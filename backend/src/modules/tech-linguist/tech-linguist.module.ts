import { Module } from '@nestjs/common';
import { WordLookupService } from '../../core/ai/word-lookup.service';
import { AiClient } from '../../core/ai/ai.client';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { TranscriptService } from '../tracks/shadowing/transcript.service';
import { AdvancedNativeModeStrategy } from './modes/advanced-native-mode.strategy';
import { ComprehensiveModeStrategy } from './modes/comprehensive-mode.strategy';
import { ExtractionModeRegistry } from './modes/extraction-mode.registry';
import { TechLinguistController } from './tech-linguist.controller';
import { TechLinguistRepository } from './tech-linguist.repository';
import { TechLinguistService } from './tech-linguist.service';

@Module({
  imports: [AiProvidersModule],
  controllers: [TechLinguistController],
  providers: [
    SqliteService,
    AiClient,
    WordLookupService,
    TranscriptService,
    ComprehensiveModeStrategy,
    AdvancedNativeModeStrategy,
    ExtractionModeRegistry,
    TechLinguistRepository,
    TechLinguistService,
  ],
  exports: [TechLinguistService, ExtractionModeRegistry],
})
export class TechLinguistModule {}
