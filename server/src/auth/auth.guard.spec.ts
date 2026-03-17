import { AuthGuard } from './auth.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

const mockRedis = {
  hgetall: jest.fn(),
  exists: jest.fn(),
  del: jest.fn(),
};

const mockPrisma = {
  userSession: { updateMany: jest.fn() },
};

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

function makeContext(authHeader?: string): ExecutionContext {
  const req: any = {
    headers: { authorization: authHeader },
    user: undefined,
    ip: '127.0.0.1',
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = new AuthGuard(
      mockReflector as any,
      mockRedis as any,
      mockPrisma as any,
    );
    jest.clearAllMocks();
  });

  it('allows @Public() routes without a token', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const result = await guard.canActivate(makeContext());
    expect(result).toBe(true);
  });

  it('throws 401 when Authorization header is missing', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when user_session_details key is missing in Redis', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockRedis.hgetall.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext('Bearer sess_123'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when session:{userId}:{sessionId} does not exist in Redis', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockRedis.hgetall
      .mockResolvedValueOnce({
        userId: 'user_1',
        role: 'USER',
        platform: 'forum',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .mockResolvedValueOnce(null); // session:{userId}:{sessionId} missing
    await expect(guard.canActivate(makeContext('Bearer sess_123'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 and marks session EXPIRED when expiresAt is in the past', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const expired = new Date(Date.now() - 1000).toISOString();
    mockRedis.hgetall
      .mockResolvedValueOnce({ userId: 'user_1', role: 'USER', platform: 'forum', expiresAt: expired })
      .mockResolvedValueOnce({ userId: 'user_1', expiresAt: expired });
    mockRedis.del.mockResolvedValue(undefined);
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });
    await expect(guard.canActivate(makeContext('Bearer sess_123'))).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
  });

  it('attaches req.user and returns true for a valid session', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    mockRedis.hgetall
      .mockResolvedValueOnce({ userId: 'user_1', role: 'USER', platform: 'forum', expiresAt })
      .mockResolvedValueOnce({ userId: 'user_1', sessionId: 'sess_123', role: 'USER', expiresAt });
    const ctx = makeContext('Bearer sess_123');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toMatchObject({
      userId: 'user_1',
      role: 'USER',
      sessionId: 'sess_123',
      platform: 'forum',
    });
  });
});
