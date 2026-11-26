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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { AuditLogRepository } from '../data-lifecycle/audit-log.repository';
import { DataLifecycleService } from '../data-lifecycle/data-lifecycle.service';
import { AmericanExtractorService } from './american-extractor.service';
import {
  ExtractorInputKind,
  HistorySortBy,
  HistoryStatusFilter,
  UploadedFileInput,
} from './american-extractor.types';
import { MAX_IMAGES_PER_EXTRACTION } from './sources/vision-ocr.service';

interface ExtractBody {
  inputKind?: ExtractorInputKind;
  url?: string;
  text?: string;
  title?: string;
  lessonId?: string;
  sourceId?: string;
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
    private readonly dataLifecycle: DataLifecycleService,
    private readonly auditLog: AuditLogRepository,
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
    const parsedPage = page !== undefined && page !== '' ? Number(page) : undefined;
    const parsedLimit = limit !== undefined && limit !== '' ? Number(limit) : undefined;
    const history = this.extractor.listHistory(identity.userId, {
      q,
      sourceType,
      status: status as HistoryStatusFilter | undefined,
      sort: sort as HistorySortBy | undefined,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
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
        sourceId: body.sourceId,
        language: body.language,
        extractionType: body.extractionType,
        categories: parseCategoriesParam(body.categories),
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
          sourceId: body.sourceId,
          language: body.language,
          extractionType: body.extractionType,
          categories: parseCategoriesParam(body.categories),
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
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: MAX_IMAGES_PER_EXTRACTION },
        { name: 'files', maxCount: MAX_IMAGES_PER_EXTRACTION },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_IMAGES_PER_EXTRACTION },
      },
    ),
  )
  async extractUpload(
    @UploadedFiles() filesMap: { file?: any[]; files?: any[] } | undefined,
    @Body() body: ExtractBody,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const files = collectUploadedFiles(filesMap);
    if (files.length === 0) {
      throw new BadRequestException('Choose a file to upload.');
    }

    try {
      const data = await this.extractor.extractUploads({
        userId: identity.userId,
        files,
        language: body?.language,
        extractionType: body?.extractionType,
        categories: parseCategoriesParam(body?.categories),
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
      throw toHttpException(error, 'Failed to extract text from that upload.');
    }
  }

  @Post('extract/upload/stream')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: MAX_IMAGES_PER_EXTRACTION },
        { name: 'files', maxCount: MAX_IMAGES_PER_EXTRACTION },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_IMAGES_PER_EXTRACTION },
      },
    ),
  )
  async extractUploadStream(
    @UploadedFiles() filesMap: { file?: any[]; files?: any[] } | undefined,
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

    const files = collectUploadedFiles(filesMap);
    if (files.length === 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Choose a file to upload.',
      });
    }

    const { ac, writeSse, openSse, endSse } = createSseChannel(res);
    openSse();

    try {
      const data = await this.extractor.extractUploads(
        {
          userId: identity.userId,
          files,
          language: body?.language,
          extractionType: body?.extractionType,
          categories: parseCategoriesParam(body?.categories),
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
      const httpErr = toHttpException(error, 'Failed to extract text from that upload.');
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
    if (typeof body?.completed === 'boolean') {
      throw new BadRequestException(
        'Study guide completion is derived automatically from its checked phrases and cannot be toggled manually.',
      );
    }
    if (typeof body?.title !== 'string') {
      throw new BadRequestException('Provide "title" (string).');
    }

    const renamed = this.extractor.renameNote(identity.userId, id, body.title);
    return {
      success: true,
      id,
      title: renamed.title,
      updatedAt: renamed.updatedAt,
    };
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

  @Post('notes/bulk-delete')
  bulkDeleteNotes(@Body() body: { ids?: string[] } | undefined, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.dataLifecycle.purgeExtractorNotesBulk(identity.userId, body?.ids || []),
    };
  }

  @Post('notes/clear')
  clearAllNotes(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.dataLifecycle.purgeAllExtractorNotes(identity.userId),
    };
  }

  @Post('notes/:id/reset-progress')
  resetNoteProgress(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const updated = this.extractor.resetNoteProgress(identity.userId, id);
    this.auditLog.record(identity.userId, {
      action: 'reset_extractor_progress',
      feature: 'american_extractor',
      scope: 'progress',
      targetId: id,
      targetLabel: updated.title,
      summary: `Reset phrase checkmarks for "${updated.title}"`,
      purged: { extractorNotes: 1 },
    });
    return { success: true, ...updated };
  }

  @Delete('notes/:id/items/:index')
  deleteNoteItem(
    @Param('id') id: string,
    @Param('index') index: string,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const parsedIndex = Number(index);
    if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
      throw new BadRequestException('Item index must be a non-negative integer.');
    }
    const res = this.extractor.deleteNoteItem(identity.userId, id, parsedIndex);
    this.auditLog.record(identity.userId, {
      action: 'delete_extractor_phrase',
      feature: 'american_extractor',
      scope: 'sub_item',
      targetId: id,
      targetLabel: res.removedPhrase || res.note.title,
      summary: `Removed phrase "${res.removedPhrase || parsedIndex}" from "${res.note.title}"`,
      purged: { extractorItems: 1 },
    });
    return {
      success: true,
      note: res.note,
      completionProgress: res.completionProgress,
      isCompleted: res.isCompleted,
    };
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const res = this.dataLifecycle.purgeExtractorNote(identity.userId, id);
    if (!res.deleted) {
      throw new HttpException('Extraction not found.', HttpStatus.NOT_FOUND);
    }
    return { success: true, message: 'Extraction deleted.', purged: res.purged };
  }
}

function normalizeInputKind(body: ExtractBody): ExtractorInputKind {
  const requested = String(body?.inputKind || '').trim().toLowerCase();
  if (
    requested === 'url' ||
    requested === 'text' ||
    requested === 'lesson' ||
    requested === 'source'
  ) {
    return requested as ExtractorInputKind;
  }
  if (String(body?.sourceId || '').trim()) return 'source';
  if (String(body?.url || '').trim()) return 'url';
  if (String(body?.lessonId || '').trim()) return 'lesson';
  return 'text';
}

function validateExtractBody(inputKind: ExtractorInputKind, body: ExtractBody): void {
  if (inputKind === 'source' && !String(body?.sourceId || '').trim()) {
    throw new BadRequestException('Choose a saved Flaptap source.');
  }
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

function parseCategoriesParam(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const cleaned = raw.map((v) => String(v || '').trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map((v) => String(v || '').trim()).filter(Boolean);
          return cleaned.length > 0 ? cleaned : undefined;
        }
      } catch {}
    }
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
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

function collectUploadedFiles(
  filesMap?: { file?: any[]; files?: any[] },
): UploadedFileInput[] {
  const raw = [...(filesMap?.files || []), ...(filesMap?.file || [])];
  return raw.map((item) => ({
    buffer: item?.buffer || Buffer.alloc(0),
    originalName: item?.originalname || 'upload',
    mimeType: item?.mimetype || '',
  }));
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
