import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { AuditService } from '../audit/audit.service';
import { slugify, newCardToken } from '../common/vcard';

function token() { return 'INV-' + Math.random().toString(36).slice(2, 10).toUpperCase(); }

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService, private roles: RolesService, private audit: AuditService) {}

  // Who-onboards-whom is enforced here, from the configurable role definitions.
  async invite(actor: { id?: string; role?: string; chapterId?: string }, dto: {
    email: string; name: string; roleKey: string; chapterId: string;
  }) {
    const allowed = this.roles.canOnboard(actor.role ?? 'MEMBER');
    if (!allowed.includes(dto.roleKey)) {
      throw new ForbiddenException(`A ${actor.role} cannot onboard a ${dto.roleKey}`);
    }
    // chapter-scoped roles can only invite into their own chapter
    if (this.roles.scope(actor.role ?? 'MEMBER') === 'CHAPTER' && dto.chapterId !== actor.chapterId) {
      throw new ForbiddenException('Outside your chapter');
    }
    if (await this.prisma.member.findUnique({ where: { email: dto.email } })) {
      throw new BadRequestException('A member with this email already exists');
    }
    const inv = await this.prisma.invitation.create({
      data: { ...dto, token: token(), invitedById: actor.id },
    });
    await this.audit.record({
      actorId: actor.id, role: actor.role, action: 'ONBOARD_INVITE', entity: 'Invitation', entityId: inv.id,
      summary: `Invited ${dto.name} as ${dto.roleKey}`,
    });
    // In production this token is emailed/SMSed as a link.
    return { id: inv.id, token: inv.token, acceptUrl: `/onboard/${inv.token}` };
  }

  getByToken(t: string) {
    return this.prisma.invitation.findUnique({ where: { token: t } });
  }

  // Invitee accepts, sets a password -> becomes an active member with the granted role + an NFC card.
  async accept(t: string, dto: { password: string; phone?: string; company?: string; category?: string }) {
    const inv = await this.prisma.invitation.findUnique({ where: { token: t } });
    if (!inv || inv.status !== 'PENDING') throw new NotFoundException('Invitation not valid');

    let slug = slugify(inv.name);
    if (await this.prisma.member.findUnique({ where: { slug } })) slug += '-' + Math.random().toString(36).slice(2, 5);

    const member = await this.prisma.member.create({
      data: {
        chapterId: inv.chapterId, name: inv.name, slug, email: inv.email, role: inv.roleKey,
        phone: dto.phone, company: dto.company, category: dto.category,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    await this.prisma.$transaction([
      this.prisma.invitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } }),
      this.prisma.nfcCard.create({ data: { memberId: member.id, token: newCardToken(), status: 'ACTIVE', issuedAt: new Date() } }),
    ]);
    await this.audit.record({
      action: 'ONBOARD_ACCEPT', entity: 'Member', entityId: member.id,
      summary: `${member.name} joined as ${inv.roleKey} (NFC card issued)`,
    });
    return { id: member.id, slug: member.slug, role: member.role };
  }

  pending(chapterId: string) {
    return this.prisma.invitation.findMany({ where: { chapterId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
  }
}
