import { Module } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import { TranscriptProviderGuard } from '../../core/media/transcript-provider-guard.service';
import { MediaTranscriptionService } from '../american-extractor/sources/media-transcription.service';
import { AuthService } from '../auth/auth.service';
import { TranscriptService } from '../tracks/media-hub/transcript.service';
import { SharedSourcesController } from './shared-sources.controller';
import { SharedSourcesRepository } from './shared-sources.repository';
import { SharedSourcesService } from './shared-sources.service';

@Module({
  controllers: [SharedSourcesController],
  providers: [
    SqliteService,
    AuthService,
    TranscriptProviderGuard,
    SharedSourcesRepository,
    SharedSourcesService,
    TranscriptService,
    MediaTranscriptionService,
  ],
  exports: [
    TranscriptProviderGuard,
    SharedSourcesService,
    SharedSourcesRepository,
    TranscriptService,
    MediaTranscriptionService,
  ],
})
export class SharedSourcesModule {}
