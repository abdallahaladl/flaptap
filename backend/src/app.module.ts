import { Module } from '@nestjs/common';
import { SqliteService } from './core/database/sqlite.service';
import { HistoryRepository } from './core/database/history.repository';
import { AiClient } from './core/ai/ai.client';
import { WordLookupService } from './core/ai/word-lookup.service';

import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { VocabularyController, VocabularyService } from './modules/vocabulary/vocabulary.service';

import { ShadowingController } from './modules/tracks/shadowing/shadowing.controller';
import { ShadowingService } from './modules/tracks/shadowing/shadowing.service';
import { ShadowingTranslationService } from './modules/tracks/shadowing/shadowing.translation.service';
import { ShadowingAnalysisService } from './modules/tracks/shadowing/shadowing.analysis.service';
import { ShadowingCoachGlossService } from './modules/tracks/shadowing/shadowing.coach-gloss.service';
import { TranscriptService } from './modules/tracks/shadowing/transcript.service';
import { StreetTalkController, StreetTalkService } from './modules/tracks/street-talk/street-talk.service';
import { PhoneticsController, PhoneticsService } from './modules/tracks/phonetics/phonetics.service';
import { HistoryController } from './modules/history/history.controller';
import { LanguagesController } from './modules/languages/languages.controller';
import { HealthController } from './modules/health/health.controller';
import { AiProvidersModule } from './modules/ai-providers/ai-providers.module';
import { TechLinguistModule } from './modules/tech-linguist/tech-linguist.module';
import { LearningLibraryModule } from './modules/learning-library/learning-library.module';
import { AmericanExtractorModule } from './modules/american-extractor/american-extractor.module';
import { SharedSourcesModule } from './modules/shared-sources/shared-sources.module';

@Module({
  imports: [
    SharedSourcesModule,
    AiProvidersModule,
    TechLinguistModule,
    LearningLibraryModule,
    AmericanExtractorModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    VocabularyController,
    ShadowingController,
    StreetTalkController,
    PhoneticsController,
    HistoryController,
    LanguagesController,
  ],
  providers: [
    SqliteService,
    HistoryRepository,
    AiClient,
    WordLookupService,
    AuthService,
    VocabularyService,
    TranscriptService,
    ShadowingTranslationService,
    ShadowingAnalysisService,
    ShadowingCoachGlossService,
    ShadowingService,
    StreetTalkService,
    PhoneticsService,
  ],
})
export class AppModule {}
