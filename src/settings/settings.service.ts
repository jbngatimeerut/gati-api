import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async getReferralFee(chapterId: string) {
    const c = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    return { chapterId, referralFeePct: Number(c?.referralFeePct ?? 0) };
  }

  async setReferralFee(chapterId: string, pct: number, actor: { id?: string; role?: string }) {
    const before = await this.getReferralFee(chapterId);
    const c = await this.prisma.chapter.update({ where: { id: chapterId }, data: { referralFeePct: pct } });
    await this.audit.record({
      actorId: actor.id, role: actor.role, action: 'REFERRAL_FEE_AMEND', entity: 'Chapter', entityId: chapterId,
      summary: `Referral fee changed ${before.referralFeePct}% → ${pct}%`,
      meta: { before: before.referralFeePct, after: pct },
    });
    return { chapterId, referralFeePct: Number(c.referralFeePct) };
  }
}
