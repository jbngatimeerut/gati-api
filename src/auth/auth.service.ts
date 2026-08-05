import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { sendOtpSms } from './sms';

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const CHANNEL = (process.env.OTP_CHANNEL || 'off').toLowerCase(); // 'off' | 'email' | 'sms'
const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, (_m, a, b) => `${a}•••${b}`);
// Per-ACCOUNT lockout (keyed only by email, never by client-suppliable IP) — catches a
// distributed attacker rotating IPs to stay under the framework-level @Throttle() on the login
// route (auth.controller.ts), which is per-IP. The two are complementary, not redundant: IP
// throttling stops one source hammering many accounts; this stops many sources hammering one.
const attempts = new Map<string, { n: number; until: number }>();
function throttle(key: string) {
  const rec = attempts.get(key);
  if (rec && rec.until > Date.now() && rec.n >= 8) {
    throw new UnauthorizedException('Too many attempts — try again in a few minutes');
  }
}
function markFail(key: string) {
  const rec = attempts.get(key) || { n: 0, until: Date.now() + 15 * 60000 };
  rec.n += 1; rec.until = Date.now() + 15 * 60000; attempts.set(key, rec);
}
function clearFail(key: string) { attempts.delete(key); }

const pub = (m: any) => ({
  id: m.id, name: m.name, role: m.role, slug: m.slug, chapterId: m.chapterId,
  premiumColor: m.premiumCategory?.active ? m.premiumCategory.color : null,
  // Surfaced so a client can prompt "please set a real password" — deliberately NOT enforced as
  // a server-side block. Every currently-active member in this dataset has this flag set from
  // bulk import and has never been forced through a reset, so a hard block would lock out the
  // entire real membership today. A soft client-side nudge is the safe rollout; only tighten
  // this into an actual block once the mustResetPwd flag reflects reality again (e.g. a
  // one-time migration clearing it for members already active/using the app).
  mustResetPwd: !!m.mustResetPwd,
});
const MEMBER_WITH_PREMIUM = { include: { premiumCategory: { select: { color: true, active: true } } } } as const;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private mail: MailService) {}

  private sign(m: any) { return this.jwt.signAsync({ sub: m.id, role: m.role, chapterId: m.chapterId }); }
  private async audit(m: any, action: 'LOGIN' | 'LOGOUT', ip?: string) {
    await this.prisma.auditLog.create({ data: {
      actorId: m.id, actorName: m.name, role: m.role, action, entity: 'Auth',
      summary: `${m.name} ${action === 'LOGIN' ? 'signed in' : 'signed out'}`, ip: ip || null,
    }}).catch(() => {});
  }

  // Step 1: verify password. If OTP is off -> log in now; else issue a code.
  async requestLogin(email: string, password: string, ip?: string) {
    const key = (email || '').toLowerCase().trim();
    throttle(key);
    const member = await this.prisma.member.findUnique({ where: { email: (email || '').toLowerCase().trim() }, ...MEMBER_WITH_PREMIUM });
    if (!member) { markFail(key); throw new UnauthorizedException('Invalid email or password'); }
    if (!member.active) throw new ForbiddenException('This account is no longer active');
    const ok = await bcrypt.compare(password || '', member.passwordHash);
    if (!ok) { markFail(key); throw new UnauthorizedException('Invalid email or password'); }
    clearFail(key);

    if (CHANNEL === 'off') {
      await this.audit(member, 'LOGIN', ip);
      return { otpRequired: false, accessToken: await this.sign(member), member: pub(member) };
    }

    const code = '' + randomInt(100000, 1000000); // crypto.randomInt, not Math.random() — this is a 2FA code
    const otp = await this.prisma.otp.create({ data: {
      memberId: member.id, codeHash: await bcrypt.hash(code, 8),
      channel: CHANNEL === 'sms' ? 'SMS' : 'EMAIL',
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60000),
    }});
    let sentTo = maskEmail(email);
    if (CHANNEL === 'sms' && member.phone) {
      await sendOtpSms(member.phone, code).catch(() => {});
      sentTo = `••••${member.phone.slice(-4)}`;
    } else {
      await this.mail.sendOtp(email, code).catch(() => {});
    }
    return { otpRequired: true, challengeId: otp.id, sentTo };
  }

  // Step 2: verify code -> issue JWT + log the login.
  async verifyOtp(challengeId: string, code: string, ip?: string) {
    const otp = await this.prisma.otp.findUnique({ where: { id: challengeId } });
    if (!otp || otp.consumedAt || otp.expiresAt < new Date()) throw new UnauthorizedException('Code expired — request a new one');
    if (otp.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException('Too many attempts');
    const ok = await bcrypt.compare(code, otp.codeHash);
    if (!ok) {
      await this.prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Incorrect code');
    }
    await this.prisma.otp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    const member = await this.prisma.member.findUnique({ where: { id: otp.memberId }, ...MEMBER_WITH_PREMIUM });
    await this.audit(member, 'LOGIN', ip);
    return { accessToken: await this.sign(member), member: pub(member) };
  }

  async changePassword(memberId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) throw new BadRequestException('New password must be at least 6 characters.');
    const m = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!m) throw new UnauthorizedException('Not found');
    const ok = await bcrypt.compare(currentPassword || '', m.passwordHash);
    // 400, not 401 — this is a validation failure of user-supplied input, not an authentication
    // failure. The JWT that got you into this request is still perfectly valid. Both clients
    // treat a 401 from any authenticated endpoint as "the session is dead, force sign-out" —
    // a 401 here would wipe a fine session just because someone mistyped their current password.
    if (!ok) throw new BadRequestException('Your current password is incorrect.');
    await this.prisma.member.update({ where: { id: memberId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), mustResetPwd: false } });
    return { ok: true };
  }

  async logout(memberId: string, ip?: string) {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (member) await this.audit(member, 'LOGOUT', ip);
    return { ok: true };
  }
}
