import { Module } from '@nestjs/common';
import { AiClient } from '../../core/ai/ai.client';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesModule } from '../shared-sources/shared-sources.module';
import { ThinkAloudController } from './think-aloud.controller';
import { ThinkAloudRepository } from './think-aloud.repository';
import { ThinkAloudService } from './think-aloud.service';

@Module({
  imports: [AiProvidersModule, SharedSourcesModule],
  controllers: [ThinkAloudController],
  providers: [
    SqliteService,
    AuthService,
    AiClient,
    ThinkAloudRepository,
    ThinkAloudService,
  ],
  exports: [ThinkAloudService, ThinkAloudRepository],
})
export class ThinkAloudModule {}
