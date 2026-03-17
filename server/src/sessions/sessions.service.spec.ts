import { Test } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

const mockRedis = {
  hset: jest.fn(),
  expire: jest.fn(),
  zadd: jest.fn(),
  hgetall: jest.fn(),
  del: jest.fn(),
  zrem: jest.fn(),
  scan: jest.fn(),
};

const mockPrisma = {
  userSession: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const mockConfig = {
  get: jest.fn((key: string, def: any) => {
    const map: Record<string, any> = { HEARTBEAT_TIMEOUT_SEC: 120 };
    return map[key] ?? def;
  }),
};

describe('SessionsService', () => {
  let service: SessionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: RedisService, useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(SessionsService);
    jest.clearAllMocks();
  });

  describe('heartbeat', () => {
    it('updates lastActive in Redis, resets TTL, and updates ZSET score', async () => {
      mockRedis.hset.mockResolvedValue(undefined);
      mockRedis.expire.mockResolvedValue(undefined);
      mockRedis.zadd.mockResolvedValue(undefined);

      await service.heartbeat('sess_1', 'user_1', '127.0.0.1');

      expect(mockRedis.hset).toHaveBeenCalledWith(
        'user_session_details:sess_1',
        expect.objectContaining({ lastActive: expect.any(String) }),
      );
      expect(mockRedis.expire).toHaveBeenCalledWith('user_session_details:sess_1', 120);
      expect(mockRedis.zadd).toHaveBeenCalledWith('online_users_by_last_active', expect.any(Number), 'sess_1');
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue(null);
      await expect(service.revoke('db_id_1', 'user_1', 'USER', '127.0.0.1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-owner non-admin tries to revoke', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue({
        id: 'db_id_1',
        userId: 'other_user',
        sessionId: 'sess_1',
      });
      await expect(service.revoke('db_id_1', 'user_1', 'USER', '127.0.0.1')).rejects.toThrow(ForbiddenException);
    });

    it('allows ADMIN to revoke any session', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue({
        id: 'db_id_1',
        userId: 'other_user',
        sessionId: 'sess_1',
      });
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      mockRedis.zrem.mockResolvedValue(undefined);

      await expect(service.revoke('db_id_1', 'admin_user', 'ADMIN', '127.0.0.1')).resolves.toBeUndefined();
    });

    it('deletes both Redis keys and updates DB to REVOKED', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue({
        id: 'db_id_1',
        userId: 'user_1',
        sessionId: 'sess_1',
      });
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      mockRedis.zrem.mockResolvedValue(undefined);

      await service.revoke('db_id_1', 'user_1', 'USER', '127.0.0.1');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'user_session_details:sess_1',
        'session:user_1:sess_1',
      );
      expect(mockRedis.zrem).toHaveBeenCalledWith('online_users_by_last_active', 'sess_1');
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REVOKED' }) }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ actionType: 'REVOKE_SESSION' }),
        }),
      );
    });
  });
});
