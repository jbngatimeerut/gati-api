import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@Req() req: any, @Query('page') page?: string) {
    return this.notifications.list(req.user.id, page ? parseInt(page, 10) : 1);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    return { count: await this.notifications.unreadCount(req.user.id) };
  }

  @Post(':id/read')
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.notifications.markRead(req.user.id, id);
  }

  @Post('read-all')
  markAllRead(@Req() req: any) {
    return this.notifications.markAllRead(req.user.id);
  }

  @Post('device-token')
  registerDevice(@Req() req: any, @Body() b: { token: string; platform?: string }) {
    return this.notifications.registerDevice(req.user.id, b.token, b.platform || 'ios');
  }
}
