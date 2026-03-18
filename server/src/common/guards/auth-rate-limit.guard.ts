import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

const LIMIT = 5;
const WINDOW_SEC = 120; // 2 minutes

/**
 * Rate limit: 5 requests per 2 minutes per IP.
 * If the client sends X-Device-ID header (MAC address / device fingerprint),
 * that is used as the identifier instead of IP — covers Unity game clients
 * where multiple users may share the same NAT IP.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const deviceId = req.headers['x-device-id'] as string | undefined;
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const identifier = (deviceId?.trim() || ip).toLowerCase();

    // Key is scoped to the specific endpoint path to keep login and register buckets separate
    const endpoint = req.path.split('/').pop() ?? 'auth'; // "login" | "register"
    const key = `rl:auth:${endpoint}:${identifier}`;

    const count = await this.redis.incr(key, WINDOW_SEC);

    if (count > LIMIT) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests.`,
          retryAfter: WINDOW_SEC,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
