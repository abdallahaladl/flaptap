import { Module } from '@nestjs/common';
import { AiClient } from '../../core/ai/ai.client';
import { WordLookupService } from '../../core/ai/word-lookup.service';
import { HistoryRepository } from '../../core/database/history.repository';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesModule } from '../shared-sources/shared-sources.module';
import { TranscriptService } from '../tracks/shadowing/transcript.service';
import { AmericanExtractorController } from './american-extractor.controller';
import { AmericanExtractorRepository } from './american-extractor.repository';
import { AmericanExtractorService } from './american-extractor.service';
import { ArticleReaderService } from './sources/article-reader.service';
import { MediaTranscriptionService } from './sources/media-transcription.service';
import { SourceResolverService } from './sources/source-resolver.service';
import { VisionOcrService } from './sources/vision-ocr.service';

@Module({
  imports: [AiProvidersModule, SharedSourcesModule],
  controllers: [AmericanExtractorController],
  providers: [
    SqliteService,
    AuthService,
    AiClient,
    WordLookupService,
    HistoryRepository,
    TranscriptService,
    ArticleReaderService,
    MediaTranscriptionService,
    VisionOcrService,
    SourceResolverService,
    AmericanExtractorRepository,
    AmericanExtractorService,
  ],
  exports: [AmericanExtractorService],
})
export class AmericanExtractorModule {}
