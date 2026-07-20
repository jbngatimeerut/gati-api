import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const ipOf = (req: any) => ((req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() b: { email: string; password: string }, @Req() req: any) {
    return this.auth.requestLogin(b.email, b.password, ipOf(req));
  }

  @Post('verify-otp')
  verify(@Body() b: { challengeId: string; code: string }, @Req() req: any) {
    return this.auth.verifyOtp(b.challengeId, b.code, ipOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Req() req: any, @Body() b: { currentPassword: string; newPassword: string }) {
    return this.auth.changePassword(req.user.id, b.currentPassword, b.newPassword);
  }

  @Post('logout')
  logout(@Req() req: any) {
    return this.auth.logout(req.user.id, ipOf(req));
  }
}
