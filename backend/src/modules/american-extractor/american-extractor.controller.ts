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
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { AmericanExtractorService } from './american-extractor.service';
import {
  ExtractorInputKind,
  HistorySortBy,
  HistoryStatusFilter,
} from './american-extractor.types';

interface ExtractBody {
  inputKind?: ExtractorInputKind;
  url?: string;
  text?: string;
  title?: string;
  lessonId?: string;
  language?: string;
  extractionType?: string;
  style?: string;
  level?: string;
  focus?: string;
  depth?: string;
  studyGoal?: string;
  order?: string;
  keyId?: string;
  model?: string;
  variant?: string;
  force?: boolean | string;
}

interface DefineWordBody {
  noteId?: string;
  word: string;
  contextSentence?: string;
  title?: string;
  language?: string;
}

interface UpdateNoteBody {
  completed?: boolean;
  title?: string;
}

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

@Controller('api/american-extractor')
export class AmericanExtractorController {
  constructor(
    private readonly extractor: AmericanExtractorService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Public capability metadata: categories, focuses, limits, AI readiness.
   * Visitors can browse the feature before signing in.
   */
  @Get('config')
  getConfig() {
    return { success: true, ...this.extractor.getConfig() };
  }

  @Get('history')
  getHistory(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('sourceType') sourceType?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const history = this.extractor.listHistory(identity.userId, {
      q,
      sourceType,
      status: status as HistoryStatusFilter | undefined,
      sort: sort as HistorySortBy | undefined,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    return { success: true, ...history };
  }

  @Get('transcript-sources')
  getTranscriptSources(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      items: this.extractor.getTranscriptSources(identity.userId),
    };
  }

  @Get('notes/:id')
  getNote(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: true, data: this.extractor.getNote(identity.userId, id) };
  }

  @Post('extract')
  async extract(@Body() body: ExtractBody, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const inputKind = normalizeInputKind(body);
    validateExtractBody(inputKind, body);

    try {
      const data = await this.extractor.extract({
        userId: identity.userId,
        inputKind,
        url: body.url,
        text: body.text,
        title: body.title,
        lessonId: body.lessonId,
        language: body.language,
        extractionType: body.extractionType,
        style: body.style,
        level: body.level,
        focus: body.focus,
        depth: body.depth,
        studyGoal: body.studyGoal,
        order: body.order,
        keyId: body.keyId,
        model: body.model,
        variant: body.variant,
        force: parseBool(body.force),
      });
      return { success: true, data, cached: Boolean(data.cached) };
    } catch (error: any) {
      throw toHttpException(error, 'Failed to extract American English study items.');
    }
  }

  @Post('extract/stream')
  async extractStream(@Body() body: ExtractBody, @Req() req: Request, @Res() res: Response) {
    let identity;
    try {
      identity = requireAuthenticatedUser(req, this.authService);
    } catch (authErr: any) {
      return sendAuthErrorJson(res, authErr);
    }

    const inputKind = normalizeInputKind(body);
    try {
      validateExtractBody(inputKind, body);
    } catch (valErr: any) {
      const status = valErr instanceof HttpException ? valErr.getStatus() : HttpStatus.BAD_REQUEST;
      return res.status(status).json(
        valErr instanceof HttpException ? valErr.getResponse() : { statusCode: status, message: valErr?.message },
      );
    }

    const { ac, writeSse, openSse, endSse } = createSseChannel(res);
    openSse();

    try {
      const data = await this.extractor.extract(
        {
          userId: identity.userId,
          inputKind,
          url: body.url,
          text: body.text,
          title: body.title,
          lessonId: body.lessonId,
          language: body.language,
          extractionType: body.extractionType,
          style: body.style,
          level: body.level,
          focus: body.focus,
          depth: body.depth,
          studyGoal: body.studyGoal,
          order: body.order,
          keyId: body.keyId,
          model: body.model,
          variant: body.variant,
          force: parseBool(body.force),
        },
        {
          signal: ac.signal,
          onStage: (stage) => writeSse('stage', stage),
          onSourceReady: (source) => writeSse('source_ready', source),
          onItemPreview: (preview) => writeSse('item_preview', preview),
        },
      );

      writeSse('complete', { success: true, data, cached: Boolean(data.cached) });
      endSse();
    } catch (error: any) {
      if (ac.signal.aborted || error?.name === 'AbortError') {
        endSse();
        return;
      }
      const httpErr = toHttpException(error, 'Failed to extract American English study items.');
      const status = httpErr.getStatus();
      writeSse('error', {
        statusCode: status,
        message: httpErr.message,
        retryable: status >= 500 || status === 429,
      });
      endSse();
    }
  }

  @Post('extract/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async extractUpload(
    @UploadedFile() file: any,
    @Body() body: ExtractBody,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a file to upload.');
    }

    try {
      const data = await this.extractor.extractUpload({
        userId: identity.userId,
        buffer: file.buffer,
        originalName: file.originalname || 'upload',
        mimeType: file.mimetype || '',
        language: body?.language,
        extractionType: body?.extractionType,
        style: body?.style,
        level: body?.level,
        focus: body?.focus,
        depth: body?.depth,
        studyGoal: body?.studyGoal,
        order: body?.order,
        keyId: body?.keyId,
        model: body?.model,
        variant: body?.variant,
        force: parseBool(body?.force),
      });
      return { success: true, data, cached: Boolean(data.cached) };
    } catch (error: any) {
      throw toHttpException(error, 'Failed to extract text from that file.');
    }
  }

  @Post('extract/upload/stream')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async extractUploadStream(
    @UploadedFile() file: any,
    @Body() body: ExtractBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let identity;
    try {
      identity = requireAuthenticatedUser(req, this.authService);
    } catch (authErr: any) {
      return sendAuthErrorJson(res, authErr);
    }

    if (!file?.buffer?.length) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Choose a file to upload.',
      });
    }

    const { ac, writeSse, openSse, endSse } = createSseChannel(res);
    openSse();

    try {
      const data = await this.extractor.extractUpload(
        {
          userId: identity.userId,
          buffer: file.buffer,
          originalName: file.originalname || 'upload',
          mimeType: file.mimetype || '',
          language: body?.language,
          extractionType: body?.extractionType,
          style: body?.style,
          level: body?.level,
          focus: body?.focus,
          depth: body?.depth,
          studyGoal: body?.studyGoal,
          order: body?.order,
          keyId: body?.keyId,
          model: body?.model,
          variant: body?.variant,
          force: parseBool(body?.force),
        },
        {
          signal: ac.signal,
          onStage: (stage) => writeSse('stage', stage),
          onSourceReady: (source) => writeSse('source_ready', source),
          onItemPreview: (preview) => writeSse('item_preview', preview),
        },
      );

      writeSse('complete', { success: true, data, cached: Boolean(data.cached) });
      endSse();
    } catch (error: any) {
      if (ac.signal.aborted || error?.name === 'AbortError') {
        endSse();
        return;
      }
      const httpErr = toHttpException(error, 'Failed to extract text from that file.');
      const status = httpErr.getStatus();
      writeSse('error', {
        statusCode: status,
        message: httpErr.message,
        retryable: status >= 500 || status === 429,
      });
      endSse();
    }
  }

  @Post('define-word')
  async defineWord(@Body() body: DefineWordBody, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!body?.word || !String(body.word).trim()) {
      throw new BadRequestException('A valid word or phrase is required.');
    }
    try {
      return await this.extractor.defineWordInContext({
        userId: identity.userId,
        noteId: body.noteId,
        word: body.word,
        contextSentence: body.contextSentence,
        title: body.title,
        language: body.language,
      });
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        error?.message || 'Contextual lookup failed.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Patch('notes/:id')
  updateNote(
    @Param('id') id: string,
    @Body() body: UpdateNoteBody,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const hasCompleted = typeof body?.completed === 'boolean';
    const hasTitle = typeof body?.title === 'string';

    if (!hasCompleted && !hasTitle) {
      throw new BadRequestException('Provide "completed" (boolean) or "title" (string).');
    }

    const result: Record<string, any> = { success: true, id };
    if (hasTitle) {
      const renamed = this.extractor.renameNote(identity.userId, id, body.title as string);
      result.title = renamed.title;
      result.updatedAt = renamed.updatedAt;
    }
    if (hasCompleted) {
      const updated = this.extractor.setCompleted(identity.userId, id, body.completed as boolean);
      result.isCompleted = updated.isCompleted;
    }
    return result;
  }

  @Patch('notes/:id/items/:index')
  setItemCompletion(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() body: { completed?: boolean },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const parsedIndex = Number(index);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
      throw new BadRequestException('Item index must be a non-negative integer.');
    }
    if (typeof body?.completed !== 'boolean') {
      throw new BadRequestException('Field "completed" must be a boolean.');
    }
    return {
      success: true,
      ...this.extractor.setItemCompletion(identity.userId, id, parsedIndex, body.completed),
    };
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    this.extractor.deleteNote(identity.userId, id);
    return { success: true, message: 'Extraction deleted.' };
  }
}

function normalizeInputKind(body: ExtractBody): ExtractorInputKind {
  const requested = String(body?.inputKind || '').trim().toLowerCase();
  if (requested === 'url' || requested === 'text' || requested === 'lesson') {
    return requested as ExtractorInputKind;
  }
  if (String(body?.url || '').trim()) return 'url';
  if (String(body?.lessonId || '').trim()) return 'lesson';
  return 'text';
}

function validateExtractBody(inputKind: ExtractorInputKind, body: ExtractBody): void {
  if (inputKind === 'url' && !String(body?.url || '').trim()) {
    throw new BadRequestException('Paste a video, social, audio, or article URL.');
  }
  if (inputKind === 'text' && !String(body?.text || '').trim()) {
    throw new BadRequestException('Paste text or Markdown to extract from.');
  }
  if (inputKind === 'lesson' && !String(body?.lessonId || '').trim()) {
    throw new BadRequestException('Choose a saved lesson transcript.');
  }
}

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function sendAuthErrorJson(res: Response, authErr: any) {
  const status = authErr instanceof HttpException ? authErr.getStatus() : HttpStatus.UNAUTHORIZED;
  const body =
    authErr instanceof HttpException
      ? authErr.getResponse()
      : { code: 'auth_required', message: 'Authentication required.' };
  return res.status(status).json(body);
}

function createSseChannel(res: Response) {
  const ac = new AbortController();
  let opened = false;

  res.on('close', () => {
    if (!res.writableEnded) {
      ac.abort(new Error('Client closed stream connection.'));
    }
  });

  const openSse = () => {
    if (opened || res.headersSent) return;
    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    opened = true;
  };

  const writeSse = (event: string, data: unknown) => {
    if (res.writableEnded || res.destroyed) return;
    openSse();
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const endSse = () => {
    if (!res.writableEnded) {
      res.end();
    }
  };

  return { ac, openSse, writeSse, endSse };
}

function toHttpException(error: any, fallback: string): HttpException {
  if (error instanceof HttpException) return error;
  const message = String(error?.message || fallback);
  const status = /not found/i.test(message)
    ? HttpStatus.NOT_FOUND
    : /sign in|auth/i.test(message)
      ? HttpStatus.UNAUTHORIZED
      : /AI request timed out|timed out/i.test(message)
        ? HttpStatus.GATEWAY_TIMEOUT
        : HttpStatus.BAD_GATEWAY;
  return new HttpException(message, status);
}
