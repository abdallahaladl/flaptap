import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import {
  CacheClearScope,
  HistoryRepository,
  LessonCompletionSubject,
} from '../../core/database/history.repository';
import { AuthService } from '../auth/auth.service';
import { requireAuthenticatedUser } from '../auth/auth.request';
import { AuditLogRepository } from '../data-lifecycle/audit-log.repository';
import { DataLifecycleService } from '../data-lifecycle/data-lifecycle.service';

@Controller('api/history')
export class HistoryController {
  constructor(
    private readonly historyRepo: HistoryRepository,
    private readonly authService: AuthService,
    private readonly dataLifecycle: DataLifecycleService,
    private readonly auditLog: AuditLogRepository,
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
  clearHistory(
    @Body() body: { track?: 'media_hub' | 'shadowing' | 'street_talk' | 'phonetics' | 'all' } | undefined,
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const rawTrack = body?.track || 'all';
    const track = rawTrack === 'shadowing' ? 'media_hub' : rawTrack;
    const res = this.dataLifecycle.purgeLessonsByTrack(identity.userId, track);
    return {
      success: true,
      removedCount: res.removedCount,
      purged: res.purged,
      message: 'Lesson library cleared.',
    };
  }

  @Post('reset')
  resetWebsite(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    this.dataLifecycle.purgeLessonsByTrack(identity.userId, 'all');
    return [];
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
      ...this.dataLifecycle.clearLessonCaches(identity.userId, 'all', scope),
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
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (action === 'delete') {
      return {
        success: true,
        action,
        ...this.dataLifecycle.purgeLessonsBulk(identity.userId, ids),
      };
    }
    if (action === 'clear_cache') {
      const res = this.dataLifecycle.clearLessonCaches(identity.userId, ids, 'all');
      return {
        success: true,
        action,
        affectedCount: res.clearedLessonsCount,
        purged: res.purged,
      };
    }
    const result = this.historyRepo.bulkManage(ids, action, identity);
    if (result.affectedCount > 0) {
      this.auditLog.record(identity.userId, {
        action: 'bulk_reset_lesson_progress',
        feature: 'media_hub',
        scope: 'bulk',
        targetLabel: `${result.affectedCount} lesson(s)`,
        summary: `Reset study progress for ${result.affectedCount} lesson(s)`,
        purged: { lessons: result.affectedCount },
      });
    }
    return {
      success: true,
      action,
      ...result,
    };
  }

  @Post('activity/clear')
  clearActivityLogs(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const removedCount = this.historyRepo.clearActivityLogs(identity);
    if (removedCount > 0) {
      this.auditLog.record(identity.userId, {
        action: 'clear_activity_logs',
        feature: 'activity',
        scope: 'feature',
        targetLabel: 'Practice Timeline & Streak',
        summary: `Cleared ${removedCount} practice logs and reset streak`,
        purged: { practiceLogs: removedCount },
      });
    }
    return { success: true, removedCount };
  }

  @Delete('activity/:logId')
  deleteActivityLog(@Param('logId') logId: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const deleted = this.historyRepo.deleteActivityLog(logId, identity);
    if (deleted) {
      this.auditLog.record(identity.userId, {
        action: 'delete_activity_log',
        feature: 'activity',
        scope: 'item',
        targetId: logId,
        targetLabel: 'Practice Log',
        summary: 'Removed practice session log entry',
        purged: { practiceLogs: 1 },
      });
    }
    return { success: deleted };
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

  @Patch(':id/complete')
  setLessonCompleted() {
    throw new BadRequestException(
      'Lesson completion is derived automatically from its studied items and cannot be toggled manually.',
    );
  }

  @Patch(':id/item-completion')
  setLessonItemCompletion(
    @Param('id') id: string,
    @Body()
    body: {
      subject?: LessonCompletionSubject;
      index?: number;
      completed?: boolean;
    },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const validSubjects: LessonCompletionSubject[] = [
      'sentences',
      'paragraphs',
      'listen',
      'coachConnected',
      'coachExpressions',
      'coachVocabulary',
    ];
    if (!body?.subject || !validSubjects.includes(body.subject)) {
      throw new BadRequestException('Invalid completion subject.');
    }
    const idx = Number(body.index);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new BadRequestException('Field "index" must be a non-negative integer.');
    }
    if (typeof body.completed !== 'boolean') {
      throw new BadRequestException('Field "completed" must be a boolean.');
    }
    const updated = this.historyRepo.setLessonItemCompletion(
      id,
      body.subject,
      idx,
      body.completed,
      identity,
    );
    if (!updated) throw new NotFoundException(`Lesson "${id}" not found`);
    return {
      success: true,
      ...updated,
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
    const existing = this.historyRepo.findById(id, identity);
    if (!existing) throw new NotFoundException(`Lesson "${id}" not found`);
    this.dataLifecycle.clearLessonCaches(identity.userId, [id], scope);
    const summary = this.historyRepo.findSummaries(undefined, identity).find((s) => s.id === id);
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
    this.auditLog.record(identity.userId, {
      action: 'reset_lesson_progress',
      feature: summary.track === 'street_talk' ? 'street_talk' : summary.track === 'phonetics' ? 'phonetics' : 'media_hub',
      scope: 'progress',
      targetId: id,
      targetLabel: summary.title,
      summary: `Reset study progress${body?.clearNotes ? ' and notes' : ''} for "${summary.title}"`,
      purged: { lessons: 1 },
    });
    return { success: true, item: summary };
  }

  @Delete(':id')
  deleteItem(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const res = this.dataLifecycle.purgeLesson(identity.userId, id);
    return { success: res.deleted, purged: res.purged };
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
