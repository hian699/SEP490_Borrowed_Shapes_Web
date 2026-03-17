import { Controller, Get, Put, Delete, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { SessionsService } from './sessions.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('sessions')
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.sessionsService.getMe(user.sessionId);
  }

  @Put('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(@CurrentUser() user: RequestUser, @Req() req: Request): Promise<void> {
    await this.sessionsService.heartbeat(user.sessionId, user.userId, req.ip ?? '');
  }

  @Get()
  listSessions(@CurrentUser() user: RequestUser) {
    return this.sessionsService.listSessions(user.userId, user.sessionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<void> {
    await this.sessionsService.revoke(id, user.userId, user.role, req.ip ?? '');
  }
}
