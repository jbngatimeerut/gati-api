import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../realtime/notifications.service';
import { LEADERSHIP } from '../auth/leadership';
import {
  ActivateCampaignDto, CreateAdDealDto, CreateAdSignupInviteDto, CreateCampaignDto, CreateSponsorDto,
  CreateTierDto, SubmitAdSignupDto, UpdateCampaignDto, UpdateTierDto,
} from './ads.dto';

const CAMPAIGN_INCLUDE = { sponsor: { include: { member: { select: { id: true, slug: true, name: true } } } }, tier: true };

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

  // A member has at most one sponsor profile in practice; reused by both the leadership admin
  // "create campaign for a member" flow and the member self-signup flow below.
  private async sponsorForMember(memberId: string, fallbackName: string) {
    const existing = await this.prisma.sponsor.findFirst({ where: { memberId } });
    if (existing) return existing;
    return this.prisma.sponsor.create({ data: { name: fallbackName, memberId } });
  }

  // ---- Campaigns (leadership-direct creation, e.g. a comped/free sponsorship with no signup form) ----
  async createCampaign(actor: { id?: string; role?: string }, dto: CreateCampaignDto) {
    const campaign = await this.prisma.adCampaign.create({
      data: {
        sponsorId: dto.sponsorId,
        tierId: dto.tierId || null,
        chapterId: dto.chapterId || null,
        slot: dto.slot as any,
        title: dto.title,
        imageUrl: dto.imageUrl,
        videoUrl: dto.videoUrl,
        logoUrl: dto.logoUrl,
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
        ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.targetUrl !== undefined ? { targetUrl: dto.targetUrl } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      },
    });
  }

  // No payment gateway: this is the one place a campaign goes DRAFT/PENDING_APPROVAL -> LIVE, and
  // leadership must commit to a run window (confirming the offline payment) to do it.
  async activateCampaign(actor: { id?: string; role?: string }, id: string, dto: ActivateCampaignDto) {
    const existing = await this.prisma.adCampaign.findUnique({ where: { id }, include: CAMPAIGN_INCLUDE });
    if (!existing) throw new NotFoundException('Campaign not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only a draft or pending-approval campaign can be activated');
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    const campaign = await this.prisma.adCampaign.update({ where: { id }, data: { status: 'LIVE', startsAt, endsAt } });
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_STATUS', entity: 'AdCampaign', entityId: id, summary: `Activated campaign "${campaign.title}" -> LIVE (${dto.startsAt} - ${dto.endsAt})` });
    if (existing.sponsor.memberId) {
      await this.notifications.notify(existing.sponsor.memberId, {
        type: 'AD_ACTIVATED',
        title: 'Your ad is now live',
        body: `"${campaign.title}" is running from ${startsAt.toLocaleDateString()} to ${endsAt.toLocaleDateString()}.`,
        entityType: 'AdCampaign',
        entityId: id,
      });
    }
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

  // Cascades: the campaign's own deals are removed, any leads it generated are kept but unlinked
  // (they're the member's own CRM data, not the ad's), and a linked signup invite is removed too —
  // this is what makes the member/leadership ad dashboards "close" per-campaign (see build notes).
  async removeCampaign(actor: { id?: string; role?: string }, id: string) {
    const existing = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    await this.prisma.$transaction([
      this.prisma.adDeal.deleteMany({ where: { campaignId: id } }),
      this.prisma.lead.updateMany({ where: { campaignId: id }, data: { campaignId: null } }),
      this.prisma.adSignupInvite.updateMany({ where: { campaignId: id }, data: { campaignId: null } }),
      this.prisma.adCampaign.delete({ where: { id } }),
    ]);
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_STATUS', entity: 'AdCampaign', entityId: id, summary: `Removed campaign "${existing.title}"` });
  }

  listCampaigns(tierId?: string | null, status?: string) {
    return this.prisma.adCampaign.findMany({
      where: { ...(tierId === undefined ? {} : { tierId }), ...(status ? { status: status as any } : {}) },
      include: CAMPAIGN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Resolves the ad's "Connect" destination: a member-linked sponsor always goes to their live
  // digital-card profile (so a click can turn into a lead via the existing callback form), never
  // to an arbitrary external link the sponsor typed in — that's the whole point of tying named
  // sponsorship to real community members.
  private toPublicCampaign(c: any) {
    const memberSlug: string | undefined = c.sponsor?.member?.slug;
    return {
      ...c,
      linkUrl: memberSlug ? `/m/${memberSlug}` : c.targetUrl,
      linkIsProfile: !!memberSlug,
    };
  }

  // ---- Public: serving, impressions, clicks ----
  // Fresh query on every call, no per-member state (Phase 1 — see build plan). Ordered by tier
  // priority first (lower = more prominent, same direction as search.service.ts's premium-priority
  // sort), then shuffled within a tier so same-tier sponsors rotate fairly.
  async serveAds(slot: string, chapterId?: string) {
    const now = new Date();
    // HOME_TOP is synthetic: named-sponsorship campaigns only, regardless of their own slot —
    // see the AdSlot comment in schema.prisma.
    const isHomeTop = slot === 'HOME_TOP';
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        ...(isHomeTop ? { tierId: { not: null } } : { slot: slot as any }),
        status: 'LIVE',
        OR: [{ chapterId: null }, ...(chapterId ? [{ chapterId }] : [])],
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
      },
      include: CAMPAIGN_INCLUDE,
    });
    const priorityOf = (c: (typeof campaigns)[number]) => (c.tier?.active ? c.tier.priority : Number.MAX_SAFE_INTEGER);
    return campaigns
      .map((c) => ({ c, r: Math.random() }))
      .sort((x, y) => priorityOf(x.c) - priorityOf(y.c) || x.r - y.r)
      .map(({ c }) => this.toPublicCampaign(c));
  }

  // Pre-login named-sponsor logo strip (web landing/login + iOS LoginView) — network-wide, since
  // there's no logged-in member yet to scope a chapter from.
  async namedSponsorLogos() {
    const now = new Date();
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { status: 'LIVE', tierId: { not: null }, logoUrl: { not: null }, OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      include: CAMPAIGN_INCLUDE,
    });
    const priorityOf = (c: (typeof campaigns)[number]) => (c.tier?.active ? c.tier.priority : Number.MAX_SAFE_INTEGER);
    return campaigns
      .map((c) => ({ c, r: Math.random() }))
      .sort((x, y) => priorityOf(x.c) - priorityOf(y.c) || x.r - y.r)
      .map(({ c }) => ({ id: c.id, name: c.sponsor.name, logoUrl: c.logoUrl, tierName: c.tier?.name, ...this.toPublicCampaign(c) }));
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

  // ---- Signup invites: leadership -> a specific, already-agreed member, with a hard deadline ----
  async createInvite(actor: { id?: string; role?: string }, dto: CreateAdSignupInviteDto) {
    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId }, select: { id: true, name: true, active: true } });
    if (!member || !member.active) throw new NotFoundException('Member not found');
    const deadline = new Date(dto.deadline);
    if (deadline <= new Date()) throw new BadRequestException('Deadline must be in the future');
    if (dto.tierId) {
      const tier = await this.prisma.sponsorshipTier.findUnique({ where: { id: dto.tierId } });
      if (!tier) throw new NotFoundException('Tier not found');
    }
    const invite = await this.prisma.adSignupInvite.create({
      data: { memberId: dto.memberId, tierId: dto.tierId || null, deadline, createdById: actor.id || null },
      include: { tier: true },
    });
    await this.notifications.notify(dto.memberId, {
      type: 'AD_SIGNUP_INVITE',
      title: invite.tier ? `You're invited: ${invite.tier.name} sponsorship` : "You're invited to run an ad",
      body: `Fill in your ad details by ${deadline.toLocaleDateString()} to activate it. Tap to get started.`,
      entityType: 'AdSignupInvite',
      entityId: invite.id,
      meta: { inviteId: invite.id, deadline: deadline.toISOString(), tierId: dto.tierId || null },
    });
    await this.audit.record({ actorId: actor.id, role: actor.role, action: 'AD_SIGNUP', entity: 'AdSignupInvite', entityId: invite.id, summary: `Invited ${member.name} to sign up for ${invite.tier?.name ?? 'an ad'} (deadline ${deadline.toLocaleDateString()})` });
    return invite;
  }

  listInvites(status?: string) {
    return this.prisma.adSignupInvite.findMany({
      where: status ? { status: status as any } : undefined,
      include: { tier: true, member: { select: { id: true, name: true, slug: true, company: true } }, campaign: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // The invited member's own currently-actionable invite, if any — null once submitted, expired,
  // or never invited. Drives the popup-on-open form on both web and iOS.
  myPendingInvite(memberId: string) {
    return this.prisma.adSignupInvite.findFirst({
      where: { memberId, status: 'PENDING', deadline: { gt: new Date() } },
      include: { tier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async submitSignup(memberId: string, inviteId: string, dto: SubmitAdSignupDto) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId }, select: { id: true, name: true, company: true, chapterId: true } });
    if (!member) throw new NotFoundException('Member not found');
    const invite = await this.prisma.adSignupInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.memberId !== member.id) throw new ForbiddenException('This invite is not yours');
    if (invite.status !== 'PENDING') throw new BadRequestException('This invite has already been used or has expired');
    if (invite.deadline <= new Date()) {
      await this.prisma.adSignupInvite.update({ where: { id: inviteId }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('The deadline for this invite has passed');
    }
    if (!dto.imageUrl && !dto.videoUrl) throw new BadRequestException('Upload an ad image or video');

    const sponsor = await this.sponsorForMember(member.id, member.company || member.name);
    const campaign = await this.prisma.adCampaign.create({
      data: {
        sponsorId: sponsor.id,
        tierId: invite.tierId,
        chapterId: member.chapterId,
        slot: dto.slot as any,
        title: dto.title,
        imageUrl: dto.imageUrl,
        videoUrl: dto.videoUrl,
        logoUrl: dto.logoUrl,
        targetUrl: dto.targetUrl,
        status: 'PENDING_APPROVAL',
      },
      include: { tier: true },
    });
    await this.prisma.adSignupInvite.update({ where: { id: inviteId }, data: { status: 'SUBMITTED', campaignId: campaign.id, submittedAt: new Date() } });

    const leadership = await this.chapterLeadership(member.chapterId);
    if (leadership.length) {
      await this.notifications.notify(leadership, {
        type: 'AD_SIGNUP_SUBMITTED',
        title: `Ad signup submitted: ${member.name}`,
        body: `${member.name} submitted their ${campaign.tier?.name ?? 'ad'} form. Confirm the payment and activate it from the ads dashboard.`,
        entityType: 'AdCampaign',
        entityId: campaign.id,
      });
    }
    await this.audit.record({ actorId: member.id, action: 'AD_SIGNUP', entity: 'AdCampaign', entityId: campaign.id, summary: `${member.name} submitted ad signup form (${campaign.tier?.name ?? 'Community Spotlight'})` });
    return campaign;
  }

  // Runs every 10 minutes alongside sweepExpiredAds: invites nobody acted on in time simply
  // stop being actionable — no campaign was ever created for them, so there's nothing else to undo.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepExpiredInvites() {
    const expired = await this.prisma.adSignupInvite.findMany({
      where: { status: 'PENDING', deadline: { lt: new Date() } },
      include: { member: { select: { name: true } } },
    });
    if (!expired.length) return;
    for (const invite of expired) {
      await this.prisma.adSignupInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } }).catch(() => {});
    }
    this.logger.log(`Ad signup invite sweep: ${expired.length} invite(s) expired.`);
  }

  // ---- Member self-service: performance dashboard + closed-deal logging ----
  async myCampaigns(memberId: string) {
    const sponsors = await this.prisma.sponsor.findMany({ where: { memberId }, select: { id: true } });
    if (!sponsors.length) return [];
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { sponsorId: { in: sponsors.map((s) => s.id) } },
      include: { tier: true, _count: { select: { leads: true, deals: true } }, deals: { select: { amountInr: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((c) => this.withStats(c));
  }

  private withStats(c: any) {
    const dealsTotalInr = (c.deals ?? []).reduce((sum: number, d: any) => sum + Number(d.amountInr), 0);
    const now = new Date();
    return {
      id: c.id, title: c.title, slot: c.slot, status: c.status,
      tierName: c.tier?.name ?? null,
      imageUrl: c.imageUrl, videoUrl: c.videoUrl, logoUrl: c.logoUrl,
      startsAt: c.startsAt, endsAt: c.endsAt,
      daysRemaining: c.endsAt ? Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - now.getTime()) / 86400000)) : null,
      impressions: c.impressions, clicks: c.clicks,
      ctr: c.impressions > 0 ? Number(((c.clicks / c.impressions) * 100).toFixed(1)) : 0,
      leadsCount: c._count.leads, dealsCount: c._count.deals, dealsTotalInr,
    };
  }

  // Prisma's Decimal serializes to a JSON string by default (Decimal.js's toJSON), which would
  // silently break a strictly-typed client (Swift's Double decode expects a JSON number) — every
  // AdDeal returned to a client goes through this to guarantee a plain number on the wire.
  private serializeDeal(d: { id: string; campaignId: string; amountInr: any; note: string | null; createdAt: Date }) {
    return { ...d, amountInr: Number(d.amountInr) };
  }

  async addDeal(memberId: string, campaignId: string, dto: CreateAdDealDto) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id: campaignId }, include: { sponsor: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.sponsor.memberId !== memberId) throw new ForbiddenException('This is not your campaign');
    if (campaign.status === 'DRAFT' || campaign.status === 'PENDING_APPROVAL') throw new BadRequestException('This ad has not run yet');
    const deal = await this.prisma.adDeal.create({ data: { campaignId, amountInr: dto.amountInr, note: dto.note } });
    return this.serializeDeal(deal);
  }

  async myDeals(memberId: string, campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id: campaignId }, include: { sponsor: true } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.sponsor.memberId !== memberId) throw new ForbiddenException('This is not your campaign');
    const deals = await this.prisma.adDeal.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' } });
    return deals.map((d) => this.serializeDeal(d));
  }

  // ---- Leadership: performance + revenue overview across every campaign in their chapter ----
  async leadershipOverview(chapterId: string) {
    const campaigns = await this.prisma.adCampaign.findMany({
      where: { OR: [{ chapterId }, { chapterId: null }] },
      include: { tier: true, sponsor: true, _count: { select: { leads: true, deals: true } }, deals: { select: { amountInr: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const rows = campaigns.map((c) => ({ ...this.withStats(c), sponsorName: c.sponsor.name }));
    const totals = rows.reduce(
      (acc, r) => ({
        activeCampaigns: acc.activeCampaigns + (r.status === 'LIVE' ? 1 : 0),
        pendingApproval: acc.pendingApproval + (r.status === 'PENDING_APPROVAL' ? 1 : 0),
        impressions: acc.impressions + r.impressions,
        clicks: acc.clicks + r.clicks,
        leads: acc.leads + r.leadsCount,
        revenueInr: acc.revenueInr + r.dealsTotalInr,
      }),
      { activeCampaigns: 0, pendingApproval: 0, impressions: 0, clicks: 0, leads: 0, revenueInr: 0 },
    );
    return { totals, campaigns: rows.sort((a, b) => b.dealsTotalInr - a.dealsTotalInr) };
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
