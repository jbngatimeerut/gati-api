import { Module } from '@nestjs/common';
import { SetuService } from './setu.service';
import { SetuController } from './setu.controller';
@Module({ providers: [SetuService], controllers: [SetuController] })
export class SetuModule {}
