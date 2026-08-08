import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { SecurityModule } from './security/security.module';
import { EncryptionMiddleware } from './security/encryption.middleware';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { ReferralsModule } from './referrals/referrals.module';
import { SetuModule } from './setu/setu.module';
import { MeetingsModule } from './meetings/meetings.module';
import { NfcModule } from './nfc/nfc.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { PaymentsModule } from './payments/payments.module';
import { RolesModule } from './roles/roles.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { SearchModule } from './search/search.module';
import { MailerModule } from './mailer/mailer.module';
import { MailModule } from './mail/mail.module';
import { MediaModule } from './media/media.module';
import { MessagingModule } from './messaging/messaging.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PremiumModule } from './premium/premium.module';
import { AdsModule } from './ads/ads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global default: 60 requests/minute per IP. Endpoints handling auth or AI cost (login,
    // verify-otp, search) set their own tighter @Throttle() below. Tracked by req.ip — safe from
    // header-spoofing since main.ts never enables Express's `trust proxy`, so a client-supplied
    // X-Forwarded-For can't override it. In-memory storage (the package default): resets on
    // restart and doesn't share state across multiple instances — fine for this single-instance
    // deployment, would need a Redis-backed ThrottlerStorage to scale horizontally.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 60 }]),
    PrismaModule, AuditModule, AuthModule, MembersModule, ReferralsModule,
    SetuModule, MeetingsModule, NfcModule, AdminModule, SettingsModule, BroadcastsModule, PaymentsModule, RolesModule, OnboardingModule, SearchModule, MailerModule, MailModule, MediaModule, MessagingModule, RealtimeModule, PremiumModule, SecurityModule, AdsModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(EncryptionMiddleware).forRoutes('*');
  }
}
