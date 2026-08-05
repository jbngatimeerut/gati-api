import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { SearchModule } from '../search/search.module';
import { RealtimeModule } from '../realtime/realtime.module';
@Module({ imports: [SearchModule, RealtimeModule], providers: [OnboardingService], controllers: [OnboardingController] })
export class OnboardingModule {}
