import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PaymentsService } from '../payments/payments.service';

const MEMBER_SELECT = { id: true, name: true, slug: true, photoUrl: true, premiumCategory: { select: { color: true, active: true } } };

// Every query above nests `premiumCategory` since it's a relation — this flattens it back into
// the same `premiumColor` shape every other member-representing response uses (search, members
// list, digital card), so clients only ever deal with one shape.
function flattenPremium<T extends { premiumCategory?: { color: string; active: boolean } | null }>(m: T) {
  const { premiumCategory, ...rest } = m;
  return { ...rest, premiumColor: premiumCategory?.active ? premiumCategory.color : null };
}

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService, private gateway: RealtimeGateway, private payments: PaymentsService) {}

  async resolve(idOrSlug: string) {
    const m = await this.prisma.member.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: { ...MEMBER_SELECT, company: true },
    });
    if (!m) throw new NotFoundException('Member not found');
    return flattenPremium(m);
  }

  async send(fromId: string, toId: string, body: string, kind = 'TEXT', mediaUrl?: string, meta?: string) {
    if (!toId) throw new BadRequestException('Recipient is required');
    if (toId === fromId) throw new BadRequestException('You cannot message yourself');
    if (await this.payments.isRestricted(fromId)) throw new ForbiddenException('Messaging is disabled while a payment is overdue');
    const isText = (kind || 'TEXT') === 'TEXT';
    if (isText && (!body || !body.trim())) throw new BadRequestException('Message is required');
    const message = await this.prisma.message.create({
      data: { from: { connect: { id: fromId } }, to: { connect: { id: toId } }, body: (body || '').trim(), kind: kind || 'TEXT', mediaUrl: mediaUrl || null, meta: meta || null },
      include: { from: { select: MEMBER_SELECT } },
    });
    this.gateway.sendToMember(toId, {
      type: 'message',
      peerId: fromId,
      peer: flattenPremium(message.from),
      message: { id: message.id, body: message.body, mine: false, createdAt: message.createdAt, readAt: message.readAt, kind: message.kind, mediaUrl: message.mediaUrl, meta: message.meta },
    });
    return message;
  }

  private previewText(m: any): string {
    switch (m.kind) {
      case 'IMAGE': return '📷 Photo';
      case 'DOCUMENT': return '📄 Document';
      case 'CONTACT': return '👤 Contact';
      case 'LOCATION': return '📍 Location';
      default: return m.body;
    }
  }
  async threads(meId: string) {
    const msgs = await this.prisma.message.findMany({
      where: { OR: [{ fromId: meId }, { toId: meId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        from: { select: MEMBER_SELECT },
        to: { select: MEMBER_SELECT },
      },
    });
    const map = new Map<string, any>();
    for (const m of msgs) {
      const other = flattenPremium(m.fromId === meId ? m.to : m.from);
      if (!map.has(other.id)) map.set(other.id, { member: other, last: this.previewText(m), at: m.createdAt, unread: 0 });
      if (m.toId === meId && !m.readAt) map.get(other.id).unread++;
    }
    return { threads: Array.from(map.values()) };
  }

  async deleteThread(meId: string, otherId: string) {
    await this.prisma.message.deleteMany({
      where: { OR: [{ fromId: meId, toId: otherId }, { fromId: otherId, toId: meId }] },
    });
    return { ok: true };
  }

  async thread(meId: string, otherId: string) {
    const other = await this.prisma.member.findUnique({ where: { id: otherId }, select: { ...MEMBER_SELECT, company: true } });
    const messages = await this.prisma.message.findMany({
      where: { OR: [{ fromId: meId, toId: otherId }, { fromId: otherId, toId: meId }] },
      orderBy: { createdAt: 'asc' },
    });
    await this.prisma.message.updateMany({ where: { fromId: otherId, toId: meId, readAt: null }, data: { readAt: new Date() } });
    return { member: other ? flattenPremium(other) : other, messages: messages.map((m) => ({ id: m.id, body: m.body, mine: m.fromId === meId, createdAt: m.createdAt, readAt: m.readAt, kind: m.kind, mediaUrl: m.mediaUrl, meta: m.meta })) };
  }
}
