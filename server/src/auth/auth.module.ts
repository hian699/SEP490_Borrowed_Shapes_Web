import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard],
})
export class AuthModule {}
