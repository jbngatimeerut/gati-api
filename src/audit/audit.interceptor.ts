import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

// Coarse net: every authenticated, state-changing request is logged.
// Services add richer, human-readable entries on top for key events.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    if (!mutating || !req.user) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.audit.record({
          actorId: req.user.id, role: req.user.role,
          action: `${req.method} ${req.route?.path ?? req.url}`,
          ip: req.ip,
          summary: `${req.user.role} called ${req.method} ${req.route?.path ?? req.url}`,
        });
      }),
    );
  }
}
