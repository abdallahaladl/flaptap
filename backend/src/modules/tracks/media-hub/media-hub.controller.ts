import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import {
  isValidPacingMode,
  normalizePacingMode,
  MediaHubPacingMode,
} from '../../../core/linguistics/segmentation';
import { requireAuthenticatedUser } from '../../auth/auth.request';
import { AuthService } from '../../auth/auth.service';
import { AmericanExtractorService } from '../../american-extractor/american-extractor.service';
import { AskLessonDto, MediaHubAskService } from './media-hub.ask.service';
import { MediaHubService } from './media-hub.service';
import { ReadingBookmark, TranscriptExportFormat, TranscriptViewMode } from './media-hub.types';

const MAX_MEDIA_UPLOAD_BYTES = 120 * 1024 * 1024;

export class ProcessVideoDto {
  url: string;
  force?: boolean;
  pacingMode?: MediaHubPacingMode;
  allowInstantOpen?: boolean;
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
  lookupScope?: 'word' | 'phrase' | 'sentence';
}

interface ReviewLessonBody {
  keyId?: string;
  model?: string;
  variant?: string;
  force?: boolean;
}

@Controller('api/tracks/media-hub')
export class MediaHubController {
  constructor(
    private readonly mediaHubService: MediaHubService,
    private readonly mediaHubAskService: MediaHubAskService,
    private readonly americanExtractor: AmericanExtractorService,
    private readonly authService: AuthService,
  ) {}

  @Get('config')
  getConfig(@Req() req: Request) {
    let userId: string | null = null;
    try {
      userId = requireAuthenticatedUser(req, this.authService).userId;
    } catch {
      userId = null;
    }
    return { success: true, ...this.mediaHubService.getConfig(userId) };
  }

  @Get('check-existing')
  checkExisting(@Query('url') url: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!url) return { exists: false };
    return this.mediaHubService.checkExisting(url, identity);
  }

  @Post('process')
  processVideo(@Body() dto: ProcessVideoDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const pacingMode =
      dto?.pacingMode !== undefined ? normalizePacingMode(dto.pacingMode) : undefined;
    return this.mediaHubService.process(
      dto?.url,
      Boolean(dto?.force),
      identity,
      pacingMode,
      { allowInstantOpen: Boolean(dto?.allowInstantOpen) },
    );
  }

  @Post(':id/captions/retry')
  retryCaptions(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.mediaHubService.retryYoutubeCaptions(id, identity);
  }

  @Post(':id/transcript/import')
  importTranscript(
    @Param('id') id: string,
    @Body('rawText') rawText: string,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.mediaHubService.importManualTranscript(id, rawText, identity);
  }

  @Post(':id/transcribe')
  transcribeLesson(
    @Param('id') id: string,
    @Body('allowLocalWhisper') allowLocalWhisper: boolean | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.mediaHubService.transcribeLessonExplicit(
      id,
      { allowLocalWhisper: Boolean(allowLocalWhisper) },
      identity,
    );
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_UPLOAD_BYTES },
    }),
  )
  async uploadMedia(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype?: string } | undefined,
    @Body('force') force: string | boolean | undefined,
    @Body('pacingMode') pacingMode: string | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!file) {
      throw new BadRequestException('Select an audio or video file to upload.');
    }
    return this.mediaHubService.processUpload(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      force === true || force === 'true',
      identity,
      pacingMode !== undefined ? normalizePacingMode(pacingMode) : undefined,
    );
  }

  @Post('translate-sentences')
  translateSentences(@Body() dto: TranslateSentencesDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const sentenceIndices = Array.isArray(dto?.sentenceIndices)
      ? dto.sentenceIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : undefined;
    return this.mediaHubService.translateSentences(
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
    return this.mediaHubService.analyzeLesson(dto?.historyId, Boolean(dto?.force), identity);
  }

  @Post('coach-glosses')
  coachGlosses(@Body() dto: AnalyzeLessonDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.mediaHubService.coachGlosses(dto?.historyId, Boolean(dto?.force), identity);
  }

  @Post('define-word')
  defineWord(@Body() dto: DefineWordDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.mediaHubService.defineWord(
      dto?.historyId,
      dto?.word,
      dto?.sentenceIndex,
      dto?.language,
      dto?.lookupScope,
      identity,
    );
  }

  @Post(':id/review')
  async reviewLesson(@Param('id') id: string, @Body() body: ReviewLessonBody, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const data = await this.mediaHubService.reviewLesson(
      id,
      {
        keyId: body?.keyId,
        model: body?.model,
        variant: body?.variant,
        force: Boolean(body?.force),
      },
      identity,
    );
    return { success: true, data };
  }

  @Post(':id/review/stream')
  async reviewLessonStream(
    @Param('id') id: string,
    @Body() body: ReviewLessonBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let identity: ReturnType<typeof requireAuthenticatedUser>;
    try {
      identity = requireAuthenticatedUser(req, this.authService);
    } catch (authErr: any) {
      const status =
        authErr instanceof HttpException ? authErr.getStatus() : HttpStatus.UNAUTHORIZED;
      const payload =
        authErr instanceof HttpException
          ? authErr.getResponse()
          : { code: 'auth_required', message: 'Authentication required.' };
      res.status(status).json(payload);
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const ac = new AbortController();
    let closed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        ac.abort(new Error('Client closed stream connection.'));
      }
    });

    const emit = (event: string, payload: unknown) => {
      if (closed || res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const lesson = await this.mediaHubService.reviewLesson(
        id,
        {
          keyId: body?.keyId,
          model: body?.model,
          variant: body?.variant,
          force: Boolean(body?.force),
          signal: ac.signal,
          onProgress: (ev) => emit('progress', ev),
        },
        identity,
      );
      emit('done', { success: true, data: lesson });
    } catch (err: any) {
      const message =
        err instanceof HttpException
          ? (err.getResponse() as any)?.message || err.message
          : err?.message || 'Transcript review failed.';
      emit('error', { success: false, message });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Patch(':id/title')
  renameLesson(
    @Param('id') id: string,
    @Body('title') title: string,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: true, data: this.mediaHubService.renameLesson(id, title, identity) };
  }

  @Patch(':id/speakers')
  renameSpeakers(
    @Param('id') id: string,
    @Body('speakers') speakers: Record<string, string>,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      data: this.mediaHubService.renameSpeakers(id, speakers || {}, identity),
    };
  }

  @Patch(':id/reading-progress')
  updateReadingProgress(
    @Param('id') id: string,
    @Body('bookmark') bookmark: Partial<ReadingBookmark> | null,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const data = this.mediaHubService.updateReadingBookmark(id, bookmark ?? null, identity);
    return { success: true, ...data };
  }

  @Post('transcribe-question')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async transcribeQuestion(
    @UploadedFile() file: { buffer: Buffer; mimetype?: string; originalname?: string } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!file) {
      throw new BadRequestException('No audio recording uploaded.');
    }
    const result = await this.mediaHubAskService.transcribeQuestionAudio(file, identity);
    return { success: true, ...result };
  }

  @Post(':id/ask')
  async askLesson(
    @Param('id') id: string,
    @Body() body: AskLessonDto,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const data = await this.mediaHubAskService.askLesson(id, body, identity);
    return { success: true, data };
  }

  @Post(':id/ask/stream')
  async askLessonStream(
    @Param('id') id: string,
    @Body() body: AskLessonDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let identity: ReturnType<typeof requireAuthenticatedUser>;
    try {
      identity = requireAuthenticatedUser(req, this.authService);
    } catch (authErr: any) {
      const status =
        authErr instanceof HttpException ? authErr.getStatus() : HttpStatus.UNAUTHORIZED;
      const payload =
        authErr instanceof HttpException
          ? authErr.getResponse()
          : { code: 'auth_required', message: 'Authentication required.' };
      res.status(status).json(payload);
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const ac = new AbortController();
    let closed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        ac.abort(new Error('Client closed stream connection.'));
      }
    });

    const emit = (event: string, payload: unknown) => {
      if (closed || res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      emit('meta', { status: 'streaming' });
      const data = await this.mediaHubAskService.askLesson(id, body, identity, {
        signal: ac.signal,
        onDelta: (delta, accumulated) => emit('delta', { delta, accumulated }),
      });
      emit('done', { success: true, data });
    } catch (err: any) {
      const message =
        err instanceof HttpException
          ? (err.getResponse() as any)?.message || err.message
          : err?.message || 'Could not generate an answer.';
      emit('error', { success: false, message });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Delete(':id/ask/history')
  clearAskHistory(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.mediaHubAskService.clearHistory(id, identity);
  }

  @Patch(':id/pacing')
  updatePacing(
    @Param('id') id: string,
    @Body('pacingMode') pacingMode: unknown,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!isValidPacingMode(pacingMode)) {
      throw new BadRequestException(
        'Invalid pacingMode. Expected one of: "short", "normal".',
      );
    }
    const normalizedPacingMode = normalizePacingMode(pacingMode);
    const updated = this.mediaHubService.updateLessonPacing(
      id,
      normalizedPacingMode,
      identity,
    );
    return {
      success: true,
      pacingMode: normalizedPacingMode,
      sentenceCount: updated.sentences?.length ?? 0,
      item: updated,
    };
  }

  @Get(':id/extraction')
  getLessonExtraction(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const result = this.americanExtractor.getLatestForLesson(identity.userId, id);
    return { success: true, data: result.latest, guides: result.guides };
  }

  @Post(':id/extract/stream')
  async extractLessonStream(
    @Param('id') id: string,
    @Body()
    body: {
      language?: string;
      extractionType?: string;
      categories?: string[] | string;
      style?: string;
      level?: string;
      focus?: string;
      depth?: string;
      studyGoal?: string;
      order?: string;
      keyId?: string;
      model?: string;
      variant?: string;
      force?: boolean;
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let identity: ReturnType<typeof requireAuthenticatedUser>;
    try {
      identity = requireAuthenticatedUser(req, this.authService);
    } catch (authErr: any) {
      const status =
        authErr instanceof HttpException ? authErr.getStatus() : HttpStatus.UNAUTHORIZED;
      const payload =
        authErr instanceof HttpException
          ? authErr.getResponse()
          : { code: 'auth_required', message: 'Authentication required.' };
      res.status(status).json(payload);
      return;
    }

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const ac = new AbortController();
    let closed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        ac.abort(new Error('Client closed stream connection.'));
      }
    });

    const emit = (event: string, payload: unknown) => {
      if (closed || res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const categories = Array.isArray(body?.categories)
      ? body.categories.map((c) => String(c || '').trim()).filter(Boolean)
      : typeof body?.categories === 'string' && body.categories.trim()
        ? body.categories.split(',').map((c) => c.trim()).filter(Boolean)
        : undefined;

    try {
      const data = await this.americanExtractor.extract(
        {
          userId: identity.userId,
          inputKind: 'lesson',
          lessonId: id,
          language: body?.language,
          extractionType: body?.extractionType || 'all',
          categories,
          style: body?.style || 'auto',
          level: body?.level || 'all',
          focus: body?.focus || 'balanced',
          depth: body?.depth || 'exhaustive',
          studyGoal: body?.studyGoal || 'full',
          order: body?.order || 'appearance',
          keyId: body?.keyId,
          model: body?.model,
          variant: body?.variant,
          force: Boolean(body?.force),
        },
        {
          signal: ac.signal,
          onStage: (stage) => emit('stage', stage),
          onSourceReady: (source) => emit('source_ready', source),
          onItemPreview: (preview) => emit('item_preview', preview),
        },
      );
      emit('complete', { success: true, data, cached: Boolean(data.cached) });
    } catch (err: any) {
      if (!ac.signal.aborted && err?.name !== 'AbortError') {
        const status = err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_GATEWAY;
        const message =
          err instanceof HttpException
            ? (err.getResponse() as any)?.message || err.message
            : err?.message || 'Deep lexical extraction failed.';
        emit('error', {
          statusCode: status,
          message,
          retryable: status >= 500 || status === 429,
        });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  @Get(':id/export')
  exportLesson(
    @Param('id') id: string,
    @Query('view') view: TranscriptViewMode = 'sentences',
    @Query('format') format: TranscriptExportFormat = 'txt',
    @Query('timestamps') timestamps?: string,
    @Query('speakers') speakers?: string,
    @Req() req?: Request,
    @Res() res?: Response,
  ) {
    let identity: ReturnType<typeof requireAuthenticatedUser>;
    try {
      identity = requireAuthenticatedUser(req!, this.authService);
    } catch (authErr: any) {
      const status =
        authErr instanceof HttpException ? authErr.getStatus() : HttpStatus.UNAUTHORIZED;
      const payload =
        authErr instanceof HttpException
          ? authErr.getResponse()
          : { code: 'auth_required', message: 'Authentication required.' };
      res!.status(status).json(payload);
      return;
    }

    try {
      const result = this.mediaHubService.exportLesson(
        id,
        {
          view,
          format,
          includeTimestamps: timestamps !== '0' && timestamps !== 'false',
          includeSpeakers: speakers !== '0' && speakers !== 'false',
        },
        identity,
      );

      res!.setHeader('Content-Type', result.mimeType);
      res!.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename.replace(/"/g, '')}"`,
      );
      res!.status(HttpStatus.OK).send(result.content);
    } catch (err: any) {
      const status =
        err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const payload =
        err instanceof HttpException
          ? err.getResponse()
          : { message: err?.message || 'Export failed.' };
      res!.status(status).json(payload);
    }
  }
}
