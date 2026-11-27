import { Module } from '@nestjs/common';
import { HistoryRepository } from '../../core/database/history.repository';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesModule } from '../shared-sources/shared-sources.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatRepository } from './ai-chat.repository';
import { AiChatService } from './ai-chat.service';

@Module({
  imports: [AiProvidersModule, SharedSourcesModule],
  controllers: [AiChatController],
  providers: [SqliteService, AuthService, HistoryRepository, AiChatRepository, AiChatService],
  exports: [AiChatRepository, AiChatService],
})
export class AiChatModule {}
