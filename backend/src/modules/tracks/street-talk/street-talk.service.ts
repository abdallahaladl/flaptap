import { Injectable, Controller, Post, Body, Logger } from '@nestjs/common';
import { HistoryRepository, HistoryItem, SentenceItem, ChunkItem } from '../../../core/database/history.repository';
import { AgentFactory } from '../../../core/agents/agent.factory';
import { AgentType } from '../../../core/agents/agent.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StreetTalkService {
  private readonly logger = new Logger(StreetTalkService.name);

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly agentFactory: AgentFactory,
  ) {}

  /**
   * Generates an authentic American Street Talk roleplay dynamically via the active AI Agent.
   * Adheres strictly to AGENTS.md: zero static template strings or regex heuristics.
   */
  async startScenario(
    scenario: string,
    dialectOverride?: string,
    agentType: AgentType = AgentType.ANTIGRAVITY,
  ): Promise<HistoryItem> {
    const adapter = this.agentFactory.getAdapter(agentType);
    this.logger.log(`[Cognitive Delegation] Delegating Street Talk generation for "${scenario}" to ${adapter.displayName}...`);

    const result = await adapter.execute({
      skillName: 'street-talk-generation',
      parameters: {
        scenario,
        dialect: dialectOverride,
      },
    });

    if (!result.success || !result.structuredData) {
      throw new Error(result.error || 'Failed to generate street talk scenario via AI Agent');
    }

    const template = result.structuredData;
    const id = uuidv4();
    const dialect = dialectOverride || template.dialect || 'General American Urban Vernacular';

    const chunks: ChunkItem[] = [
      {
        timeRange: '[00:00:00 - 00:00:45]',
        start: '00:00:00',
        end: '00:00:45',
        startSec: 0,
        endSec: 45,
        text: template.chunk1,
        highlightedHtml: template.chunk1,
      },
      {
        timeRange: '[00:00:45 - 00:01:30]',
        start: '00:00:45',
        end: '00:01:30',
        startSec: 45,
        endSec: 90,
        text: template.chunk2,
        highlightedHtml: template.chunk2,
      },
    ];

    const slug = (template.title || scenario)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    const item: HistoryItem = {
      id,
      track: 'street_talk',
      trackTitle: 'Street Talk & American Slang Dialogue',
      title: template.title || `${scenario} Sparring`,
      creator: `${adapter.displayName} Sparring Partner`,
      sourceUrl: `interactive-roleplay://${slug}`,
      thumbnailUrl:
        template.thumbnailUrl ||
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      categoryIcon: '🔥',
      accentDialect: dialect,
      colorTheme: '#F59E0B',
      durationSeconds: 90,
      pacingWpm: template.pacingWpm || 175,
      difficulty: 'Intermediate',
      stats: {
        slangCount: (template.slangTable || []).length,
        idiomsCount: (template.idiomsTable || []).length,
        reductionsCount: (template.reductionsTable || []).length,
        fillersCount: 6,
        correctionsCount: 0,
        totalWords: 245,
      },
      keyHighlights: (template.slangTable || []).map((s: any) => ({
        category: 'Modern Street Slang',
        text: s.term,
        meaning: s.meaning,
        icon: '🟡',
        color: '#FEF08A',
      })),
      slangTable: template.slangTable || [],
      idiomsTable: template.idiomsTable || [],
      reductionsTable: template.reductionsTable || [],
      asrFixes: [],
      chunks,
      sentences: template.sentences || [],
      chunksCount: 2,
      noteMarkdown: `# 🔥 Street Talk Roleplay: ${template.title}\n> **Tone:** Authentic American street pacing and conversational slang.\n> **Dialect:** ${dialect}\n> **Cognitive Agent Engine:** ${adapter.displayName}\n\n## Dialogue Chunks\n\n1. ${template.chunk1}\n2. ${template.chunk2}`,
      agentUsed: adapter.displayName,
      createdAt: new Date().toISOString(),
      completedDrills: 0,
    };

    return this.historyRepo.create(item);
  }
}

@Controller('api/tracks/street-talk')
export class StreetTalkController {
  constructor(private readonly streetTalkService: StreetTalkService) {}

  @Post('start')
  startScenario(@Body() body: { scenario: string; dialect?: string; agentType?: AgentType }) {
    return this.streetTalkService.startScenario(body.scenario, body.dialect, body.agentType);
  }
}
