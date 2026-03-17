import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { init } from '@paralleldrive/cuid2';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const createId = init({ length: 24 });

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async register(dto: Pick<RegisterDto, 'email' | 'password'> & { deviceInfo?: string }, ipAddress: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash, role: 'USER' },
      });
      await tx.gameProfile.create({ data: { userId: created.id } });
      await tx.auditLog.create({
        data: {
          userId: created.id,
          actionType: 'CREATE',
          entityName: 'User',
          entityId: created.id,
          newValue: { email: created.email, role: created.role },
          ipAddress,
        },
      });
      return created;
    });

    return { userId: user.id, email: user.email, role: user.role };
  }

  async login(dto: LoginDto, ipAddress: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const sessionId = createId();
    const sessionTtl = this.config.get<number>('SESSION_TTL_SEC', 604800);
    const heartbeatTtl = this.config.get<number>('HEARTBEAT_TIMEOUT_SEC', 120);
    const expiresAt = new Date(Date.now() + sessionTtl * 1000).toISOString();
    const now = new Date().toISOString();

    // Auth session key — indexed by userId (for listing/revoke)
    const authKey = `session:${user.id}:${sessionId}`;
    await this.redis.pipeline([
      { cmd: 'hset', args: [authKey, { userId: user.id, sessionId, role: user.role, deviceInfo: dto.deviceInfo ?? '', ipAddress, loginTime: now, expiresAt }] },
      { cmd: 'expire', args: [authKey, sessionTtl] },
    ]);

    // Presence key — indexed by sessionId (for O(1) auth guard lookup)
    const presenceKey = `user_session_details:${sessionId}`;
    await this.redis.pipeline([
      { cmd: 'hset', args: [presenceKey, { userId: user.id, role: user.role, platform: dto.platform, deviceInfo: dto.deviceInfo ?? '', ipAddress, lastActive: now, expiresAt }] },
      { cmd: 'expire', args: [presenceKey, heartbeatTtl] },
    ]);

    await this.redis.zadd('online_users_by_last_active', Date.now(), sessionId);

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        sessionId,
        ipAddress,
        deviceInfo: dto.deviceInfo,
        status: 'ACTIVE',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        actionType: 'LOGIN',
        entityName: 'UserSession',
        entityId: sessionId,
        ipAddress,
      },
    });

    return { sessionId, userId: user.id, role: user.role, expiresAt };
  }

  async logout(userId: string, sessionId: string, ipAddress: string): Promise<void> {
    await this.redis.del(`user_session_details:${sessionId}`, `session:${userId}:${sessionId}`);
    await this.redis.zrem('online_users_by_last_active', sessionId);

    await this.prisma.userSession.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'LOGGED_OUT', logoutTime: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        actionType: 'LOGOUT',
        entityName: 'UserSession',
        entityId: sessionId,
        ipAddress,
      },
    });
  }
}
