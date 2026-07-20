import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SetuService } from './setu.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';

@Controller('setu')
export class SetuController {
  constructor(private setu: SetuService) {}

  @Get()
  feed(@Query('chapterId') chapterId: string, @Query('status') status?: string) {
    return this.setu.feed(chapterId, status || 'OPEN');
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.setu.create(req.user.id, dto);
  }

  @Get(':id/replies')
  replies(@Param('id') id: string) {
    return this.setu.replies(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/replies')
  addReply(@Req() req: any, @Param('id') id: string, @Body() b: { text: string }) {
    return this.setu.addReply(id, req.user.id, b.text);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/resolve')
  resolve(@Req() req: any, @Param('id') id: string) {
    return this.setu.resolve(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('oversight/all')
  oversight(@Query('chapterId') chapterId: string) {
    return this.setu.oversight(chapterId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() b: { status: string }) {
    return this.setu.setStatus(id, b.status);
  }

  @Get(':id/matches')
  matches(@Param('id') id: string) {
    return this.setu.matches(id);
  }
}
