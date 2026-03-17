import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn() },
  gameProfile: { create: jest.fn() },
  userSession: { create: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockRedis = {
  hset: jest.fn(),
  expire: jest.fn(),
  pipeline: jest.fn().mockResolvedValue(undefined),
  zadd: jest.fn(),
  del: jest.fn(),
  zrem: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, def: any) => {
    const map: Record<string, any> = {
      BCRYPT_ROUNDS: 4, // low for fast tests
      SESSION_TTL_SEC: 604800,
      HEARTBEAT_TIMEOUT_SEC: 120,
    };
    return map[key] ?? def;
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({ email: 'a@b.com', password: 'password123' }, '127.0.0.1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates User and GameProfile in a transaction', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const createdUser = { id: 'user_1', email: 'a@b.com', role: 'USER' };
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.gameProfile.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.register({ email: 'a@b.com', password: 'password123' }, '127.0.0.1');

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.gameProfile.create).toHaveBeenCalledWith({ data: { userId: 'user_1' } });
      expect(result).toMatchObject({ userId: 'user_1', email: 'a@b.com', role: 'USER' });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@b.com', password: 'pass', platform: 'forum' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: '$2b$04$invalidhash',
        role: 'USER',
      });
      await expect(
        service.login({ email: 'a@b.com', password: 'wrongpass', platform: 'forum' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('writes both Redis keys and DB record on successful login', async () => {
      const hash = await bcrypt.hash('password123', 4);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: hash, role: 'USER' });
      mockPrisma.userSession.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockRedis.pipeline.mockResolvedValue(undefined);
      mockRedis.zadd.mockResolvedValue(undefined);

      const result = await service.login({ email: 'a@b.com', password: 'password123', platform: 'forum' }, '127.0.0.1');

      expect(mockRedis.pipeline).toHaveBeenCalledTimes(2); // auth key + presence key
      expect(mockRedis.zadd).toHaveBeenCalledTimes(1);
      const pipelineCalls = (mockRedis.pipeline as jest.Mock).mock.calls;
      // First pipeline call: auth key with SESSION_TTL_SEC=604800
      expect(pipelineCalls[0][0]).toContainEqual(
        expect.objectContaining({ cmd: 'expire', args: expect.arrayContaining([604800]) }),
      );
      // Second pipeline call: presence key with HEARTBEAT_TIMEOUT_SEC=120
      expect(pipelineCalls[1][0]).toContainEqual(
        expect.objectContaining({ cmd: 'expire', args: expect.arrayContaining([120]) }),
      );
      expect(mockPrisma.userSession.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ userId: 'u1', role: 'USER', sessionId: expect.any(String) });
    });
  });

  describe('logout', () => {
    it('cleans up Redis keys and updates DB', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(undefined);
      mockRedis.zrem.mockResolvedValue(undefined);

      await service.logout('u1', 'sess_1', '127.0.0.1');

      expect(mockRedis.del).toHaveBeenCalledWith('user_session_details:sess_1', 'session:u1:sess_1');
      expect(mockRedis.zrem).toHaveBeenCalledWith('online_users_by_last_active', 'sess_1');
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'LOGGED_OUT' }) }),
      );
    });
  });
});
