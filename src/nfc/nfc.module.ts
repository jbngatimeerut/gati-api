import { Module } from '@nestjs/common';
import { NfcService } from './nfc.service';
import { NfcController } from './nfc.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({ imports: [RealtimeModule, PaymentsModule], providers: [NfcService], controllers: [NfcController] })
export class NfcModule {}
