import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CryptoService } from './crypto.service';
import { HandshakeDto } from './security.dto';

// Bootstrap endpoints for the app-layer encryption handshake — necessarily unencrypted
// themselves, since a client can't decrypt the message that tells it how to decrypt.
@Controller('security')
export class SecurityController {
  constructor(private crypto: CryptoService) {}

  @Get('public-key')
  publicKey() {
    return this.crypto.publicKeyDer;
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('handshake')
  handshake(@Body() dto: HandshakeDto) {
    this.crypto.handshake(dto.sessionId, dto.encryptedKey);
    return { ok: true };
  }
}
