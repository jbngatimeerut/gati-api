import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdsService } from './ads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PREMIUM_CATEGORY_MANAGERS } from '../auth/leadership';
import { saveUploadedMedia, VIDEO_MAX_BYTES } from '../common/upload.util';
import {
  ActivateCampaignDto, CreateAdDealDto, CreateAdSignupInviteDto, CreateCampaignDto, CreateSponsorDto,
  CreateTierDto, SubmitAdSignupDto, UpdateCampaignDto, UpdateTierDto,
} from './ads.dto';

// ---- Public: ads must render on public digital card / pre-login pages too, so serving/tracking
// stay unauthenticated. Member-scoped routes live under /ads/me/*, leadership-only under
// /ads/manage/*. ----
@Controller('ads')
export class AdsController {
  constructor(private ads: AdsService) {}

  @Get()
  serve(@Query('slot') slot: string, @Query('chapterId') chapterId?: string) {
    return this.ads.serveAds(slot, chapterId);
  }

  @Get('named-sponsors')
  namedSponsors() {
    return this.ads.namedSponsorLogos();
  }

  @Post(':id/impression')
  impression(@Param('id') id: string) {
    return this.ads.trackImpression(id);
  }

  @Post(':id/click')
  click(@Param('id') id: string) {
    return this.ads.trackClick(id);
  }
}

// ---- Member-scoped: any signed-in, active member — checking their own invite, submitting their
// own signup form, viewing their own campaign dashboard, logging their own closed deals. Every
// method in AdsService this calls independently re-checks ownership by memberId, never trusting
// an id in the URL alone. ----
@UseGuards(JwtAuthGuard)
@Controller('ads/me')
export class AdsMeController {
  constructor(private ads: AdsService) {}

  @Get('invite')
  myInvite(@Req() req: any) {
    return this.ads.myPendingInvite(req.user.id);
  }

  @Post('invite/:id/submit')
  submit(@Req() req: any, @Param('id') id: string, @Body() dto: SubmitAdSignupDto) {
    return this.ads.submitSignup(req.user.id, id, dto);
  }

  @Get('campaigns')
  myCampaigns(@Req() req: any) {
    return this.ads.myCampaigns(req.user.id);
  }

  @Get('campaigns/:id/deals')
  myDeals(@Req() req: any, @Param('id') id: string) {
    return this.ads.myDeals(req.user.id, id);
  }

  @Post('campaigns/:id/deals')
  addDeal(@Req() req: any, @Param('id') id: string, @Body() dto: CreateAdDealDto) {
    return this.ads.addDeal(req.user.id, id, dto);
  }

  // Members need to upload their own ad creative/logo when filling the signup form — this is
  // deliberately not under /ads/manage (leadership-only); ownership of the resulting campaign is
  // enforced separately when the upload URL is submitted.
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_MAX_BYTES } }))
  upload(@UploadedFile() file: any) {
    return saveUploadedMedia(file);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PREMIUM_CATEGORY_MANAGERS)
@Controller('ads/manage')
export class AdsManageController {
  constructor(private ads: AdsService) {}

  // Tiers
  @Get('tiers')
  listTiers(@Query('chapterId') chapterId?: string) { return this.ads.list(chapterId); }

  @Post('tiers')
  createTier(@Body() dto: CreateTierDto) { return this.ads.createTier(dto); }

  @Patch('tiers/:id')
  updateTier(@Param('id') id: string, @Body() dto: UpdateTierDto) { return this.ads.updateTier(id, dto); }

  @Delete('tiers/:id')
  removeTier(@Param('id') id: string) { return this.ads.removeTier(id); }

  // Sponsors
  @Get('sponsors')
  listSponsors() { return this.ads.listSponsors(); }

  @Post('sponsors')
  createSponsor(@Body() dto: CreateSponsorDto) { return this.ads.createSponsor(dto); }

  // Campaigns
  @Get('campaigns')
  listCampaigns(@Query('tierId') tierId?: string, @Query('status') status?: string) {
    return this.ads.listCampaigns(tierId === undefined ? undefined : tierId || null, status);
  }

  @Post('campaigns')
  createCampaign(@Req() req: any, @Body() dto: CreateCampaignDto) { return this.ads.createCampaign(req.user, dto); }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() dto: UpdateCampaignDto) { return this.ads.updateCampaign(id, dto); }

  // No payment gateway: this is where leadership confirms the offline payment and commits to a
  // run window, moving a DRAFT or PENDING_APPROVAL campaign to LIVE.
  @Post('campaigns/:id/activate')
  activate(@Req() req: any, @Param('id') id: string, @Body() dto: ActivateCampaignDto) { return this.ads.activateCampaign(req.user, id, dto); }

  @Post('campaigns/:id/pause')
  pause(@Req() req: any, @Param('id') id: string) { return this.ads.pauseCampaign(req.user, id); }

  @Post('campaigns/:id/resume')
  resume(@Req() req: any, @Param('id') id: string) { return this.ads.resumeCampaign(req.user, id); }

  @Delete('campaigns/:id')
  removeCampaign(@Req() req: any, @Param('id') id: string) { return this.ads.removeCampaign(req.user, id); }

  // Signup invites
  @Get('invites')
  listInvites(@Query('status') status?: string) { return this.ads.listInvites(status); }

  @Post('invites')
  createInvite(@Req() req: any, @Body() dto: CreateAdSignupInviteDto) { return this.ads.createInvite(req.user, dto); }

  // Revenue + performance overview
  @Get('overview')
  overview(@Req() req: any) { return this.ads.leadershipOverview(req.user.chapterId); }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_MAX_BYTES } }))
  upload(@UploadedFile() file: any) { return saveUploadedMedia(file); }
}
