import { Module } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ReferralsController } from './referrals.controller';
import { RealtimeModule } from '../realtime/realtime.module';
@Module({ imports: [RealtimeModule], providers: [ReferralsService], controllers: [ReferralsController] })
export class ReferralsModule {}
