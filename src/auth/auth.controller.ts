import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto, VerifyOtpDto, ChangePasswordDto } from './auth.dto';

// Only used for audit-log display (e.g. "signed in from x.x.x.x") — X-Forwarded-For is
// client-controllable, so this is NOT used for anything security-sensitive like rate limiting;
// that's handled by the framework-level @Throttle() below, keyed off the unspoofable req.ip.
const ipOf = (req: any) => ((req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() b: LoginDto, @Req() req: any) {
    return this.auth.requestLogin(b.email, b.password, ipOf(req));
  }

  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post('verify-otp')
  verify(@Body() b: VerifyOtpDto, @Req() req: any) {
    return this.auth.verifyOtp(b.challengeId, b.code, ipOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Req() req: any, @Body() b: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, b.currentPassword, b.newPassword);
  }

  // Was missing this guard entirely — req.user.id would have thrown on any real call, silently
  // masked client-side by the fetch's try/catch (OwnerBar.tsx just clears localStorage either way).
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: any) {
    return this.auth.logout(req.user.id, ipOf(req));
  }
}
