import { Module } from '@nestjs/common';
import { SqliteService } from '../../core/database/sqlite.service';
import { AuthService } from '../auth/auth.service';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAiCompatibleAdapter } from './adapters/openai-compatible.adapter';
import { AiProvidersController } from './ai-providers.controller';
import { AiProvidersRepository } from './ai-providers.repository';
import { AiProvidersService } from './ai-providers.service';
import { KeyDiscoveryService } from './services/key-discovery.service';
import { ProviderCatalogService } from './services/provider-catalog.service';

@Module({
  controllers: [AiProvidersController],
  providers: [
    SqliteService,
    AuthService,
    AiProvidersRepository,
    KeyDiscoveryService,
    ProviderCatalogService,
    OpenAiCompatibleAdapter,
    GeminiAdapter,
    AnthropicAdapter,
    AiProvidersService,
  ],
  exports: [AiProvidersService, KeyDiscoveryService, ProviderCatalogService],
})
export class AiProvidersModule {}
