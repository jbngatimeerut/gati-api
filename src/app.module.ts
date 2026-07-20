import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, AuditModule, AuthModule, MembersModule, ReferralsModule,
    SetuModule, MeetingsModule, NfcModule, AdminModule, SettingsModule, BroadcastsModule, PaymentsModule, RolesModule, OnboardingModule, SearchModule, MailerModule, MailModule, MediaModule, MessagingModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
