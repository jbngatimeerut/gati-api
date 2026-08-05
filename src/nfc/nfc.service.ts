import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildVCard, slugify, newCardToken } from '../common/vcard';
import { NotificationsService } from '../realtime/notifications.service';
import { PaymentsService } from '../payments/payments.service';

function driveProxy(url?: string | null): string | null {
  if (!url) return url ?? null;
  if (!/drive\.google|googleusercontent|docs\.google/.test(url)) return url; // already local
  const m = url.match(/[-\w]{25,}/);
  return m ? `/api/img?id=${m[0]}` : url;
}
function driveProxyList(s?: string | null): string | null {
  if (!s) return s ?? null;
  return s.split(',').map((x) => driveProxy(x.trim())).filter(Boolean).join(',');
}

@Injectable()
export class NfcService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private payments: PaymentsService) {}

  // Public profile for the digital visiting card (by member slug). Same generic "not found" for
  // inactive AND payment-restricted members — deliberately doesn't reveal which, so a member's
  // payment status is never publicly exposed through their own card link.
  async publicProfile(slug: string) {
    const m = await this.prisma.member.findUnique({
      where: { slug },
      include: { chapter: true, group: true, premiumCategory: { select: { color: true, active: true } } },
    });
    if (!m || !m.active) throw new NotFoundException('Card not found');
    if (await this.payments.isRestricted(m.id)) throw new NotFoundException('Card not found');
    return {
      slug: m.slug,
      premiumColor: m.premiumCategory?.active ? m.premiumCategory.color : null,
      name: m.name,
      company: m.company,
      brandName: m.brandName,
      category: m.category,
      subCategory: m.subCategory,
      productImages: driveProxyList(m.productImages),
      about: m.about,
      phone: m.phone,
      whatsapp: m.whatsapp,
      email: m.email,
      website: m.website,
      photoUrl: driveProxy(m.photoUrl),
      coverUrl: driveProxy(m.coverUrl),
      labels: m.labels,
      verified: m.verified,
      jitoMembership: m.jitoMembership,
      chapter: m.chapter?.name,
      chapterBrand: m.chapter?.brandName,
      chapterCity: m.chapter?.city,
      chapterLogo: m.chapter?.logoUrl,
      group: m.group?.name,
    };
  }

  // Physical NFC tap: token -> member, logged for analytics.
  async resolveTap(token: string, meta: { source?: string; userAgent?: string; city?: string }) {
    const card = await this.prisma.nfcCard.findUnique({
      where: { token },
      include: { member: true },
    });
    if (!card || !card.member) throw new NotFoundException('Card not assigned');
    await this.prisma.$transaction([
      this.prisma.cardTap.create({
        data: {
          cardId: card.id, memberId: card.memberId,
          source: meta.source || 'nfc', userAgent: meta.userAgent, city: meta.city,
        },
      }),
      this.prisma.nfcCard.update({ where: { id: card.id }, data: { lastTapAt: new Date() } }),
    ]);
    return { slug: card.member.slug };
  }

  async vcard(slug: string) {
    const m = await this.prisma.member.findUnique({ where: { slug } });
    if (!m) throw new NotFoundException('Card not found');
    return buildVCard({
      name: m.name, company: m.company, title: m.category,
      phone: m.phone, whatsapp: m.whatsapp, email: m.email,
      website: m.website, photoUrl: m.photoUrl,
      note: `JBN GATI · ${m.category ?? 'Member'}`,
    });
  }

  // Reverse capture: whoever tapped leaves their card -> becomes a lead.
  async createLead(slug: string, dto: { name: string; phone?: string; email?: string; company?: string; interests?: string; note?: string }) {
    const m = await this.prisma.member.findUnique({ where: { slug } });
    if (!m) throw new NotFoundException('Card not found');
    const lead = await this.prisma.lead.create({ data: { memberId: m.id, ...dto } });
    this.notifications.notify(m.id, {
      type: 'LEAD_CAPTURED',
      title: `New lead: ${dto.name}`,
      body: dto.company || dto.phone || 'From your digital card',
      entityType: 'Lead',
      entityId: lead.id,
    }).catch(() => {});
    return lead;
  }

  // Admin: mint a card token and bind it to a member (handles lost-card re-issue).
  async issueCard(memberId: string, batchRef?: string) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');
    // retire any existing active cards (lost/replaced)
    await this.prisma.nfcCard.updateMany({
      where: { memberId, status: 'ACTIVE' }, data: { status: 'LOST' },
    });
    const card = await this.prisma.nfcCard.create({
      data: { memberId, token: newCardToken(), status: 'ACTIVE', batchRef, issuedAt: new Date() },
    });
    this.notifications.notify(memberId, {
      type: 'CARD_ISSUED', title: 'Your NFC card is active', entityType: 'NfcCard', entityId: card.id,
    }).catch(() => {});
    return card;
  }

  async memberLeads(memberId: string) {
    return this.prisma.lead.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } });
  }

  async cardTaps(memberId: string) {
    return this.prisma.cardTap.findMany({
      where: { memberId }, orderBy: { tappedAt: 'desc' }, take: 100,
    });
  }

  async listCards() {
    const cards = await this.prisma.nfcCard.findMany({
      orderBy: { createdAt: 'desc' },
      include: { member: { select: { name: true, slug: true, phone: true, company: true } } },
    });
    return { cards };
  }

  async revokeCard(id: string) {
    return this.prisma.nfcCard.update({ where: { id }, data: { status: 'LOST' } });
  }
}
