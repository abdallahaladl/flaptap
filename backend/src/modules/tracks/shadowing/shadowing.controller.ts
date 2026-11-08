import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ShadowingService } from './shadowing.service';
import { AuthService } from '../../auth/auth.service';
import { requireAuthenticatedUser } from '../../auth/auth.request';

export class ProcessVideoDto {
  url: string;
  force?: boolean;
}

export class TranslateSentencesDto {
  historyId: string;
  language?: string;
  force?: boolean;
  sentenceIndices?: number[];
}

export class AnalyzeLessonDto {
  historyId: string;
  force?: boolean;
}

export class DefineWordDto {
  historyId: string;
  word: string;
  sentenceIndex?: number;
  language?: string;
}

@Controller('api/tracks/shadowing')
export class ShadowingController {
  constructor(
    private readonly shadowingService: ShadowingService,
    private readonly authService: AuthService,
  ) {}

  @Get('check-existing')
  checkExisting(@Query('url') url: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!url) return { exists: false };
    return this.shadowingService.checkExisting(url, identity);
  }

  @Post('process')
  processVideo(@Body() dto: ProcessVideoDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.shadowingService.process(dto?.url, Boolean(dto?.force), identity);
  }

  @Post('translate-sentences')
  translateSentences(@Body() dto: TranslateSentencesDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const sentenceIndices = Array.isArray(dto?.sentenceIndices)
      ? dto.sentenceIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : undefined;
    return this.shadowingService.translateSentences(
      dto?.historyId,
      dto?.language,
      Boolean(dto?.force),
      identity,
      sentenceIndices,
    );
  }

  @Post('analyze')
  analyzeLesson(@Body() dto: AnalyzeLessonDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.shadowingService.analyzeLesson(dto?.historyId, Boolean(dto?.force), identity);
  }

  @Post('define-word')
  defineWord(@Body() dto: DefineWordDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.shadowingService.defineWord(
      dto?.historyId,
      dto?.word,
      dto?.sentenceIndex,
      dto?.language,
      identity,
    );
  }
}
