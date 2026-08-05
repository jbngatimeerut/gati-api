import { Body, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityGuard } from '../hierarchy/capability.guard';
import { RequireCap } from '../hierarchy/capability.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('referral-fee')
  get(@Query('chapterId') chapterId: string) {
    return this.settings.getReferralFee(chapterId);
  }

  // Only roles with chapter.referralFee.amend (chapter head / super admin); scope-checked.
  @UseGuards(JwtAuthGuard, CapabilityGuard)
  @RequireCap('chapter.referralFee.amend')
  @Patch('referral-fee')
  set(@Req() req: any, @Body() b: { chapterId: string; pct: number }) {
    return this.settings.setReferralFee(b.chapterId, b.pct, req.user);
  }
}
