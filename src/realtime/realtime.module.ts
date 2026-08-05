import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { ApnsService } from './apns.provider';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  providers: [RealtimeGateway, ApnsService, NotificationsService],
  controllers: [NotificationsController],
  exports: [RealtimeGateway, NotificationsService],
})
export class RealtimeModule {}
