import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityGuard } from '../hierarchy/capability.guard';
import { RequireCap } from '../hierarchy/capability.decorator';
import { LEADERSHIP } from '../auth/leadership';
import { RequestPaymentDto } from './payments.dto';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.payment.request')
  @Post('request')
  request(@Req() req: any, @Body() dto: RequestPaymentDto) {
    return this.payments.request(req.user, dto);
  }

  // A member sees their own dues; leadership can look up anyone's.
  @Get('dues/:memberId')
  dues(@Req() req: any, @Param('memberId') memberId: string) {
    if (req.user.id !== memberId && !LEADERSHIP.includes(req.user.role)) {
      throw new ForbiddenException("You can only view your own dues");
    }
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

  // Leadership excuses a due payment without collecting it.
  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.payment.request')
  @Patch(':id/waive')
  waive(@Param('id') id: string) {
    return this.payments.waive(id);
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
