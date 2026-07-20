import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CapabilityGuard } from '../hierarchy/capability.guard';
import { RequireCap } from '../hierarchy/capability.decorator';

@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get()
  list() { return this.roles.all(); }

  // Configurable roles — super-admin only.
  @UseGuards(JwtAuthGuard, CapabilityGuard)
  @RequireCap('roles.manage')
  @Post()
  upsert(@Body() def: any) { return this.roles.upsert(def); }
}
