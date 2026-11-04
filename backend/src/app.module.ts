import { Module } from '@nestjs/common';
import { SqliteService } from './core/database/sqlite.service';
import { HistoryRepository } from './core/database/history.repository';
import { AiClient } from './core/ai/ai.client';

import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { GoogleOAuthService } from './modules/auth/google-oauth.service';
import { VocabularyController, VocabularyService } from './modules/vocabulary/vocabulary.service';

import { ShadowingController } from './modules/tracks/shadowing/shadowing.controller';
import { ShadowingService } from './modules/tracks/shadowing/shadowing.service';
import { ShadowingTranslationService } from './modules/tracks/shadowing/shadowing.translation.service';
import { ShadowingAnalysisService } from './modules/tracks/shadowing/shadowing.analysis.service';
import { TranscriptService } from './modules/tracks/shadowing/transcript.service';
import { StreetTalkController, StreetTalkService } from './modules/tracks/street-talk/street-talk.service';
import { PhoneticsController, PhoneticsService } from './modules/tracks/phonetics/phonetics.service';
import { HistoryController } from './modules/history/history.controller';
import { LanguagesController } from './modules/languages/languages.controller';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [],
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
    GoogleOAuthService,
    AuthService,
    VocabularyService,
    TranscriptService,
    ShadowingTranslationService,
    ShadowingAnalysisService,
    ShadowingService,
    StreetTalkService,
    PhoneticsService,
  ],
})
export class AppModule {}
