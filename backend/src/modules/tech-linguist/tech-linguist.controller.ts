import {
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
} from '@nestjs/common';
import { Request } from 'express';
import { TechLinguistService } from './tech-linguist.service';
import { TechLexiconCompletionSubject } from './tech-linguist.types';

interface ExtractDto {
  url?: string;
  transcriptText?: string;
  mode?: string;
  keyId?: string;
  model?: string;
  variant?: string;
  thinking?: string;
}

interface DefineLexiconWordDto {
  extractionId?: string;
  word: string;
  contextSentence?: string;
  title?: string;
  language?: string;
}

@Controller('api/tech-linguist')
export class TechLinguistController {
  constructor(private readonly techLinguist: TechLinguistService) {}

  /**
   * Lists supported extraction modes and their tab/schema configuration.
   */
  @Get('modes')
  getExtractionModes() {
    const modes = this.techLinguist.getExtractionModes();
    return {
      success: true,
      count: modes.length,
      modes,
    };
  }

  /**
   * Runs the full Tech Lexicon extraction pipeline end-to-end inside Flaptap
   * via the unified multi-provider Direct AI transport (`AiProvidersService`).
   */
  @Post('extract')
  async extractContent(@Body() dto: ExtractDto, @Req() req: Request) {
    if (!dto.url && !dto.transcriptText) {
      throw new HttpException(
        'Either a YouTube / media URL or transcriptText must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userId = (req as any).user?.id || undefined;
    const guestToken = (req as any).guestToken || (req.headers['x-guest-token'] as string) || undefined;

    try {
      const result = await this.techLinguist.processExtraction({
        url: dto.url?.trim(),
        transcriptText: dto.transcriptText?.trim(),
        mode: dto.mode,
        keyId: dto.keyId,
        model: dto.model,
        variant: dto.variant || dto.thinking,
        userId,
        guestToken,
      });

      return {
        success: true,
        data: result,
      };
    } catch (err: any) {
      throw new HttpException(
        err.message || 'Failed to execute technical linguistic extraction.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Shared contextual click-any-word lookup endpoint for Tech Lexicon study outputs.
   */
  @Post('define-word')
  async defineWord(@Body() dto: DefineLexiconWordDto) {
    if (!dto?.word || !String(dto.word).trim()) {
      throw new HttpException('A valid word is required.', HttpStatus.BAD_REQUEST);
    }

    return this.techLinguist.defineWordInContext({
      extractionId: dto.extractionId,
      word: dto.word,
      contextSentence: dto.contextSentence,
      title: dto.title,
      language: dto.language,
    });
  }

  /**
   * Fetches past extractions.
   */
  @Get('history')
  getHistory(@Req() req: Request) {
    const userId = (req as any).user?.id || undefined;
    const guestToken = (req as any).guestToken || (req.headers['x-guest-token'] as string) || undefined;
    const items = this.techLinguist.getHistory(userId, guestToken);
    return {
      success: true,
      items,
    };
  }

  /**
   * Fetches single full extraction.
   */
  @Get('extractions/:id')
  getExtraction(@Param('id') id: string) {
    const item = this.techLinguist.getExtractionById(id);
    if (!item) {
      throw new HttpException('Extraction not found.', HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      data: item,
    };
  }

  /**
   * Extraction completion is strictly derived from studied child items and cannot be toggled manually.
   */
  @Patch('extractions/:id/complete')
  setExtractionCompleted() {
    throw new HttpException(
      'Extraction completion is derived automatically from its studied items and cannot be toggled manually.',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Updates completion state of a single item inside an extraction note subject.
   */
  @Patch('extractions/:id/item-completion')
  setExtractionItemCompletion(
    @Param('id') id: string,
    @Body()
    body: {
      subject?: TechLexiconCompletionSubject;
      index?: number;
      completed?: boolean;
    },
    @Req() req: Request,
  ) {
    const validSubjects: TechLexiconCompletionSubject[] = [
      'vocab',
      'idioms',
      'patterns',
      'transcript',
    ];
    if (!body?.subject || !validSubjects.includes(body.subject)) {
      throw new HttpException('Invalid completion subject.', HttpStatus.BAD_REQUEST);
    }
    const idx = Number(body.index);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new HttpException('Field "index" must be a non-negative integer.', HttpStatus.BAD_REQUEST);
    }
    if (typeof body.completed !== 'boolean') {
      throw new HttpException('Field "completed" must be a boolean.', HttpStatus.BAD_REQUEST);
    }
    const userId = (req as any).user?.id || undefined;
    const guestToken = (req as any).guestToken || (req.headers['x-guest-token'] as string) || undefined;
    const updated = this.techLinguist.setExtractionItemCompletion(
      id,
      body.subject,
      idx,
      body.completed,
      userId,
      guestToken,
    );
    if (!updated) {
      throw new HttpException('Extraction not found.', HttpStatus.NOT_FOUND);
    }
    return {
      success: true,
      ...updated,
    };
  }

  /**
   * Deletes a single extraction.
   */
  @Delete('extractions/:id')
  deleteExtraction(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.id || undefined;
    const guestToken = (req as any).guestToken || (req.headers['x-guest-token'] as string) || undefined;
    this.techLinguist.deleteExtraction(id, userId, guestToken);
    return {
      success: true,
      message: 'Extraction deleted.',
    };
  }
}
