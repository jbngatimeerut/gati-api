import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdsService } from './ads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PREMIUM_CATEGORY_MANAGERS } from '../auth/leadership';
import { saveUploadedImage, UPLOAD_MAX_BYTES } from '../common/upload.util';
import { CreateCampaignDto, CreateSponsorDto, CreateTierDto, UpdateCampaignDto, UpdateTierDto } from './ads.dto';

// ---- Public: ads must render on public digital card pages too, so serving/tracking/sponsors
// stay unauthenticated. Leadership-only management lives under /ads/manage/*. ----
@Controller('ads')
export class AdsController {
  constructor(private ads: AdsService) {}

  @Get()
  serve(@Query('slot') slot: string, @Query('chapterId') chapterId?: string) {
    return this.ads.serveAds(slot, chapterId);
  }

  @Get('sponsors')
  sponsorsPage() {
    return this.ads.sponsorsPage();
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
  listCampaigns(@Query('tierId') tierId?: string) {
    return this.ads.listCampaigns(tierId === undefined ? undefined : tierId || null);
  }

  @Post('campaigns')
  createCampaign(@Req() req: any, @Body() dto: CreateCampaignDto) { return this.ads.createCampaign(req.user, dto); }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() dto: UpdateCampaignDto) { return this.ads.updateCampaign(id, dto); }

  @Post('campaigns/:id/approve')
  approve(@Req() req: any, @Param('id') id: string) { return this.ads.approveCampaign(req.user, id); }

  @Post('campaigns/:id/pause')
  pause(@Req() req: any, @Param('id') id: string) { return this.ads.pauseCampaign(req.user, id); }

  @Post('campaigns/:id/resume')
  resume(@Req() req: any, @Param('id') id: string) { return this.ads.resumeCampaign(req.user, id); }

  @Delete('campaigns/:id')
  removeCampaign(@Param('id') id: string) { return this.ads.removeCampaign(id); }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }))
  upload(@UploadedFile() file: any) { return saveUploadedImage(file); }
}
