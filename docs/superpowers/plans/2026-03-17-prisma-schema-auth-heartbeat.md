# Prisma Schema, Auth Module & Session Heartbeat — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a NestJS backend in `server/` with Prisma + PostgreSQL schema, opaque-token auth (sessionId stored in Redis), and REST session/heartbeat endpoints, running alongside Next.js via a single `npm run dev` command.

**Architecture:** NestJS (port 3001) lives in `server/` within the existing Next.js repo. All session state is stored in Redis using two key patterns (`session:{userId}:{sessionId}` for per-user listing/revoke and `user_session_details:{sessionId}` for O(1) auth-guard lookup). Next.js never exposes the raw sessionId — it stores it in an HttpOnly cookie and forwards it as a Bearer token for server-to-server calls.

**Tech Stack:** NestJS 10, Prisma 7, PostgreSQL, ioredis, bcrypt, class-validator, @nestjs/schedule, concurrently

---

## File Map

### New files — NestJS server

| File | Responsibility |
|---|---|
| `server/package.json` | NestJS dependencies and scripts |
| `server/tsconfig.json` | TypeScript config for NestJS |
| `server/tsconfig.build.json` | Build-specific TS config |
| `server/nest-cli.json` | NestJS CLI config |
| `server/.env` | Environment variables (gitignored) |
| `server/prisma/schema.prisma` | Full database schema |
| `server/src/main.ts` | NestJS bootstrap, port 3001 |
| `server/src/app.module.ts` | Root module — imports all feature modules |
| `server/src/prisma/prisma.module.ts` | Global Prisma module |
| `server/src/prisma/prisma.service.ts` | PrismaClient wrapper |
| `server/src/redis/redis.module.ts` | Global Redis module (ioredis) |
| `server/src/redis/redis.service.ts` | Typed Redis operation wrappers |
| `server/src/auth/dto/register.dto.ts` | Register request validation |
| `server/src/auth/dto/login.dto.ts` | Login request validation |
| `server/src/auth/decorators/public.decorator.ts` | `@Public()` — skip auth guard |
| `server/src/auth/decorators/current-user.decorator.ts` | `@CurrentUser()` — inject req.user |
| `server/src/auth/decorators/roles.decorator.ts` | `@Roles()` — role-based guard |
| `server/src/auth/auth.guard.ts` | Global guard: validate sessionId from Bearer token |
| `server/src/auth/auth.service.ts` | register / login / logout business logic |
| `server/src/auth/auth.controller.ts` | POST /auth/register, POST /auth/login, DELETE /auth/logout |
| `server/src/auth/auth.module.ts` | Auth feature module |
| `server/src/sessions/sessions.service.ts` | Session list, heartbeat, revoke logic |
| `server/src/sessions/sessions.controller.ts` | GET/PUT /sessions/me, GET/DELETE /sessions/:id |
| `server/src/sessions/sessions.module.ts` | Sessions feature module |
| `server/src/presence/presence.service.ts` | Redis read/write helpers for presence data |
| `server/src/presence/presence-sync.job.ts` | @Cron jobs: Redis cleanup + DB sync |
| `server/src/presence/presence.module.ts` | Presence feature module |
| `server/test/auth.e2e-spec.ts` | E2E tests: register, login, logout flows |
| `server/test/sessions.e2e-spec.ts` | E2E tests: heartbeat, list, revoke flows |
| `server/test/jest-e2e.json` | Jest config for e2e tests |

### Modified files — Next.js

| File | Change |
|---|---|
| `package.json` | Add `concurrently` dev dep + `dev`/`start` scripts |
| `app/api/auth/login/route.ts` | New: call NestJS login, set HttpOnly cookie |
| `app/api/auth/logout/route.ts` | New: call NestJS logout, clear cookie |

---

## Task 1: Monorepo — Root Scripts + NestJS Scaffold

**Files:**
- Modify: `package.json`
- Create: `server/` (scaffolded by NestJS CLI)

- [ ] **Step 1.1: Install concurrently at root**

```bash
cd d:/SEP490/borrowed-shapes-wiki
npm install --save-dev concurrently
```

- [ ] **Step 1.2: Update root package.json scripts**

In `package.json`, replace the `scripts` block with:

```json
"scripts": {
  "dev": "concurrently \"next dev --turbopack\" \"cd server && npm run start:dev\"",
  "build": "next build",
  "start": "concurrently \"next start\" \"cd server && npm run start:prod\"",
  "lint": "eslint"
}
```

- [ ] **Step 1.3: Scaffold NestJS app in server/**

```bash
cd d:/SEP490/borrowed-shapes-wiki
npx @nestjs/cli new server --package-manager npm --skip-git --strict
```

When prompted for package manager: select `npm`.

- [ ] **Step 1.4: Verify NestJS boots**

```bash
cd server && npm run start:dev
```

Expected: `NestJS application listening on port 3000` (default, will change to 3001 later).
Stop with Ctrl+C.

- [ ] **Step 1.5: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add package.json package-lock.json server/
git commit -m "feat: scaffold NestJS server and add concurrently monorepo scripts"
```

---

## Task 2: Prisma Schema

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/.env`

- [ ] **Step 2.1: Install Prisma in server/**

```bash
cd server
npm install prisma @prisma/client
npx prisma init --datasource-provider postgresql
```

This creates `server/prisma/schema.prisma` and `server/.env`.

- [ ] **Step 2.2: Set DATABASE_URL in server/.env**

Edit `server/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/borrowed_shapes_dev"
REDIS_URL="redis://localhost:6379"
HEARTBEAT_TIMEOUT_SEC=120
HEARTBEAT_TIMEOUT_MS=120000
SESSION_TTL_SEC=604800
REDIS_CLEANUP_INTERVAL_MS=60000
DB_SYNC_INTERVAL_MS=60000
BCRYPT_ROUNDS=12
PORT=3001
```

- [ ] **Step 2.3: Ensure server/.env is gitignored**

Check `server/.gitignore` includes `.env`. If not, add it:

```
.env
dist/
node_modules/
```

- [ ] **Step 2.4: Write the full Prisma schema**

Replace the contents of `server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ───────────────────────────────────────────────

enum Role {
  USER
  ADMIN
}

enum SessionStatus {
  ACTIVE
  REVOKED
  EXPIRED
  LOGGED_OUT
}

enum AuditActionType {
  CREATE
  UPDATE
  DELETE
  LOGIN
  LOGOUT
  REVOKE_SESSION
}

enum ForumThreadStatus {
  OPEN
  CLOSED
  ARCHIVED
}

enum ForumPostType {
  TEXT
  IMAGE
}

enum ForumFlair {
  GENERAL
  BUG_REPORT
  GUIDE
  SUGGESTION
  FAN_ART
  LOOKING_FOR_PARTY
  PATCH_NOTE
}

// ─── Core ────────────────────────────────────────────────

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  gameProfile   GameProfile?
  sessions      UserSession[]
  auditLogs     AuditLog[]
  forumThreads  ForumThread[]
  forumComments ForumComment[]
  threadVotes   ForumThreadVote[]
  commentVotes  ForumCommentVote[]
  wikiRevisions WikiRevision[]
  downloadLogs  DownloadLog[]
  onlineStatus  UserOnlineStatus?

  @@index([role])
}

model GameProfile {
  id               String @id @default(cuid())
  userId           String @unique
  level            Int    @default(1)
  experiencePoints Int    @default(0)
  virtualCurrency  Int    @default(0)

  user         User              @relation(fields: [userId], references: [id])
  achievements UserAchievement[]
}

model Achievement {
  id            String @id @default(cuid())
  name          String @unique
  criteriaCode  String
  badgeImageUrl String
  rewardPoints  Int

  userAchievements UserAchievement[]
}

// Links GameProfile ↔ Achievement (not User directly)
model UserAchievement {
  gameProfileId String
  achievementId String
  achievedAt    DateTime @default(now())

  gameProfile GameProfile @relation(fields: [gameProfileId], references: [id])
  achievement Achievement @relation(fields: [achievementId], references: [id])

  @@id([gameProfileId, achievementId])
}

// ─── Forum ───────────────────────────────────────────────

model ForumCategory {
  id           String  @id @default(cuid())
  name         String  @unique
  slug         String  @unique
  description  String?
  iconUrl      String?
  isOfficial   Boolean @default(false)
  displayOrder Int     @default(0)

  threads ForumThread[]
}

model ForumThread {
  id             String            @id @default(cuid())
  title          String
  slug           String            @unique
  categoryId     String
  authorId       String
  content        String
  imageUrl       String?
  postType       ForumPostType     @default(TEXT)
  flair          ForumFlair?
  viewCount      Int               @default(0)
  score          Int               @default(0)
  commentCount   Int               @default(0)
  isPinned       Boolean           @default(false)
  isLocked       Boolean           @default(false)
  isAnnouncement Boolean           @default(false)
  status         ForumThreadStatus @default(OPEN)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  category ForumCategory     @relation(fields: [categoryId], references: [id])
  author   User              @relation(fields: [authorId], references: [id])
  comments ForumComment[]
  votes    ForumThreadVote[]

  @@index([categoryId, createdAt])
  @@index([categoryId, score])
  @@index([authorId, createdAt])
}

model ForumComment {
  id        String   @id @default(cuid())
  threadId  String
  authorId  String
  content   String
  parentId  String?
  score     Int      @default(0)
  isDeleted Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  thread  ForumThread        @relation(fields: [threadId], references: [id])
  author  User               @relation(fields: [authorId], references: [id])
  parent  ForumComment?      @relation("CommentReplies", fields: [parentId], references: [id])
  replies ForumComment[]     @relation("CommentReplies")
  votes   ForumCommentVote[]

  @@index([threadId, createdAt])
  @@index([parentId])
}

model ForumThreadVote {
  userId   String
  threadId String
  // +1 or -1 only — validated at service layer
  value    Int

  user   User        @relation(fields: [userId], references: [id])
  thread ForumThread @relation(fields: [threadId], references: [id])

  @@id([userId, threadId])
}

model ForumCommentVote {
  userId    String
  commentId String
  // +1 or -1 only — validated at service layer
  value     Int

  user    User         @relation(fields: [userId], references: [id])
  comment ForumComment @relation(fields: [commentId], references: [id])

  @@id([userId, commentId])
}

// ─── Wiki ────────────────────────────────────────────────

model WikiPage {
  id               String  @id @default(cuid())
  slug             String  @unique
  title            String
  metadataJson     Json?
  // Intentionally denormalized — no @relation to avoid circular dep.
  // Updated atomically with WikiRevision.create() in application code.
  latestRevisionId String?

  revisions WikiRevision[]

  @@index([title])
}

model WikiRevision {
  id        String   @id @default(cuid())
  pageId    String
  authorId  String
  content   String
  createdAt DateTime @default(now())

  page   WikiPage @relation(fields: [pageId], references: [id])
  author User     @relation(fields: [authorId], references: [id])
}

// ─── Sessions & Audit ────────────────────────────────────

model UserSession {
  id         String        @id @default(cuid())
  userId     String
  sessionId  String        @unique
  loginTime  DateTime      @default(now())
  logoutTime DateTime?
  deviceInfo String?
  ipAddress  String
  status     SessionStatus @default(ACTIVE)

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([loginTime])
}

model AuditLog {
  id         String          @id @default(cuid())
  userId     String?
  actionType AuditActionType
  entityName String
  entityId   String
  oldValue   Json?
  newValue   Json?
  timestamp  DateTime        @default(now())
  ipAddress  String?

  user User? @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([entityName])
  @@index([entityId])
  @@index([timestamp])
}

// ─── Downloads ───────────────────────────────────────────

model FileAsset {
  id          String   @id @default(cuid())
  fileName    String
  fileVersion String   @unique
  filePath    String
  fileSize    BigInt
  mimeType    String
  uploadedAt  DateTime @default(now())
  updatedAt   DateTime @updatedAt

  downloadStats DownloadStats[]
}

model DownloadLog {
  id           String   @id @default(cuid())
  userId       String?
  // Denormalized snapshot — no FK to FileAsset (preserves version at download time)
  fileVersion  String
  bytesSent    BigInt
  clientIp     String
  downloadedAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([fileVersion])
  @@index([downloadedAt])
}

model DownloadStats {
  id             String   @id @default(cuid())
  fileAssetId    String
  date           DateTime @db.Date
  downloadCount  BigInt   @default(0)
  totalBytesSent BigInt   @default(0)

  fileAsset FileAsset @relation(fields: [fileAssetId], references: [id])

  @@unique([fileAssetId, date])
  @@index([fileAssetId])
}

// ─── Presence ────────────────────────────────────────────

model UserOnlineStatus {
  userId          String    @id @unique
  isOnline        Boolean   @default(false)
  lastOnline      DateTime?
  onlinePlatforms Json?
  updatedAt       DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([lastOnline])
}
```

- [ ] **Step 2.5: Run migration**

```bash
cd server
npx prisma migrate dev --name init
```

Expected: Migration applied, `server/prisma/migrations/` created.

- [ ] **Step 2.6: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` output.

- [ ] **Step 2.7: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/prisma/ server/.env.example
git commit -m "feat: add full Prisma schema and initial migration"
```

> Create `server/.env.example` as a copy of `.env` with placeholder values — commit that, not `.env`.

---

## Task 3: PrismaModule (Global)

**Files:**
- Create: `server/src/prisma/prisma.module.ts`
- Create: `server/src/prisma/prisma.service.ts`

- [ ] **Step 3.1: Install @nestjs/config**

```bash
cd server
npm install @nestjs/config
```

- [ ] **Step 3.2: Create PrismaService**

Create `server/src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 3.3: Create PrismaModule**

Create `server/src/prisma/prisma.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3.4: Register in AppModule**

Edit `server/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3.5: Verify build compiles**

```bash
cd server
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 3.6: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/
git commit -m "feat: add global PrismaModule and ConfigModule"
```

---

## Task 4: RedisModule (Global)

**Files:**
- Create: `server/src/redis/redis.module.ts`
- Create: `server/src/redis/redis.service.ts`

- [ ] **Step 4.1: Install ioredis**

```bash
cd server
npm install ioredis
npm install --save-dev @types/ioredis
```

- [ ] **Step 4.2: Create RedisService**

Create `server/src/redis/redis.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'));
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // Hash operations
  async hset(key: string, data: Record<string, string>): Promise<void> {
    await this.client.hset(key, data);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const result = await this.client.hgetall(key);
    return Object.keys(result).length === 0 ? null : result;
  }

  async del(...keys: string[]): Promise<void> {
    await this.client.del(...keys);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  // Sorted Set operations
  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  // Returns sessionIds with scores ≤ maxScore (oldest/expired sessions)
  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    return this.client.zrangebyscore(key, min, max);
  }

  // Returns all members with scores (alternating: member, score, member, score...)
  async zrangeWithScores(key: string): Promise<string[]> {
    return this.client.zrange(key, 0, -1, 'WITHSCORES');
  }

  // Scan all keys matching pattern (full cursor loop)
  async scan(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, found] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');
    return keys;
  }
}
```

- [ ] **Step 4.3: Create RedisModule**

Create `server/src/redis/redis.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

- [ ] **Step 4.4: Register RedisModule in AppModule**

Edit `server/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4.5: Verify build**

```bash
cd server && npm run build
```

Expected: Clean build.

- [ ] **Step 4.6: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/redis/
git commit -m "feat: add global RedisModule with ioredis client"
```

---

## Task 5: Auth DTOs + Decorators

**Files:**
- Create: `server/src/auth/dto/register.dto.ts`
- Create: `server/src/auth/dto/login.dto.ts`
- Create: `server/src/auth/decorators/public.decorator.ts`
- Create: `server/src/auth/decorators/current-user.decorator.ts`
- Create: `server/src/auth/decorators/roles.decorator.ts`

- [ ] **Step 5.1: Install validation packages**

```bash
cd server
npm install class-validator class-transformer
```

- [ ] **Step 5.2: Enable global validation pipe in main.ts**

Edit `server/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
}
bootstrap();
```

- [ ] **Step 5.3: Create Register DTO**

Create `server/src/auth/dto/register.dto.ts`:

```typescript
import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deviceInfo?: string;
}
```

- [ ] **Step 5.4: Create Login DTO**

Create `server/src/auth/dto/login.dto.ts`:

```typescript
import { IsEmail, IsString, IsIn, IsOptional, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsIn(['game', 'forum'])
  platform: 'game' | 'forum';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deviceInfo?: string;
}
```

- [ ] **Step 5.5: Create @Public() decorator**

Create `server/src/auth/decorators/public.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 5.6: Create @CurrentUser() decorator**

Create `server/src/auth/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  userId: string;
  role: string;
  sessionId: string;
  platform: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 5.7: Create @Roles() decorator**

Create `server/src/auth/decorators/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 5.8: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/auth/ server/src/main.ts
git commit -m "feat: add auth DTOs, decorators, and global validation pipe"
```

---

## Task 6: AuthGuard

**Files:**
- Create: `server/src/auth/auth.guard.ts`

- [ ] **Step 6.1: Write failing test for AuthGuard**

Create `server/src/auth/auth.guard.spec.ts`:

```typescript
import { AuthGuard } from './auth.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

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
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: authHeader },
        user: undefined,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    guard = new AuthGuard(mockReflector as any, mockRedis as any, mockPrisma as any);
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

  it('throws 401 when session:{userId}:{sessionId} does not exist', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockRedis.hgetall.mockResolvedValue({
      userId: 'user_1',
      role: 'USER',
      platform: 'forum',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    mockRedis.exists.mockResolvedValue(false);
    await expect(guard.canActivate(makeContext('Bearer sess_123'))).rejects.toThrow(UnauthorizedException);
  });

  it('attaches req.user and returns true for a valid session', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(false);
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    mockRedis.hgetall.mockResolvedValue({
      userId: 'user_1',
      role: 'USER',
      platform: 'forum',
      expiresAt,
    });
    mockRedis.exists.mockResolvedValue(true);
    const ctx = makeContext('Bearer sess_123');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(ctx.switchToHttp().getRequest().user).toMatchObject({
      userId: 'user_1',
      role: 'USER',
      sessionId: 'sess_123',
    });
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
cd server && npx jest auth.guard.spec.ts --no-coverage
```

Expected: FAIL — `AuthGuard` not found.

- [ ] **Step 6.3: Implement AuthGuard**

Create `server/src/auth/auth.guard.ts`:

```typescript
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

    // Step 1: Look up presence details (O(1) by sessionId)
    const details = await this.redis.hgetall(`user_session_details:${sessionId}`);
    if (!details) throw new UnauthorizedException();

    // Step 2: Look up auth session (verify not revoked, check expiresAt)
    const authKey = `session:${details.userId}:${sessionId}`;
    const authSession = await this.redis.hgetall(authKey);
    if (!authSession) {
      throw new UnauthorizedException();
    }

    if (new Date(authSession.expiresAt) <= new Date()) {
      // Expired — clean up
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
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
cd server && npx jest auth.guard.spec.ts --no-coverage
```

Expected: All 5 tests PASS.

- [ ] **Step 6.5: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/auth/auth.guard.ts server/src/auth/auth.guard.spec.ts
git commit -m "feat: implement AuthGuard with Redis session validation"
```

---

## Task 7: AuthService — Register

**Files:**
- Create: `server/src/auth/auth.service.ts` (partial — register only)

- [ ] **Step 7.1: Install bcrypt and cuid2**

```bash
cd server && npm install bcrypt @paralleldrive/cuid2 && npm install --save-dev @types/bcrypt
```

- [ ] **Step 7.2: Write failing test for register**

Create `server/src/auth/auth.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';

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
  zadd: jest.fn(),
  del: jest.fn(),
  zrem: jest.fn(),
};

const mockConfig = { get: jest.fn((key: string, def: any) => def ?? 12) };

describe('AuthService - register', () => {
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

  it('throws ConflictException if email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({ email: 'a@b.com', password: 'password123' }, '127.0.0.1'),
    ).rejects.toThrow(ConflictException);
  });

  it('creates user and gameProfile in a transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const mockUser = { id: 'user_1', email: 'a@b.com', role: 'USER' };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.user.create.mockResolvedValue(mockUser);
    mockPrisma.gameProfile.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const result = await service.register(
      { email: 'a@b.com', password: 'password123' },
      '127.0.0.1',
    );

    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.gameProfile.create).toHaveBeenCalledWith({
      data: { userId: 'user_1' },
    });
    expect(result).toMatchObject({ userId: 'user_1', email: 'a@b.com' });
  });
});
```

- [ ] **Step 7.3: Run test to verify it fails**

```bash
cd server && npx jest auth.service.spec.ts --no-coverage
```

Expected: FAIL — `AuthService` not found.

- [ ] **Step 7.4: Implement AuthService (register)**

Create `server/src/auth/auth.service.ts`:

```typescript
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

  async register(dto: RegisterDto, ipAddress: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const rounds = this.config.get<number>('BCRYPT_ROUNDS', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.$transaction(async (tx) => {
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

    // Write auth session key (indexed by userId — for listing/revoke)
    const authKey = `session:${user.id}:${sessionId}`;
    await this.redis.hset(authKey, {
      userId: user.id,
      sessionId,
      role: user.role,
      deviceInfo: dto.deviceInfo ?? '',
      ipAddress,
      loginTime: now,
      expiresAt,
    });
    await this.redis.expire(authKey, sessionTtl);

    // Write presence key (indexed by sessionId — for auth guard)
    const presenceKey = `user_session_details:${sessionId}`;
    await this.redis.hset(presenceKey, {
      userId: user.id,
      role: user.role,
      platform: dto.platform,
      deviceInfo: dto.deviceInfo ?? '',
      ipAddress,
      lastActive: now,
      expiresAt,
    });
    await this.redis.expire(presenceKey, heartbeatTtl);

    // Update sorted set for presence tracking
    await this.redis.zadd('online_users_by_last_active', Date.now(), sessionId);

    // Persist session to DB
    await this.prisma.userSession.create({
      data: { userId: user.id, sessionId, ipAddress, deviceInfo: dto.deviceInfo, status: 'ACTIVE' },
    });

    // Audit log
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

  async logout(userId: string, sessionId: string, ipAddress: string) {
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
```

> Note: Install `@paralleldrive/cuid2` for cuid generation:
> ```bash
> cd server && npm install @paralleldrive/cuid2
> ```

- [ ] **Step 7.5: Run tests to verify they pass**

```bash
cd server && npx jest auth.service.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 7.6: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "feat: implement AuthService register and login with Redis session"
```

---

## Task 8: AuthController + AuthModule

**Files:**
- Create: `server/src/auth/auth.controller.ts`
- Create: `server/src/auth/auth.module.ts`
- Modify: `server/src/app.module.ts`

- [ ] **Step 8.1: Create AuthController**

Create `server/src/auth/auth.controller.ts`:

```typescript
import { Controller, Post, Delete, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip ?? '');
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip ?? '');
  }

  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.authService.logout(user.userId, user.sessionId, req.ip ?? '');
  }
}
```

- [ ] **Step 8.2: Create AuthModule**

Create `server/src/auth/auth.module.ts`:

```typescript
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
    // Register globally — all routes protected unless @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard],
})
export class AuthModule {}
```

- [ ] **Step 8.3: Register AuthModule in AppModule**

Edit `server/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 8.4: Write E2E test for auth**

Create `server/test/auth.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /api/auth/register — creates a new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `test-${Date.now()}@example.com`, password: 'password123' })
      .expect(201);

    expect(res.body).toMatchObject({ userId: expect.any(String), email: expect.any(String) });
  });

  it('POST /api/auth/login — returns sessionId', async () => {
    const email = `login-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123', platform: 'forum' })
      .expect(200);

    expect(res.body).toMatchObject({ sessionId: expect.any(String) });
  });

  it('DELETE /api/auth/logout — requires auth, returns 204', async () => {
    const email = `logout-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123', platform: 'forum' });

    await request(app.getHttpServer())
      .delete('/api/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.sessionId}`)
      .expect(204);
  });
});
```

- [ ] **Step 8.5: Create E2E Jest config**

Create `server/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 8.6: Run E2E tests**

Ensure PostgreSQL and Redis are running, then:

```bash
cd server && npx jest --config test/jest-e2e.json --no-coverage
```

Expected: All 3 auth E2E tests PASS.

- [ ] **Step 8.7: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/auth/ server/src/app.module.ts server/test/
git commit -m "feat: wire up AuthModule with global guard and e2e tests"
```

---

## Task 9: SessionsModule — Heartbeat + List + Revoke

**Files:**
- Create: `server/src/sessions/sessions.service.ts`
- Create: `server/src/sessions/sessions.controller.ts`
- Create: `server/src/sessions/sessions.module.ts`

- [ ] **Step 9.1: Write failing tests for SessionsService**

Create `server/src/sessions/sessions.service.spec.ts`:

```typescript
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

const mockConfig = { get: jest.fn((key: string, def: any) => def ?? 120) };

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
    it('updates lastActive in Redis and resets TTL', async () => {
      await service.heartbeat('sess_1', 'user_1', '127.0.0.1');
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'user_session_details:sess_1',
        expect.objectContaining({ lastActive: expect.any(String) }),
      );
      expect(mockRedis.expire).toHaveBeenCalledWith('user_session_details:sess_1', expect.any(Number));
      expect(mockRedis.zadd).toHaveBeenCalledWith('online_users_by_last_active', expect.any(Number), 'sess_1');
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException when session does not exist', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue(null);
      await expect(service.revoke('db_id_1', 'user_1', 'USER', '127.0.0.1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-owner non-admin tries to revoke', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue({ id: 'db_id_1', userId: 'other_user', sessionId: 'sess_1' });
      await expect(service.revoke('db_id_1', 'user_1', 'USER', '127.0.0.1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes Redis keys and updates DB on successful revoke', async () => {
      mockPrisma.userSession.findUnique.mockResolvedValue({ id: 'db_id_1', userId: 'user_1', sessionId: 'sess_1' });
      mockPrisma.userSession.updateMany.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});
      await service.revoke('db_id_1', 'user_1', 'USER', '127.0.0.1');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'user_session_details:sess_1',
        'session:user_1:sess_1',
      );
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REVOKED', logoutTime: expect.any(Date) } }),
      );
    });
  });
});
```

- [ ] **Step 9.2: Run test to verify it fails**

```bash
cd server && npx jest sessions.service.spec.ts --no-coverage
```

Expected: FAIL — `SessionsService` not found.

- [ ] **Step 9.3: Implement SessionsService**

Create `server/src/sessions/sessions.service.ts`:

```typescript
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

  async heartbeat(sessionId: string, userId: string, _ipAddress: string): Promise<void> {
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
    // Scan all active Redis sessions for this user
    const keys = await this.redis.scan(`session:${userId}:*`);
    const activeSessionIds = keys.map((k) => k.split(':')[2]);

    // Fetch DB records for full history
    const dbSessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { loginTime: 'desc' },
    });

    // Merge Redis live data with DB records
    return Promise.all(
      dbSessions.map(async (s) => {
        const isActive = activeSessionIds.includes(s.sessionId);
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

  async revoke(dbSessionId: string, requestUserId: string, requestUserRole: string, ipAddress: string): Promise<void> {
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
```

- [ ] **Step 9.4: Run test to verify it passes**

```bash
cd server && npx jest sessions.service.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 9.5: Create SessionsController**

Create `server/src/sessions/sessions.controller.ts`:

```typescript
import { Controller, Get, Put, Delete, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { SessionsService } from './sessions.service';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('sessions')
export class SessionsController {
  constructor(private sessionsService: SessionsService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.sessionsService.getMe(user.sessionId);
  }

  @Put('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  heartbeat(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.sessionsService.heartbeat(user.sessionId, user.userId, req.ip ?? '');
  }

  @Get()
  listSessions(@CurrentUser() user: RequestUser) {
    return this.sessionsService.listSessions(user.userId, user.sessionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.sessionsService.revoke(id, user.userId, user.role, req.ip ?? '');
  }
}
```

- [ ] **Step 9.6: Create SessionsModule**

Create `server/src/sessions/sessions.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
```

- [ ] **Step 9.7: Register SessionsModule in AppModule**

Edit `server/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    SessionsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 9.8: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/sessions/
git commit -m "feat: add SessionsModule with heartbeat, list, and revoke endpoints"
```

---

## Task 10: PresenceModule — Background Jobs

**Files:**
- Create: `server/src/presence/presence.service.ts`
- Create: `server/src/presence/presence-sync.job.ts`
- Create: `server/src/presence/presence.module.ts`

- [ ] **Step 10.1: Install @nestjs/schedule**

```bash
cd server && npm install @nestjs/schedule
```

- [ ] **Step 10.2: Create PresenceService**

Create `server/src/presence/presence.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async cleanupExpiredSessions(): Promise<void> {
    const timeoutMs = this.config.get<number>('HEARTBEAT_TIMEOUT_MS', 120000);
    const cutoff = Date.now() - timeoutMs;

    const expired = await this.redis.zrangebyscore('online_users_by_last_active', 0, cutoff);
    if (expired.length === 0) return;

    this.logger.debug(`Cleaning up ${expired.length} expired sessions`);

    for (const sessionId of expired) {
      const details = await this.redis.hgetall(`user_session_details:${sessionId}`);

      await this.redis.del(`user_session_details:${sessionId}`);
      await this.redis.zrem('online_users_by_last_active', sessionId);

      if (details?.userId) {
        await this.redis.del(`session:${details.userId}:${sessionId}`);
        await this.prisma.userSession.updateMany({
          where: { sessionId, status: 'ACTIVE' },
          data: { status: 'EXPIRED', logoutTime: new Date() },
        });
      }
    }
  }

  async syncOnlineStatusToDb(): Promise<void> {
    const raw = await this.redis.zrangeWithScores('online_users_by_last_active');

    // raw = [sessionId, score, sessionId, score, ...]
    const userMap = new Map<string, { platforms: Set<string>; lastActive: number }>();

    for (let i = 0; i < raw.length; i += 2) {
      const sessionId = raw[i];
      const score = parseInt(raw[i + 1], 10);
      const details = await this.redis.hgetall(`user_session_details:${sessionId}`);
      if (!details?.userId) continue;

      const entry = userMap.get(details.userId) ?? { platforms: new Set(), lastActive: 0 };
      entry.platforms.add(details.platform);
      entry.lastActive = Math.max(entry.lastActive, score);
      userMap.set(details.userId, entry);
    }

    // Upsert online users
    for (const [userId, { platforms, lastActive }] of userMap) {
      await this.prisma.userOnlineStatus.upsert({
        where: { userId },
        update: {
          isOnline: true,
          lastOnline: new Date(lastActive),
          onlinePlatforms: Array.from(platforms),
          updatedAt: new Date(),
        },
        create: {
          userId,
          isOnline: true,
          lastOnline: new Date(lastActive),
          onlinePlatforms: Array.from(platforms),
        },
      });
    }

    // Mark users no longer in Redis as offline
    const onlineIds = Array.from(userMap.keys());
    await this.prisma.userOnlineStatus.updateMany({
      where: { userId: { notIn: onlineIds }, isOnline: true },
      data: { isOnline: false },
    });
  }
}
```

- [ ] **Step 10.3: Create PresenceSyncJob**

Create `server/src/presence/presence-sync.job.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from './presence.service';

@Injectable()
export class PresenceSyncJob {
  private readonly logger = new Logger(PresenceSyncJob.name);

  constructor(
    private presenceService: PresenceService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpired() {
    try {
      await this.presenceService.cleanupExpiredSessions();
    } catch (err) {
      this.logger.error('Redis cleanup job failed', err);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncToDb() {
    try {
      await this.presenceService.syncOnlineStatusToDb();
    } catch (err) {
      this.logger.error('DB sync job failed', err);
    }
  }
}
```

- [ ] **Step 10.4: Create PresenceModule**

Create `server/src/presence/presence.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PresenceService } from './presence.service';
import { PresenceSyncJob } from './presence-sync.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [PresenceService, PresenceSyncJob],
})
export class PresenceModule {}
```

- [ ] **Step 10.5: Register PresenceModule in AppModule**

Edit `server/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';
import { PresenceModule } from './presence/presence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    SessionsModule,
    PresenceModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 10.6: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add server/src/presence/
git commit -m "feat: add PresenceModule with Redis cleanup and DB sync cron jobs"
```

---

## Task 11: Next.js Auth Cookie Handlers

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`

- [ ] **Step 11.1: Create login route handler**

Create `app/api/auth/login/route.ts`:

```typescript
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const NESTJS_URL = process.env.NESTJS_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${NESTJS_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, platform: 'forum' }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Login failed' }));
    return NextResponse.json(error, { status: res.status });
  }

  const data = await res.json();
  const cookieStore = await cookies();

  cookieStore.set('sid', data.sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production',
  });

  // Do NOT expose sessionId to the browser
  const { sessionId: _, ...safeData } = data;
  return NextResponse.json(safeData);
}
```

- [ ] **Step 11.2: Create logout route handler**

Create `app/api/auth/logout/route.ts`:

```typescript
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const NESTJS_URL = process.env.NESTJS_URL ?? 'http://localhost:3001';

export async function DELETE() {
  const cookieStore = await cookies();
  const sid = cookieStore.get('sid')?.value;

  if (sid) {
    await fetch(`${NESTJS_URL}/api/auth/logout`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sid}` },
    }).catch(() => {}); // Best-effort — always clear cookie

    cookieStore.delete('sid');
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 11.3: Add NESTJS_URL to Next.js .env.local**

Create `.env.local` at the root:

```env
NESTJS_URL=http://localhost:3001
```

- [ ] **Step 11.4: Commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add app/api/ .env.local.example
git commit -m "feat: add Next.js auth cookie handlers for login and logout"
```

> Add `.env.local.example` with placeholder, not `.env.local` itself.

---

## Task 12: Full Integration Verification

- [ ] **Step 12.1: Start both services**

```bash
cd d:/SEP490/borrowed-shapes-wiki
npm run dev
```

Expected: Both Next.js (port 3000) and NestJS (port 3001) start successfully.

- [ ] **Step 12.2: Run NestJS unit tests**

```bash
cd server && npx jest --no-coverage
```

Expected: All unit tests PASS.

- [ ] **Step 12.3: Run NestJS E2E tests**

```bash
cd server && npx jest --config test/jest-e2e.json --no-coverage
```

Expected: All E2E tests PASS.

- [ ] **Step 12.4: Smoke test via curl**

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"password123"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"password123","platform":"forum"}'

# Heartbeat (replace SESSION_ID)
curl -X PUT http://localhost:3001/api/sessions/me \
  -H "Authorization: Bearer SESSION_ID" -v

# Logout
curl -X DELETE http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer SESSION_ID" -v
```

Expected: Register 201, Login 200 with sessionId, Heartbeat 204, Logout 204.

- [ ] **Step 12.5: Final commit**

```bash
cd d:/SEP490/borrowed-shapes-wiki
git add .
git commit -m "chore: complete Prisma schema, Auth module, and Session heartbeat implementation"
```
