import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';
import { ApnsService } from './apns.provider';

export type NotifyInput = {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
};

// The single place every domain (setu, referrals, approvals, leads, broadcasts, cards...) calls
// after its own mutation. Writes the permanent Notification row(s) first — that's the source of
// truth a member can always come back to — then best-effort pushes it live over the socket and
// via APNs. Push failures are caught and logged here so a caller's mutation never fails because a
// notification couldn't be delivered.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService, private gateway: RealtimeGateway, private apns: ApnsService) {}

  async notify(memberIds: string | string[], input: NotifyInput): Promise<void> {
    const ids = (Array.isArray(memberIds) ? memberIds : [memberIds]).filter(Boolean);
    if (!ids.length) return;

    // createManyAndReturn (not just createMany) so the live push carries the same id/createdAt
    // as the persisted row — the client can merge a live push and a GET /notifications page
    // without them looking like two different shapes.
    const rows = await this.prisma.notification.createManyAndReturn({
      data: ids.map((memberId) => ({
        memberId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta as any,
      })),
    });

    for (const row of rows) {
      try {
        this.gateway.sendToMember(row.memberId, { type: 'notification', notification: row });
      } catch (e) {
        this.logger.warn(`Socket push failed for ${row.memberId}: ${(e as Error).message}`);
      }
      this.pushToDevices(row.memberId, input).catch((e) =>
        this.logger.warn(`APNs push failed for ${row.memberId}: ${(e as Error).message}`),
      );
    }
  }

  private async pushToDevices(memberId: string, input: NotifyInput): Promise<void> {
    if (!this.apns.available) return;
    const devices = await this.prisma.deviceToken.findMany({ where: { memberId }, select: { token: true } });
    for (const d of devices) {
      await this.apns.push(d.token, input.title, input.body, { type: input.type, entityType: input.entityType, entityId: input.entityId });
    }
  }

  list(memberId: string, page = 1, pageSize = 30) {
    return this.prisma.notification.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  unreadCount(memberId: string) {
    return this.prisma.notification.count({ where: { memberId, readAt: null } });
  }

  async markRead(memberId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, memberId }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(memberId: string) {
    await this.prisma.notification.updateMany({ where: { memberId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async registerDevice(memberId: string, token: string, platform = 'ios') {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { memberId, token, platform },
      update: { memberId, platform },
    });
    return { ok: true };
  }
}
