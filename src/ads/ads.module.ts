import { Module } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdsController, AdsManageController, AdsMeController } from './ads.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({ imports: [RealtimeModule], providers: [AdsService], controllers: [AdsController, AdsMeController, AdsManageController] })
export class AdsModule {}
