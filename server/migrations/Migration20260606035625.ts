import { Migration } from '@mikro-orm/migrations';

export class Migration20260606035625 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "web"."DownloadStats" drop constraint "DownloadStats_fileAssetId_fkey";`);

    this.addSql(`alter table "game"."GameSession" drop constraint "GameSession_levelId_fkey";`);
    this.addSql(`alter table "game"."GameSession" drop constraint "GameSession_runId_fkey";`);

    this.addSql(`alter table "web"."RateLimitLog" drop constraint "RateLimitLog_userId_fkey";`);

    this.addSql(`alter table "game"."GameProfile" drop constraint "GameProfile_equippedAchievementId_fkey";`);
    this.addSql(`alter table "game"."GameProfile" drop constraint "GameProfile_userId_fkey";`);

    this.addSql(`alter table "game"."SeasonTeam" drop constraint "SeasonTeam_leader_fkey";`);

    this.addSql(`alter table "game"."SeasonTeamMember" drop constraint "SeasonTeamMember_profile_fkey";`);
    this.addSql(`alter table "game"."SeasonTeamMember" drop constraint "SeasonTeamMember_team_fkey";`);

    this.addSql(`alter table "game"."GameSessionPlayer" drop constraint "GameSessionPlayer_gameProfileId_fkey";`);
    this.addSql(`alter table "game"."GameSessionPlayer" drop constraint "GameSessionPlayer_sessionId_fkey";`);

    this.addSql(`alter table "game"."GameRunPlayer" drop constraint "GameRunPlayer_gameProfileId_fkey";`);
    this.addSql(`alter table "game"."GameRunPlayer" drop constraint "GameRunPlayer_runId_fkey";`);

    this.addSql(`alter table "web"."ForumThread" drop constraint "ForumThread_authorId_fkey";`);
    this.addSql(`alter table "web"."ForumThread" drop constraint "ForumThread_categoryId_fkey";`);

    this.addSql(`alter table "web"."ForumThreadVote" drop constraint "ForumThreadVote_threadId_fkey";`);
    this.addSql(`alter table "web"."ForumThreadVote" drop constraint "ForumThreadVote_userId_fkey";`);

    this.addSql(`alter table "web"."ForumComment" drop constraint "ForumComment_authorId_fkey";`);
    this.addSql(`alter table "web"."ForumComment" drop constraint "ForumComment_parentId_fkey";`);
    this.addSql(`alter table "web"."ForumComment" drop constraint "ForumComment_threadId_fkey";`);

    this.addSql(`alter table "web"."Report" drop constraint "Report_commentId_fkey";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_handledBy_fkey";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_reportedUserId_fkey";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_reporterId_fkey";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_threadId_fkey";`);

    this.addSql(`alter table "web"."ReportResponse" drop constraint "ReportResponse_adminId_fkey";`);
    this.addSql(`alter table "web"."ReportResponse" drop constraint "ReportResponse_reportId_fkey";`);

    this.addSql(`alter table "web"."ReportMedia" drop constraint "ReportMedia_reportId_fkey";`);

    this.addSql(`alter table "web"."ForumCommentVote" drop constraint "ForumCommentVote_commentId_fkey";`);
    this.addSql(`alter table "web"."ForumCommentVote" drop constraint "ForumCommentVote_userId_fkey";`);

    this.addSql(`alter table "web"."DownloadLog" drop constraint "DownloadLog_fileAssetId_fkey";`);
    this.addSql(`alter table "web"."DownloadLog" drop constraint "DownloadLog_userId_fkey";`);

    this.addSql(`alter table "auth"."AuditLog" drop constraint "AuditLog_userId_fkey";`);

    this.addSql(`alter table "web"."Announcement" drop constraint "Announcement_authorId_fkey";`);

    this.addSql(`alter table "game"."UserAchievement" drop constraint "UserAchievement_achievementId_fkey";`);
    this.addSql(`alter table "game"."UserAchievement" drop constraint "UserAchievement_gameProfileId_fkey";`);

    this.addSql(`alter table "auth"."UserOnlineStatus" drop constraint "UserOnlineStatus_userId_fkey";`);

    this.addSql(`alter table "auth"."UserSession" drop constraint "UserSession_userId_fkey";`);

    this.addSql(`alter table "web"."WikiPage" drop constraint "WikiPage_latestRevisionId_fkey";`);

    this.addSql(`alter table "web"."WikiRevision" drop constraint "WikiRevision_authorId_fkey";`);
    this.addSql(`alter table "web"."WikiRevision" drop constraint "WikiRevision_pageId_fkey";`);

    this.addSql(`alter table "web"."DownloadStats" add constraint "DownloadStats_fileAssetId_foreign" foreign key ("fileAssetId") references "web"."FileAsset" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "game"."GameRun" drop constraint GameRun_completed_check;`);

    this.addSql(`alter table "game"."GameSession" drop constraint GameSession_player_count_check;`);

    this.addSql(`alter table "game"."GameSession" add constraint "GameSession_runId_foreign" foreign key ("runId") references "game"."GameRun" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "game"."GameSession" add constraint "GameSession_levelId_foreign" foreign key ("levelId") references "game"."Level" ("id") on update cascade;`);

    this.addSql(`alter table "auth"."User" drop constraint User_auth_method_check;`);

    this.addSql(`alter table "auth"."User" alter column "displayName" type text using ("displayName"::text);`);
    this.addSql(`alter table "auth"."User" alter column "displayName" drop not null;`);

    this.addSql(`alter table "web"."RateLimitLog" add constraint "RateLimitLog_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "game"."GameProfile" add constraint "GameProfile_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "game"."GameProfile" add constraint "GameProfile_equippedAchievementId_foreign" foreign key ("equippedAchievementId") references "game"."Achievement" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "game"."GameProfile" add constraint "GameProfile_userId_unique" unique ("userId");`);

    this.addSql(`alter table "game"."SeasonTeam" add constraint "SeasonTeam_leaderId_foreign" foreign key ("leaderId") references "game"."GameProfile" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "game"."SeasonTeamMember" add constraint "SeasonTeamMember_gameProfileId_foreign" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "game"."SeasonTeamMember" add constraint "SeasonTeamMember_teamId_foreign" foreign key ("teamId") references "game"."SeasonTeam" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "game"."GameSessionPlayer" add constraint "GameSessionPlayer_sessionId_foreign" foreign key ("sessionId") references "game"."GameSession" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "game"."GameSessionPlayer" add constraint "GameSessionPlayer_gameProfileId_foreign" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "game"."GameRunPlayer" add constraint "GameRunPlayer_runId_foreign" foreign key ("runId") references "game"."GameRun" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "game"."GameRunPlayer" add constraint "GameRunPlayer_gameProfileId_foreign" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."ForumThread" add constraint "ForumThread_categoryId_foreign" foreign key ("categoryId") references "web"."ForumCategory" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "web"."ForumThread" add constraint "ForumThread_authorId_foreign" foreign key ("authorId") references "auth"."User" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."ForumThreadVote" alter column "value" type text using ("value"::text);`);
    this.addSql(`alter table "web"."ForumThreadVote" add constraint "ForumThreadVote_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."ForumThreadVote" add constraint "ForumThreadVote_threadId_foreign" foreign key ("threadId") references "web"."ForumThread" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."ForumComment" add constraint "ForumComment_threadId_foreign" foreign key ("threadId") references "web"."ForumThread" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."ForumComment" add constraint "ForumComment_authorId_foreign" foreign key ("authorId") references "auth"."User" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."ForumComment" add constraint "ForumComment_parentId_foreign" foreign key ("parentId") references "web"."ForumComment" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."Report" add constraint "Report_reporterId_foreign" foreign key ("reporterId") references "auth"."User" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_reportedUserId_foreign" foreign key ("reportedUserId") references "auth"."User" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_threadId_foreign" foreign key ("threadId") references "web"."ForumThread" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_commentId_foreign" foreign key ("commentId") references "web"."ForumComment" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_handledBy_foreign" foreign key ("handledBy") references "auth"."User" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "web"."ReportResponse" add constraint "ReportResponse_reportId_foreign" foreign key ("reportId") references "web"."Report" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."ReportResponse" add constraint "ReportResponse_adminId_foreign" foreign key ("adminId") references "auth"."User" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "web"."ReportResponse" add constraint "ReportResponse_reportId_unique" unique ("reportId");`);

    this.addSql(`alter table "web"."ReportMedia" add constraint "ReportMedia_reportId_foreign" foreign key ("reportId") references "web"."Report" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."ForumCommentVote" alter column "value" type text using ("value"::text);`);
    this.addSql(`alter table "web"."ForumCommentVote" add constraint "ForumCommentVote_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."ForumCommentVote" add constraint "ForumCommentVote_commentId_foreign" foreign key ("commentId") references "web"."ForumComment" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."DownloadLog" add constraint "DownloadLog_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete set null;`);
    this.addSql(`alter table "web"."DownloadLog" add constraint "DownloadLog_fileAssetId_foreign" foreign key ("fileAssetId") references "web"."FileAsset" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "auth"."AuditLog" add constraint "AuditLog_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "web"."Announcement" add constraint "Announcement_authorId_foreign" foreign key ("authorId") references "auth"."User" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "game"."UserAchievement" add constraint "UserAchievement_gameProfileId_foreign" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "game"."UserAchievement" add constraint "UserAchievement_achievementId_foreign" foreign key ("achievementId") references "game"."Achievement" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "auth"."UserOnlineStatus" add constraint "UserOnlineStatus_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "auth"."UserSession" add constraint "UserSession_userId_foreign" foreign key ("userId") references "auth"."User" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "web"."WikiPage" add constraint "WikiPage_latestRevisionId_foreign" foreign key ("latestRevisionId") references "web"."WikiRevision" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "web"."WikiRevision" add column "title" text not null, add column "title_vi" text not null, add column "slug" text not null, add column "slug_vi" text not null, add column "metadataJson" jsonb null, add column "isPublished" boolean not null default false;`);
    this.addSql(`alter table "web"."WikiRevision" add constraint "WikiRevision_pageId_foreign" foreign key ("pageId") references "web"."WikiPage" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "web"."WikiRevision" add constraint "WikiRevision_authorId_foreign" foreign key ("authorId") references "auth"."User" ("id") on update cascade on delete set null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "web"."Announcement" drop constraint "Announcement_authorId_foreign";`);

    this.addSql(`alter table "auth"."AuditLog" drop constraint "AuditLog_userId_foreign";`);

    this.addSql(`alter table "web"."DownloadLog" drop constraint "DownloadLog_userId_foreign";`);
    this.addSql(`alter table "web"."DownloadLog" drop constraint "DownloadLog_fileAssetId_foreign";`);

    this.addSql(`alter table "web"."DownloadStats" drop constraint "DownloadStats_fileAssetId_foreign";`);

    this.addSql(`alter table "web"."ForumComment" drop constraint "ForumComment_threadId_foreign";`);
    this.addSql(`alter table "web"."ForumComment" drop constraint "ForumComment_authorId_foreign";`);
    this.addSql(`alter table "web"."ForumComment" drop constraint "ForumComment_parentId_foreign";`);

    this.addSql(`alter table "web"."ForumCommentVote" drop constraint "ForumCommentVote_userId_foreign";`);
    this.addSql(`alter table "web"."ForumCommentVote" drop constraint "ForumCommentVote_commentId_foreign";`);

    this.addSql(`alter table "web"."ForumThread" drop constraint "ForumThread_categoryId_foreign";`);
    this.addSql(`alter table "web"."ForumThread" drop constraint "ForumThread_authorId_foreign";`);

    this.addSql(`alter table "web"."ForumThreadVote" drop constraint "ForumThreadVote_userId_foreign";`);
    this.addSql(`alter table "web"."ForumThreadVote" drop constraint "ForumThreadVote_threadId_foreign";`);

    this.addSql(`alter table "game"."GameProfile" drop constraint "GameProfile_userId_foreign";`);
    this.addSql(`alter table "game"."GameProfile" drop constraint "GameProfile_equippedAchievementId_foreign";`);

    this.addSql(`alter table "game"."GameRunPlayer" drop constraint "GameRunPlayer_runId_foreign";`);
    this.addSql(`alter table "game"."GameRunPlayer" drop constraint "GameRunPlayer_gameProfileId_foreign";`);

    this.addSql(`alter table "game"."GameSession" drop constraint "GameSession_runId_foreign";`);
    this.addSql(`alter table "game"."GameSession" drop constraint "GameSession_levelId_foreign";`);

    this.addSql(`alter table "game"."GameSessionPlayer" drop constraint "GameSessionPlayer_sessionId_foreign";`);
    this.addSql(`alter table "game"."GameSessionPlayer" drop constraint "GameSessionPlayer_gameProfileId_foreign";`);

    this.addSql(`alter table "web"."RateLimitLog" drop constraint "RateLimitLog_userId_foreign";`);

    this.addSql(`alter table "web"."Report" drop constraint "Report_reporterId_foreign";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_reportedUserId_foreign";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_threadId_foreign";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_commentId_foreign";`);
    this.addSql(`alter table "web"."Report" drop constraint "Report_handledBy_foreign";`);

    this.addSql(`alter table "web"."ReportMedia" drop constraint "ReportMedia_reportId_foreign";`);

    this.addSql(`alter table "web"."ReportResponse" drop constraint "ReportResponse_reportId_foreign";`);
    this.addSql(`alter table "web"."ReportResponse" drop constraint "ReportResponse_adminId_foreign";`);

    this.addSql(`alter table "game"."SeasonTeam" drop constraint "SeasonTeam_leaderId_foreign";`);

    this.addSql(`alter table "game"."SeasonTeamMember" drop constraint "SeasonTeamMember_gameProfileId_foreign";`);
    this.addSql(`alter table "game"."SeasonTeamMember" drop constraint "SeasonTeamMember_teamId_foreign";`);

    this.addSql(`alter table "game"."UserAchievement" drop constraint "UserAchievement_gameProfileId_foreign";`);
    this.addSql(`alter table "game"."UserAchievement" drop constraint "UserAchievement_achievementId_foreign";`);

    this.addSql(`alter table "auth"."UserOnlineStatus" drop constraint "UserOnlineStatus_userId_foreign";`);

    this.addSql(`alter table "auth"."UserSession" drop constraint "UserSession_userId_foreign";`);

    this.addSql(`alter table "web"."WikiPage" drop constraint "WikiPage_latestRevisionId_foreign";`);

    this.addSql(`alter table "web"."WikiRevision" drop constraint "WikiRevision_pageId_foreign";`);
    this.addSql(`alter table "web"."WikiRevision" drop constraint "WikiRevision_authorId_foreign";`);

    this.addSql(`alter table "web"."Announcement" add constraint "Announcement_authorId_fkey" foreign key ("authorId") references "auth"."User" ("id") on update no action on delete set null;`);

    this.addSql(`alter table "auth"."AuditLog" add constraint "AuditLog_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete set null;`);

    this.addSql(`alter table "web"."DownloadLog" add constraint "DownloadLog_fileAssetId_fkey" foreign key ("fileAssetId") references "web"."FileAsset" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."DownloadLog" add constraint "DownloadLog_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete set null;`);

    this.addSql(`alter table "web"."DownloadStats" add constraint "DownloadStats_fileAssetId_fkey" foreign key ("fileAssetId") references "web"."FileAsset" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."ForumComment" add constraint "ForumComment_authorId_fkey" foreign key ("authorId") references "auth"."User" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."ForumComment" add constraint "ForumComment_parentId_fkey" foreign key ("parentId") references "web"."ForumComment" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."ForumComment" add constraint "ForumComment_threadId_fkey" foreign key ("threadId") references "web"."ForumThread" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."ForumCommentVote" alter column "value" type int4 using ("value"::int4);`);
    this.addSql(`alter table "web"."ForumCommentVote" add constraint "ForumCommentVote_commentId_fkey" foreign key ("commentId") references "web"."ForumComment" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."ForumCommentVote" add constraint "ForumCommentVote_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."ForumThread" add constraint "ForumThread_authorId_fkey" foreign key ("authorId") references "auth"."User" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."ForumThread" add constraint "ForumThread_categoryId_fkey" foreign key ("categoryId") references "web"."ForumCategory" ("id") on update no action on delete no action;`);

    this.addSql(`alter table "web"."ForumThreadVote" alter column "value" type int4 using ("value"::int4);`);
    this.addSql(`alter table "web"."ForumThreadVote" add constraint "ForumThreadVote_threadId_fkey" foreign key ("threadId") references "web"."ForumThread" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."ForumThreadVote" add constraint "ForumThreadVote_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "game"."GameProfile" drop constraint "GameProfile_userId_unique";`);

    this.addSql(`alter table "game"."GameProfile" add constraint "GameProfile_equippedAchievementId_fkey" foreign key ("equippedAchievementId") references "game"."Achievement" ("id") on update no action on delete no action;`);
    this.addSql(`alter table "game"."GameProfile" add constraint "GameProfile_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "game"."GameRun" add constraint GameRun_completed_check check((("isCompleted" = false) AND ("completedAt" IS NULL)) OR (("isCompleted" = true) AND ("completedAt" IS NOT NULL) AND ("totalTimeSec" IS NOT NULL)));`);

    this.addSql(`alter table "game"."GameRunPlayer" add constraint "GameRunPlayer_gameProfileId_fkey" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "game"."GameRunPlayer" add constraint "GameRunPlayer_runId_fkey" foreign key ("runId") references "game"."GameRun" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "game"."GameSession" add constraint "GameSession_levelId_fkey" foreign key ("levelId") references "game"."Level" ("id") on update no action on delete no action;`);
    this.addSql(`alter table "game"."GameSession" add constraint "GameSession_runId_fkey" foreign key ("runId") references "game"."GameRun" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "game"."GameSession" add constraint GameSession_player_count_check check(("minPlayers" >= 1) AND ("maxPlayers" >= "minPlayers"));`);

    this.addSql(`alter table "game"."GameSessionPlayer" add constraint "GameSessionPlayer_gameProfileId_fkey" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "game"."GameSessionPlayer" add constraint "GameSessionPlayer_sessionId_fkey" foreign key ("sessionId") references "game"."GameSession" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."RateLimitLog" add constraint "RateLimitLog_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."Report" add constraint "Report_commentId_fkey" foreign key ("commentId") references "web"."ForumComment" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_handledBy_fkey" foreign key ("handledBy") references "auth"."User" ("id") on update no action on delete set null;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_reportedUserId_fkey" foreign key ("reportedUserId") references "auth"."User" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_reporterId_fkey" foreign key ("reporterId") references "auth"."User" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "web"."Report" add constraint "Report_threadId_fkey" foreign key ("threadId") references "web"."ForumThread" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."ReportMedia" add constraint "ReportMedia_reportId_fkey" foreign key ("reportId") references "web"."Report" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."ReportResponse" drop constraint "ReportResponse_reportId_unique";`);

    this.addSql(`alter table "web"."ReportResponse" add constraint "ReportResponse_adminId_fkey" foreign key ("adminId") references "auth"."User" ("id") on update no action on delete set null;`);
    this.addSql(`alter table "web"."ReportResponse" add constraint "ReportResponse_reportId_fkey" foreign key ("reportId") references "web"."Report" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "game"."SeasonTeam" add constraint "SeasonTeam_leader_fkey" foreign key ("leaderId") references "game"."GameProfile" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "game"."SeasonTeamMember" add constraint "SeasonTeamMember_profile_fkey" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "game"."SeasonTeamMember" add constraint "SeasonTeamMember_team_fkey" foreign key ("teamId") references "game"."SeasonTeam" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "auth"."User" alter column "displayName" type text using ("displayName"::text);`);
    this.addSql(`alter table "auth"."User" alter column "displayName" set not null;`);
    this.addSql(`alter table "auth"."User" add constraint User_auth_method_check check(("passwordHash" IS NOT NULL) OR ("googleId" IS NOT NULL));`);

    this.addSql(`alter table "game"."UserAchievement" add constraint "UserAchievement_achievementId_fkey" foreign key ("achievementId") references "game"."Achievement" ("id") on update no action on delete cascade;`);
    this.addSql(`alter table "game"."UserAchievement" add constraint "UserAchievement_gameProfileId_fkey" foreign key ("gameProfileId") references "game"."GameProfile" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "auth"."UserOnlineStatus" add constraint "UserOnlineStatus_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "auth"."UserSession" add constraint "UserSession_userId_fkey" foreign key ("userId") references "auth"."User" ("id") on update no action on delete cascade;`);

    this.addSql(`alter table "web"."WikiPage" add constraint "WikiPage_latestRevisionId_fkey" foreign key ("latestRevisionId") references "web"."WikiRevision" ("id") on update no action on delete set null;`);

    this.addSql(`alter table "web"."WikiRevision" drop column "title", drop column "title_vi", drop column "slug", drop column "slug_vi", drop column "metadataJson", drop column "isPublished";`);

    this.addSql(`alter table "web"."WikiRevision" add constraint "WikiRevision_authorId_fkey" foreign key ("authorId") references "auth"."User" ("id") on update no action on delete set null;`);
    this.addSql(`alter table "web"."WikiRevision" add constraint "WikiRevision_pageId_fkey" foreign key ("pageId") references "web"."WikiPage" ("id") on update no action on delete cascade;`);
  }

}
