import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../realtime/notifications.service';
import { LEADERSHIP } from '../auth/leadership';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  private async chapterLeadership(chapterId: string): Promise<string[]> {
    const leaders = await this.prisma.member.findMany({
      where: { chapterId, role: { in: LEADERSHIP }, active: true },
      select: { id: true },
    });
    return leaders.map((l) => l.id);
  }

  // Leadership sends a configurable payment screen to one or many members. `dueAt` is optional —
  // when set, the member gets a grace period until then (see isRestricted()); when omitted, the
  // existing immediate-block behavior (PaymentBlockerView on any DUE request) is unchanged.
  async request(actor: { id?: string; role?: string }, dto: {
    chapterId: string; memberIds: string[]; type: any; amountInr: number; note?: string; upiId?: string; bankDetails?: string; gatesAdId?: string; dueAt?: string;
  }) {
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    const created = await this.prisma.$transaction(
      dto.memberIds.map((memberId) =>
        this.prisma.paymentRequest.create({
          data: { chapterId: dto.chapterId, memberId, type: dto.type,
                   amountInr: dto.amountInr, note: dto.note, upiId: dto.upiId, bankDetails: dto.bankDetails, gatesAdId: dto.gatesAdId, dueAt },
        }),
      ),
    );
    await this.audit.record({
      actorId: actor.id, role: actor.role, action: 'PAYMENT_REQUEST', entity: 'PaymentRequest',
      summary: `Requested ${dto.type} ₹${dto.amountInr} from ${dto.memberIds.length} member(s)`,
    });
    this.notifications.notify(dto.memberIds, {
      type: 'PAYMENT_REQUESTED',
      title: `Payment requested: ₹${dto.amountInr.toLocaleString('en-IN')}`,
      body: dto.note || dto.type,
      entityType: 'PaymentRequest',
      meta: dueAt ? { dueAt: dueAt.toISOString() } : undefined,
    }).catch(() => {});
    return { count: created.length };
  }

  get(id: string) { return this.prisma.paymentRequest.findUnique({ where: { id } }); }

  // Member marks their side as paid (awaits leadership confirmation).
  async markPaidByMember(id: string, memberId: string) {
    const pr = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!pr || pr.memberId !== memberId) return { ok: false };
    await this.prisma.paymentRequest.updateMany({ where: { id, memberId }, data: { memberPaid: true, memberPaidAt: new Date() } });
    const leaders = await this.chapterLeadership(pr.chapterId);
    this.notifications.notify(leaders, {
      type: 'PAYMENT_SUBMITTED_FOR_APPROVAL',
      title: 'A member marked a payment as paid',
      body: `₹${Number(pr.amountInr).toLocaleString('en-IN')} — awaiting your confirmation`,
      entityType: 'PaymentRequest',
      entityId: id,
    }).catch(() => {});
    return { ok: true };
  }

  // Leadership confirms → payment clears (and any gated ad goes live).
  async confirm(id: string) {
    const pr = await this.prisma.paymentRequest.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } });
    if (pr.gatesAdId) await this.prisma.adCampaign.update({ where: { id: pr.gatesAdId }, data: { status: 'LIVE' } });
    this.notifications.notify(pr.memberId, {
      type: 'PAYMENT_APPROVED', title: 'Your payment was approved', entityType: 'PaymentRequest', entityId: id,
    }).catch(() => {});
    return { ok: true };
  }

  // Leadership excuses a due payment without collecting it — gives real meaning to the
  // previously-unused WAIVED status, and lifts any restriction it would otherwise have caused.
  async waive(id: string) {
    const pr = await this.prisma.paymentRequest.update({ where: { id }, data: { status: 'WAIVED' } });
    this.notifications.notify(pr.memberId, {
      type: 'PAYMENT_WAIVED', title: 'A pending payment was waived', entityType: 'PaymentRequest', entityId: id,
    }).catch(() => {});
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

  // Member pays → if it gated an ad, the ad goes LIVE. Ownership is enforced the same way
  // markPaidByMember() already does — without this check any authenticated member could clear
  // ANY payment request (their own restriction or someone else's) and flip a gated ad live.
  async pay(id: string, memberId: string) {
    const existing = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Payment request not found');
    if (existing.memberId !== memberId) throw new ForbiddenException('This payment request is not yours');
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
    this.notifications.notify(pr.memberId, {
      type: 'PAYMENT_APPROVED', title: 'Payment received', entityType: 'PaymentRequest', entityId: id,
    }).catch(() => {});
    return { id: pr.id, status: pr.status, adActivated: !!pr.gatesAdId };
  }

  // The one source of truth for "is this member locked out for non-payment" — computed live,
  // never a stored flag that could drift. True only once a DUE request's own dueAt has passed;
  // a DUE request with no dueAt at all does NOT restrict (that's the existing PaymentBlockerView
  // hard-block instead, handled client-side — see RootTabView.swift).
  async isRestricted(memberId: string): Promise<boolean> {
    const overdue = await this.prisma.paymentRequest.findFirst({
      where: { memberId, status: 'DUE', dueAt: { not: null, lt: new Date() } },
      select: { id: true },
    });
    return !!overdue;
  }

  // Runs every 10 minutes: finds DUE requests whose dueAt just passed (not yet notified),
  // notifies the member their account is now restricted and the chapter's leadership, then
  // stamps overdueNotifiedAt so it never fires twice for the same request.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepOverduePayments() {
    const overdue = await this.prisma.paymentRequest.findMany({
      where: { status: 'DUE', dueAt: { not: null, lt: new Date() }, overdueNotifiedAt: null },
    });
    if (!overdue.length) return;
    for (const pr of overdue) {
      try {
        const leaders = await this.chapterLeadership(pr.chapterId);
        await this.notifications.notify(pr.memberId, {
          type: 'PAYMENT_OVERDUE',
          title: 'Payment overdue — your access is now restricted',
          body: `₹${Number(pr.amountInr).toLocaleString('en-IN')} was due and hasn't been confirmed`,
          entityType: 'PaymentRequest', entityId: pr.id,
        });
        await this.notifications.notify(leaders, {
          type: 'PAYMENT_OVERDUE_MEMBER',
          title: 'A member is now payment-restricted',
          body: `₹${Number(pr.amountInr).toLocaleString('en-IN')} overdue`,
          entityType: 'PaymentRequest', entityId: pr.id,
        });
        await this.prisma.paymentRequest.update({ where: { id: pr.id }, data: { overdueNotifiedAt: new Date() } });
      } catch (e) {
        this.logger.warn(`Overdue sweep failed for PaymentRequest ${pr.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`Overdue payment sweep: ${overdue.length} request(s) newly restricted.`);
  }
}
