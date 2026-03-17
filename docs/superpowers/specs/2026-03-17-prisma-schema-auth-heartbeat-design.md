# Design Spec: Prisma Schema, Auth Module & Session Heartbeat

**Date:** 2026-03-17
**Status:** Approved
**Revision:** 3 (post spec-review fixes — round 2)

---

## 1. Architecture Overview

### Project Structure

```
borrowed-shapes-wiki/              ← Next.js 16 (App Router) — root, unchanged
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── login/route.ts     ← Set HttpOnly cookie after NestJS login
│   │       └── logout/route.ts    ← Clear cookie + call NestJS logout
│   └── ...
├── server/                        ← NestJS backend (new)
│   ├── src/
│   │   ├── prisma/
│   │   ├── redis/
│   │   ├── auth/
│   │   ├── sessions/
│   │   ├── presence/
│   │   └── main.ts                ← Port 3001
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
├── package.json                   ← root: concurrently scripts
└── ...
```

### Communication Flow

```
Browser (wiki)
  └─► Next.js Route Handler / Server Action (port 3000)
        Reads HttpOnly cookie "sid" → forwards as Bearer token
        └─► fetch("http://localhost:3001/api/...", {
              headers: { Authorization: "Bearer <sessionId>" }
            })
              └─► NestJS (port 3001)

              Edit: Wiki không cần login, vì wifi có thể anonymous, chỉ cần login required khi người dùng vào 1 bài post nào đó. và game

Unity Game Client
  └─► fetch("http://localhost:3001/api/...")
        Headers: { Authorization: "Bearer <sessionId>" }
        └─► NestJS (port 3001)
```

> **Important:** NestJS NEVER receives cookies directly. It only reads
> `Authorization: Bearer <sessionId>`. The HttpOnly cookie is an internal
> Next.js concern — Next.js translates cookie → Bearer header for all
> server-to-server calls to NestJS.

### Root package.json Scripts

```json
{
  "scripts": {
    "dev":   "concurrently \"next dev\" \"cd server && npm run start:dev\"",
    "start": "concurrently \"next start\" \"cd server && npm run start:prod\""
  }
}
```

---

## 2. Redis Key Architecture

Three Redis key patterns are used, each with a distinct purpose:

### Key 1: `session:{userId}:{sessionId}` (Hash)

**Purpose:** Auth session record indexed by userId. Enables per-user session listing and revocation without scanning.

```
Key:    session:{userId}:{sessionId}
Type:   Hash
TTL:    SESSION_TTL_SEC (7 days — absolute session maximum, NOT reset on heartbeat)
Fields:
  userId      string
  sessionId   string
  role        string
  deviceInfo  string
  ipAddress   string
  loginTime   ISO timestamp
  expiresAt   ISO timestamp
```

**Used for:**
- `GET /sessions` — SCAN `session:{userId}:*` to list all active sessions for a user
- `DELETE /sessions/:id` — DEL by known userId + sessionId
- Password reset / logout-all-devices — DEL all matching `session:{userId}:*`

### Key 2: `user_session_details:{sessionId}` (Hash)

**Purpose:** Presence and auth-guard lookup indexed by sessionId alone. This is the primary key the Auth Guard uses since it only knows the sessionId from the Bearer token.

```
Key:    user_session_details:{sessionId}
Type:   Hash
TTL:    HEARTBEAT_TIMEOUT_SEC (sliding window — reset on every heartbeat)
Fields:
  userId      string
  role        string
  platform    "game" | "forum"
  deviceInfo  string
  ipAddress   string
  lastActive  ISO timestamp
  expiresAt   ISO timestamp    ← copied from session:{userId}:{sessionId}
```

**Used for:**
- Auth Guard validation (only Bearer token → sessionId is known)
- Heartbeat TTL sliding window
- Presence tracking

### Key 3: `online_users_by_last_active` (Sorted Set)

```
Key:    online_users_by_last_active
Type:   Sorted Set
Member: sessionId
Score:  lastActive unix timestamp (ms)
```

**Used for:**
- Background cleanup: find sessions with score < (now - HEARTBEAT_TIMEOUT_MS)
- DB Sync job: enumerate all online sessions, group by userId

### TTL Interaction Clarification

```
Login:
  session:{userId}:{sessionId}      TTL = 7 days (absolute max, never extended)
  user_session_details:{sessionId}  TTL = HEARTBEAT_TIMEOUT_SEC (120s)

Heartbeat:
  user_session_details:{sessionId}  TTL RESET to HEARTBEAT_TIMEOUT_SEC
  session:{userId}:{sessionId}      TTL unchanged (counts down to 7-day expiry)

Outcome:
  - If client stops sending heartbeats → user_session_details expires in 120s → detected as "offline"
  - If user never logs out and keeps sending heartbeats → session:{userId}:{sessionId}
    expires at 7-day mark → next heartbeat finds user_session_details but session: is gone
    → treat as expired, force re-login
  - Auth Guard MUST check both keys exist and session: expiresAt > now()
```

---

## 3. Prisma Schema

**Database:** PostgreSQL
**ORM:** Prisma 7.x
**ID strategy:** `cuid()`
**Location:** `server/prisma/schema.prisma`

### Enums

```prisma
enum Role {
  USER
  ADMIN
} // Just User and admin.

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
```

### Core Models

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(USER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  gameProfile      GameProfile?
  sessions         UserSession[]
  auditLogs        AuditLog[]
  forumThreads     ForumThread[]
  forumComments    ForumComment[]
  threadVotes      ForumThreadVote[]
  commentVotes     ForumCommentVote[]
  wikiRevisions    WikiRevision[]
  downloadLogs     DownloadLog[]
  onlineStatus     UserOnlineStatus?

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

// UserAchievement links GameProfile ↔ Achievement (not User directly)
// Achievements are a game-profile concern, not an account concern
model UserAchievement {
  gameProfileId String
  achievementId String
  achievedAt    DateTime @default(now())

  gameProfile GameProfile @relation(fields: [gameProfileId], references: [id])
  achievement Achievement @relation(fields: [achievementId], references: [id])

  @@id([gameProfileId, achievementId])
}
```

### Forum Models (Reddit-style, game-focused)

```prisma
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
  // value must be +1 or -1 — enforced at service layer (Prisma has no @check constraint)
  value    Int

  user   User        @relation(fields: [userId], references: [id])
  thread ForumThread @relation(fields: [threadId], references: [id])

  @@id([userId, threadId])
}

model ForumCommentVote {
  userId    String
  commentId String
  // value must be +1 or -1 — enforced at service layer (Prisma has no @check constraint)
  value     Int

  user    User         @relation(fields: [userId], references: [id])
  comment ForumComment @relation(fields: [commentId], references: [id])

  @@id([userId, commentId])
}
```

### Wiki Models

```prisma
model WikiPage {
  id               String  @id @default(cuid())
  slug             String  @unique
  title            String
  metadataJson     Json?
  // Intentionally denormalized cache — stores the ID of the latest WikiRevision.
  // Not a Prisma @relation to avoid circular dependency (WikiPage → WikiRevision → WikiPage).
  // Managed in application code: updated atomically with WikiRevision.create().
  // If a revision is deleted, application code must update this field.
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
```

### Session & Audit Models

```prisma
model UserSession {
  id         String        @id @default(cuid())
  userId     String
  sessionId  String        @unique   // Redis sessionId — required for revoke lookup
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
```

### Download & Presence Models

```prisma
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
  // fileVersion is an intentionally denormalized snapshot (no FK to FileAsset).
  // Preserves the version string at download time even if the FileAsset record changes.
  fileVersion  String
  bytesSent    BigInt
  clientIp     String
  downloadedAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([fileVersion])
  @@index([downloadedAt])
}

model DownloadStats {
  id             String    @id @default(cuid())
  fileAssetId    String
  date           DateTime  @db.Date
  downloadCount  BigInt    @default(0)
  totalBytesSent BigInt    @default(0)

  fileAsset FileAsset @relation(fields: [fileAssetId], references: [id])

  @@unique([fileAssetId, date])
  @@index([fileAssetId])
}

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

---

## 4. Auth Module

### API Endpoints

```
POST   /auth/register     ← Create user + GameProfile
POST   /auth/login        ← Issue sessionId
DELETE /auth/logout       ← Invalidate current session
```

### Register Flow

1. Validate `email` not already in DB
2. `bcrypt.hash(password, 12)`
3. Prisma transaction:
   - `user = prisma.user.create(...)`
   - `prisma.gameProfile.create({ userId: user.id })`
4. `AuditLog { actionType: CREATE, entityName: 'User', entityId: user.id, newValue: { email, role } }`
5. Return `{ userId, email, role }`

### Login Flow

1. `prisma.user.findUnique({ where: { email } })` → 401 if not found
2. `bcrypt.compare(password, user.passwordHash)` → 401 if mismatch
3. `sessionId = cuid()`
4. `expiresAt = now() + SESSION_TTL_SEC`
5. Redis writes (both keys):
   ```
   HSET session:{userId}:{sessionId}
     userId, sessionId, role, deviceInfo, ipAddress, loginTime, expiresAt
   EXPIRE session:{userId}:{sessionId} SESSION_TTL_SEC

   HSET user_session_details:{sessionId}
     userId, role, platform, deviceInfo, ipAddress, lastActive=now(), expiresAt
   EXPIRE user_session_details:{sessionId} HEARTBEAT_TIMEOUT_SEC
   ```
6. `ZADD online_users_by_last_active Date.now() sessionId`
7. `prisma.userSession.create({ userId, ipAddress, deviceInfo, status: ACTIVE })`
8. `AuditLog { actionType: LOGIN, entityName: 'UserSession' }`
9. Return `{ sessionId, userId, role, expiresAt }`

### Logout Flow (`DELETE /auth/logout`)

Requires: Auth Guard (current session)

1. `DEL user_session_details:{sessionId}`
2. `DEL session:{userId}:{sessionId}`
3. `ZREM online_users_by_last_active sessionId`
4. `prisma.userSession.update({ where: { id: dbSessionId }, data: { status: LOGGED_OUT, logoutTime: now() } })`
5. `AuditLog { actionType: LOGOUT }`

### Auth Guard

Applied to every protected route. NestJS only ever receives Bearer tokens.

```
1. Extract from header: Authorization: Bearer <sessionId>
   → missing or malformed? → 401

2. HGETALL user_session_details:{sessionId}
   → null (key missing or expired by heartbeat timeout)? → 401

3. HGETALL session:{userId}:{sessionId}   (userId taken from step 2)
   → missing (revoked or 7-day TTL expired)? → 401
   → Check expiresAt > now()
     → expired? → UPDATE UserSession status=EXPIRED, logoutTime=now()
               → DEL both Redis keys → 401
   Note: expiresAt is the authoritative source from this key.
   Both keys are written atomically on login with the same expiresAt value.

5. Attach to request:
   req.user = { userId, role, sessionId, platform }
```

### Module Structure

```
server/src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.guard.ts
├── decorators/
│   ├── current-user.decorator.ts    ← @CurrentUser()
│   └── roles.decorator.ts           ← @Roles(Role.ADMIN)
└── dto/
    ├── register.dto.ts
    └── login.dto.ts
```

### Next.js Cookie Handlers

```
app/api/auth/login/route.ts
  POST → call NestJS POST /auth/login
       → on success: set cookie("sid", sessionId, { httpOnly: true, sameSite: "strict", path: "/" })
       → return { userId, role, expiresAt } to browser (no sessionId exposed)

app/api/auth/logout/route.ts
  DELETE → read cookie("sid") → call NestJS DELETE /auth/logout with Bearer header
          → clearCookie("sid")
```

---

## 5. Session & Heartbeat Endpoints

### API Endpoints

```
GET    /sessions/me        ← Get current session info
PUT    /sessions/me        ← Heartbeat: update lastActive (reset TTL)
GET    /sessions           ← List all active sessions for current user
DELETE /sessions/:id       ← Revoke a specific session
```

### Heartbeat Flow (`PUT /sessions/me`)

1. `AuthGuard` validates sessionId
2. `HSET user_session_details:{sessionId} lastActive now()`
3. `EXPIRE user_session_details:{sessionId} HEARTBEAT_TIMEOUT_SEC`
4. `ZADD online_users_by_last_active Date.now() sessionId`
5. Return `204 No Content`

> Note: `session:{userId}:{sessionId}` TTL is NOT reset here.
> It counts down from login time to the absolute 7-day limit.

### List Sessions Flow (`GET /sessions`)

1. `AuthGuard` → extract `userId` from `req.user`
2. Full cursor loop: `SCAN session:{userId}:* COUNT 100` — repeat until cursor returns 0 to ensure all keys are collected
3. For each sessionId: `HGETALL user_session_details:{sessionId}` (get live presence data)
4. Join with `prisma.userSession.findMany({ where: { userId } })` for loginTime history
5. Return merged list: `[{ sessionId, platform, deviceInfo, ipAddress, loginTime, lastActive, isCurrent }]`

### Revoke Session Flow (`DELETE /sessions/:id`)

`:id` = the `UserSession.id` (DB record ID, not Redis sessionId — safer to expose)

1. `AuthGuard` → `req.user.userId`
2. `prisma.userSession.findUnique({ where: { id: params.id } })` → 404 if not found
3. Authorization check: `userSession.userId === req.user.userId` OR `req.user.role === ADMIN` → else 403
4. Extract `sessionId` from `userSession.sessionId` (stored in DB)
5. `DEL user_session_details:{sessionId}`
6. `DEL session:{userId}:{sessionId}`
7. `ZREM online_users_by_last_active sessionId`
8. `prisma.userSession.update({ status: REVOKED, logoutTime: now() })`
9. `AuditLog { actionType: REVOKE_SESSION, entityName: 'UserSession', entityId: params.id }`

### Background Jobs

**Job 1 — Redis Cleanup** (every 60s via `@Cron`):

```
// ioredis modern syntax (Redis 6.2+ compatible)
const expired = await redis.zrange(
  'online_users_by_last_active', 0, Date.now() - HEARTBEAT_TIMEOUT_MS, 'BYSCORE'
)
for (const sessionId of expired) {
  const details = await redis.hgetall(`user_session_details:${sessionId}`)
  await redis.del(`user_session_details:${sessionId}`)
  await redis.zrem('online_users_by_last_active', sessionId)
  if (details?.userId) {
    await redis.del(`session:${details.userId}:${sessionId}`)
    await prisma.userSession.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'EXPIRED', logoutTime: new Date() },
    })
  }
}
```

**Job 2 — DB Sync / UserOnlineStatus** (every 60s via `@Cron`):

```
const activeSessions = await redis.zrange(
  'online_users_by_last_active', 0, -1, 'WITHSCORES'  // ioredis returns [member, score, ...]
)
// Group by userId
const userMap = Map<userId, { platforms: string[], lastActive: number }>
for each sessionId in activeSessions:
  details = HGETALL user_session_details:{sessionId}
  userMap[details.userId].platforms.add(details.platform)
  userMap[details.userId].lastActive = max(score, current)

// Upsert online users
for each [userId, { platforms, lastActive }] in userMap:
  prisma.userOnlineStatus.upsert({
    where: { userId },
    update: { isOnline: true, lastOnline: new Date(lastActive), onlinePlatforms: platforms, updatedAt: now() },
    create: { userId, isOnline: true, lastOnline: new Date(lastActive), onlinePlatforms: platforms },
  })

// Mark absent users as offline
const onlineUserIds = Array.from(userMap.keys())
prisma.userOnlineStatus.updateMany({
  where: { userId: { notIn: onlineUserIds }, isOnline: true },
  data: { isOnline: false },
})
```

### Client Heartbeat Intervals

| Client | Interval | HEARTBEAT_TIMEOUT_SEC |
|--------|----------|-----------------------|
| Unity (game) | 30s | 120s |
| Browser (forum) | 60s | 120s |

### Module Structure

```
server/src/sessions/
├── sessions.module.ts
├── sessions.controller.ts     ← GET/PUT /sessions/me, GET/DELETE /sessions/:id
└── sessions.service.ts

server/src/presence/
├── presence.module.ts
├── presence.service.ts        ← Redis read/write helpers
└── presence-sync.job.ts       ← @Cron jobs (cleanup + DB sync)
```

---

## 6. Shared Infrastructure Modules

### PrismaModule (Global)

```
server/src/prisma/
├── prisma.module.ts   ← @Global()
└── prisma.service.ts  ← extends PrismaClient, onModuleInit/Destroy
```

### RedisModule (Global)

```
server/src/redis/
├── redis.module.ts    ← @Global(), ioredis client
└── redis.service.ts   ← typed wrappers: hset, hgetall, del, expire, zadd, zrange, zrem
```

---

## 7. Environment Variables

```env
# server/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/borrowed_shapes"
REDIS_URL="redis://localhost:6379"

HEARTBEAT_TIMEOUT_SEC=120
HEARTBEAT_TIMEOUT_MS=120000       # = HEARTBEAT_TIMEOUT_SEC * 1000, used in Redis ZRANGE score comparisons
SESSION_TTL_SEC=604800            # 7 days — absolute session maximum
REDIS_CLEANUP_INTERVAL_MS=60000
DB_SYNC_INTERVAL_MS=60000

BCRYPT_ROUNDS=12
PORT=3001
```

---

## 8. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| ID type | `cuid()` | Prisma native, no extra package |
| Password hashing | bcrypt rounds=12 | Strong security, acceptable performance |
| Token type | Opaque Session ID | Supports instant revoke, all state in Redis |
| Two Redis session keys | `session:{userId}:{sessionId}` + `user_session_details:{sessionId}` | First enables per-user list/revoke; second enables O(1) auth-guard lookup by sessionId |
| NestJS never reads cookies | Bearer token only | Simpler auth guard; cookie management is Next.js concern |
| Vote tables | Two separate tables | Cleaner FK constraints vs nullable union table |
| Comment depth | Unlimited in DB, max 3 levels in API | DB flexibility, UI practicality |
| Forum flair | Enum (not string) | Consistent labels, filterable, no typos |
| UserAchievement FK | `gameProfileId → GameProfile` | Achievements are a game-profile concern per system design |
| WikiPage.latestRevisionId | Denormalized String?, no @relation | Avoids circular dependency; managed in application code |
| DownloadStats.date | `@db.Date` | Date-only field for daily aggregation |
| AuditLog.userId | Nullable | Supports system-generated events |
| UserSession.sessionId | `String @unique` | Required to look up Redis key during session revoke |
| Redis ZRANGE syntax | `ZRANGE key min max BYSCORE` | ioredis modern API, Redis 6.2+ compatible |
