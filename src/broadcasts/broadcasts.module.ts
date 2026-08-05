import { Module } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsController } from './broadcasts.controller';
import { RealtimeModule } from '../realtime/realtime.module';
@Module({ imports: [RealtimeModule], providers: [BroadcastsService], controllers: [BroadcastsController] })
export class BroadcastsModule {}
