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
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { AmericanExtractorService } from './american-extractor.service';
import { ExtractorInputKind } from './american-extractor.types';

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
}

interface DefineWordBody {
  noteId?: string;
  word: string;
  contextSentence?: string;
  title?: string;
  language?: string;
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
  getHistory(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const history = this.extractor.listHistory(identity.userId);
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

    if (inputKind === 'url' && !String(body?.url || '').trim()) {
      throw new BadRequestException('Paste a video, social, audio, or article URL.');
    }
    if (inputKind === 'text' && !String(body?.text || '').trim()) {
      throw new BadRequestException('Paste text or Markdown to extract from.');
    }
    if (inputKind === 'lesson' && !String(body?.lessonId || '').trim()) {
      throw new BadRequestException('Choose a saved lesson transcript.');
    }

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
      });
      return { success: true, data };
    } catch (error: any) {
      throw toHttpException(error, 'Failed to extract American English study items.');
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
      });
      return { success: true, data };
    } catch (error: any) {
      throw toHttpException(error, 'Failed to extract text from that file.');
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
  setCompleted(
    @Param('id') id: string,
    @Body() body: { completed?: boolean },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (typeof body?.completed !== 'boolean') {
      throw new BadRequestException('Field "completed" must be a boolean.');
    }
    return {
      success: true,
      ...this.extractor.setCompleted(identity.userId, id, body.completed),
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
