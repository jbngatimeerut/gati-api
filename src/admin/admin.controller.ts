import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';
import { saveUploadedImage, UPLOAD_MAX_BYTES } from '../common/upload.util';

// Previously this file had its own local LEADERSHIP list ('APEX_ADMIN', 'CHAPTER_ADMIN', ...) —
// role strings that matched zero actual members (the real roles in use are CONVENER,
// TECHNOLOGY_COORDINATOR, etc., from auth/leadership.ts). That silently made every endpoint
// below unreachable by anyone. Now unified on the one real LEADERSHIP list used everywhere else
// — this app has a single leadership tier (no separate super-admin role currently assigned to
// anyone), so all of these are leadership-gated rather than split across two tiers.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('summary')
  @Roles(...LEADERSHIP)
  summary() { return this.admin.summary(); }

  // Who signed in / out, when, from where.
  @Get('members')
  @Roles(...LEADERSHIP)
  members() { return this.admin.members(); }

  @Post('upload')
  @Roles(...LEADERSHIP)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }))
  upload(@UploadedFile() file: any) {
    return saveUploadedImage(file);
  }

  @Get('features')
  @Roles(...LEADERSHIP)
  features() { return this.admin.features(); }

  @Get('access/:feature')
  @Roles(...LEADERSHIP)
  accessList(@Param('feature') feature: string) { return this.admin.accessList(feature); }

  @Post('access/grant-by-id')
  @Roles(...LEADERSHIP)
  grantById(@Body() b: { feature: string; memberId: string }) { return this.admin.grantById(b.feature, b.memberId); }

  @Post('access/grant')
  @Roles(...LEADERSHIP)
  grant(@Body() b: { feature: string; phone: string }) { return this.admin.grant(b.feature, b.phone); }

  @Post('access/revoke')
  @Roles(...LEADERSHIP)
  revoke(@Body() b: { feature: string; phone: string }) { return this.admin.revoke(b.feature, b.phone); }

  @Get('chapters')
  @Roles(...LEADERSHIP)
  chapters() { return this.admin.chapters(); }

  @Get('login-log')
  @Roles(...LEADERSHIP)
  loginLog() { return this.admin.loginLog(); }
}
