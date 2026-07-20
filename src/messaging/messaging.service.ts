import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  async resolve(idOrSlug: string) {
    const m = await this.prisma.member.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { id: true, name: true, slug: true, photoUrl: true, company: true },
    });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }

  async send(fromId: string, toId: string, body: string) {
    if (!toId || !body || !body.trim()) throw new BadRequestException('Recipient and message are required');
    if (toId === fromId) throw new BadRequestException('You cannot message yourself');
    return this.prisma.message.create({ data: { fromId, toId, body: body.trim() } });
  }

  async threads(meId: string) {
    const msgs = await this.prisma.message.findMany({
      where: { OR: [{ fromId: meId }, { toId: meId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        from: { select: { id: true, name: true, slug: true, photoUrl: true } },
        to: { select: { id: true, name: true, slug: true, photoUrl: true } },
      },
    });
    const map = new Map<string, any>();
    for (const m of msgs) {
      const other = m.fromId === meId ? m.to : m.from;
      if (!map.has(other.id)) map.set(other.id, { member: other, last: m.body, at: m.createdAt, unread: 0 });
      if (m.toId === meId && !m.readAt) map.get(other.id).unread++;
    }
    return { threads: Array.from(map.values()) };
  }

  async thread(meId: string, otherId: string) {
    const other = await this.prisma.member.findUnique({ where: { id: otherId }, select: { id: true, name: true, slug: true, photoUrl: true, company: true } });
    const messages = await this.prisma.message.findMany({
      where: { OR: [{ fromId: meId, toId: otherId }, { fromId: otherId, toId: meId }] },
      orderBy: { createdAt: 'asc' },
    });
    await this.prisma.message.updateMany({ where: { fromId: otherId, toId: meId, readAt: null }, data: { readAt: new Date() } });
    return { member: other, messages: messages.map((m) => ({ id: m.id, body: m.body, mine: m.fromId === meId, at: m.createdAt })) };
  }
}
