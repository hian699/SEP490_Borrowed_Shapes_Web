import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthRateLimitGuard } from '../common/guards/auth-rate-limit.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    AuthRateLimitGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [AuthGuard],
})
export class AuthModule {}
