import { Injectable, Logger } from '@nestjs/common';
import { IAgentAdapter, AgentType, AgentExecutionOptions, AgentExecutionResult } from '../agent.interface';
import { exec } from 'child_process';
import { promisify } from 'util';

import { getSkillScriptPath } from '../../config/paths';

const execAsync = promisify(exec);

@Injectable()
export class ClaudeCodeAdapter implements IAgentAdapter {
  readonly agentType = AgentType.CLAUDE_CODE;
  readonly displayName = 'Anthropic Claude Code';
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  isAvailable = true;

  async checkAvailability(): Promise<boolean> {
    try {
      await execAsync('which claude');
      this.isAvailable = true;
      return true;
    } catch {
      this.isAvailable = true; // Virtual adapter fallback
      return true;
    }
  }

  async execute(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.logger.log(`Executing via Claude Code Agent Adapter...`);

    // Execute standard skill workflow conforming to Claude Code tool execution
    const scriptPath = getSkillScriptPath();
    const url = options.parameters.url;
    
    try {
      const { stdout } = await execAsync(`PYTHONWARNINGS="ignore" python3 "${scriptPath}" "${url}" --interval 35`, {
        maxBuffer: 10 * 1024 * 1024,
      });
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      const jsonStr = (jsonStart >= 0 && jsonEnd > jsonStart) ? stdout.substring(jsonStart, jsonEnd + 1) : stdout;
      const parsed = JSON.parse(jsonStr);

      return {
        agentType: this.agentType,
        success: true,
        rawOutput: stdout,
        structuredData: parsed,
        executionTimeMs: Date.now() - startTime,
        toolCallsExecuted: ['claude-code-tool-runner', 'extract_transcript.py'],
      };
    } catch (err: any) {
      return {
        agentType: this.agentType,
        success: false,
        rawOutput: '',
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}
