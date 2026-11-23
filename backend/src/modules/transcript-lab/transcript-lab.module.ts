import { Module } from '@nestjs/common';
import { AiClient } from '../../core/ai/ai.client';
import { WordLookupService } from '../../core/ai/word-lookup.service';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesModule } from '../shared-sources/shared-sources.module';
import { TranscriptLabController } from './transcript-lab.controller';
import { TranscriptLabRepository } from './transcript-lab.repository';
import { TranscriptLabService } from './transcript-lab.service';

@Module({
  imports: [AiProvidersModule, SharedSourcesModule],
  controllers: [TranscriptLabController],
  providers: [
    SqliteService,
    AuthService,
    AiClient,
    WordLookupService,
    TranscriptLabRepository,
    TranscriptLabService,
  ],
  exports: [TranscriptLabService],
})
export class TranscriptLabModule {}
