import { Module } from '@nestjs/common';
import { PremiumService } from './premium.service';
import { PremiumController } from './premium.controller';

@Module({ providers: [PremiumService], controllers: [PremiumController] })
export class PremiumModule {}
