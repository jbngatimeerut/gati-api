import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityGuard } from '../hierarchy/capability.guard';
import { RequireCap } from '../hierarchy/capability.decorator';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.payment.request')
  @Post('request')
  request(@Req() req: any, @Body() dto: any) {
    return this.payments.request(req.user, dto);
  }

  // Any signed-in member sees their own dues (works for members, leaders and admins).
  @Get('dues/:memberId')
  dues(@Param('memberId') memberId: string) {
    return this.payments.dues(memberId);
  }

  // Member marks their side as paid — still needs leadership confirmation.
  @Patch(':id/mark-paid')
  markPaid(@Req() req: any, @Param('id') id: string) {
    return this.payments.markPaidByMember(id, req.user.id);
  }

  // Leadership confirms the payment → it clears from the member.
  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.payment.request')
  @Patch(':id/confirm')
  confirm(@Param('id') id: string) {
    return this.payments.confirm(id);
  }

  // Leadership: payments members have marked paid, awaiting confirmation.
  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.payment.request')
  @Get('pending')
  pending(@Query('chapterId') chapterId: string) {
    return this.payments.pendingConfirmations(chapterId);
  }

  @Patch(':id/pay')
  pay(@Req() req: any, @Param('id') id: string) {
    return this.payments.pay(id, req.user.id);
  }
}
