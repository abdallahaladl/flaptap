import { Controller, Get } from '@nestjs/common';
import { AgentFactory } from '../../core/agents/agent.factory';

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly agentFactory: AgentFactory) {}

  @Get()
  listAgents() {
    return this.agentFactory.listAvailableAgents();
  }
}
