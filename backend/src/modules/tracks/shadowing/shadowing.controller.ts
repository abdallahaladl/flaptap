import { Controller, Post, Body, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ShadowingService } from './shadowing.service';
import { AgentType } from '../../../core/agents/agent.interface';

export class ProcessVideoDto {
  url: string;
  agentType?: AgentType;
}

export class TranslateSentencesDto {
  historyId: string;
  language?: string;
  dialect?: string;
  agentType?: AgentType;
}

@Controller('api/tracks/shadowing')
export class ShadowingController {
  constructor(private readonly shadowingService: ShadowingService) {}

  @Get('check-existing')
  checkExisting(@Query('url') url: string) {
    if (!url) return { exists: false };
    return this.shadowingService.checkExisting(url);
  }

  @Post('start-job')
  startJob(@Body() dto: ProcessVideoDto) {
    if (!dto.url) {
      throw new Error('YouTube URL is required');
    }
    return this.shadowingService.startJob(dto.url, dto.agentType || AgentType.ANTIGRAVITY);
  }

  @Get('job-status/:jobId')
  getJobStatus(@Param('jobId') jobId: string) {
    const job = this.shadowingService.getJobStatus(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    return job;
  }

  @Post('process')
  async processVideo(@Body() dto: ProcessVideoDto) {
    if (!dto.url) {
      throw new Error('YouTube URL is required');
    }
    return this.shadowingService.processVideo(dto.url, dto.agentType || AgentType.ANTIGRAVITY);
  }

  @Post('translate-sentences')
  async translateSentences(@Body() dto: TranslateSentencesDto) {
    if (!dto.historyId) {
      throw new Error('historyId is required');
    }
    return this.shadowingService.translateSentences(
      dto.historyId,
      dto.language || 'ar',
      dto.dialect || 'ar-SA',
      dto.agentType || AgentType.ANTIGRAVITY
    );
  }
}
