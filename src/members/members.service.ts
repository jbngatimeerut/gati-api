import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/vcard';
import { EmbeddingsService } from '../search/embeddings.service';
import { NotificationsService } from '../realtime/notifications.service';

type Actor = { id?: string; role?: string };

@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private embeddings: EmbeddingsService,
    private notifications: NotificationsService,
  ) {}

  async list(chapterId: string, q?: string) {
    const rows = await this.prisma.member.findMany({
      where: {
        chapterId, active: true,
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { gatiScore: 'desc' },
      select: { id: true, name: true, slug: true, company: true, brandName: true, category: true,
                verified: true, gatiScore: true, photoUrl: true, role: true, labels: true,
                premiumCategory: { select: { color: true, active: true } } },
    });
    return rows.map(({ premiumCategory, ...rest }) => ({ ...rest, premiumColor: premiumCategory?.active ? premiumCategory.color : null }));
  }

  async create(dto: any, actor?: Actor) {
    const existing = dto.groupId && dto.category
      ? await this.prisma.member.findFirst({ where: { groupId: dto.groupId, category: dto.category } })
      : null;
    if (existing) throw new ConflictException(`Category "${dto.category}" already seated in this group`);

    let chapterId = dto.chapterId;
    if (!chapterId) {
      const ch = await this.prisma.chapter.findFirst({ where: { slug: 'meerut' } });
      chapterId = ch?.id;
    }
    let slug = slugify(dto.name);
    if (await this.prisma.member.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
    }
    const passwordHash = await bcrypt.hash(dto.password || 'changeme123', 10);
    const m = await this.prisma.member.create({
      data: {
        chapterId, groupId: dto.groupId, name: dto.name, slug,
        email: dto.email, phone: dto.phone, whatsapp: dto.whatsapp, company: dto.company,
        brandName: dto.brandName, category: dto.category, subCategory: dto.subCategory,
        about: dto.about, website: dto.website, photoUrl: dto.photoUrl, coverUrl: dto.coverUrl, productImages: dto.productImages,
        verified: dto.verified ?? true,
        jitoMembership: dto.jitoMembership ?? 'NONE', role: dto.role ?? 'MEMBER', passwordHash,
      },
    });
    await this.audit.record({
      actorId: actor?.id, role: actor?.role, action: 'MEMBER_ADD', entity: 'Member', entityId: m.id,
      summary: `Added ${m.name} (${m.category ?? '—'})`,
    });
    this.embeddings.reindexMember(m.id).catch(() => {});
    return m;
  }

  // Verification is the trust spine — confirmed against JITO records.
  async setVerified(id: string, verified: boolean, actor?: Actor) {
    const m = await this.prisma.member.update({ where: { id }, data: { verified } });
    await this.audit.record({
      actorId: actor?.id, role: actor?.role,
      action: verified ? 'MEMBER_VERIFY' : 'MEMBER_UNVERIFY', entity: 'Member', entityId: id,
      summary: `${verified ? 'Verified' : 'Removed verification for'} ${m.name}`,
    });
    return { id: m.id, verified: m.verified };
  }

  async offboard(id: string, actor?: Actor) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Member not found');
    const [updated] = await this.prisma.$transaction([
      this.prisma.member.update({ where: { id }, data: { active: false, leftAt: new Date() } }),
      this.prisma.nfcCard.updateMany({ where: { memberId: id }, data: { status: 'LOST', memberId: null } }),
      this.prisma.setuPost.updateMany({ where: { memberId: id, status: 'OPEN' }, data: { status: 'CLOSED' } }),
    ]);
    await this.audit.record({
      actorId: actor?.id, role: actor?.role, action: 'MEMBER_OFFBOARD', entity: 'Member', entityId: id,
      summary: `Offboarded ${member.name} — card revoked, login disabled, profile hidden`,
      meta: { leftAt: updated.leftAt },
    });
    return { id: updated.id, active: updated.active, leftAt: updated.leftAt, cardsRevoked: true };
  }

  // Effective feature access = individually-granted features UNION whatever the member's premium
  // category (if any) has enabled — category permissions only ever add access, never take away
  // an individual grant.
  async myFeatures(memberId: string) {
    const [grants, member] = await Promise.all([
      this.prisma.featureGrant.findMany({ where: { memberId }, select: { feature: true } }),
      this.prisma.member.findUnique({
        where: { id: memberId },
        select: { premiumCategory: { select: { permissions: { where: { enabled: true }, select: { feature: true } } } } },
      }),
    ]);
    const categoryFeatures = member?.premiumCategory?.permissions.map((p) => p.feature) ?? [];
    const features = [...new Set([...grants.map((g) => g.feature), ...categoryFeatures])];
    return { features };
  }

  async updateSelf(user: any, dto: any) {
    const allowed = ['company', 'brandName', 'category', 'subCategory', 'about', 'website', 'phone', 'whatsapp', 'photoUrl', 'coverUrl', 'productImages', 'labels'];
    const data: any = {};
    for (const k of allowed) if (dto[k] !== undefined) data[k] = dto[k];
    const me = await this.prisma.member.findUnique({ where: { id: user.id }, select: { name: true, chapterId: true, slug: true } });
    // Leadership edits apply immediately; regular members go through approval.
    const LEADERSHIP = require('../auth/leadership').LEADERSHIP;
    if (LEADERSHIP.includes(user.role)) {
      const m = await this.prisma.member.update({ where: { id: user.id }, data });
      this.embeddings.reindexMember(m.id).catch(() => {});
      return { ok: true, slug: m.slug, applied: true };
    }
    await this.prisma.profileEdit.create({ data: { memberId: user.id, memberName: me?.name || 'Member', chapterId: me?.chapterId || null, data } });
    // So the leadership pending-edits queue updates live too, not just the submitter once decided.
    const leaders = await this.prisma.member.findMany({
      where: { chapterId: me?.chapterId || undefined, role: { in: LEADERSHIP }, active: true },
      select: { id: true },
    });
    this.notifications.notify(leaders.map((l) => l.id), {
      type: 'APPROVAL_PENDING',
      title: `${me?.name || 'A member'} submitted a profile edit`,
      body: 'Awaiting your review',
      entityType: 'ProfileEdit',
    }).catch(() => {});
    return { ok: true, pending: true, slug: me?.slug };
  }

  pendingEdits(chapterId?: string) {
    return this.prisma.profileEdit.findMany({ where: { status: 'PENDING', ...(chapterId ? { chapterId } : {}) }, orderBy: { createdAt: 'desc' } });
  }

  async approveEdit(id: string) {
    const e = await this.prisma.profileEdit.findUnique({ where: { id } });
    if (!e) return { ok: false };
    await this.prisma.member.update({ where: { id: e.memberId }, data: e.data as any });
    this.embeddings.reindexMember(e.memberId).catch(() => {});
    const result = await this.prisma.profileEdit.update({ where: { id }, data: { status: 'APPROVED', reviewedAt: new Date() } });
    this.notifications.notify(e.memberId, {
      type: 'APPROVAL_APPROVED', title: 'Your profile edit was approved', entityType: 'ProfileEdit', entityId: id,
    }).catch(() => {});
    return result;
  }

  async rejectEdit(id: string) {
    const e = await this.prisma.profileEdit.findUnique({ where: { id } });
    const result = await this.prisma.profileEdit.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date() } });
    if (e) {
      this.notifications.notify(e.memberId, {
        type: 'APPROVAL_REJECTED', title: 'Your profile edit was rejected', entityType: 'ProfileEdit', entityId: id,
      }).catch(() => {});
    }
    return result;
  }
}
