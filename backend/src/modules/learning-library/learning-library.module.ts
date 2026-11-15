import { Module } from '@nestjs/common';
import { AiClient } from '../../core/ai/ai.client';
import { WordLookupService } from '../../core/ai/word-lookup.service';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AuthService } from '../auth/auth.service';
import { LearningDomainRegistry } from './domains/learning-domain.registry';
import { NaturalAmericanEnglishDomainStrategy } from './domains/natural-american-english.strategy';
import { ProgrammingTerminologyDomainStrategy } from './domains/programming-terminology.strategy';
import { TechnicalVocabularyDomainStrategy } from './domains/technical-vocabulary.strategy';
import { LearningLibraryController } from './learning-library.controller';
import { LearningLibraryRepository } from './learning-library.repository';
import { LearningLibraryService } from './learning-library.service';

@Module({
  imports: [AiProvidersModule],
  controllers: [LearningLibraryController],
  providers: [
    SqliteService,
    AuthService,
    AiClient,
    WordLookupService,
    NaturalAmericanEnglishDomainStrategy,
    TechnicalVocabularyDomainStrategy,
    ProgrammingTerminologyDomainStrategy,
    LearningDomainRegistry,
    LearningLibraryRepository,
    LearningLibraryService,
  ],
  exports: [LearningLibraryService, LearningDomainRegistry],
})
export class LearningLibraryModule {}
