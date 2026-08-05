import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../realtime/notifications.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class SetuService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private payments: PaymentsService) {}

  async feed(chapterId: string, status: any = 'OPEN') {
    const where: any = { status };
    if (chapterId) where.chapterId = chapterId;
    const rows = await this.prisma.setuPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { member: { select: { name: true, slug: true, company: true, brandName: true, photoUrl: true, premiumCategory: { select: { color: true, active: true } } } } },
    });
    return rows.map((r) => {
      const { premiumCategory, ...member } = r.member;
      return { ...r, member: { ...member, premiumColor: premiumCategory?.active ? premiumCategory.color : null } };
    });
  }

  async create(memberId: string, dto: any) {
    if (await this.payments.isRestricted(memberId)) throw new ForbiddenException('Setu is disabled while a payment is overdue');
    const m = await this.prisma.member.findUnique({ where: { id: memberId }, select: { chapterId: true, name: true } });
    const chapterId = dto.chapterId || m?.chapterId;
    const post = await this.prisma.setuPost.create({
      data: {
        chapterId, memberId, type: dto.type,
        category: dto.category || 'General', text: dto.text,
      },
    });
    // Alert whoever's already posted the opposite side of this category — the same logic
    // matches(postId) already uses to surface matches when a member browses the feed.
    const wanted = post.type === 'NEED' ? 'OFFER' : 'NEED';
    const counterparts = await this.prisma.setuPost.findMany({
      where: { chapterId: post.chapterId, type: wanted, category: post.category, status: 'OPEN' },
      select: { memberId: true },
    });
    const counterpartIds = counterparts.map((c) => c.memberId).filter((id) => id !== memberId);
    if (counterpartIds.length) {
      this.notifications.notify(counterpartIds, {
        type: 'SETU_MATCH',
        title: `New ${post.type === 'NEED' ? 'need' : 'offer'} matches your Setu post`,
        body: `${m?.name || 'A member'} posted "${post.text.slice(0, 80)}" in ${post.category}`,
        entityType: 'SetuPost',
        entityId: post.id,
      }).catch(() => {});
    }
    return post;
  }

  // Leadership moderation: every post, any status.
  oversight(chapterId: string) {
    return this.prisma.setuPost.findMany({
      where: { chapterId }, orderBy: { createdAt: 'desc' },
      include: { member: { select: { name: true, slug: true } } },
    });
  }

  setStatus(id: string, status: any) {
    return this.prisma.setuPost.update({ where: { id }, data: { status } });
  }

  // Simple category matcher: a NEED surfaces members who OFFER the same category.
  async matches(postId: string) {
    const post = await this.prisma.setuPost.findUnique({ where: { id: postId } });
    if (!post) return [];
    const wanted = post.type === 'NEED' ? 'OFFER' : 'NEED';
    return this.prisma.setuPost.findMany({
      where: { chapterId: post.chapterId, type: wanted, category: post.category, status: 'OPEN' },
      include: { member: { select: { name: true, slug: true, company: true, phone: true } } },
    });
  }

  async addReply(postId: string, memberId: string, text: string) {
    if (await this.payments.isRestricted(memberId)) throw new ForbiddenException('Setu is disabled while a payment is overdue');
    const m = await this.prisma.member.findUnique({ where: { id: memberId }, select: { name: true } });
    const reply = await this.prisma.setuReply.create({ data: { postId, memberId, memberName: m?.name || 'Member', text } });
    const post = await this.prisma.setuPost.findUnique({ where: { id: postId }, select: { memberId: true, text: true } });
    if (post && post.memberId !== memberId) {
      this.notifications.notify(post.memberId, {
        type: 'SETU_REPLY',
        title: `${m?.name || 'Someone'} replied to your Setu post`,
        body: text.slice(0, 120),
        entityType: 'SetuPost',
        entityId: postId,
      }).catch(() => {});
    }
    return reply;
  }

  async replies(postId: string) {
    const rows = await this.prisma.setuReply.findMany({ where: { postId }, orderBy: { createdAt: 'asc' } });
    const ids = [...new Set(rows.map(r => r.memberId))];
    const mem = await this.prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, photoUrl: true, slug: true, premiumCategory: { select: { color: true, active: true } } } });
    const byId: Record<string, any> = Object.fromEntries(mem.map(m => [m.id, m]));
    return rows.map(r => ({
      ...r,
      photoUrl: byId[r.memberId]?.photoUrl ?? null,
      slug: byId[r.memberId]?.slug ?? null,
      premiumColor: byId[r.memberId]?.premiumCategory?.active ? byId[r.memberId].premiumCategory.color : null,
    }));
  }

  async resolve(postId: string, memberId: string) {
    const post = await this.prisma.setuPost.findUnique({ where: { id: postId } });
    if (!post) return { ok: false };
    return this.prisma.setuPost.update({ where: { id: postId }, data: { status: 'CLOSED' } });
  }
}
