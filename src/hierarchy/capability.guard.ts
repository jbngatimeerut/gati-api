import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAP_KEY } from './capability.decorator';
import { Capability } from './permissions';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private reflector: Reflector, private roles: RolesService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cap = this.reflector.getAllAndOverride<Capability>(CAP_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!cap) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user || !this.roles.has(user.role, cap)) throw new ForbiddenException('Not permitted at your level');

    const scope = this.roles.scope(user.role);
    if (scope === 'CHAPTER') {
      const target = req.query.chapterId || req.body?.chapterId;
      if (target && target !== user.chapterId) throw new ForbiddenException('Outside your chapter');
    }
    if (scope === 'SELF') {
      const target = req.params.memberId || req.query.memberId || req.body?.memberId;
      if (target && target !== user.id) throw new ForbiddenException('Not your record');
    }
    return true;
  }
}
