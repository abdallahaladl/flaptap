export enum AgentType {
  ANTIGRAVITY = 'antigravity',
  CLAUDE_CODE = 'claude_code',
  CODEX = 'codex',
  OPENCODE = 'opencode',
  DIRECT_LOCAL = 'direct_local',
}

export interface AgentExecutionOptions {
  skillName: string;
  parameters: Record<string, any>;
  workingDirectory?: string;
  systemPrompt?: string;
}

export interface AgentExecutionResult {
  agentType: AgentType;
  success: boolean;
  rawOutput: string;
  structuredData?: any;
  executionTimeMs: number;
  toolCallsExecuted?: string[];
  error?: string;
}

export interface IAgentAdapter {
  readonly agentType: AgentType;
  readonly displayName: string;
  readonly isAvailable: boolean;
  
  checkAvailability(): Promise<boolean>;
  execute(options: AgentExecutionOptions): Promise<AgentExecutionResult>;
}
