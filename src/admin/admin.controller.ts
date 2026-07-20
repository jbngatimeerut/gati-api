import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const LEADERSHIP = ['APEX_ADMIN', 'CHAPTER_ADMIN', 'CHAPTER_PRESIDENT', 'CHAPTER_CO_PRESIDENT',
  'CHAPTER_CHAIRMAN', 'CHAPTER_SECRETARY', 'CHAPTER_TREASURER'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('summary')
  @Roles('APEX_ADMIN', 'CHAPTER_ADMIN')
  summary() { return this.admin.summary(); }

  // Who signed in / out, when, from where — visible to super admin + chapter heads.
  @Get('members')
  @Roles('APEX_ADMIN')
  members() { return this.admin.members(); }

  @Post('upload')
  @Roles('APEX_ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('No file');
    const ext = (String(file.originalname || 'img').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const name = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const dir = join(process.cwd(), 'uploads');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), file.buffer);
    return { url: `/api/uploads/${name}` };
  }

  @Get('features')
  @Roles('APEX_ADMIN')
  features() { return this.admin.features(); }

  @Get('access/:feature')
  @Roles('APEX_ADMIN')
  accessList(@Param('feature') feature: string) { return this.admin.accessList(feature); }

  @Post('access/grant')
  @Roles('APEX_ADMIN')
  grant(@Body() b: { feature: string; phone: string }) { return this.admin.grant(b.feature, b.phone); }

  @Post('access/revoke')
  @Roles('APEX_ADMIN')
  revoke(@Body() b: { feature: string; phone: string }) { return this.admin.revoke(b.feature, b.phone); }

  @Get('chapters')
  @Roles('APEX_ADMIN')
  chapters() { return this.admin.chapters(); }

  @Get('login-log')
  @Roles(...LEADERSHIP)
  loginLog() { return this.admin.loginLog(); }
}
