import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BroadcastsService {
  constructor(private prisma: PrismaService) {}

  create(fromMemberId: string, dto: any) {
    return this.prisma.broadcast.create({
      data: {
        chapterId: dto.chapterId ?? null, fromMemberId,
        kind: dto.kind ?? 'MESSAGE', scope: dto.scope, title: dto.title,
        body: dto.body, eventAt: dto.eventAt ? new Date(dto.eventAt) : null,
      },
    });
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
