import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../common/vcard';

type Actor = { id?: string; role?: string };

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  list(chapterId: string, q?: string) {
    return this.prisma.member.findMany({
      where: {
        chapterId, active: true,
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { gatiScore: 'desc' },
      select: { id: true, name: true, slug: true, company: true, category: true,
                verified: true, gatiScore: true, photoUrl: true, role: true },
    });
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

  async myFeatures(memberId: string) {
    const grants = await this.prisma.featureGrant.findMany({ where: { memberId }, select: { feature: true } });
    return { features: grants.map((g) => g.feature) };
  }

  async updateSelf(user: any, dto: any) {
    const allowed = ['company', 'brandName', 'category', 'subCategory', 'about', 'website', 'phone', 'whatsapp', 'photoUrl', 'coverUrl', 'productImages'];
    const data: any = {};
    for (const k of allowed) if (dto[k] !== undefined) data[k] = dto[k];
    const me = await this.prisma.member.findUnique({ where: { id: user.id }, select: { name: true, chapterId: true, slug: true } });
    // Super Admin edits apply immediately; everyone else goes through leadership approval.
    if (user.role === 'APEX_ADMIN') {
      const m = await this.prisma.member.update({ where: { id: user.id }, data });
      return { ok: true, slug: m.slug, applied: true };
    }
    await this.prisma.profileEdit.create({ data: { memberId: user.id, memberName: me?.name || 'Member', chapterId: me?.chapterId || null, data } });
    return { ok: true, pending: true, slug: me?.slug };
  }

  pendingEdits(chapterId?: string) {
    return this.prisma.profileEdit.findMany({ where: { status: 'PENDING', ...(chapterId ? { chapterId } : {}) }, orderBy: { createdAt: 'desc' } });
  }

  async approveEdit(id: string) {
    const e = await this.prisma.profileEdit.findUnique({ where: { id } });
    if (!e) return { ok: false };
    await this.prisma.member.update({ where: { id: e.memberId }, data: e.data as any });
    return this.prisma.profileEdit.update({ where: { id }, data: { status: 'APPROVED', reviewedAt: new Date() } });
  }

  rejectEdit(id: string) {
    return this.prisma.profileEdit.update({ where: { id }, data: { status: 'REJECTED', reviewedAt: new Date() } });
  }
}
