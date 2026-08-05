import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LEADERSHIP } from '../auth/leadership';
import { saveUploadedImage, UPLOAD_MAX_BYTES } from '../common/upload.util';
import { CreateMemberDto, UpdateSelfDto } from './members.dto';

@Controller('members')
export class MembersController {
  constructor(private members: MembersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/features')
  myFeatures(@Req() req: any) { return this.members.myFeatures(req.user.id); }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateSelf(@Req() req: any, @Body() dto: UpdateSelfDto) { return this.members.updateSelf(req.user, dto); }

  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }))
  @Post('upload')
  upload(@UploadedFile() file: any) {
    return saveUploadedImage(file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Get('pending-edits')
  pendingEdits(@Query('chapterId') chapterId?: string) { return this.members.pendingEdits(chapterId); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post('pending-edits/:id/approve')
  approveEdit(@Param('id') id: string) { return this.members.approveEdit(id); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Post('pending-edits/:id/reject')
  rejectEdit(@Param('id') id: string) { return this.members.rejectEdit(id); }

  @Get()
  list(@Query('chapterId') chapterId: string, @Query('q') q?: string) {
    return this.members.list(chapterId, q);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('APEX_ADMIN')
  @Post()
  create(@Req() req: any, @Body() dto: CreateMemberDto) {
    return this.members.create(dto, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CHAPTER_ADMIN', 'APEX_ADMIN')
  @Patch(':id/verify')
  verify(@Req() req: any, @Param('id') id: string, @Body() b: { verified: boolean }) {
    return this.members.setVerified(id, b.verified, req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...LEADERSHIP)
  @Patch(':id/offboard')
  offboard(@Req() req: any, @Param('id') id: string) {
    return this.members.offboard(id, req.user);
  }
}
