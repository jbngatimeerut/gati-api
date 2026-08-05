import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, map, throwError } from 'rxjs';
import { CryptoService } from './crypto.service';

// Encrypts JSON responses for any request carrying a known session — including the handshake
// call itself, whose response can already be decrypted by the client since it just supplied
// that same AES key. The bootstrap /security/* GET (no session yet) is naturally left plaintext.
// Thrown HttpExceptions (401s, validation errors, etc.) skip the success path entirely and go
// straight to Nest's exception filter, so they're re-wrapped here to keep error bodies encrypted
// too — the HTTP status code itself stays untouched so client error handling still works.
@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  constructor(private crypto: CryptoService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    if (req.path.startsWith('/api/security/public-key')) return next.handle();

    const sessionId = req.header('x-session-id');
    // Checked AFTER the handler runs, not before — the handshake call's own session doesn't
    // exist yet when this interceptor first sees the request, only once the controller has run.
    return next.handle().pipe(
      map((body) => (this.crypto.hasSession(sessionId) ? this.crypto.encrypt(sessionId, body) : body)),
      catchError((err) => {
        if (!this.crypto.hasSession(sessionId) || !(err instanceof HttpException)) return throwError(() => err);
        const encrypted = this.crypto.encrypt(sessionId, err.getResponse());
        return throwError(() => new HttpException(encrypted, err.getStatus()));
      }),
    );
  }
}
