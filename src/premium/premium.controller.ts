import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PremiumService } from './premium.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PREMIUM_CATEGORY_MANAGERS } from '../auth/leadership';
import { CreateCategoryDto, UpdateCategoryDto, SetCategoryPermissionDto } from './premium.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PREMIUM_CATEGORY_MANAGERS)
@Controller('premium/categories')
export class PremiumController {
  constructor(private premium: PremiumService) {}

  @Get()
  list(@Query('chapterId') chapterId?: string) { return this.premium.list(chapterId); }

  @Get('features')
  features() { return this.premium.features(); }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.premium.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.premium.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.premium.remove(id); }

  @Post(':id/members/:memberId')
  assign(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.premium.assignMember(id, memberId);
  }

  @Delete('members/:memberId')
  unassign(@Param('memberId') memberId: string) { return this.premium.unassignMember(memberId); }

  @Patch(':id/permissions/:feature')
  setPermission(@Param('id') id: string, @Param('feature') feature: string, @Body() b: SetCategoryPermissionDto) {
    return this.premium.setPermission(id, feature, b.enabled);
  }
}
