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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuthService } from '../auth/auth.service';
import { LearningLibraryService } from './learning-library.service';
import {
  GenerateLibraryItemsDto,
  ListLibraryItemsQuery,
  UpdateLibraryItemDto,
} from './learning-library.types';

interface DefineLibraryWordDto {
  itemId?: string;
  word: string;
  contextSentence?: string;
  language?: string;
}

@Controller('api/learning-library')
export class LearningLibraryController {
  constructor(
    private readonly learningLibrary: LearningLibraryService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Public catalog of registered Learning Library domains, categories,
   * and UI metadata so visitors can browse capabilities before sign-in.
   */
  @Get('domains')
  listDomains() {
    const { defaultDomainId, domains, aiEngine } = this.learningLibrary.listDomains();
    return {
      success: true,
      defaultDomainId,
      count: domains.length,
      domains,
      aiEngine,
    };
  }

  @Get('items')
  listItems(
    @Req() req: Request,
    @Query('domainId') domainId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('masteryStatus') masteryStatus?: string,
    @Query('favoritesOnly') favoritesOnly?: string,
    @Query('batchId') batchId?: string,
    @Query('register') register?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const query: ListLibraryItemsQuery = {
      domainId,
      categoryId,
      masteryStatus,
      favoritesOnly: favoritesOnly === 'true' || favoritesOnly === '1',
      batchId,
      register,
      q,
      sort:
        sort === 'alphabetical' || sort === 'mastery' || sort === 'most_reviewed'
          ? sort
          : 'newest',
    };

    return {
      success: true,
      ...this.learningLibrary.listLibrary(identity.userId, query),
    };
  }

  @Get('batches')
  listBatches(@Req() req: Request, @Query('domainId') domainId?: string) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const batches = this.learningLibrary.listBatches(identity.userId, domainId);
    return {
      success: true,
      count: batches.length,
      batches,
    };
  }

  @Get('export')
  exportLibrary(@Req() req: Request, @Query('domainId') domainId?: string) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.learningLibrary.exportLibrary(identity.userId, domainId);
  }

  @Post('generate')
  async generateItems(@Body() dto: GenerateLibraryItemsDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    try {
      const result = await this.learningLibrary.generateItems(
        identity.userId,
        dto || {},
        identity.user.nativeLanguage,
      );
      return {
        success: true,
        ...result,
      };
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new HttpException(
        err?.message || 'Failed to generate learning library expressions.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('generate/stream')
  async generateItemsStream(
    @Body() dto: GenerateLibraryItemsDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let identity;
    try {
      identity = requireAuthenticatedUser(req, this.authService);
    } catch (authErr: any) {
      const status = authErr instanceof HttpException ? authErr.getStatus() : HttpStatus.UNAUTHORIZED;
      const body =
        authErr instanceof HttpException
          ? authErr.getResponse()
          : { code: 'auth_required', message: 'Authentication required.' };
      return res.status(status).json(body);
    }

    const ac = new AbortController();
    let sseOpen = false;
    const writeSse = (event: string, data: unknown) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    res.on('close', () => {
      if (!res.writableEnded) {
        ac.abort(new Error('Client closed stream connection.'));
      }
    });

    try {
      const result = await this.learningLibrary.generateItems(
        identity.userId,
        dto || {},
        identity.user.nativeLanguage,
        {
          signal: ac.signal,
          onStarted: (info) => {
            if (!sseOpen && !res.headersSent) {
              res.status(HttpStatus.OK);
              res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache, no-transform');
              res.setHeader('Connection', 'keep-alive');
              res.setHeader('X-Accel-Buffering', 'no');
              res.flushHeaders?.();
              sseOpen = true;
            }
            writeSse('started', info);
          },
          onChunk: (chunkInfo) => {
            writeSse('chunk', chunkInfo);
          },
        },
      );

      writeSse('complete', { success: true, ...result });
      if (!res.writableEnded) {
        res.end();
      }
    } catch (err: any) {
      const status =
        err instanceof HttpException ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const msg = err?.message || 'Failed to generate learning library expressions.';

      if (!sseOpen && !res.headersSent) {
        return res.status(status).json(
          err instanceof HttpException
            ? err.getResponse()
            : { statusCode: status, message: msg },
        );
      }
      writeSse('error', { statusCode: status, message: msg });
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  @Post('define-word')
  async defineWord(@Body() dto: DefineLibraryWordDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    if (!dto?.word || !String(dto.word).trim()) {
      throw new BadRequestException('A valid word is required.');
    }
    return this.learningLibrary.defineWordInContext(identity.userId, {
      itemId: dto.itemId,
      word: dto.word,
      contextSentence: dto.contextSentence,
      language: dto.language || identity.user.nativeLanguage,
    });
  }

  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateLibraryItemDto,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const item = this.learningLibrary.updateItem(identity.userId, id, dto || {});
    return {
      success: true,
      item,
    };
  }

  @Delete('items/:id')
  deleteItem(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const deleted = this.learningLibrary.deleteItem(identity.userId, id);
    return {
      success: deleted,
    };
  }

  @Post('clear')
  clearDomain(@Body() body: { domainId?: string } | undefined, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const removedCount = this.learningLibrary.clearDomain(identity.userId, body?.domainId);
    return {
      success: true,
      removedCount,
    };
  }
}
