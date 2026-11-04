import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqliteService } from '../../core/database/sqlite.service';
import { RequestIdentityScope } from '../../core/database/history.repository';
import { AuthService } from '../auth/auth.service';
import { requireAuthenticatedUser } from '../auth/auth.request';

export interface VocabularyItem {
  id: string;
  lessonId?: string | null;
  videoId?: string;
  lessonTitle?: string;
  term: string;
  ipa: string;
  partOfSpeech: string;
  definition: string;
  translation: string;
  contextSentence: string;
  timestampSec: number;
  masteryLevel: number;
  nextReviewAt: string;
  createdAt: string;
}

export interface CreateVocabularyDto {
  term: string;
  ipa?: string;
  partOfSpeech?: string;
  definition: string;
  translation?: string;
  contextSentence?: string;
  lessonId?: string;
  videoId?: string;
  lessonTitle?: string;
  timestampSec?: number;
}

@Injectable()
export class VocabularyService {
  constructor(private readonly sqlite: SqliteService) {}

  private scopeWhere(scope?: RequestIdentityScope): { sql: string; params: any[] } {
    if (scope?.userId) {
      return { sql: 'user_id = ?', params: [scope.userId] };
    }
    return { sql: '1 = 0', params: [] };
  }

  private rowToVocab(row: Record<string, any>): VocabularyItem {
    return {
      id: String(row.id),
      lessonId: row.lesson_id ? String(row.lesson_id) : null,
      videoId: String(row.video_id || ''),
      lessonTitle: String(row.lesson_title || ''),
      term: String(row.term),
      ipa: String(row.ipa || ''),
      partOfSpeech: String(row.part_of_speech || ''),
      definition: String(row.definition),
      translation: String(row.translation || ''),
      contextSentence: String(row.context_sentence || ''),
      timestampSec: Number(row.timestamp_sec) || 0,
      masteryLevel: Number(row.mastery_level) || 0,
      nextReviewAt: String(row.next_review_at),
      createdAt: String(row.created_at),
    };
  }

  list(
    scope?: RequestIdentityScope,
    filter?: string,
    query?: string,
  ): VocabularyItem[] {
    const where = this.scopeWhere(scope);
    const params: any[] = [...where.params];
    let sql = `SELECT * FROM vocabulary_items WHERE ${where.sql}`;

    if (filter === 'due') {
      sql += ' AND next_review_at <= ?';
      params.push(new Date().toISOString());
    } else if (filter === 'mastered') {
      sql += ' AND mastery_level >= 3';
    }

    if (query && query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(term) LIKE ? OR LOWER(definition) LIKE ? OR LOWER(context_sentence) LIKE ?)';
      params.push(q, q, q);
    }

    sql += ' ORDER BY created_at DESC';
    return this.sqlite.db.prepare(sql).all(...params).map((r) => this.rowToVocab(r));
  }

  save(dto: CreateVocabularyDto, scope?: RequestIdentityScope): VocabularyItem {
    const term = (dto?.term || '').replace(/\s+/g, ' ').trim();
    const definition = (dto?.definition || '').replace(/\s+/g, ' ').trim();
    if (!term) {
      throw new BadRequestException('A word or expression is required.');
    }
    if (!definition) {
      throw new BadRequestException('A definition is required.');
    }

    const where = this.scopeWhere(scope);
    const existing = this.sqlite.db
      .prepare(`SELECT * FROM vocabulary_items WHERE ${where.sql} AND LOWER(term) = ? LIMIT 1`)
      .get(...where.params, term.toLowerCase());

    const now = new Date().toISOString();

    if (existing) {
      this.sqlite.db
        .prepare(`
          UPDATE vocabulary_items
          SET ipa = COALESCE(NULLIF(?, ''), ipa),
              part_of_speech = COALESCE(NULLIF(?, ''), part_of_speech),
              definition = ?,
              translation = COALESCE(NULLIF(?, ''), translation),
              context_sentence = COALESCE(NULLIF(?, ''), context_sentence),
              lesson_id = COALESCE(?, lesson_id),
              video_id = COALESCE(NULLIF(?, ''), video_id),
              lesson_title = COALESCE(NULLIF(?, ''), lesson_title),
              timestamp_sec = CASE WHEN ? > 0 THEN ? ELSE timestamp_sec END
          WHERE id = ?
        `)
        .run(
          (dto.ipa || '').trim(),
          (dto.partOfSpeech || '').trim(),
          definition,
          (dto.translation || '').trim(),
          (dto.contextSentence || '').trim(),
          dto.lessonId || null,
          (dto.videoId || '').trim(),
          (dto.lessonTitle || '').trim(),
          Number(dto.timestampSec) || 0,
          Number(dto.timestampSec) || 0,
          String(existing.id),
        );

      const updated = this.sqlite.db
        .prepare('SELECT * FROM vocabulary_items WHERE id = ?')
        .get(String(existing.id));
      return this.rowToVocab(updated!);
    }

    const id = uuidv4();
    const userId = scope?.userId || null;
    const guestToken = userId ? null : (scope?.guestToken || null);

    this.sqlite.db
      .prepare(`
        INSERT INTO vocabulary_items (
          id, user_id, guest_token, lesson_id, video_id, lesson_title,
          term, ipa, part_of_speech, definition, translation,
          context_sentence, timestamp_sec, mastery_level, next_review_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `)
      .run(
        id,
        userId,
        guestToken,
        dto.lessonId || null,
        (dto.videoId || '').trim(),
        (dto.lessonTitle || '').trim(),
        term,
        (dto.ipa || '').trim(),
        (dto.partOfSpeech || '').trim(),
        definition,
        (dto.translation || '').trim(),
        (dto.contextSentence || '').trim(),
        Number(dto.timestampSec) || 0,
        now,
        now,
      );

    const created = this.sqlite.db.prepare('SELECT * FROM vocabulary_items WHERE id = ?').get(id);
    return this.rowToVocab(created!);
  }

  review(
    id: string,
    rating: 'again' | 'good' | 'easy',
    scope?: RequestIdentityScope,
  ): VocabularyItem {
    const where = this.scopeWhere(scope);
    const existing = this.sqlite.db
      .prepare(`SELECT * FROM vocabulary_items WHERE id = ? AND ${where.sql}`)
      .get(id, ...where.params);

    if (!existing) {
      throw new NotFoundException('Vocabulary item not found.');
    }

    const currentLevel = Number(existing.mastery_level) || 0;
    let nextLevel = currentLevel;
    let intervalMs = 10 * 60 * 1000; // 10 min default for 'again'

    if (rating === 'again') {
      nextLevel = Math.max(0, currentLevel - 1);
      intervalMs = 10 * 60 * 1000;
    } else if (rating === 'good') {
      nextLevel = Math.min(4, currentLevel + 1);
      const daysByLevel = [0.5, 1, 3, 7, 21];
      intervalMs = daysByLevel[nextLevel] * 24 * 60 * 60 * 1000;
    } else {
      nextLevel = Math.min(4, currentLevel + 2);
      const daysByLevel = [1, 2, 5, 14, 30];
      intervalMs = daysByLevel[nextLevel] * 24 * 60 * 60 * 1000;
    }

    const nextReviewAt = new Date(Date.now() + intervalMs).toISOString();
    this.sqlite.db
      .prepare('UPDATE vocabulary_items SET mastery_level = ?, next_review_at = ? WHERE id = ?')
      .run(nextLevel, nextReviewAt, id);

    const updated = this.sqlite.db.prepare('SELECT * FROM vocabulary_items WHERE id = ?').get(id);
    return this.rowToVocab(updated!);
  }

  delete(id: string, scope?: RequestIdentityScope): boolean {
    const where = this.scopeWhere(scope);
    const res = this.sqlite.db
      .prepare(`DELETE FROM vocabulary_items WHERE id = ? AND ${where.sql}`)
      .run(id, ...where.params);
    return Number(res.changes) > 0;
  }

  clearAll(scope?: RequestIdentityScope): number {
    const where = this.scopeWhere(scope);
    const res = this.sqlite.db
      .prepare(`DELETE FROM vocabulary_items WHERE ${where.sql}`)
      .run(...where.params);
    return Number(res.changes) || 0;
  }
}

@Controller('api/vocabulary')
export class VocabularyController {
  constructor(
    private readonly vocabularyService: VocabularyService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  list(
    @Req() req: Request,
    @Query('filter') filter?: string,
    @Query('q') q?: string,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.vocabularyService.list(identity, filter, q);
  }

  @Post()
  save(@Body() body: CreateVocabularyDto, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return this.vocabularyService.save(body, identity);
  }

  @Post('clear')
  clearAll(@Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const removed = this.vocabularyService.clearAll(identity);
    return { success: true, removedCount: removed };
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() body: { rating?: 'again' | 'good' | 'easy' },
    @Req() req: Request,
  ) {
    const identity = requireAuthenticatedUser(req, this.authService);
    const rating = body?.rating && ['again', 'good', 'easy'].includes(body.rating)
      ? body.rating
      : 'good';
    return this.vocabularyService.review(id, rating, identity);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const identity = requireAuthenticatedUser(req, this.authService);
    return { success: this.vocabularyService.delete(id, identity) };
  }
}
