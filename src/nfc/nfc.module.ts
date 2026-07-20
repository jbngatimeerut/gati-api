import { Module } from '@nestjs/common';
import { NfcService } from './nfc.service';
import { NfcController } from './nfc.controller';

@Module({ providers: [NfcService], controllers: [NfcController] })
export class NfcModule {}
