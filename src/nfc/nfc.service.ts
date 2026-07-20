import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildVCard, slugify, newCardToken } from '../common/vcard';

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
  constructor(private prisma: PrismaService) {}

  // Public profile for the digital visiting card (by member slug).
  async publicProfile(slug: string) {
    const m = await this.prisma.member.findUnique({
      where: { slug },
      include: { chapter: true, group: true },
    });
    if (!m || !m.active) throw new NotFoundException('Card not found');
    return {
      slug: m.slug,
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
  async createLead(slug: string, dto: { name: string; phone?: string; email?: string; company?: string; note?: string }) {
    const m = await this.prisma.member.findUnique({ where: { slug } });
    if (!m) throw new NotFoundException('Card not found');
    return this.prisma.lead.create({ data: { memberId: m.id, ...dto } });
  }

  // Admin: mint a card token and bind it to a member (handles lost-card re-issue).
  async issueCard(memberId: string, batchRef?: string) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');
    // retire any existing active cards (lost/replaced)
    await this.prisma.nfcCard.updateMany({
      where: { memberId, status: 'ACTIVE' }, data: { status: 'LOST' },
    });
    return this.prisma.nfcCard.create({
      data: { memberId, token: newCardToken(), status: 'ACTIVE', batchRef, issuedAt: new Date() },
    });
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
