import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService) {}

  async create(fromMemberId: string, dto: any) {
    const from = await this.prisma.member.findUnique({ where: { id: fromMemberId }, select: { chapterId: true } });
    const chapterId = dto.chapterId || from?.chapterId;
    return this.prisma.referral.create({
      data: { chapterId, fromMemberId, toMemberId: dto.toMemberId || null,
               contactName: dto.contactName, detail: dto.detail || null },
    });
  }

  forMember(memberId: string) {
    return this.prisma.referral.findMany({
      where: { OR: [{ fromMemberId: memberId }, { toMemberId: memberId }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async close(id: string, amount: number) {
    return this.prisma.referral.update({
      where: { id }, data: { status: 'CLOSED', closedAmount: amount },
    });
  }

  // Leadership view: every referral in the chapter + roll-up totals.
  async oversight(chapterId: string) {
    const rows = await this.prisma.referral.findMany({
      where: { chapterId }, orderBy: { createdAt: 'desc' },
      include: {
        from: { select: { name: true } },
        to: { select: { name: true } },
      },
    });
    const closed = rows.filter(r => r.status === 'CLOSED');
    const totalClosed = closed.reduce((s, r) => s + Number(r.closedAmount ?? 0), 0);
    return {
      totals: { count: rows.length, closed: closed.length, totalClosed },
      rows,
    };
  }
}
