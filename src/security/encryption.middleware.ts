import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { CryptoService } from './crypto.service';

// Decrypts the {iv,data,tag} envelope back into req.body before any guard/pipe/controller runs.
// Requests without a known session (no handshake yet, or the bootstrap /security/* routes
// themselves) pass through untouched — never encrypted in the first place.
@Injectable()
export class EncryptionMiddleware implements NestMiddleware {
  constructor(private crypto: CryptoService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    if (req.path.startsWith('/api/security/')) return next();

    const sessionId = req.header('x-session-id');
    if (this.crypto.hasSession(sessionId) && req.body && typeof req.body === 'object' && 'data' in req.body) {
      req.body = this.crypto.decrypt(sessionId, req.body as any);
    }
    next();
  }
}
