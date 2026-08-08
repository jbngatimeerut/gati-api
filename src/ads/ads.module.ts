import { Module } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdsController, AdsManageController } from './ads.controller';

@Module({ providers: [AdsService], controllers: [AdsController, AdsManageController] })
export class AdsModule {}
