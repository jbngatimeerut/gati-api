import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURES } from '../admin/admin.service';

@Injectable()
export class PremiumService {
  constructor(private prisma: PrismaService) {}

  list(chapterId?: string) {
    return this.prisma.premiumCategory.findMany({
      where: chapterId ? { OR: [{ chapterId }, { chapterId: null }] } : undefined,
      orderBy: { priority: 'asc' },
      include: {
        permissions: true,
        _count: { select: { members: true } },
        members: { select: { id: true, name: true, slug: true, photoUrl: true, company: true, brandName: true } },
      },
    });
  }

  create(dto: { chapterId?: string; name: string; priority?: number; color: string }) {
    if (!dto.name?.trim()) throw new BadRequestException('Category name is required');
    if (!dto.color?.trim()) throw new BadRequestException('Category color is required');
    return this.prisma.premiumCategory.create({
      data: { chapterId: dto.chapterId || null, name: dto.name.trim(), priority: dto.priority ?? 100, color: dto.color },
    });
  }

  async update(id: string, dto: { name?: string; priority?: number; color?: string; active?: boolean }) {
    const existing = await this.prisma.premiumCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    return this.prisma.premiumCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.premiumCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    // Un-assigns members automatically (FK is nullable) before the category row itself goes.
    await this.prisma.member.updateMany({ where: { premiumCategoryId: id }, data: { premiumCategoryId: null } });
    await this.prisma.premiumCategory.delete({ where: { id } });
    return { ok: true };
  }

  async assignMember(categoryId: string, memberId: string) {
    const category = await this.prisma.premiumCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Member not found');
    await this.prisma.member.update({ where: { id: memberId }, data: { premiumCategoryId: categoryId } });
    return { ok: true };
  }

  async unassignMember(memberId: string) {
    await this.prisma.member.update({ where: { id: memberId }, data: { premiumCategoryId: null } });
    return { ok: true };
  }

  async setPermission(categoryId: string, feature: string, enabled: boolean) {
    if (!FEATURES.some((f) => f.key === feature)) throw new BadRequestException('Unknown feature');
    const category = await this.prisma.premiumCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    await this.prisma.categoryPermission.upsert({
      where: { categoryId_feature: { categoryId, feature } },
      create: { categoryId, feature, enabled },
      update: { enabled },
    });
    return { ok: true };
  }

  features() {
    return { features: FEATURES };
  }
}
