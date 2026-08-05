import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityGuard } from '../hierarchy/capability.guard';
import { RequireCap } from '../hierarchy/capability.decorator';

@UseGuards(JwtAuthGuard)
@Controller('broadcasts')
export class BroadcastsController {
  constructor(private broadcasts: BroadcastsService) {}

  // scope CHAPTER_LEADERS needs network.broadcast; CHAPTER_MEMBERS needs chapter.broadcast.
  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.broadcast')
  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.broadcasts.create(req.user.id, dto);
  }

  @Get('inbox')
  inbox(@Query('chapterId') chapterId: string) {
    return this.broadcasts.inbox(chapterId);
  }

  @Post(':id/read')
  read(@Req() req: any, @Param('id') id: string) {
    return this.broadcasts.markRead(id, req.user.id);
  }

  @UseGuards(CapabilityGuard)
  @RequireCap('chapter.broadcast')
  @Get(':id/receipts')
  receipts(@Param('id') id: string) {
    return this.broadcasts.receipts(id);
  }
}
