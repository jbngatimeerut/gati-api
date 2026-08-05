import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../realtime/notifications.service';

@Injectable()
export class BroadcastsService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async create(fromMemberId: string, dto: any) {
    const broadcast = await this.prisma.broadcast.create({
      data: {
        chapterId: dto.chapterId ?? null, fromMemberId,
        kind: dto.kind ?? 'MESSAGE', scope: dto.scope, title: dto.title,
        body: dto.body, eventAt: dto.eventAt ? new Date(dto.eventAt) : null,
      },
    });
    // Fan out to exactly who inbox() would show this to: the chapter's members, or everyone
    // network-wide for a null chapterId (super-admin -> chapter leaders) broadcast.
    const recipients = await this.prisma.member.findMany({
      where: { active: true, ...(broadcast.chapterId ? { chapterId: broadcast.chapterId } : {}) },
      select: { id: true },
    });
    this.notifications.notify(
      recipients.map((r) => r.id).filter((id) => id !== fromMemberId),
      { type: 'BROADCAST', title: broadcast.title, body: broadcast.body, entityType: 'Broadcast', entityId: broadcast.id },
    ).catch(() => {});
    return broadcast;
  }

  // What a given member should see (their chapter's member broadcasts).
  inbox(chapterId: string) {
    return this.prisma.broadcast.findMany({
      where: { OR: [{ chapterId }, { chapterId: null }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(broadcastId: string, memberId: string) {
    return this.prisma.broadcastReceipt.upsert({
      where: { broadcastId_memberId: { broadcastId, memberId } },
      update: {}, create: { broadcastId, memberId },
    });
  }

  // Read receipts for leadership: who has opened a broadcast.
  receipts(broadcastId: string) {
    return this.prisma.broadcastReceipt.findMany({ where: { broadcastId } });
  }
}
