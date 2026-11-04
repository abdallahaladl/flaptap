import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CacheClearScope, HistoryRepository } from '../../core/database/history.repository';
import { AuthService } from '../auth/auth.service';
import { requireAuthenticatedUser } from '../auth/auth.request';

@Controller('api/history')
export class HistoryController {
  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly authService: AuthService,
  ) {}

  @Get()
  getAll(@Query('track') track: string | undefined, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.historyRepo.findSummaries(track, identity);
  }

  @Get('stats')
  getStats(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.historyRepo.getStats(identity);
  }

  @Get('usage')
  getUsageOverview(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.historyRepo.getUsageOverview(identity);
  }

  @Get('export')
  exportAccountData(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.historyRepo.exportAccountData(identity.user, identity);
  }

  @Post('clear')
  clearHistory(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const removedCount = this.historyRepo.clearAll(identity);
    return { success: true, removedCount, message: 'Lesson library cleared.' };
  }

  @Post('reset')
  resetWebsite(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.historyRepo.resetToDefaultShowcase(identity);
  }

  @Post('cache/clear')
  clearAllCaches(
    @Body() body: { scope?: 'all' | 'coach' | 'translations' | 'transcripts' } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const scope = body?.scope || 'all';
    if (!['all', 'coach', 'translations', 'transcripts'].includes(scope)) {
      throw new BadRequestException('Invalid cache scope.');
    }
    return {
      success: true,
      scope,
      ...this.historyRepo.clearAllCaches(scope, identity),
    };
  }

  @Post('bulk')
  bulkManage(
    @Body()
    body: {
      ids?: string[];
      action?: 'delete' | 'clear_cache' | 'reset_progress';
    },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const action = body?.action;
    if (!action || !['delete', 'clear_cache', 'reset_progress'].includes(action)) {
      throw new BadRequestException('Invalid bulk action.');
    }
    return {
      success: true,
      action,
      ...this.historyRepo.bulkManage(body?.ids || [], action, identity),
    };
  }

  @Post('activity/clear')
  clearActivityLogs(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const removedCount = this.historyRepo.clearActivityLogs(identity);
    return { success: true, removedCount };
  }

  @Delete('activity/:logId')
  deleteActivityLog(@Param('logId') logId: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: this.historyRepo.deleteActivityLog(logId, identity) };
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const item = this.historyRepo.findById(id, identity);
    if (!item) throw new NotFoundException(`Lesson "${id}" not found`);
    return item;
  }

  @Put(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @Body() body: { studyNotes?: string },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const updated = this.historyRepo.updateNotes(id, body?.studyNotes ?? '', identity);
    if (!updated) throw new NotFoundException(`Lesson "${id}" not found`);
    return {
      success: true,
      id: updated.id,
      studyNotes: updated.studyNotes,
      noteMarkdown: updated.noteMarkdown,
    };
  }

  @Post(':id/cache/clear')
  clearLessonCache(
    @Param('id') id: string,
    @Body() body: { scope?: CacheClearScope } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const scope: CacheClearScope = body?.scope || 'all';
    if (!['all', 'coach', 'translations', 'transcript'].includes(scope)) {
      throw new BadRequestException('Invalid lesson cache scope.');
    }
    const summary = this.historyRepo.clearLessonCache(id, scope, identity);
    if (!summary) throw new NotFoundException(`Lesson "${id}" not found`);
    return { success: true, scope, item: summary };
  }

  @Post(':id/reset-progress')
  resetLessonProgress(
    @Param('id') id: string,
    @Body() body: { clearNotes?: boolean } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const summary = this.historyRepo.resetLessonProgress(
      id,
      { clearNotes: Boolean(body?.clearNotes) },
      identity,
    );
    if (!summary) throw new NotFoundException(`Lesson "${id}" not found`);
    return { success: true, item: summary };
  }

  @Delete(':id')
  deleteItem(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: this.historyRepo.delete(id, identity) };
  }

  @Post(':id/drill')
  incrementDrill(
    @Param('id') id: string,
    @Body() body: { mode?: string } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const updated = this.historyRepo.incrementDrill(id, identity, body?.mode || 'shadow');
    if (!updated) throw new NotFoundException(`Lesson "${id}" not found`);
    return updated;
  }
}
