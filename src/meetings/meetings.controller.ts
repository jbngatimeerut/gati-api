import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';

@Controller('meetings')
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get()
  upcoming(@Query('chapterId') chapterId: string) {
    return this.meetings.upcoming(chapterId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.meetings.create(req.user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('today')
  today(@Query('chapterId') chapterId: string) {
    return this.meetings.today(chapterId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('attendance-matrix')
  attendanceMatrix(@Query('chapterId') chapterId: string) {
    return this.meetings.attendanceMatrix(chapterId);
  }

  // Leadership scans a member's personal QR (from that member's meeting screen) to mark them
  // physically present. Body carries only the opaque token — the meeting + member are resolved
  // from it server-side, so there's nothing for the client to spoof.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post('scan')
  scan(@Req() req: any, @Body() body: { token: string }) {
    return this.meetings.scanAttendance(req.user.id, body.token);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.meetings.detail(id);
  }

  // Any signed-in member — this is how they fetch their own personal QR to display on their
  // meeting screen. Nothing sensitive here besides a token that only THEY can present.
  @UseGuards(JwtAuthGuard)
  @Get(':id/my-qr')
  myQr(@Req() req: any, @Param('id') id: string) {
    return this.meetings.getOrCreateQr(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pay')
  pay(@Req() req: any, @Param('id') id: string) {
    return this.meetings.markPaid(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/pay-qr')
  async payQr(@Param('id') id: string, @Res() res: Response) {
    const m: any = await this.meetings.detail(id);
    const upi = `upi://pay?pa=${encodeURIComponent(m?.upiId || '')}&pn=${encodeURIComponent('JITO')}&am=${m?.feeAmount || ''}&tn=${encodeURIComponent(m?.title || 'JITO event')}`;
    const svg = await QRCode.toString(upi, { type: 'svg', margin: 1, width: 240 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  }

  // Manual override, leadership-only — a safety valve (e.g. a broken phone), not exposed as a
  // one-tap button in the member-facing UI anymore. The real path is POST /meetings/scan.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post(':id/attendance')
  mark(@Param('id') id: string, @Body() body: { memberId: string; status: string }) {
    return this.meetings.mark(id, body.memberId, body.status);
  }

  // Roster is leadership-only; individual rate is self-service.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get(':id/attendance-list')
  attendanceList(@Param('id') id: string) {
    return this.meetings.attendanceList(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post(':id/close-attendance')
  closeAttendance(@Param('id') id: string) {
    return this.meetings.closeAttendance(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get(':id/roster')
  roster(@Param('id') id: string) {
    return this.meetings.roster(id);
  }

  // Self-service, as the original comment intended — was reachable by anyone unauthenticated.
  @UseGuards(JwtAuthGuard)
  @Get('rate/:memberId')
  rate(@Req() req: any, @Param('memberId') memberId: string) {
    if (req.user.id !== memberId && !LEADERSHIP.includes(req.user.role)) {
      throw new ForbiddenException("You can only view your own attendance rate");
    }
    return this.meetings.rate(memberId);
  }
}
