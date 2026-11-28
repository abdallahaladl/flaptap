import { Module } from '@nestjs/common';
import { SqliteService } from './core/database/sqlite.service';
import { HistoryRepository } from './core/database/history.repository';
import { AiClient } from './core/ai/ai.client';
import { WordLookupService } from './core/ai/word-lookup.service';

import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { VocabularyController, VocabularyService } from './modules/vocabulary/vocabulary.service';

import { MediaHubController } from './modules/tracks/media-hub/media-hub.controller';
import { MediaHubService } from './modules/tracks/media-hub/media-hub.service';
import { MediaHubTranslationService } from './modules/tracks/media-hub/media-hub.translation.service';
import { MediaHubAnalysisService } from './modules/tracks/media-hub/media-hub.analysis.service';
import { MediaHubCoachGlossService } from './modules/tracks/media-hub/media-hub.coach-gloss.service';
import { MediaHubReviewService } from './modules/tracks/media-hub/media-hub.review.service';
import { MediaHubAskService } from './modules/tracks/media-hub/media-hub.ask.service';
import { StreetTalkController, StreetTalkService } from './modules/tracks/street-talk/street-talk.service';
import { PhoneticsController, PhoneticsService } from './modules/tracks/phonetics/phonetics.service';
import { HistoryController } from './modules/history/history.controller';
import { LanguagesController } from './modules/languages/languages.controller';
import { HealthController } from './modules/health/health.controller';
import { AiProvidersModule } from './modules/ai-providers/ai-providers.module';
import { LearningLibraryModule } from './modules/learning-library/learning-library.module';
import { AmericanExtractorModule } from './modules/american-extractor/american-extractor.module';
import { SharedSourcesModule } from './modules/shared-sources/shared-sources.module';
import { ThinkAloudModule } from './modules/think-aloud/think-aloud.module';
import { DataLifecycleModule } from './modules/data-lifecycle/data-lifecycle.module';
import { AiChatModule } from './modules/ai-chat/ai-chat.module';

@Module({
  imports: [
    SharedSourcesModule,
    AiProvidersModule,
    AiChatModule,
    DataLifecycleModule,
    LearningLibraryModule,
    AmericanExtractorModule,
    ThinkAloudModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    VocabularyController,
    MediaHubController,
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
    MediaHubTranslationService,
    MediaHubAnalysisService,
    MediaHubCoachGlossService,
    MediaHubReviewService,
    MediaHubAskService,
    MediaHubService,
    StreetTalkService,
    PhoneticsService,
  ],
})
export class AppModule {}
