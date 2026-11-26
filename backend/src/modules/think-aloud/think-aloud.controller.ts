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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { requireAuthenticatedUser, resolveRequestIdentity } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { DataLifecycleService } from '../data-lifecycle/data-lifecycle.service';
import { ThinkAloudService } from './think-aloud.service';
import {
  EvaluateSessionDto,
  GeneratePromptDto,
  GenerateSpinePackDto,
} from './think-aloud.types';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

@Controller('api/think-aloud')
export class ThinkAloudController {
  constructor(
    private readonly thinkAloud: ThinkAloudService,
    private readonly authService: AuthService,
    private readonly dataLifecycle: DataLifecycleService,
  ) {}

  /** Public capabilities & built-in catalog metadata for visitors before sign-in. */
  @Get('config')
  getConfig() {
    return {
      success: true,
      ...this.thinkAloud.getConfig(),
    };
  }

  @Get('overview')
  getOverview(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      overview: this.thinkAloud.getOverview(identity.userId),
    };
  }

  @Post('prompt')
  async generatePrompt(@Body() body: GeneratePromptDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    try {
      const prompt = await this.thinkAloud.generatePrompt(identity.userId, body || {});
      return { success: true, prompt };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message || 'Failed to generate Think Aloud prompt.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES },
    }),
  )
  async transcribeAudio(@UploadedFile() file: any, @Req() req: Request) {
    requireAuthenticatedUser(req, this.authService);
    if (!file) {
      throw new BadRequestException('No audio file uploaded.');
    }
    try {
      const result = await this.thinkAloud.transcribeRecording(file);
      return { success: true, ...result };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message || 'Audio transcription failed.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('sessions/evaluate')
  async evaluateSession(@Body() body: EvaluateSessionDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    try {
      const session = await this.thinkAloud.evaluateAndSaveSession(
        identity.userId,
        body,
        identity.user.nativeLanguage,
      );
      return { success: true, session };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message || 'Failed to evaluate Think Aloud session.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('sessions')
  listSessions(
    @Req() req: Request,
    @Query('mode') mode?: string,
    @Query('domain') domain?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const parsedPage = page ? Number(page) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return {
      success: true,
      ...this.thinkAloud.listSessions(identity.userId, {
        mode,
        domain,
        q,
        page: Number.isFinite(parsedPage) ? parsedPage : undefined,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      }),
    };
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      session: this.thinkAloud.getSession(identity.userId, id),
    };
  }

  @Post('sessions/bulk-delete')
  bulkDeleteSessions(@Body() body: { ids?: string[] } | undefined, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.dataLifecycle.purgeThinkAloudSessionsBulk(identity.userId, body?.ids || []),
    };
  }

  @Post('sessions/clear')
  clearSessions(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.dataLifecycle.purgeAllThinkAloudSessions(identity.userId),
    };
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const res = this.dataLifecycle.purgeThinkAloudSession(identity.userId, id);
    if (!res.deleted) {
      throw new HttpException('Think Aloud session not found.', HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      purged: res.purged,
    };
  }

  /**
   * Spines list: public built-in research packs for guests, plus user's custom
   * AI packs & practice state when authenticated.
   */
  @Get('spines')
  listSpines(@Req() req: Request) {
    const identity = resolveRequestIdentity(req, this.authService);
    return {
      success: true,
      packs: this.thinkAloud.listSpines(identity.userId),
    };
  }

  @Post('spines/generate')
  async generateSpinePack(@Body() body: GenerateSpinePackDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    try {
      const pack = await this.thinkAloud.generateSpinePack(identity.userId, body);
      return { success: true, pack };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message || 'Failed to generate Spine Pack.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Patch('spines/:id/toggle')
  toggleSpineItem(
    @Param('id') packId: string,
    @Body() body: { itemId?: string },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const itemId = String(body?.itemId || '').trim();
    if (!itemId) {
      throw new BadRequestException('itemId is required.');
    }
    return {
      success: true,
      pack: this.thinkAloud.toggleSpinePracticed(identity.userId, packId, itemId),
    };
  }

  @Post('spines/clear')
  clearSpines(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.dataLifecycle.purgeAllThinkAloudSpines(identity.userId),
    };
  }

  @Post('spines/:id/reset-progress')
  resetSpineProgress(@Param('id') packId: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return {
      success: true,
      ...this.dataLifecycle.resetThinkAloudSpineProgress(identity.userId, packId),
    };
  }

  @Delete('spines/:id')
  deleteSpinePack(@Param('id') packId: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const res = this.dataLifecycle.purgeThinkAloudSpinePack(identity.userId, packId);
    return {
      success: res.deleted,
      purged: res.purged,
    };
  }
}
