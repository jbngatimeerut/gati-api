import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const FEATURES = [
  { key: 'DIGITAL_CARD', label: 'Digital card', description: 'Public profile, NFC & QR card' },
  { key: 'PRODUCTS', label: 'Product showcase', description: 'Show product images on the profile' },
  { key: 'REFERRALS', label: 'Give referrals', description: 'Record referrals to other members' },
  { key: 'SETU', label: 'Setu — needs & offers', description: 'Post needs and offers' },
  { key: 'BROADCASTS', label: 'Broadcasts', description: 'Send chapter broadcasts' },
  { key: 'ANALYTICS', label: 'Analytics & reports', description: 'View dashboards and reports' },
  { key: 'MARKETPLACE', label: 'Marketplace', description: 'Buy & sell in the marketplace (coming soon)' },
  { key: 'ADS', label: 'Ads & promotions', description: 'Run promotions (coming soon)' },
];

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // One call powering the super-admin overview across the whole ecosystem.
  async summary() {
    const [chapters, members, verified, openSetu, liveAds, orders, closed] = await Promise.all([
      this.prisma.chapter.count(),
      this.prisma.member.count({ where: { active: true } }),
      this.prisma.member.count({ where: { active: true, verified: true } }),
      this.prisma.setuPost.count({ where: { status: 'OPEN' } }),
      this.prisma.adCampaign.count({ where: { status: 'LIVE' } }),
      this.prisma.order.count(),
      this.prisma.referral.aggregate({ _sum: { closedAmount: true }, where: { status: 'CLOSED' } }),
    ]);
    return {
      chapters, members, verified,
      verifiedPct: members ? Math.round((verified / members) * 100) : 0,
      openSetu, liveAds, orders,
      closedBusiness: Number(closed._sum.closedAmount ?? 0),
    };
  }

  async loginLog() {
    const events = await this.prisma.auditLog.findMany({
      where: { action: { in: ['LOGIN', 'LOGOUT'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { actorName: true, role: true, action: true, ip: true, createdAt: true },
    });
    return { events };
  }

  async members() {
    const members = await this.prisma.member.findMany({
      orderBy: { name: 'asc' },
      select: {
        name: true, slug: true, email: true, phone: true, company: true, brandName: true,
        category: true, subCategory: true, role: true, verified: true, active: true, photoUrl: true,
        chapter: { select: { brandName: true, city: true } },
      },
    });
    return { total: members.length, members };
  }

  private norm(phone?: string | null) { return String(phone || '').replace(/\D/g, '').slice(-10); }

  async features() {
    const grouped = await this.prisma.featureGrant.groupBy({ by: ['feature'], _count: { feature: true } });
    const counts: Record<string, number> = {};
    for (const g of grouped) counts[g.feature] = g._count.feature;
    return { features: FEATURES.map((f) => ({ ...f, count: counts[f.key] || 0 })) };
  }

  async accessList(feature: string) {
    const grants = await this.prisma.featureGrant.findMany({
      where: { feature },
      include: { member: { select: { name: true, phone: true, slug: true, company: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { feature, members: grants.map((g) => ({ ...g.member, since: g.createdAt })) };
  }

  async grant(feature: string, phone: string) {
    if (!FEATURES.some((f) => f.key === feature)) throw new BadRequestException('Unknown feature');
    const last10 = this.norm(phone);
    if (last10.length < 10) throw new BadRequestException('Enter a valid 10-digit phone number');
    const member = await this.prisma.member.findFirst({ where: { phone: { contains: last10 } } });
    if (!member) throw new NotFoundException('No member found with that phone number');
    await this.prisma.featureGrant.upsert({
      where: { feature_memberId: { feature, memberId: member.id } },
      create: { feature, memberId: member.id },
      update: {},
    });
    return { ok: true, member: { name: member.name, phone: member.phone } };
  }

  async revoke(feature: string, phone: string) {
    const last10 = this.norm(phone);
    const member = await this.prisma.member.findFirst({ where: { phone: { contains: last10 } } });
    if (!member) throw new NotFoundException('No member found with that phone number');
    await this.prisma.featureGrant.deleteMany({ where: { feature, memberId: member.id } });
    return { ok: true };
  }

  async chapters() {
    const rows = await this.prisma.chapter.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { members: true } } } });
    return {
      chapters: await Promise.all(rows.map(async (c) => ({
        name: c.name, brandName: c.brandName, city: c.city, slug: c.slug,
        members: c._count.members,
        verified: await this.prisma.member.count({ where: { chapterId: c.id, verified: true } }),
      }))),
    };
  }
}
