import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { RealtimeModule } from '../realtime/realtime.module';
@Module({ imports: [RealtimeModule], providers: [PaymentsService], controllers: [PaymentsController], exports: [PaymentsService] })
export class PaymentsModule {}
