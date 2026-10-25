import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentType, IAgentAdapter } from './agent.interface';
import { AntigravityAdapter } from './adapters/antigravity.adapter';
import { ClaudeCodeAdapter } from './adapters/claude-code.adapter';
import { CodexAdapter, OpenCodeAdapter } from './adapters/codex-and-opencode.adapter';

@Injectable()
export class AgentFactory {
  private adapters = new Map<AgentType, IAgentAdapter>();

  constructor(
    antigravity: AntigravityAdapter,
    claudeCode: ClaudeCodeAdapter,
    codex: CodexAdapter,
    opencode: OpenCodeAdapter,
  ) {
    this.adapters.set(AgentType.ANTIGRAVITY, antigravity);
    this.adapters.set(AgentType.CLAUDE_CODE, claudeCode);
    this.adapters.set(AgentType.CODEX, codex);
    this.adapters.set(AgentType.OPENCODE, opencode);
  }

  getAdapter(type: AgentType = AgentType.ANTIGRAVITY): IAgentAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new NotFoundException(`Agent adapter '${type}' is not registered`);
    }
    return adapter;
  }

  listAvailableAgents() {
    return Array.from(this.adapters.values()).map((a) => ({
      type: a.agentType,
      name: a.displayName,
      isAvailable: a.isAvailable,
    }));
  }
}
