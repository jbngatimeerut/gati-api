import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsModule } from '../payments/payments.module';
@Module({ imports: [RealtimeModule, PaymentsModule], providers: [MessagingService], controllers: [MessagingController] })
export class MessagingModule {}
