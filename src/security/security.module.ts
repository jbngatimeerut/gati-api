import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CryptoService } from './crypto.service';
import { SecurityController } from './security.controller';
import { EncryptionMiddleware } from './encryption.middleware';
import { EncryptionInterceptor } from './encryption.interceptor';

@Module({
  controllers: [SecurityController],
  providers: [
    CryptoService,
    EncryptionMiddleware,
    { provide: APP_INTERCEPTOR, useClass: EncryptionInterceptor },
  ],
  exports: [CryptoService, EncryptionMiddleware],
})
export class SecurityModule {}
