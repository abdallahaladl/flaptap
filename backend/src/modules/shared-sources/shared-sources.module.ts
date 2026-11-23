import { Module } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import { MediaTranscriptionService } from '../american-extractor/sources/media-transcription.service';
import { AuthService } from '../auth/auth.service';
import { TranscriptService } from '../tracks/shadowing/transcript.service';
import { SharedSourcesController } from './shared-sources.controller';
import { SharedSourcesRepository } from './shared-sources.repository';
import { SharedSourcesService } from './shared-sources.service';

@Module({
  controllers: [SharedSourcesController],
  providers: [
    SqliteService,
    AuthService,
    SharedSourcesRepository,
    SharedSourcesService,
    TranscriptService,
    MediaTranscriptionService,
  ],
  exports: [
    SharedSourcesService,
    SharedSourcesRepository,
    TranscriptService,
    MediaTranscriptionService,
  ],
})
export class SharedSourcesModule {}
