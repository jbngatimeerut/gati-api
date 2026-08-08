import { Module } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdsController, AdsManageController } from './ads.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({ imports: [RealtimeModule], providers: [AdsService], controllers: [AdsController, AdsManageController] })
export class AdsModule {}
