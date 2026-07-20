import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Leadership sends a configurable payment screen to one or many members.
  async request(actor: { id?: string; role?: string }, dto: {
    chapterId: string; memberIds: string[]; type: any; amountInr: number; note?: string; upiId?: string; bankDetails?: string; gatesAdId?: string;
  }) {
    const created = await this.prisma.$transaction(
      dto.memberIds.map((memberId) =>
        this.prisma.paymentRequest.create({
          data: { chapterId: dto.chapterId, memberId, type: dto.type,
                   amountInr: dto.amountInr, note: dto.note, upiId: dto.upiId, bankDetails: dto.bankDetails, gatesAdId: dto.gatesAdId },
        }),
      ),
    );
    await this.audit.record({
      actorId: actor.id, role: actor.role, action: 'PAYMENT_REQUEST', entity: 'PaymentRequest',
      summary: `Requested ${dto.type} ₹${dto.amountInr} from ${dto.memberIds.length} member(s)`,
    });
    return { count: created.length };
  }

  get(id: string) { return this.prisma.paymentRequest.findUnique({ where: { id } }); }

  // Member marks their side as paid (awaits leadership confirmation).
  async markPaidByMember(id: string, memberId: string) {
    await this.prisma.paymentRequest.updateMany({ where: { id, memberId }, data: { memberPaid: true, memberPaidAt: new Date() } });
    return { ok: true };
  }

  // Leadership confirms → payment clears (and any gated ad goes live).
  async confirm(id: string) {
    const pr = await this.prisma.paymentRequest.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
    if (pr.gatesAdId) await this.prisma.adCampaign.update({ where: { id: pr.gatesAdId }, data: { status: 'LIVE' } });
    return { ok: true };
  }

  async pendingConfirmations(chapterId: string) {
    const items = await this.prisma.paymentRequest.findMany({ where: { chapterId, status: 'DUE', memberPaid: true }, orderBy: { memberPaidAt: 'desc' } });
    const ids = Array.from(new Set(items.map((i) => i.memberId)));
    const members = await this.prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, company: true } });
    const map: any = {}; members.forEach((m) => (map[m.id] = m));
    return { pending: items.map((i) => ({ ...i, member: map[i.memberId] || null })) };
  }

  // A member's outstanding dues.
  dues(memberId: string) {
    return this.prisma.paymentRequest.findMany({
      where: { memberId }, orderBy: { createdAt: 'desc' },
    });
  }

  // Member pays → if it gated an ad, the ad goes LIVE.
  async pay(id: string, memberId: string) {
    const pr = await this.prisma.paymentRequest.update({
      where: { id }, data: { status: 'PAID', paidAt: new Date() },
    });
    if (pr.gatesAdId) {
      await this.prisma.adCampaign.update({ where: { id: pr.gatesAdId }, data: { status: 'LIVE' } });
    }
    await this.audit.record({
      action: 'PAYMENT_PAID', actorId: memberId, role: 'MEMBER', entity: 'PaymentRequest', entityId: id,
      summary: `Paid ${pr.type} ₹${Number(pr.amountInr)}${pr.gatesAdId ? ' — ad set live' : ''}`,
    });
    return { id: pr.id, status: pr.status, adActivated: !!pr.gatesAdId };
  }
}
