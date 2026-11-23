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
import { TranscriptLabService } from './transcript-lab.service';
import { TranscriptExportFormat, TranscriptViewMode } from './transcript-lab.types';

const MAX_MEDIA_UPLOAD_BYTES = 120 * 1024 * 1024;

interface IngestUrlBody {
  url: string;
  force?: boolean;
}

interface ReviewDocBody {
  keyId?: string;
  model?: string;
  variant?: string;
  force?: boolean;
}

interface LookupWordBody {
  docId?: string;
  word: string;
  contextSentence?: string;
  language?: string;
  lookupScope?: 'word' | 'phrase' | 'sentence';
}

@Controller('api/transcript-lab')
export class TranscriptLabController {
  constructor(
    private readonly service: TranscriptLabService,
    private readonly authService: AuthService,
  ) {}

  @Get('config')
  getConfig() {
    return { success: true, ...this.service.getConfig() };
  }

  @Get('docs')
  listDocs(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const parsedPage = page ? Number(page) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    const data = this.service.listDocs(identity.userId, {
      q,
      platform,
      status: status as any,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
    return { success: true, ...data };
  }

  @Get('docs/:id')
  getDoc(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: true, data: this.service.getDoc(identity.userId, id) };
  }

  @Post('ingest')
  async ingestUrl(@Body() body: IngestUrlBody, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const result = await this.service.ingestUrl(identity.userId, body?.url, {
      force: Boolean(body?.force),
    });
    return { success: true, cached: result.cached, data: result.doc };
  }

  @Post('ingest-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_MEDIA_UPLOAD_BYTES },
    }),
  )
  async ingestUpload(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype?: string } | undefined,
    @Body('force') force: string | boolean | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!file) {
      throw new BadRequestException('Select an audio or video file to upload.');
    }
    const result = await this.service.ingestUpload(
      identity.userId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      { force: force === true || force === 'true' },
    );
    return { success: true, cached: result.cached, data: result.doc };
  }

  @Post('docs/:id/review')
  async reviewDoc(@Param('id') id: string, @Body() body: ReviewDocBody, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const doc = await this.service.reviewTranscript(identity.userId, id, {
      keyId: body?.keyId,
      model: body?.model,
      variant: body?.variant,
      force: Boolean(body?.force),
    });
    return { success: true, data: doc };
  }

  @Post('docs/:id/review/stream')
  async reviewDocStream(
    @Param('id') id: string,
    @Body() body: ReviewDocBody,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const ac = new AbortController();
    let closed = false;
    req.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        ac.abort();
      }
    });

    const emit = (event: string, payload: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const doc = await this.service.reviewTranscript(identity.userId, id, {
        keyId: body?.keyId,
        model: body?.model,
        variant: body?.variant,
        force: Boolean(body?.force),
        signal: ac.signal,
        onProgress: (ev) => emit('progress', ev),
      });
      emit('done', { success: true, data: doc });
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

  @Patch('docs/:id/title')
  renameDoc(
    @Param('id') id: string,
    @Body('title') title: string,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: true, data: this.service.renameDoc(identity.userId, id, title) };
  }

  @Patch('docs/:id/speakers')
  renameSpeakers(
    @Param('id') id: string,
    @Body('speakers') speakers: Record<string, string>,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: true, data: this.service.renameSpeakers(identity.userId, id, speakers || {}) };
  }

  @Patch('docs/:id/completion')
  toggleCompletion(
    @Param('id') id: string,
    @Body() body: { sentenceIndex: number; completed: boolean },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const result = this.service.toggleSentenceCompletion(
      identity.userId,
      id,
      Number(body?.sentenceIndex),
      Boolean(body?.completed),
    );
    return { success: true, ...result };
  }

  @Get('docs/:id/export')
  exportDoc(
    @Param('id') id: string,
    @Query('view') view: TranscriptViewMode = 'sentences',
    @Query('format') format: TranscriptExportFormat = 'txt',
    @Query('timestamps') timestamps?: string,
    @Query('speakers') speakers?: string,
    @Req() req?: Request,
    @Res() res?: Response,
  ) {
    const identity = requireAuthenticatedUser(req!, this.authService);
    const result = this.service.exportDoc(identity.userId, id, {
      view,
      format,
      includeTimestamps: timestamps !== '0' && timestamps !== 'false',
      includeSpeakers: speakers !== '0' && speakers !== 'false',
    });

    res!.setHeader('Content-Type', result.mimeType);
    res!.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename.replace(/"/g, '')}"`,
    );
    res!.status(HttpStatus.OK).send(result.content);
  }

  @Post('lookup-word')
  async lookupWord(@Body() body: LookupWordBody, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const result = await this.service.lookupWord({
      userId: identity.userId,
      docId: body?.docId,
      word: body?.word,
      contextSentence: body?.contextSentence,
      language: body?.language,
      lookupScope: body?.lookupScope,
    });
    return { success: true, ...result };
  }

  @Delete('docs/:id')
  deleteDoc(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const deleted = this.service.deleteDoc(identity.userId, id);
    return { success: true, deleted };
  }
}
