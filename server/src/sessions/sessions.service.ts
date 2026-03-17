import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SessionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async heartbeat(sessionId: string, _userId: string, _ipAddress: string): Promise<void> {
    const ttl = this.config.get<number>('HEARTBEAT_TIMEOUT_SEC', 120);
    const now = new Date().toISOString();
    await this.redis.hset(`user_session_details:${sessionId}`, { lastActive: now });
    await this.redis.expire(`user_session_details:${sessionId}`, ttl);
    await this.redis.zadd('online_users_by_last_active', Date.now(), sessionId);
  }

  async getMe(sessionId: string) {
    const details = await this.redis.hgetall(`user_session_details:${sessionId}`);
    return { sessionId, ...details };
  }

  async listSessions(userId: string, currentSessionId: string) {
    // Scan all active Redis auth keys for this user
    const keys = await this.redis.scan(`session:${userId}:*`);
    const activeSessionIds = new Set(keys.map((k) => k.split(':')[2]));

    const dbSessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { loginTime: 'desc' },
    });

    return Promise.all(
      dbSessions.map(async (s) => {
        const isActive = activeSessionIds.has(s.sessionId);
        const live = isActive
          ? await this.redis.hgetall(`user_session_details:${s.sessionId}`)
          : null;
        return {
          id: s.id,
          sessionId: s.sessionId,
          loginTime: s.loginTime,
          logoutTime: s.logoutTime,
          deviceInfo: s.deviceInfo,
          ipAddress: s.ipAddress,
          status: s.status,
          isActive,
          isCurrent: s.sessionId === currentSessionId,
          lastActive: live?.lastActive ?? null,
          platform: live?.platform ?? null,
        };
      }),
    );
  }

  async revoke(
    dbSessionId: string,
    requestUserId: string,
    requestUserRole: string,
    ipAddress: string,
  ): Promise<void> {
    const session = await this.prisma.userSession.findUnique({ where: { id: dbSessionId } });
    if (!session) throw new NotFoundException('Session not found');

    if (session.userId !== requestUserId && requestUserRole !== 'ADMIN') {
      throw new ForbiddenException();
    }

    await this.redis.del(
      `user_session_details:${session.sessionId}`,
      `session:${session.userId}:${session.sessionId}`,
    );
    await this.redis.zrem('online_users_by_last_active', session.sessionId);

    await this.prisma.userSession.updateMany({
      where: { id: dbSessionId },
      data: { status: 'REVOKED', logoutTime: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: requestUserId,
        actionType: 'REVOKE_SESSION',
        entityName: 'UserSession',
        entityId: dbSessionId,
        ipAddress,
      },
    });
  }
}
