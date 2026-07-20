import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagingController {
  constructor(private svc: MessagingService) {}

  @Get('threads')
  threads(@Req() req: any) { return this.svc.threads(req.user.id); }

  @Get('resolve/:slug')
  resolve(@Param('slug') slug: string) { return this.svc.resolve(slug); }

  @Get('with/:memberId')
  thread(@Req() req: any, @Param('memberId') memberId: string) { return this.svc.thread(req.user.id, memberId); }

  @Post()
  async send(@Req() req: any, @Body() b: { toId?: string; toSlug?: string; body: string }) {
    let toId = b.toId;
    if (!toId && b.toSlug) toId = (await this.svc.resolve(b.toSlug)).id;
    return this.svc.send(req.user.id, toId as string, b.body);
  }
}
