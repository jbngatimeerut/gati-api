import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../realtime/notifications.service';

@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async create(fromMemberId: string, dto: any) {
    const from = await this.prisma.member.findUnique({ where: { id: fromMemberId }, select: { chapterId: true, name: true } });
    const chapterId = dto.chapterId || from?.chapterId;
    // The deal amount is entered by the submitting member up front, but it only counts toward
    // the chapter's network value once leadership approves it (see close()) — status stays NEW
    // until then, same as a referral submitted with no amount at all.
    const amount = dto.amount !== undefined && dto.amount !== null && dto.amount !== '' ? Number(dto.amount) : null;
    const referral = await this.prisma.referral.create({
      data: { chapterId, fromMemberId, toMemberId: dto.toMemberId || null,
               contactName: dto.contactName, detail: dto.detail || null,
               closedAmount: amount },
    });
    if (referral.toMemberId) {
      this.notifications.notify(referral.toMemberId, {
        type: 'REFERRAL_RECEIVED',
        title: `${from?.name || 'A member'} sent you a referral`,
        body: referral.contactName,
        entityType: 'Referral',
        entityId: referral.id,
      }).catch(() => {});
    }
    return referral;
  }

  forMember(memberId: string) {
    return this.prisma.referral.findMany({
      where: { OR: [{ fromMemberId: memberId }, { toMemberId: memberId }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Leadership-only approval step — see referrals.controller.ts. Confirms the amount the
  // submitter entered (or overrides it) and marks the referral CLOSED, which is what makes it
  // count toward the chapter's network value.
  async close(id: string, amount: number) {
    const referral = await this.prisma.referral.update({
      where: { id }, data: { status: 'CLOSED', closedAmount: amount },
    });
    const { total } = await this.networkValue(referral.chapterId);
    this.notifications.notify(referral.fromMemberId, {
      type: 'REFERRAL_CLOSED',
      title: 'Your referral was closed',
      body: `${referral.contactName} — confirmed at ₹${amount.toLocaleString('en-IN')}`,
      entityType: 'Referral',
      entityId: referral.id,
      meta: { networkValue: total },
    }).catch(() => {});
    return referral;
  }

  // Leadership view: every referral in the chapter + roll-up totals, with enough submitter info
  // (name/photo/company) to review who's asking for approval and what amount they entered.
  async oversight(chapterId: string) {
    const rows = await this.prisma.referral.findMany({
      where: { chapterId }, orderBy: { createdAt: 'desc' },
      include: {
        from: { select: { name: true, photoUrl: true, company: true, brandName: true } },
        to: { select: { name: true, photoUrl: true, company: true, brandName: true } },
      },
    });
    const closed = rows.filter(r => r.status === 'CLOSED');
    const totalClosed = closed.reduce((s, r) => s + Number(r.closedAmount ?? 0), 0);
    return {
      totals: { count: rows.length, closed: closed.length, totalClosed },
      rows,
    };
  }

  // Public-safe aggregate for the home screen's "Network Value" stat — the total business
  // closed through approved referrals, with zero per-referral attribution (no one but
  // leadership, via oversight() above, can see who submitted what).
  async networkValue(chapterId: string) {
    const result = await this.prisma.referral.aggregate({
      where: { chapterId, status: 'CLOSED' },
      _sum: { closedAmount: true },
    });
    return { total: Number(result._sum.closedAmount ?? 0) };
  }
}
