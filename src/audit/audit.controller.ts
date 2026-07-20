import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAPTER_ADMIN', 'APEX_ADMIN')
@Controller('admin/audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  list(@Query('action') action?: string, @Query('entity') entity?: string, @Query('cursor') cursor?: string) {
    return this.audit.list({ action, entity, cursor });
  }
}
