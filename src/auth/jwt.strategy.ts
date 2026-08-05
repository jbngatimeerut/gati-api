import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JWT_SECRET } from './jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_SECRET,
    });
  }

  // Re-checked against the DB on every request rather than trusting the token payload — a token
  // is only as fresh as when it was issued (up to 24h), so without this an offboarded member or
  // one whose role just changed keeps their old access until the token naturally expires.
  async validate(payload: any) {
    const id = payload.sub || payload.id;
    if (!id) throw new UnauthorizedException();
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: { id: true, role: true, chapterId: true, active: true },
    });
    if (!member || !member.active) throw new UnauthorizedException('This account is no longer active');
    return { id: member.id, role: member.role, chapterId: member.chapterId };
  }
}
