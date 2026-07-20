import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityGuard } from '../hierarchy/capability.guard';
import { RequireCap } from '../hierarchy/capability.decorator';

@Controller('onboarding')
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  @UseGuards(JwtAuthGuard, CapabilityGuard)
  @RequireCap('member.onboard')
  @Post('invite')
  invite(@Req() req: any, @Body() dto: any) {
    return this.onboarding.invite(req.user, dto);
  }

  @Get('invite/:token')          // public — invitee opens the link
  show(@Param('token') token: string) {
    return this.onboarding.getByToken(token);
  }

  @Post('accept/:token')         // public — invitee sets password
  accept(@Param('token') token: string, @Body() dto: any) {
    return this.onboarding.accept(token, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilityGuard)
  @RequireCap('member.onboard')
  @Get('pending')
  pending(@Query('chapterId') chapterId: string) {
    return this.onboarding.pending(chapterId);
  }
}
