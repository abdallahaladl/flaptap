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
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { AiChatService, StreamHooks } from './ai-chat.service';
import {
  AiChatContextInput,
  AiChatLanguageMode,
  AiChatPersonaId,
  AiChatResponseStyle,
  EditAiChatMessageDto,
  RegenerateAiChatDto,
  SendAiChatMessageDto,
} from './ai-chat.types';

@Controller('api/ai-chat')
export class AiChatController {
  constructor(
    private readonly aiChat: AiChatService,
    private readonly authService: AuthService,
  ) {}

  /** Public catalog of personas, response styles, and language modes for visitors before sign-in. */
  @Get('config')
  getConfig() {
    return {
      success: true,
      ...this.aiChat.getPublicConfig(),
    };
  }

  @Get('preferences')
  getPreferences(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      preferences: this.aiChat.getPreferences(identity.userId!),
    };
  }

  @Patch('preferences')
  updatePreferences(
    @Body()
    body: Partial<{
      defaultPersona: AiChatPersonaId;
      responseStyle: AiChatResponseStyle;
      responseLanguage: AiChatLanguageMode;
      temperature: number;
      customInstructions: string;
      usePageContext: boolean;
    }>,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      preferences: this.aiChat.updatePreferences(identity.userId!, body || {}),
    };
  }

  @Get('threads')
  listThreads(
    @Query('q') q: string | undefined,
    @Query('contextType') contextType: string | undefined,
    @Query('contextId') contextId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const threads = this.aiChat.listThreads(identity.userId!, {
      q,
      contextType,
      contextId,
      limit: limit ? Number(limit) : undefined,
    });
    return { success: true, threads };
  }

  @Get('threads/by-context')
  getByContext(
    @Query('contextType') contextType: string,
    @Query('contextId') contextId: string,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const found = this.aiChat.findContextThread(identity.userId!, contextType, contextId);
    return { success: true, ...(found || { thread: null, messages: [] }) };
  }

  @Post('threads')
  createThread(
    @Body()
    body: {
      title?: string;
      persona?: AiChatPersonaId;
      context?: AiChatContextInput;
    },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const thread = this.aiChat.createThread(identity.userId!, body);
    return { success: true, thread, messages: [] };
  }

  @Get('threads/:id')
  getThread(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const data = this.aiChat.getThread(identity.userId!, id);
    return { success: true, ...data };
  }

  @Patch('threads/:id')
  updateThread(
    @Param('id') id: string,
    @Body() body: Partial<{ title: string; persona: AiChatPersonaId; isPinned: boolean }>,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const thread = this.aiChat.updateThread(identity.userId!, id, body || {});
    return { success: true, thread };
  }

  @Delete('threads/:id')
  deleteThread(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.aiChat.deleteThread(identity.userId!, id);
  }

  @Delete('threads')
  deleteAllThreads(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.aiChat.deleteAllThreads(identity.userId!);
  }

  @Get('threads/:id/export')
  exportThread(
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const fmt = format === 'json' ? 'json' : 'md';
    const out = this.aiChat.exportThread(identity.userId!, id, fmt);
    res.setHeader('Content-Type', out.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.content);
  }

  @Delete('threads/:id/messages/:msgId')
  deleteMessage(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.aiChat.deleteMessage(identity.userId!, id, msgId);
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async transcribe(
    @UploadedFile() file: { buffer: Buffer; mimetype?: string; originalname?: string } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!file) {
      throw new BadRequestException('No audio recording uploaded.');
    }
    const result = await this.aiChat.transcribeAudio(file, identity.userId);
    return { success: true, ...result };
  }

  private async runSseStream(
    req: Request,
    res: Response,
    fn: (identity: ReturnType<typeof requireAuthenticatedUser>, hooks: StreamHooks) => Promise<any>,
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
      const data = await fn(identity, {
        signal: ac.signal,
        onThread: (thread) => emit('thread', { thread }),
        onUserMessage: (message) => emit('user_message', { message }),
        onDelta: (delta, accumulated) => emit('delta', { delta, accumulated }),
        onReasoningDelta: (delta, accumulated) => emit('reasoning', { delta, accumulated }),
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

  @Post('ask/stream')
  async askStream(@Body() body: SendAiChatMessageDto, @Req() req: Request, @Res() res: Response) {
    await this.runSseStream(req, res, (identity, hooks) =>
      this.aiChat.sendMessageStream(identity.userId!, body, identity.user?.nativeLanguage || 'ar', hooks),
    );
  }

  @Post('threads/:id/messages/stream')
  async sendToThreadStream(
    @Param('id') id: string,
    @Body() body: SendAiChatMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.runSseStream(req, res, (identity, hooks) =>
      this.aiChat.sendMessageStream(
        identity.userId!,
        { ...body, threadId: id },
        identity.user?.nativeLanguage || 'ar',
        hooks,
      ),
    );
  }

  @Post('threads/:id/messages/:msgId/regenerate/stream')
  async regenerateStream(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Body() body: RegenerateAiChatDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.runSseStream(req, res, (identity, hooks) =>
      this.aiChat.regenerateMessageStream(
        identity.userId!,
        id,
        msgId,
        body || {},
        identity.user?.nativeLanguage || 'ar',
        hooks,
      ),
    );
  }

  @Post('threads/:id/messages/:msgId/edit/stream')
  async editAndResendStream(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Body() body: EditAiChatMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.runSseStream(req, res, (identity, hooks) =>
      this.aiChat.editAndResendStream(
        identity.userId!,
        id,
        msgId,
        body,
        identity.user?.nativeLanguage || 'ar',
        hooks,
      ),
    );
  }

  @Post('threads/:id/messages/:msgId/continue/stream')
  async continueStream(
    @Param('id') id: string,
    @Param('msgId') msgId: string,
    @Body() body: RegenerateAiChatDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.runSseStream(req, res, (identity, hooks) =>
      this.aiChat.continueMessageStream(
        identity.userId!,
        id,
        msgId,
        body || {},
        identity.user?.nativeLanguage || 'ar',
        hooks,
      ),
    );
  }
}
