import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SetuService {
  constructor(private prisma: PrismaService) {}

  feed(chapterId: string, status: any = 'OPEN') {
    const where: any = { status };
    if (chapterId) where.chapterId = chapterId;
    return this.prisma.setuPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { member: { select: { name: true, slug: true, company: true, brandName: true, photoUrl: true } } },
    });
  }

  async create(memberId: string, dto: any) {
    const m = await this.prisma.member.findUnique({ where: { id: memberId }, select: { chapterId: true } });
    const chapterId = dto.chapterId || m?.chapterId;
    return this.prisma.setuPost.create({
      data: {
        chapterId, memberId, type: dto.type,
        category: dto.category || 'General', text: dto.text,
      },
    });
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
    const m = await this.prisma.member.findUnique({ where: { id: memberId }, select: { name: true } });
    return this.prisma.setuReply.create({ data: { postId, memberId, memberName: m?.name || 'Member', text } });
  }

  async replies(postId: string) {
    const rows = await this.prisma.setuReply.findMany({ where: { postId }, orderBy: { createdAt: 'asc' } });
    const ids = [...new Set(rows.map(r => r.memberId))];
    const mem = await this.prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, photoUrl: true, slug: true } });
    const byId: Record<string, any> = Object.fromEntries(mem.map(m => [m.id, m]));
    return rows.map(r => ({ ...r, photoUrl: byId[r.memberId]?.photoUrl ?? null, slug: byId[r.memberId]?.slug ?? null }));
  }

  async resolve(postId: string, memberId: string) {
    const post = await this.prisma.setuPost.findUnique({ where: { id: postId } });
    if (!post) return { ok: false };
    return this.prisma.setuPost.update({ where: { id: postId }, data: { status: 'CLOSED' } });
  }
}
