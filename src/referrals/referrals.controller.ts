import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';

@UseGuards(JwtAuthGuard)
@Controller('referrals')
export class ReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.referrals.create(req.user.id, dto);
  }

  @Get()
  mine(@Query('memberId') memberId: string) {
    return this.referrals.forMember(memberId);
  }

  // Any signed-in member can see the aggregate — it carries no attribution, so it doesn't leak
  // who submitted what (only oversight/all, leadership-gated below, shows that).
  @Get('network-value')
  networkValue(@Query('chapterId') chapterId: string) {
    return this.referrals.networkValue(chapterId);
  }

  // Leadership-only: this is the approval step. Previously open to any authenticated user,
  // which meant a member could mark their own referral CLOSED with any amount.
  @UseGuards(RolesGuard)
  @Roles(...LEADERSHIP)
  @Patch(':id/close')
  close(@Param('id') id: string, @Body() body: { amount: number }) {
    return this.referrals.close(id, body.amount);
  }

  @UseGuards(RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('oversight/all')
  oversight(@Query('chapterId') chapterId: string) {
    return this.referrals.oversight(chapterId);
  }
}
