import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../realtime/notifications.service';
import { LEADERSHIP } from '../auth/leadership';
import { CreateCampaignDto, CreateSponsorDto, CreateTierDto, UpdateCampaignDto, UpdateTierDto } from './ads.dto';

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  // ---- Sponsorship tiers (Title Sponsor / Powered By / ...) — exact mirror of PremiumService ----
  list(chapterId?: string) {
    return this.prisma.sponsorshipTier.findMany({
      where: chapterId ? { OR: [{ chapterId }, { chapterId: null }] } : undefined,
      orderBy: { priority: 'asc' },
      include: { _count: { select: { campaigns: true } } },
    });
  }

  async createTier(dto: CreateTierDto) {
    return this.prisma.sponsorshipTier.create({
      data: { chapterId: dto.chapterId || null, name: dto.name.trim(), priority: dto.priority ?? 100, color: dto.color },
    });
  }

  async updateTier(id: string, dto: UpdateTierDto) {
    const existing = await this.prisma.sponsorshipTier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tier not found');
    return this.prisma.sponsorshipTier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async removeTier(id: string) {
    // Untier any campaigns instead of orphaning the delete — they fall back to "Community Spotlight".
    await this.prisma.adCampaign.updateMany({ where: { tierId: id }, data: { tierId: null } });
    return this.prisma.sponsorshipTier.delete({ where: { id } });
  }

  // ---- Sponsors ----
  createSponsor(dto: CreateSponsorDto) {
    return this.prisma.sponsor.create({ data: { name: dto.name.trim(), contact: dto.contact, memberId: dto.memberId || null } });
  }

  listSponsors() {
    return this.prisma.sponsor.findMany({ orderBy: { name: 'asc' } });
  }

  // ---- Campaigns ----
  async createCampaign(actor: { id?: string; role?: string }, dto: CreateCampaignDto) {
    const campaign = await this.prisma.adCampaign.create({
      data: {
        sponsorId: dto.sponsorId,
        tierId: dto.tierId || null,
        chapterId: dto.chapterId || null,
        slot: dto.slot as any,
        title: dto.title,
        imageUrl: dto.imageUrl,
        targetUrl: dto.targetUrl,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_STATUS', entity: 'AdCampaign', entityId: campaign.id, summary: `Created campaign "${campaign.title}" (DRAFT)` });
    return campaign;
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    const existing = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    return this.prisma.adCampaign.update({
      where: { id },
      data: {
        ...(dto.tierId !== undefined ? { tierId: dto.tierId || null } : {}),
        ...(dto.slot !== undefined ? { slot: dto.slot as any } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.targetUrl !== undefined ? { targetUrl: dto.targetUrl } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      },
    });
  }

  // Direct DRAFT -> LIVE for a comped/free sponsorship. A campaign gated behind payment instead
  // goes live via payments.service.ts confirm()/pay() (PaymentRequest.gatesAdId), not this path.
  async approveCampaign(actor: { id?: string; role?: string }, id: string) {
    const campaign = await this.prisma.adCampaign.update({ where: { id }, data: { status: 'LIVE' } });
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_STATUS', entity: 'AdCampaign', entityId: id, summary: `Approved campaign "${campaign.title}" -> LIVE` });
    return campaign;
  }

  async pauseCampaign(actor: { id?: string; role?: string }, id: string) {
    const campaign = await this.prisma.adCampaign.update({ where: { id }, data: { status: 'PAUSED' } });
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_STATUS', entity: 'AdCampaign', entityId: id, summary: `Paused campaign "${campaign.title}"` });
    return campaign;
  }

  async resumeCampaign(actor: { id?: string; role?: string }, id: string) {
    const campaign = await this.prisma.adCampaign.update({ where: { id }, data: { status: 'LIVE' } });
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_STATUS', entity: 'AdCampaign', entityId: id, summary: `Resumed campaign "${campaign.title}"` });
    return campaign;
  }

  removeCampaign(id: string) {
    return this.prisma.adCampaign.delete({ where: { id } });
  }

  listCampaigns(tierId?: string | null) {
    return this.prisma.adCampaign.findMany({
      where: tierId === undefined ? undefined : { tierId },
      include: { sponsor: true, tier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Public: serving, impressions, clicks ----
  // Fresh query on every call, no per-member state (Phase 1 — see build plan). Ordered by tier
  // priority first (lower = more prominent, same direction as search.service.ts's premium-priority
  // sort), then shuffled within a tier so same-tier sponsors rotate fairly.
  async serveAds(slot: string, chapterId?: string) {
    const now = new Date();
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        slot: slot as any,
        status: 'LIVE',
        OR: [{ chapterId: null }, ...(chapterId ? [{ chapterId }] : [])],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        ],
      },
      include: { sponsor: true, tier: true },
    });
    const priorityOf = (c: (typeof campaigns)[number]) => (c.tier?.active ? c.tier.priority : Number.MAX_SAFE_INTEGER);
    return campaigns
      .map((c) => ({ c, r: Math.random() }))
      .sort((x, y) => priorityOf(x.c) - priorityOf(y.c) || x.r - y.r)
      .map(({ c }) => c);
  }

  // Every live sponsor is guaranteed a listing here, regardless of which other zone(s) their
  // campaign is placed in — this is the one place a member can browse the full sponsor roster,
  // not just one more slot a campaign happens to be assigned to.
  async sponsorsPage() {
    const now = new Date();
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { status: 'LIVE', OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      include: { sponsor: true, tier: true },
    });
    const priorityOf = (c: (typeof campaigns)[number]) => (c.tier?.active ? c.tier.priority : Number.MAX_SAFE_INTEGER);
    campaigns.sort((a, b) => priorityOf(a) - priorityOf(b));
    const grouped = new Map<string, typeof campaigns>();
    for (const c of campaigns) {
      const key = c.tier?.name ?? 'Community Spotlight';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(c);
    }
    return Array.from(grouped.entries()).map(([tier, campaigns]) => ({ tier, campaigns }));
  }

  trackImpression(id: string) {
    return this.prisma.adCampaign.update({ where: { id }, data: { impressions: { increment: 1 } } }).catch(() => {});
  }

  trackClick(id: string) {
    return this.prisma.adCampaign.update({ where: { id }, data: { clicks: { increment: 1 } } }).catch(() => {});
  }

  private async chapterLeadership(chapterId: string | null): Promise<string[]> {
    if (!chapterId) return [];
    const leaders = await this.prisma.member.findMany({ where: { chapterId, role: { in: LEADERSHIP }, active: true }, select: { id: true } });
    return leaders.map((l) => l.id);
  }

  // Runs every 10 minutes: finds LIVE campaigns whose endsAt just passed (not yet notified),
  // retires them, and notifies the sponsor's linked member (if any) plus chapter leadership.
  // Exact structural mirror of payments.service.ts sweepOverduePayments().
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepExpiredAds() {
    const expired = await this.prisma.adCampaign.findMany({
      where: { status: 'LIVE', endsAt: { not: null, lt: new Date() }, expiredNotifiedAt: null },
      include: { sponsor: true },
    });
    if (!expired.length) return;
    for (const campaign of expired) {
      try {
        await this.prisma.adCampaign.update({ where: { id: campaign.id }, data: { status: 'ENDED', expiredNotifiedAt: new Date() } });
        const recipients: string[] = [];
        if (campaign.sponsor.memberId) recipients.push(campaign.sponsor.memberId);
        recipients.push(...(await this.chapterLeadership(campaign.chapterId)));
        if (recipients.length) {
          await this.notifications.notify(recipients, {
            type: 'AD_EXPIRED',
            title: `Ad campaign ended: ${campaign.title}`,
            body: 'This campaign has passed its expiry date and is no longer running. Renew it to keep it live.',
            entityType: 'AdCampaign',
            entityId: campaign.id,
          });
        }
      } catch (e) {
        this.logger.warn(`Expiry sweep failed for AdCampaign ${campaign.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(`Ad expiry sweep: ${expired.length} campaign(s) retired.`);
  }
}
