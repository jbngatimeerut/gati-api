import {
  Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { NfcService } from './nfc.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';
import { CreateLeadDto } from './lead.dto';

@Controller()
export class NfcController {
  constructor(private nfc: NfcService) {}

  // ---- Public endpoints (the card is a public object) ----
  // Tighter than the global default — friction against bulk scraping of the public directory
  // via slug enumeration. Doesn't stop a determined scraper with a real browser session, but
  // raises the cost of doing it at scale.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('m/:slug')
  profile(@Param('slug') slug: string) {
    return this.nfc.publicProfile(slug);
  }

  @Get('t/:token')
  async tap(
    @Param('token') token: string,
    @Headers('user-agent') ua: string,
    @Query('src') src: string,
  ) {
    return this.nfc.resolveTap(token, { source: src, userAgent: ua });
  }

  @Get('m/:slug/vcard')
  async vcard(@Param('slug') slug: string, @Res() res: Response) {
    const vcf = await this.nfc.vcard(slug);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.vcf"`);
    res.send(vcf);
  }

  @Get('m/:slug/qr')
  async qr(@Param('slug') slug: string, @Res() res: Response) {
    const base = process.env.WEB_ORIGIN?.split(',')[0] || 'https://gati.app';
    const svg = await QRCode.toString(`${base}/m/${slug}`, { type: 'svg', margin: 1, width: 320 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  }

  @Post('m/:slug/lead')
  lead(@Param('slug') slug: string, @Body() dto: CreateLeadDto) {
    return this.nfc.createLead(slug, dto);
  }

  // ---- Admin / member endpoints ----
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post('nfc/issue')
  issue(@Body() body: { memberId: string; batchRef?: string }) {
    return this.nfc.issueCard(body.memberId, body.batchRef);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('nfc/cards')
  cards() {
    return this.nfc.listCards();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post('nfc/:id/revoke')
  revoke(@Param('id') id: string) {
    return this.nfc.revokeCard(id);
  }

  @UseGuards(JwtAuthGuard)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('nfc/leads/:memberId')
  leads(@Param('memberId') memberId: string) {
    return this.nfc.memberLeads(memberId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('nfc/my-leads')
  myLeads(@Req() req: any) {
    return this.nfc.memberLeads(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('nfc/taps/:memberId')
  taps(@Param('memberId') memberId: string) {
    return this.nfc.cardTaps(memberId);
  }
}
