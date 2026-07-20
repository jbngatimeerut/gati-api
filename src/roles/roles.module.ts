import { Global, Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

@Global()
@Module({ providers: [RolesService], controllers: [RolesController], exports: [RolesService] })
export class RolesModule {}
