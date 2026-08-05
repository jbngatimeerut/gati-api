import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JWT_SECRET } from './jwt-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: JWT_SECRET,
      // Shortened from 7d: re-validation against the DB (see jwt.strategy.ts) now makes
      // offboarding/role changes take effect immediately, so a long-lived token no longer buys
      // convenience — it only extends how long a stolen token stays useful.
      signOptions: { expiresIn: '24h' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
