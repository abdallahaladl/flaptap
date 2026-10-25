import { Module } from '@nestjs/common';
import { HistoryRepository } from './core/database/history.repository';
import { AgentFactory } from './core/agents/agent.factory';
import { AntigravityAdapter } from './core/agents/adapters/antigravity.adapter';
import { ClaudeCodeAdapter } from './core/agents/adapters/claude-code.adapter';
import { CodexAdapter, OpenCodeAdapter } from './core/agents/adapters/codex-and-opencode.adapter';

import { ShadowingController } from './modules/tracks/shadowing/shadowing.controller';
import { ShadowingService } from './modules/tracks/shadowing/shadowing.service';
import { StreetTalkController, StreetTalkService } from './modules/tracks/street-talk/street-talk.service';
import { PhoneticsController, PhoneticsService } from './modules/tracks/phonetics/phonetics.service';
import { HistoryController } from './modules/history/history.controller';
import { AgentsController } from './modules/agents/agents.controller';

@Module({
  imports: [],
  controllers: [
    ShadowingController,
    StreetTalkController,
    PhoneticsController,
    HistoryController,
    AgentsController,
  ],
  providers: [
    HistoryRepository,
    AgentFactory,
    AntigravityAdapter,
    ClaudeCodeAdapter,
    CodexAdapter,
    OpenCodeAdapter,
    ShadowingService,
    StreetTalkService,
    PhoneticsService,
  ],
})
export class AppModule {}
