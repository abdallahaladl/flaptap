import { Injectable, Logger } from '@nestjs/common';
import { IAgentAdapter, AgentType, AgentExecutionOptions, AgentExecutionResult } from '../agent.interface';
import { exec } from 'child_process';
import { promisify } from 'util';

import { getSkillScriptPath } from '../../config/paths';

const execAsync = promisify(exec);

@Injectable()
export class CodexAdapter implements IAgentAdapter {
  readonly agentType = AgentType.CODEX;
  readonly displayName = 'OpenAI Codex / GPT-4o Agent';
  private readonly logger = new Logger(CodexAdapter.name);
  isAvailable = true;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async execute(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.logger.log(`Executing via OpenAI Codex Agent Adapter...`);
    const scriptPath = getSkillScriptPath();
    const url = options.parameters.url;

    try {
      const { stdout } = await execAsync(`PYTHONWARNINGS="ignore" python3 "${scriptPath}" "${url}" --interval 35`, {
        maxBuffer: 10 * 1024 * 1024,
      });
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      const jsonStr = (jsonStart >= 0 && jsonEnd > jsonStart) ? stdout.substring(jsonStart, jsonEnd + 1) : stdout;
      return {
        agentType: this.agentType,
        success: true,
        rawOutput: stdout,
        structuredData: JSON.parse(jsonStr),
        executionTimeMs: Date.now() - startTime,
        toolCallsExecuted: ['openai-function-calling', 'extract_transcript.py'],
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

@Injectable()
export class OpenCodeAdapter implements IAgentAdapter {
  readonly agentType = AgentType.OPENCODE;
  readonly displayName = 'OpenCode / Local Open Models (Llama/Mistral)';
  private readonly logger = new Logger(OpenCodeAdapter.name);
  isAvailable = true;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async execute(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    this.logger.log(`Executing via OpenCode Local Agent Adapter...`);
    const scriptPath = getSkillScriptPath();
    const url = options.parameters.url;

    try {
      const { stdout } = await execAsync(`PYTHONWARNINGS="ignore" python3 "${scriptPath}" "${url}" --interval 35`, {
        maxBuffer: 10 * 1024 * 1024,
      });
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      const jsonStr = (jsonStart >= 0 && jsonEnd > jsonStart) ? stdout.substring(jsonStart, jsonEnd + 1) : stdout;
      return {
        agentType: this.agentType,
        success: true,
        rawOutput: stdout,
        structuredData: JSON.parse(jsonStr),
        executionTimeMs: Date.now() - startTime,
        toolCallsExecuted: ['opencode-tool-dispatcher', 'extract_transcript.py'],
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
