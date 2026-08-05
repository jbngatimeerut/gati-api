import { Module } from '@nestjs/common';
import { SetuService } from './setu.service';
import { SetuController } from './setu.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsModule } from '../payments/payments.module';
@Module({ imports: [RealtimeModule, PaymentsModule], providers: [SetuService], controllers: [SetuController] })
export class SetuModule {}
