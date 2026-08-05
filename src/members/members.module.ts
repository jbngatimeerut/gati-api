import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { SearchModule } from '../search/search.module';
import { RealtimeModule } from '../realtime/realtime.module';
@Module({ imports: [SearchModule, RealtimeModule], providers: [MembersService], controllers: [MembersController] })
export class MembersModule {}
