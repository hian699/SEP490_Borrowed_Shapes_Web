import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PresenceService } from './presence.service';
import { PresenceSyncJob } from './presence-sync.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [PresenceService, PresenceSyncJob],
  exports: [PresenceService],
})
export class PresenceModule {}
