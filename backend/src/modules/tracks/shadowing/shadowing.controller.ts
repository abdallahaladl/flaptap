import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ShadowingService } from './shadowing.service';
import { TranscriptService } from './transcript.service';
import { AuthService } from '../../auth/auth.service';
import { requireAuthenticatedUser } from '../../auth/auth.request';
import { EXTERNAL_MEDIA_ID_PATTERN } from '../../../core/media/media-url';

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
    private readonly transcriptService: TranscriptService,
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

  /**
   * HTTP Range media streaming for self-hosted non-YouTube video/audio tracks
   * (TikTok, Instagram, X, Vimeo, TED, Loom, Twitch, direct media).
   * Range requests enable seeking, instant scrubbing, and zero memory overhead.
   */
  @Get('media/:mediaId')
  streamMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!EXTERNAL_MEDIA_ID_PATTERN.test(mediaId)) {
      throw new NotFoundException('Media not found.');
    }
    const filePath = this.transcriptService.resolveMediaFile(mediaId);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException('Media file not found.');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.webm'
        ? 'video/webm'
        : ext === '.mp3'
          ? 'audio/mpeg'
          : ext === '.m4a'
            ? 'audio/mp4'
            : 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.status(200).set({
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800, immutable',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }
}
