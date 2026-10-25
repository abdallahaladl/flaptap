import { Injectable, Controller, Post, Body, Logger } from '@nestjs/common';
import { HistoryRepository, HistoryItem, SentenceItem, ChunkItem } from '../../../core/database/history.repository';
import { AgentFactory } from '../../../core/agents/agent.factory';
import { AgentType } from '../../../core/agents/agent.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PhoneticsService {
  private readonly logger = new Logger(PhoneticsService.name);

  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly agentFactory: AgentFactory,
  ) {}

  /**
   * Generates an intensive articulatory phonetics drill dynamically via the active AI Agent.
   * Adheres strictly to AGENTS.md: zero static templates, LLM-driven phonetic precision.
   */
  async createDrill(topic: string, agentType: AgentType = AgentType.ANTIGRAVITY): Promise<HistoryItem> {
    const adapter = this.agentFactory.getAdapter(agentType);
    this.logger.log(`[Cognitive Delegation] Delegating Phonetics drill generation for "${topic}" to ${adapter.displayName}...`);

    const result = await adapter.execute({
      skillName: 'phonetics-drill-generation',
      parameters: { topic },
    });

    if (!result.success || !result.structuredData) {
      throw new Error(result.error || 'Failed to generate phonetics drill via AI Agent');
    }

    const template = result.structuredData;
    const id = uuidv4();

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

    const slug = (template.title || topic)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    const item: HistoryItem = {
      id,
      track: 'phonetics',
      trackTitle: 'Phonetics & Articulatory Mouth Mechanics',
      title: template.title || `${topic} Precision Drill`,
      creator: `${adapter.displayName} Phonetics Lab`,
      sourceUrl: `phonetics-lab://${slug}`,
      thumbnailUrl:
        template.thumbnailUrl ||
        'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=600&auto=format&fit=crop&q=80',
      categoryIcon: '🎯',
      accentDialect: template.dialect || 'General American Phonetic Mechanics',
      colorTheme: '#8B5CF6',
      durationSeconds: 90,
      pacingWpm: template.pacingWpm || 120,
      difficulty: 'Advanced',
      stats: {
        slangCount: (template.slangTable || []).length,
        idiomsCount: (template.idiomsTable || []).length,
        reductionsCount: (template.reductionsTable || []).length,
        fillersCount: 2,
        correctionsCount: 0,
        totalWords: 180,
      },
      keyHighlights: (template.reductionsTable || []).map((r: any) => ({
        category: 'Acoustic Mechanics',
        text: `${r.written} ${r.spoken}`,
        meaning: r.phenomenon,
        icon: '🎯',
        color: '#BAE6FD',
      })),
      slangTable: template.slangTable || [],
      idiomsTable: template.idiomsTable || [],
      reductionsTable: template.reductionsTable || [],
      asrFixes: [],
      chunks,
      sentences: template.sentences || [],
      chunksCount: 2,
      noteMarkdown: `# 🎯 Phonetics Lab: ${template.title}\n> **Dialect:** ${template.dialect}\n> **Cognitive Agent Engine:** ${adapter.displayName}\n\n## Mouth Mechanics Overview\n\n1. ${template.chunk1}\n2. ${template.chunk2}`,
      agentUsed: adapter.displayName,
      createdAt: new Date().toISOString(),
      completedDrills: 0,
    };

    return this.historyRepo.create(item);
  }
}

@Controller('api/tracks/phonetics')
export class PhoneticsController {
  constructor(private readonly phoneticsService: PhoneticsService) {}

  @Post('drill')
  createDrill(@Body() body: { topic: string; agentType?: AgentType }) {
    return this.phoneticsService.createDrill(body.topic, body.agentType);
  }
}
