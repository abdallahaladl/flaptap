import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../../core/ai/languages';
import { AiClient } from '../../core/ai/ai.client';
import { HistoryRepository } from '../../core/database/history.repository';
import { AuthService } from '../auth/auth.service';
import { requireAuthenticatedUser } from '../auth/auth.request';

@Controller('api')
export class LanguagesController {
  constructor(
    private readonly ai: AiClient,
    private readonly historyRepo: HistoryRepository,
    private readonly authService: AuthService,
  ) {}

  @Get('languages')
  listLanguages() {
    return {
      defaultLanguage: DEFAULT_LANGUAGE,
      count: SUPPORTED_LANGUAGES.length,
      languages: SUPPORTED_LANGUAGES,
    };
  }

  @Get('ai-status')
  aiStatus() {
    return this.ai.status();
  }

  @Get('stats')
  stats(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.historyRepo.getStats(identity);
  }
}
