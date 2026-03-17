import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const sessionId = this.extractSessionId(request);
    if (!sessionId) throw new UnauthorizedException();

    // Look up presence key (O(1) lookup by sessionId)
    const details = await this.redis.hgetall(`user_session_details:${sessionId}`);
    if (!details) throw new UnauthorizedException();

    // Look up auth session key (authoritative for expiresAt and revoke check)
    const authKey = `session:${details.userId}:${sessionId}`;
    const authSession = await this.redis.hgetall(authKey);
    if (!authSession) throw new UnauthorizedException();

    if (new Date(authSession.expiresAt) <= new Date()) {
      await this.redis.del(`user_session_details:${sessionId}`, authKey);
      await this.prisma.userSession.updateMany({
        where: { sessionId, status: 'ACTIVE' },
        data: { status: 'EXPIRED', logoutTime: new Date() },
      });
      throw new UnauthorizedException();
    }

    request.user = {
      userId: details.userId,
      role: details.role,
      sessionId,
      platform: details.platform,
    };

    return true;
  }

  private extractSessionId(request: any): string | null {
    const auth: string = request.headers?.authorization ?? '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
