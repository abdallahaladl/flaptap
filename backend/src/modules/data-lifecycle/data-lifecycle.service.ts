import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { clearWordLookupCache } from '../../core/ai/word-lookup.service';
import { CacheClearScope, HistoryRepository } from '../../core/database/history.repository';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersService, clearModelsCacheForFingerprints } from '../ai-providers/ai-providers.service';
import { MediaTranscriptionService } from '../american-extractor/sources/media-transcription.service';
import { clearVisionOcrCache } from '../american-extractor/sources/vision-ocr.service';
import { SharedSourcesRepository } from '../shared-sources/shared-sources.repository';
import {
  extractYouTubeVideoId,
  SharedSourcesService,
} from '../shared-sources/shared-sources.service';
import { markMediaHubTargetDeleted } from '../tracks/media-hub/media-hub.service';
import { TranscriptService } from '../tracks/media-hub/transcript.service';
import { AuditLogRepository } from './audit-log.repository';
import {
  AuditEventRecord,
  AuditFeature,
  LifecycleSummary,
  PurgeCounts,
  WorkspaceResetOptions,
} from './data-lifecycle.types';

function mergeCounts(target: PurgeCounts, delta: PurgeCounts): PurgeCounts {
  for (const [key, value] of Object.entries(delta || {})) {
    const n = Number(value) || 0;
    if (n <= 0) continue;
    (target as Record<string, number>)[key] =
      (Number((target as Record<string, number>)[key]) || 0) + n;
  }
  return target;
}

function trackToFeature(track: string): AuditFeature {
  if (track === 'street_talk') return 'street_talk';
  if (track === 'phonetics') return 'phonetics';
  return 'media_hub';
}

function extractFileDigestFromSourceKey(sourceKey?: string): string {
  const clean = String(sourceKey || '').trim();
  if (!clean.startsWith('file:')) return '';
  return clean.slice('file:'.length);
}

@Injectable()
export class DataLifecycleService {
  private readonly logger = new Logger(DataLifecycleService.name);

  constructor(
    private readonly sqlite: SqliteService,
    private readonly historyRepo: HistoryRepository,
    private readonly sharedSources: SharedSourcesService,
    private readonly sharedSourcesRepo: SharedSourcesRepository,
    private readonly transcriptService: TranscriptService,
    private readonly mediaTranscription: MediaTranscriptionService,
    private readonly aiProviders: AiProvidersService,
    private readonly auditLog: AuditLogRepository,
  ) {}

  getLifecycleSummary(userId: string): LifecycleSummary {
    const countQuery = (sql: string, ...params: any[]): number => {
      const row = this.sqlite.db.prepare(sql).get(...params) as { cnt?: number } | undefined;
      return Number(row?.cnt) || 0;
    };

    const mediaHub = countQuery(
      `SELECT COUNT(*) AS cnt FROM lessons WHERE user_id = ? AND track IN ('media_hub', 'shadowing')`,
      userId,
    );
    const street_talk = countQuery(
      `SELECT COUNT(*) AS cnt FROM lessons WHERE user_id = ? AND track = 'street_talk'`,
      userId,
    );
    const phonetics = countQuery(
      `SELECT COUNT(*) AS cnt FROM lessons WHERE user_id = ? AND track = 'phonetics'`,
      userId,
    );
    const thinkAloudSessions = countQuery(
      `SELECT COUNT(*) AS cnt FROM think_aloud_sessions WHERE user_id = ?`,
      userId,
    );
    const thinkAloudCustomSpines = countQuery(
      `SELECT COUNT(*) AS cnt FROM think_aloud_spine_packs WHERE user_id = ? AND id NOT LIKE 'state_%'`,
      userId,
    );
    const americanExtractorNotes = countQuery(
      `SELECT COUNT(*) AS cnt FROM american_extractor_notes WHERE user_id = ?`,
      userId,
    );
    const learningLibraryItems = countQuery(
      `SELECT COUNT(*) AS cnt FROM learning_library_items WHERE user_id = ?`,
      userId,
    );
    const learningLibraryBatches = countQuery(
      `SELECT COUNT(*) AS cnt FROM learning_library_batches WHERE user_id = ?`,
      userId,
    );
    const vocabulary = countQuery(
      `SELECT COUNT(*) AS cnt FROM vocabulary_items WHERE user_id = ?`,
      userId,
    );
    const sharedSources = countQuery(
      `SELECT COUNT(*) AS cnt FROM shared_sources WHERE user_id = ?`,
      userId,
    );
    const practiceLogs = countQuery(
      `SELECT COUNT(*) AS cnt FROM practice_logs WHERE user_id = ?`,
      userId,
    );
    const auditEvents = this.auditLog.count(userId);
    const aiKeys = countQuery(
      `SELECT COUNT(*) AS cnt FROM user_ai_keys WHERE user_id = ?`,
      userId,
    );

    const usage = this.historyRepo.getUsageOverview({ userId });
    const lessonsBytes = Number(usage?.cacheOverview?.totalLessonsBytes) || 0;
    const transcriptCacheBytes = Number(usage?.cacheOverview?.transcriptCacheBytes) || 0;
    const mediaStats = this.sharedSources.getStorageStatsForUser(userId);

    return {
      counts: {
        mediaHub,
        street_talk,
        phonetics,
        lessonsTotal: mediaHub + street_talk + phonetics,
        thinkAloudSessions,
        thinkAloudCustomSpines,
        americanExtractorNotes,
        learningLibraryItems,
        learningLibraryBatches,
        vocabulary,
        sharedSources,
        practiceLogs,
        auditEvents,
        aiKeys,
      },
      storage: {
        lessonsBytes,
        transcriptCacheBytes,
        mediaFilesCount: mediaStats.mediaFilesCount,
        mediaBytes: mediaStats.mediaBytes,
        totalBytes: lessonsBytes + transcriptCacheBytes + mediaStats.mediaBytes,
      },
    };
  }

  private hasOtherLessonOrSourceForKey(sourceKey?: string, videoId?: string): boolean {
    if (videoId) {
      const l = this.sqlite.db
        .prepare('SELECT COUNT(*) AS cnt FROM lessons WHERE video_id = ?')
        .get(videoId) as { cnt?: number } | undefined;
      if ((Number(l?.cnt) || 0) > 0) return true;
    }
    if (sourceKey) {
      const s = this.sqlite.db
        .prepare('SELECT COUNT(*) AS cnt FROM shared_sources WHERE source_key = ?')
        .get(sourceKey) as { cnt?: number } | undefined;
      if ((Number(s?.cnt) || 0) > 0) return true;
    }
    return false;
  }

  purgeLesson(
    userId: string,
    lessonId: string,
    opts: {
      removeLinkedVocab?: boolean;
      cascadeLinkedNotes?: boolean;
      skipAudit?: boolean;
    } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    if (!lessonId) return { deleted: false, purged: {} };

    const row = this.sqlite.db
      .prepare(
        `SELECT id, track, title, video_id, source_url, source_id, source_key, payload_json
         FROM lessons WHERE id = ? AND user_id = ?`,
      )
      .get(lessonId, userId) as Record<string, any> | undefined;

    if (!row) {
      return { deleted: false, purged: {} };
    }

    const track = String(row.track || 'media_hub');
    const title = String(row.title || 'Lesson');
    const videoId = String(row.video_id || '').trim();
    const sourceUrl = String(row.source_url || '').trim();
    const sourceId = String(row.source_id || '').trim();
    let sourceKey = String(row.source_key || '').trim();
    let mediaId = videoId;
    const ytId = extractYouTubeVideoId(sourceUrl) || (/^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : '');

    try {
      const payload = JSON.parse(String(row.payload_json || '{}'));
      if (!mediaId && payload?.media?.mediaId) mediaId = String(payload.media.mediaId);
      if (!sourceKey && payload?.sourceKey) sourceKey = String(payload.sourceKey);
    } catch {
      // Ignore malformed payload_json
    }

    markMediaHubTargetDeleted(userId, [lessonId, sourceKey, videoId, ytId, mediaId]);

    const purged: PurgeCounts = {};

    const delLesson = this.sqlite.db
      .prepare('DELETE FROM lessons WHERE id = ? AND user_id = ?')
      .run(lessonId, userId);
    purged.lessons = Number(delLesson.changes) || 0;

    const delLogs = this.sqlite.db
      .prepare('DELETE FROM practice_logs WHERE lesson_id = ? AND user_id = ?')
      .run(lessonId, userId);
    purged.practiceLogs = Number(delLogs.changes) || 0;

    if (opts.removeLinkedVocab) {
      const delVocab = this.sqlite.db
        .prepare('DELETE FROM vocabulary_items WHERE lesson_id = ? AND user_id = ?')
        .run(lessonId, userId);
      purged.vocabulary = Number(delVocab.changes) || 0;
    } else {
      this.sqlite.db
        .prepare('UPDATE vocabulary_items SET lesson_id = NULL WHERE lesson_id = ? AND user_id = ?')
        .run(lessonId, userId);
    }

    if (opts.cascadeLinkedNotes) {
      const linkedNotes = this.sharedSourcesRepo.findLinkedExtractorNotes(userId, {
        sourceId,
        videoId: ytId || videoId,
        sourceUrl,
        lessonId,
      });
      for (const note of linkedNotes) {
        const noteRes = this.purgeExtractorNote(userId, note.id, { skipAudit: true });
        mergeCounts(purged, noteRes.purged);
      }
    }

    const srcCleanup = this.sharedSources.cleanupOrphanedSource(userId, {
      sourceId,
      sourceKey,
      sourceUrl,
      mediaId,
      lessonId,
    });
    purged.sharedSources = (purged.sharedSources || 0) + srcCleanup.sourcesDeleted;
    purged.mediaFiles = (purged.mediaFiles || 0) + srcCleanup.mediaFilesRemoved;
    purged.bytesFreed = (purged.bytesFreed || 0) + srcCleanup.bytesFreed;

    // Delete global disk transcript caches only if no remaining lesson/source references this asset
    if (!this.hasOtherLessonOrSourceForKey(sourceKey, ytId || videoId)) {
      if (ytId) {
        const ytCache = this.transcriptService.deleteCacheWithBytes(ytId);
        if (ytCache.removed) {
          purged.transcriptCaches = (purged.transcriptCaches || 0) + 1;
          purged.bytesFreed = (purged.bytesFreed || 0) + ytCache.bytesFreed;
        }
      }
      if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const mediaUrlCache = this.mediaTranscription.deleteCacheForUrl(sourceUrl);
        if (mediaUrlCache.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mediaUrlCache.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mediaUrlCache.bytesFreed;
        }
      }
      const fileDigest = extractFileDigestFromSourceKey(sourceKey);
      if (mediaId || fileDigest) {
        const mediaFileCache = this.mediaTranscription.deleteCacheForMediaFile(mediaId, fileDigest);
        if (mediaFileCache.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mediaFileCache.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mediaFileCache.bytesFreed;
        }
      }
    }

    clearWordLookupCache();

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'purge_lesson',
        feature: trackToFeature(track),
        scope: 'item',
        targetId: lessonId,
        targetLabel: title,
        summary: `Permanently purged "${title}" and all associated caches`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  purgeLessonsBulk(
    userId: string,
    lessonIds: string[],
    opts: { removeLinkedVocab?: boolean; cascadeLinkedNotes?: boolean } = {},
  ): { affectedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const cleanIds = Array.from(
      new Set((lessonIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    const purged: PurgeCounts = {};
    let affected = 0;
    const tracks = new Set<string>();

    for (const id of cleanIds) {
      const row = this.sqlite.db
        .prepare('SELECT track FROM lessons WHERE id = ? AND user_id = ?')
        .get(id, userId) as { track?: string } | undefined;
      if (row?.track) tracks.add(String(row.track));

      const res = this.purgeLesson(userId, id, {
        ...opts,
        skipAudit: true,
      });
      if (res.deleted) {
        affected++;
        mergeCounts(purged, res.purged);
      }
    }

    const feature: AuditFeature =
      tracks.size === 1 ? trackToFeature(Array.from(tracks)[0]) : 'media_hub';
    const auditEvent =
      affected > 0
        ? this.auditLog.record(userId, {
            action: 'purge_lessons_bulk',
            feature,
            scope: 'bulk',
            targetLabel: `${affected} lesson${affected === 1 ? '' : 's'}`,
            summary: `Bulk purged ${affected} lesson${affected === 1 ? '' : 's'} and linked caches`,
            purged,
          })
        : undefined;

    return { affectedCount: affected, purged, auditEvent };
  }

  purgeLessonsByTrack(
    userId: string,
    track: 'media_hub' | 'shadowing' | 'street_talk' | 'phonetics' | 'all' = 'all',
    opts: { removeLinkedVocab?: boolean; cascadeLinkedNotes?: boolean; skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const rawTrack = String(track || 'all').trim();
    const cleanTrack = rawTrack === 'shadowing' ? 'media_hub' : rawTrack;
    const rows =
      cleanTrack !== 'all'
        ? (this.sqlite.db
            .prepare('SELECT id FROM lessons WHERE user_id = ? AND track = ?')
            .all(userId, cleanTrack) as Array<{ id: string }>)
        : (this.sqlite.db
            .prepare('SELECT id FROM lessons WHERE user_id = ?')
            .all(userId) as Array<{ id: string }>);

    const purged: PurgeCounts = {};
    let removedCount = 0;

    for (const row of rows) {
      const res = this.purgeLesson(userId, row.id, {
        removeLinkedVocab: opts.removeLinkedVocab,
        cascadeLinkedNotes: opts.cascadeLinkedNotes,
        skipAudit: true,
      });
      if (res.deleted) {
        removedCount++;
        mergeCounts(purged, res.purged);
      }
    }

    const feature: AuditFeature =
      cleanTrack === 'street_talk' || cleanTrack === 'phonetics' ? cleanTrack : 'media_hub';
    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && removedCount > 0) {
      auditEvent = this.auditLog.record(userId, {
        action: cleanTrack === 'all' ? 'clear_all_lessons' : `clear_${cleanTrack}`,
        feature,
        scope: 'feature',
        targetLabel: cleanTrack === 'all' ? 'All Lessons' : cleanTrack,
        summary: `Cleared ${removedCount} ${cleanTrack === 'all' ? '' : `${cleanTrack} `}lesson${removedCount === 1 ? '' : 's'}`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  clearLessonCaches(
    userId: string,
    lessonIds: string[] | 'all',
    rawScope: 'all' | 'coach' | 'translations' | 'transcript' | 'transcripts' = 'all',
  ): { clearedLessonsCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const mappedScope: CacheClearScope =
      rawScope === 'transcripts' ? 'transcript' : rawScope;
    const targets =
      lessonIds === 'all'
        ? this.historyRepo.findSummaries(undefined, { userId }).map((s) => s.id)
        : Array.from(new Set(lessonIds.map((x) => String(x || '').trim()).filter(Boolean)));

    let clearedLessonsCount = 0;
    const purged: PurgeCounts = {};

    for (const id of targets) {
      const row = this.sqlite.db
        .prepare('SELECT video_id, source_url, source_key, source_id FROM lessons WHERE id = ? AND user_id = ?')
        .get(id, userId) as Record<string, any> | undefined;
      if (!row) continue;

      if (mappedScope === 'transcript' || mappedScope === 'all') {
        const videoId = String(row.video_id || '').trim();
        const sourceUrl = String(row.source_url || '').trim();
        const sourceKey = String(row.source_key || '').trim();
        const sourceId = String(row.source_id || '').trim();
        const ytId =
          extractYouTubeVideoId(sourceUrl) || (/^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : '');

        if (ytId) {
          const ytCache = this.transcriptService.deleteCacheWithBytes(ytId);
          if (ytCache.removed) {
            purged.transcriptCaches = (purged.transcriptCaches || 0) + 1;
            purged.bytesFreed = (purged.bytesFreed || 0) + ytCache.bytesFreed;
          }
        }
        if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
          const mediaCache = this.mediaTranscription.deleteCacheForUrl(sourceUrl);
          if (mediaCache.filesRemoved > 0) {
            purged.mediaCaches = (purged.mediaCaches || 0) + mediaCache.filesRemoved;
            purged.bytesFreed = (purged.bytesFreed || 0) + mediaCache.bytesFreed;
          }
        }
        const fileDigest = extractFileDigestFromSourceKey(sourceKey);
        if (videoId || fileDigest) {
          const mf = this.mediaTranscription.deleteCacheForMediaFile(videoId, fileDigest);
          if (mf.filesRemoved > 0) {
            purged.mediaCaches = (purged.mediaCaches || 0) + mf.filesRemoved;
            purged.bytesFreed = (purged.bytesFreed || 0) + mf.bytesFreed;
          }
        }
        if (sourceId) {
          const noteRefs = this.sharedSourcesRepo.countReferencesForSource(userId, sourceId);
          if (noteRefs.notes === 0) {
            this.sqlite.db
              .prepare(`UPDATE shared_sources SET transcript_text = '', segments_json = '[]' WHERE id = ? AND user_id = ?`)
              .run(sourceId, userId);
          }
        }
      }

      const summary = this.historyRepo.clearLessonCache(id, mappedScope, { userId });
      if (summary) clearedLessonsCount++;
    }

    clearWordLookupCache();

    const auditEvent =
      clearedLessonsCount > 0
        ? this.auditLog.record(userId, {
            action: 'clear_lesson_caches',
            feature: 'media_hub',
            scope: 'cache',
            targetLabel: `${clearedLessonsCount} lesson(s) · ${mappedScope}`,
            summary: `Cleared ${mappedScope} cache across ${clearedLessonsCount} lesson${clearedLessonsCount === 1 ? '' : 's'}`,
            purged,
          })
        : undefined;

    return { clearedLessonsCount, purged, auditEvent };
  }

  purgeExtractorNote(
    userId: string,
    noteId: string,
    opts: { cascadeLinkedLesson?: boolean; skipAudit?: boolean } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const row = this.sqlite.db
      .prepare(
        `SELECT id, title, source_id, source_url, source_meta_json
         FROM american_extractor_notes WHERE id = ? AND user_id = ?`,
      )
      .get(noteId, userId) as Record<string, any> | undefined;

    if (!row) return { deleted: false, purged: {} };

    const title = String(row.title || 'Study Guide');
    const sourceId = String(row.source_id || '').trim();
    const sourceUrl = String(row.source_url || '').trim();
    let meta: Record<string, any> = {};
    try {
      meta = JSON.parse(String(row.source_meta_json || '{}'));
    } catch {
      meta = {};
    }
    const videoId = String(meta?.videoId || extractYouTubeVideoId(sourceUrl) || '').trim();
    const lessonId = String(meta?.lessonId || '').trim();
    const sourceKey =
      this.sharedSourcesRepo.findById(userId, sourceId)?.sourceKey || '';

    const purged: PurgeCounts = {};
    const del = this.sqlite.db
      .prepare('DELETE FROM american_extractor_notes WHERE id = ? AND user_id = ?')
      .run(noteId, userId);
    purged.extractorNotes = Number(del.changes) || 0;

    if (opts.cascadeLinkedLesson && lessonId) {
      const lessonRes = this.purgeLesson(userId, lessonId, { skipAudit: true });
      mergeCounts(purged, lessonRes.purged);
    }

    const srcCleanup = this.sharedSources.cleanupOrphanedSource(userId, {
      sourceId,
      sourceKey,
      sourceUrl,
      mediaId: videoId,
    });
    purged.sharedSources = (purged.sharedSources || 0) + srcCleanup.sourcesDeleted;
    purged.mediaFiles = (purged.mediaFiles || 0) + srcCleanup.mediaFilesRemoved;
    purged.bytesFreed = (purged.bytesFreed || 0) + srcCleanup.bytesFreed;

    if (!this.hasOtherLessonOrSourceForKey(sourceKey, videoId)) {
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        const ytCache = this.transcriptService.deleteCacheWithBytes(videoId);
        if (ytCache.removed) {
          purged.transcriptCaches = (purged.transcriptCaches || 0) + 1;
          purged.bytesFreed = (purged.bytesFreed || 0) + ytCache.bytesFreed;
        }
      }
      if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const mediaCache = this.mediaTranscription.deleteCacheForUrl(sourceUrl);
        if (mediaCache.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mediaCache.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mediaCache.bytesFreed;
        }
      }
      const fileDigest = extractFileDigestFromSourceKey(sourceKey);
      if (fileDigest || videoId) {
        const mf = this.mediaTranscription.deleteCacheForMediaFile(videoId, fileDigest);
        if (mf.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mf.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mf.bytesFreed;
        }
      }
    }

    clearVisionOcrCache();
    clearWordLookupCache();

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'purge_extractor_note',
        feature: 'american_extractor',
        scope: 'item',
        targetId: noteId,
        targetLabel: title,
        summary: `Deleted Phrase Miner guide "${title}" and orphaned source caches`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  purgeExtractorNotesBulk(
    userId: string,
    noteIds: string[],
  ): { affectedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const cleanIds = Array.from(
      new Set((noteIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    const purged: PurgeCounts = {};
    let affected = 0;

    for (const id of cleanIds) {
      const res = this.purgeExtractorNote(userId, id, { skipAudit: true });
      if (res.deleted) {
        affected++;
        mergeCounts(purged, res.purged);
      }
    }

    const auditEvent =
      affected > 0
        ? this.auditLog.record(userId, {
            action: 'purge_extractor_notes_bulk',
            feature: 'american_extractor',
            scope: 'bulk',
            targetLabel: `${affected} study guide(s)`,
            summary: `Bulk deleted ${affected} Phrase Miner study guide${affected === 1 ? '' : 's'}`,
            purged,
          })
        : undefined;

    return { affectedCount: affected, purged, auditEvent };
  }

  purgeAllExtractorNotes(
    userId: string,
    opts: { skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const rows = this.sqlite.db
      .prepare('SELECT id FROM american_extractor_notes WHERE user_id = ?')
      .all(userId) as Array<{ id: string }>;
    const purged: PurgeCounts = {};
    let removedCount = 0;

    for (const row of rows) {
      const res = this.purgeExtractorNote(userId, row.id, { skipAudit: true });
      if (res.deleted) {
        removedCount++;
        mergeCounts(purged, res.purged);
      }
    }

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && removedCount > 0) {
      auditEvent = this.auditLog.record(userId, {
        action: 'clear_all_extractor_notes',
        feature: 'american_extractor',
        scope: 'feature',
        targetLabel: 'All Study Guides',
        summary: `Cleared all ${removedCount} Phrase Miner study guides`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  purgeLearningLibraryItem(
    userId: string,
    itemId: string,
    opts: { skipAudit?: boolean } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const row = this.sqlite.db
      .prepare('SELECT id, expression, batch_id FROM learning_library_items WHERE id = ? AND user_id = ?')
      .get(itemId, userId) as { id: string; expression?: string; batch_id?: string } | undefined;

    if (!row) return { deleted: false, purged: {} };

    const res = this.sqlite.db
      .prepare('DELETE FROM learning_library_items WHERE id = ? AND user_id = ?')
      .run(itemId, userId);
    const purged: PurgeCounts = { libraryItems: Number(res.changes) || 0 };

    // Clean up empty batch rows so orphaned batch history never lingers
    const batchRes = this.sqlite.db
      .prepare(
        `DELETE FROM learning_library_batches
         WHERE user_id = ?
           AND id NOT IN (
             SELECT DISTINCT batch_id FROM learning_library_items
             WHERE user_id = ? AND batch_id IS NOT NULL AND batch_id != ''
           )`,
      )
      .run(userId, userId);
    purged.libraryBatches = Number(batchRes.changes) || 0;

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'delete_library_item',
        feature: 'learning_library',
        scope: 'item',
        targetId: itemId,
        targetLabel: String(row.expression || 'Expression'),
        summary: `Removed Phrase Builder expression "${row.expression || itemId}"`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  purgeLearningLibraryBulk(
    userId: string,
    itemIds: string[],
  ): { affectedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const cleanIds = Array.from(
      new Set((itemIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    const purged: PurgeCounts = {};
    let affected = 0;

    for (const id of cleanIds) {
      const res = this.purgeLearningLibraryItem(userId, id, { skipAudit: true });
      if (res.deleted) {
        affected++;
        mergeCounts(purged, res.purged);
      }
    }

    const auditEvent =
      affected > 0
        ? this.auditLog.record(userId, {
            action: 'purge_library_bulk',
            feature: 'learning_library',
            scope: 'bulk',
            targetLabel: `${affected} expression(s)`,
            summary: `Deleted ${affected} Phrase Builder expression${affected === 1 ? '' : 's'}`,
            purged,
          })
        : undefined;

    return { affectedCount: affected, purged, auditEvent };
  }

  purgeLearningLibraryDomain(
    userId: string,
    domainId?: string,
    opts: { skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const cleanDomain = String(domainId || '').trim();
    const itemRes = cleanDomain
      ? this.sqlite.db
          .prepare('DELETE FROM learning_library_items WHERE user_id = ? AND domain_id = ?')
          .run(userId, cleanDomain)
      : this.sqlite.db
          .prepare('DELETE FROM learning_library_items WHERE user_id = ?')
          .run(userId);
    const batchRes = cleanDomain
      ? this.sqlite.db
          .prepare('DELETE FROM learning_library_batches WHERE user_id = ? AND domain_id = ?')
          .run(userId, cleanDomain)
      : this.sqlite.db
          .prepare('DELETE FROM learning_library_batches WHERE user_id = ?')
          .run(userId);

    const removedCount = Number(itemRes.changes) || 0;
    const purged: PurgeCounts = {
      libraryItems: removedCount,
      libraryBatches: Number(batchRes.changes) || 0,
    };

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && (removedCount > 0 || (purged.libraryBatches || 0) > 0)) {
      auditEvent = this.auditLog.record(userId, {
        action: cleanDomain ? 'clear_library_domain' : 'clear_all_library',
        feature: 'learning_library',
        scope: 'feature',
        targetLabel: cleanDomain || 'All Domains',
        summary: `Cleared ${removedCount} Phrase Builder expression${removedCount === 1 ? '' : 's'}${cleanDomain ? ` (${cleanDomain})` : ''}`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  resetLearningLibraryProgress(
    userId: string,
    domainId?: string,
    opts: { clearNotes?: boolean; clearFavorites?: boolean } = {},
  ): { resetCount: number; auditEvent?: AuditEventRecord } {
    const cleanDomain = String(domainId || '').trim();
    const now = new Date().toISOString();
    const sets = [`is_completed = 0`, `mastery_status = 'new'`, `review_count = 0`, `updated_at = ?`];
    if (opts.clearNotes) sets.push(`user_notes = ''`);
    if (opts.clearFavorites) sets.push(`is_favorite = 0`);

    const res = cleanDomain
      ? this.sqlite.db
          .prepare(
            `UPDATE learning_library_items SET ${sets.join(', ')} WHERE user_id = ? AND domain_id = ?`,
          )
          .run(now, userId, cleanDomain)
      : this.sqlite.db
          .prepare(`UPDATE learning_library_items SET ${sets.join(', ')} WHERE user_id = ?`)
          .run(now, userId);

    const resetCount = Number(res.changes) || 0;
    const auditEvent =
      resetCount > 0
        ? this.auditLog.record(userId, {
            action: 'reset_library_progress',
            feature: 'learning_library',
            scope: 'progress',
            targetLabel: cleanDomain || 'All Domains',
            summary: `Reset study progress for ${resetCount} Phrase Builder expression${resetCount === 1 ? '' : 's'}`,
            purged: { libraryItems: resetCount },
          })
        : undefined;

    return { resetCount, auditEvent };
  }

  purgeVocabularyItem(
    userId: string,
    itemId: string,
    opts: { skipAudit?: boolean } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const row = this.sqlite.db
      .prepare('SELECT id, term FROM vocabulary_items WHERE id = ? AND user_id = ?')
      .get(itemId, userId) as { id: string; term?: string } | undefined;
    if (!row) return { deleted: false, purged: {} };

    const res = this.sqlite.db
      .prepare('DELETE FROM vocabulary_items WHERE id = ? AND user_id = ?')
      .run(itemId, userId);
    const purged: PurgeCounts = { vocabulary: Number(res.changes) || 0 };

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'delete_vocabulary_item',
        feature: 'vocabulary',
        scope: 'item',
        targetId: itemId,
        targetLabel: String(row.term || 'Word'),
        summary: `Removed "${row.term || itemId}" from Vocabulary Vault`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  purgeVocabularyBulk(
    userId: string,
    itemIds: string[],
  ): { affectedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const cleanIds = Array.from(
      new Set((itemIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    let affected = 0;
    for (const id of cleanIds) {
      const res = this.purgeVocabularyItem(userId, id, { skipAudit: true });
      if (res.deleted) affected++;
    }
    const purged: PurgeCounts = { vocabulary: affected };
    const auditEvent =
      affected > 0
        ? this.auditLog.record(userId, {
            action: 'purge_vocabulary_bulk',
            feature: 'vocabulary',
            scope: 'bulk',
            targetLabel: `${affected} word(s)`,
            summary: `Removed ${affected} saved word${affected === 1 ? '' : 's'} from Vocabulary Vault`,
            purged,
          })
        : undefined;

    return { affectedCount: affected, purged, auditEvent };
  }

  purgeAllVocabulary(
    userId: string,
    opts: { skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const res = this.sqlite.db
      .prepare('DELETE FROM vocabulary_items WHERE user_id = ?')
      .run(userId);
    const removedCount = Number(res.changes) || 0;
    const purged: PurgeCounts = { vocabulary: removedCount };

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && removedCount > 0) {
      auditEvent = this.auditLog.record(userId, {
        action: 'clear_all_vocabulary',
        feature: 'vocabulary',
        scope: 'feature',
        targetLabel: 'Vocabulary Vault',
        summary: `Cleared all ${removedCount} words from Vocabulary Vault`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  resetVocabularyProgress(userId: string): { resetCount: number; auditEvent?: AuditEventRecord } {
    const now = new Date().toISOString();
    const res = this.sqlite.db
      .prepare(
        `UPDATE vocabulary_items
         SET mastery_level = 0, is_completed = 0, next_review_at = ?
         WHERE user_id = ?`,
      )
      .run(now, userId);
    const resetCount = Number(res.changes) || 0;
    const auditEvent =
      resetCount > 0
        ? this.auditLog.record(userId, {
            action: 'reset_vocabulary_progress',
            feature: 'vocabulary',
            scope: 'progress',
            targetLabel: 'Vocabulary SRS',
            summary: `Reset SRS mastery progress for ${resetCount} saved word${resetCount === 1 ? '' : 's'}`,
            purged: { vocabulary: resetCount },
          })
        : undefined;
    return { resetCount, auditEvent };
  }

  purgeThinkAloudSession(
    userId: string,
    sessionId: string,
    opts: { skipAudit?: boolean } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const row = this.sqlite.db
      .prepare('SELECT id, prompt_title, media_id FROM think_aloud_sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as { id: string; prompt_title?: string; media_id?: string } | undefined;
    if (!row) return { deleted: false, purged: {} };

    const purged: PurgeCounts = {};
    const delSession = this.sqlite.db
      .prepare('DELETE FROM think_aloud_sessions WHERE id = ? AND user_id = ?')
      .run(sessionId, userId);
    purged.thinkAloudSessions = Number(delSession.changes) || 0;

    const delLogs = this.sqlite.db
      .prepare('DELETE FROM practice_logs WHERE user_id = ? AND lesson_id = ?')
      .run(userId, sessionId);
    purged.practiceLogs = Number(delLogs.changes) || 0;

    if (row.media_id) {
      const mediaGc = this.sharedSources.pruneOrphanedMediaFiles([row.media_id]);
      purged.mediaFiles = mediaGc.filesRemoved;
      purged.bytesFreed = mediaGc.bytesFreed;
    }

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'delete_think_aloud_session',
        feature: 'think_aloud',
        scope: 'item',
        targetId: sessionId,
        targetLabel: String(row.prompt_title || 'Speaking Session'),
        summary: `Deleted Think Aloud session "${row.prompt_title || sessionId}"`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  purgeThinkAloudSessionsBulk(
    userId: string,
    sessionIds: string[],
  ): { affectedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const cleanIds = Array.from(
      new Set((sessionIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    const purged: PurgeCounts = {};
    let affected = 0;

    for (const id of cleanIds) {
      const res = this.purgeThinkAloudSession(userId, id, { skipAudit: true });
      if (res.deleted) {
        affected++;
        mergeCounts(purged, res.purged);
      }
    }

    const auditEvent =
      affected > 0
        ? this.auditLog.record(userId, {
            action: 'purge_think_aloud_sessions_bulk',
            feature: 'think_aloud',
            scope: 'bulk',
            targetLabel: `${affected} session(s)`,
            summary: `Deleted ${affected} Think Aloud session${affected === 1 ? '' : 's'}`,
            purged,
          })
        : undefined;

    return { affectedCount: affected, purged, auditEvent };
  }

  purgeAllThinkAloudSessions(
    userId: string,
    opts: { skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const rows = this.sqlite.db
      .prepare('SELECT id FROM think_aloud_sessions WHERE user_id = ?')
      .all(userId) as Array<{ id: string }>;
    const purged: PurgeCounts = {};
    let removedCount = 0;

    for (const row of rows) {
      const res = this.purgeThinkAloudSession(userId, row.id, { skipAudit: true });
      if (res.deleted) {
        removedCount++;
        mergeCounts(purged, res.purged);
      }
    }

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && removedCount > 0) {
      auditEvent = this.auditLog.record(userId, {
        action: 'clear_all_think_aloud_sessions',
        feature: 'think_aloud',
        scope: 'feature',
        targetLabel: 'Think Aloud Sessions',
        summary: `Cleared all ${removedCount} Think Aloud speaking sessions`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  purgeThinkAloudSpinePack(
    userId: string,
    packId: string,
    opts: { skipAudit?: boolean } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    if (!packId || packId.startsWith('builtin_') || packId.startsWith('state_')) {
      throw new NotFoundException('Custom spine pack not found.');
    }

    const row = this.sqlite.db
      .prepare('SELECT id, title FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
      .get(packId, userId) as { id: string; title?: string } | undefined;
    if (!row) {
      throw new NotFoundException('Custom spine pack not found.');
    }

    const res = this.sqlite.db
      .prepare('DELETE FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
      .run(packId, userId);
    const purged: PurgeCounts = { thinkAloudSpines: Number(res.changes) || 0 };

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'delete_spine_pack',
        feature: 'think_aloud',
        scope: 'item',
        targetId: packId,
        targetLabel: String(row.title || 'Spine Pack'),
        summary: `Deleted custom Spine Pack "${row.title || packId}"`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  resetThinkAloudSpineProgress(
    userId: string,
    packId?: string,
  ): { resetCount: number; auditEvent?: AuditEventRecord } {
    const now = new Date().toISOString();
    let resetCount = 0;

    if (packId) {
      if (packId.startsWith('builtin_')) {
        const stateId = `state_${userId}_${packId}`;
        const res = this.sqlite.db
          .prepare('DELETE FROM think_aloud_spine_packs WHERE id = ? AND user_id = ?')
          .run(stateId, userId);
        resetCount = Number(res.changes) || 0;
      } else {
        const res = this.sqlite.db
          .prepare(
            `UPDATE think_aloud_spine_packs SET practiced_ids_json = '[]', updated_at = ? WHERE id = ? AND user_id = ?`,
          )
          .run(now, packId, userId);
        resetCount = Number(res.changes) || 0;
      }
    } else {
      const delStates = this.sqlite.db
        .prepare(`DELETE FROM think_aloud_spine_packs WHERE user_id = ? AND id LIKE 'state_%'`)
        .run(userId);
      const updCustom = this.sqlite.db
        .prepare(
          `UPDATE think_aloud_spine_packs SET practiced_ids_json = '[]', updated_at = ? WHERE user_id = ?`,
        )
        .run(now, userId);
      resetCount = (Number(delStates.changes) || 0) + (Number(updCustom.changes) || 0);
    }

    const auditEvent =
      resetCount > 0
        ? this.auditLog.record(userId, {
            action: 'reset_spine_progress',
            feature: 'think_aloud',
            scope: 'progress',
            targetId: packId || '',
            targetLabel: packId || 'All Spine Packs',
            summary: `Reset practiced Spine Pack progress`,
            purged: { thinkAloudSpines: resetCount },
          })
        : undefined;

    return { resetCount, auditEvent };
  }

  purgeAllThinkAloudSpines(
    userId: string,
    opts: { skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const res = this.sqlite.db
      .prepare('DELETE FROM think_aloud_spine_packs WHERE user_id = ?')
      .run(userId);
    const removedCount = Number(res.changes) || 0;
    const purged: PurgeCounts = { thinkAloudSpines: removedCount };

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && removedCount > 0) {
      auditEvent = this.auditLog.record(userId, {
        action: 'clear_all_spines',
        feature: 'think_aloud',
        scope: 'feature',
        targetLabel: 'Spine Packs',
        summary: `Cleared custom Spine Packs and built-in Spine progress`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  purgeSharedSource(
    userId: string,
    sourceId: string,
    opts: { cascadeLinked?: boolean; skipAudit?: boolean } = {},
  ): { deleted: boolean; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const rec = this.sharedSourcesRepo.findById(userId, sourceId);
    if (!rec) return { deleted: false, purged: {} };

    const purged: PurgeCounts = {};
    if (opts.cascadeLinked) {
      const lessonRows = this.sqlite.db
        .prepare('SELECT id FROM lessons WHERE user_id = ? AND source_id = ?')
        .all(userId, sourceId) as Array<{ id: string }>;
      for (const r of lessonRows) {
        const lRes = this.purgeLesson(userId, r.id, { skipAudit: true });
        mergeCounts(purged, lRes.purged);
      }
      const noteRows = this.sqlite.db
        .prepare('SELECT id FROM american_extractor_notes WHERE user_id = ? AND source_id = ?')
        .all(userId, sourceId) as Array<{ id: string }>;
      for (const r of noteRows) {
        const nRes = this.purgeExtractorNote(userId, r.id, { skipAudit: true });
        mergeCounts(purged, nRes.purged);
      }
    } else {
      this.sqlite.db
        .prepare(`UPDATE lessons SET source_id = '' WHERE user_id = ? AND source_id = ?`)
        .run(userId, sourceId);
      this.sqlite.db
        .prepare(`UPDATE american_extractor_notes SET source_id = '' WHERE user_id = ? AND source_id = ?`)
        .run(userId, sourceId);
    }

    const cleanup = this.sharedSources.cleanupOrphanedSource(userId, {
      sourceId,
      forceDelete: true,
    });
    purged.sharedSources = (purged.sharedSources || 0) + cleanup.sourcesDeleted;
    purged.mediaFiles = (purged.mediaFiles || 0) + cleanup.mediaFilesRemoved;
    purged.bytesFreed = (purged.bytesFreed || 0) + cleanup.bytesFreed;

    const ytId =
      rec.mediaKind === 'youtube' && rec.mediaId
        ? rec.mediaId
        : extractYouTubeVideoId(rec.sourceUrl);
    if (!this.hasOtherLessonOrSourceForKey(rec.sourceKey, ytId || rec.mediaId)) {
      if (ytId) {
        const ytCache = this.transcriptService.deleteCacheWithBytes(ytId);
        if (ytCache.removed) {
          purged.transcriptCaches = (purged.transcriptCaches || 0) + 1;
          purged.bytesFreed = (purged.bytesFreed || 0) + ytCache.bytesFreed;
        }
      }
      if (rec.sourceUrl && /^https?:\/\//i.test(rec.sourceUrl)) {
        const mc = this.mediaTranscription.deleteCacheForUrl(rec.sourceUrl);
        if (mc.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mc.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mc.bytesFreed;
        }
      }
      const fileDigest = extractFileDigestFromSourceKey(rec.sourceKey);
      if (rec.mediaId || fileDigest) {
        const mf = this.mediaTranscription.deleteCacheForMediaFile(rec.mediaId, fileDigest);
        if (mf.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mf.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mf.bytesFreed;
        }
      }
    }

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit) {
      auditEvent = this.auditLog.record(userId, {
        action: 'purge_shared_source',
        feature: 'shared_sources',
        scope: 'item',
        targetId: sourceId,
        targetLabel: rec.title || 'Shared Source',
        summary: `Deleted shared source "${rec.title || sourceId}" and orphaned media`,
        purged,
      });
    }

    return { deleted: true, purged, auditEvent };
  }

  purgeAllSharedSources(
    userId: string,
    opts: { cascadeLinked?: boolean; skipAudit?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const all = this.sharedSourcesRepo.findAllForUser(userId);
    const purged: PurgeCounts = {};
    let removedCount = 0;
    for (const src of all) {
      const res = this.purgeSharedSource(userId, src.id, {
        cascadeLinked: opts.cascadeLinked,
        skipAudit: true,
      });
      if (res.deleted) {
        removedCount++;
        mergeCounts(purged, res.purged);
      }
    }

    let auditEvent: AuditEventRecord | undefined;
    if (!opts.skipAudit && removedCount > 0) {
      auditEvent = this.auditLog.record(userId, {
        action: 'clear_all_shared_sources',
        feature: 'shared_sources',
        scope: 'feature',
        targetLabel: 'Shared Sources & Media',
        summary: `Cleared ${removedCount} shared sources and orphaned disk media`,
        purged,
      });
    }

    return { removedCount, purged, auditEvent };
  }

  purgeFeature(
    userId: string,
    feature: string,
    opts: { domainId?: string; removeLinkedVocab?: boolean; cascadeLinked?: boolean } = {},
  ): { removedCount: number; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const clean = String(feature || '').trim().toLowerCase();
    switch (clean) {
      case 'media_hub':
      case 'shadowing':
      case 'street_talk':
      case 'phonetics':
      case 'lessons': {
        const track =
          clean === 'lessons'
            ? 'all'
            : clean === 'shadowing'
              ? 'media_hub'
              : (clean as 'media_hub' | 'street_talk' | 'phonetics');
        return this.purgeLessonsByTrack(userId, track, {
          removeLinkedVocab: opts.removeLinkedVocab,
          cascadeLinkedNotes: opts.cascadeLinked,
        });
      }
      case 'think_aloud_sessions':
        return this.purgeAllThinkAloudSessions(userId);
      case 'think_aloud_spines':
        return this.purgeAllThinkAloudSpines(userId);
      case 'think_aloud': {
        const sess = this.purgeAllThinkAloudSessions(userId, { skipAudit: true });
        const spines = this.purgeAllThinkAloudSpines(userId, { skipAudit: true });
        const purged = mergeCounts({ ...sess.purged }, spines.purged);
        const removedCount = sess.removedCount + spines.removedCount;
        const auditEvent =
          removedCount > 0
            ? this.auditLog.record(userId, {
                action: 'clear_think_aloud',
                feature: 'think_aloud',
                scope: 'feature',
                targetLabel: 'Think Aloud',
                summary: `Cleared ${sess.removedCount} Think Aloud sessions and ${spines.removedCount} spine packs`,
                purged,
              })
            : undefined;
        return { removedCount, purged, auditEvent };
      }
      case 'american_extractor':
        return this.purgeAllExtractorNotes(userId);
      case 'learning_library':
        return this.purgeLearningLibraryDomain(userId, opts.domainId);
      case 'vocabulary':
        return this.purgeAllVocabulary(userId);
      case 'shared_sources':
        return this.purgeAllSharedSources(userId, { cascadeLinked: opts.cascadeLinked });
      case 'practice_logs': {
        const removedCount = this.historyRepo.clearActivityLogs({ userId });
        const purged: PurgeCounts = { practiceLogs: removedCount };
        const auditEvent =
          removedCount > 0
            ? this.auditLog.record(userId, {
                action: 'clear_activity_logs',
                feature: 'activity',
                scope: 'feature',
                targetLabel: 'Practice Timeline & Streak',
                summary: `Cleared ${removedCount} practice activity logs and reset streak`,
                purged,
              })
            : undefined;
        return { removedCount, purged, auditEvent };
      }
      case 'audit_log': {
        const removedCount = this.auditLog.clearAll(userId);
        return { removedCount, purged: { auditEvents: removedCount } };
      }
      default:
        throw new BadRequestException(`Unsupported feature purge target: "${feature}".`);
    }
  }

  resetWorkspace(
    userId: string,
    options: WorkspaceResetOptions = {},
  ): { success: true; purged: PurgeCounts; auditEvent?: AuditEventRecord } {
    const phrase = String(options.confirmPhrase || '').trim().toUpperCase();
    if (phrase !== 'RESET') {
      throw new BadRequestException('Type RESET to confirm a full workspace reset.');
    }

    const includeLessons = options.includeLessons !== false;
    const includeThinkAloud = options.includeThinkAloud !== false;
    const includePhraseMiner = options.includePhraseMiner !== false;
    const includePhraseBuilder = options.includePhraseBuilder !== false;
    const includeVocabulary = options.includeVocabulary !== false;
    const includeSharedSources = options.includeSharedSources !== false;
    const includePracticeAndStreak = options.includePracticeAndStreak !== false;
    const includeAuditLog = Boolean(options.includeAuditLog);
    const includeAiKeys = Boolean(options.includeAiKeys);
    const resetPreferences = Boolean(options.resetPreferences);

    const purged: PurgeCounts = {};

    if (includeLessons) {
      mergeCounts(
        purged,
        this.purgeLessonsByTrack(userId, 'all', { skipAudit: true }).purged,
      );
    }
    if (includeThinkAloud) {
      mergeCounts(purged, this.purgeAllThinkAloudSessions(userId, { skipAudit: true }).purged);
      mergeCounts(purged, this.purgeAllThinkAloudSpines(userId, { skipAudit: true }).purged);
    }
    if (includePhraseMiner) {
      mergeCounts(purged, this.purgeAllExtractorNotes(userId, { skipAudit: true }).purged);
    }
    if (includePhraseBuilder) {
      mergeCounts(purged, this.purgeLearningLibraryDomain(userId, undefined, { skipAudit: true }).purged);
    }
    if (includeVocabulary) {
      mergeCounts(purged, this.purgeAllVocabulary(userId, { skipAudit: true }).purged);
    }
    if (includeSharedSources) {
      mergeCounts(purged, this.purgeAllSharedSources(userId, { skipAudit: true }).purged);
    }
    if (includePracticeAndStreak) {
      const logsCleared = this.historyRepo.clearActivityLogs({ userId });
      if (logsCleared > 0) {
        purged.practiceLogs = (purged.practiceLogs || 0) + logsCleared;
      }
    }
    if (includeAiKeys) {
      const keysRemoved = this.aiProviders.deleteAllUserKeys(userId);
      if (keysRemoved > 0) purged.aiKeys = keysRemoved;
    }
    if (resetPreferences) {
      this.sqlite.db
        .prepare(
          `UPDATE users SET native_language = 'ar', ui_language = 'en', daily_goal_minutes = 15 WHERE id = ?`,
        )
        .run(userId);
      this.sqlite.db.prepare('DELETE FROM ai_chat_preferences WHERE user_id = ?').run(userId);
    }
    this.sqlite.db.prepare('DELETE FROM ai_chat_messages WHERE user_id = ?').run(userId);
    this.sqlite.db.prepare('DELETE FROM ai_chat_threads WHERE user_id = ?').run(userId);

    // Clear global disk transcript caches if zero users remain referencing them
    if (
      includeLessons &&
      includePhraseMiner &&
      includeSharedSources &&
      !this.sqlite.db.prepare('SELECT 1 FROM lessons LIMIT 1').get() &&
      !this.sqlite.db.prepare('SELECT 1 FROM shared_sources LIMIT 1').get()
    ) {
      const ytAll = this.transcriptService.clearAllCacheFiles();
      const mediaAll = this.mediaTranscription.clearAllCacheFiles();
      if (ytAll.filesRemoved > 0) {
        purged.transcriptCaches = (purged.transcriptCaches || 0) + ytAll.filesRemoved;
        purged.bytesFreed = (purged.bytesFreed || 0) + ytAll.bytesFreed;
      }
      if (mediaAll.filesRemoved > 0) {
        purged.mediaCaches = (purged.mediaCaches || 0) + mediaAll.filesRemoved;
        purged.bytesFreed = (purged.bytesFreed || 0) + mediaAll.bytesFreed;
      }
    }

    clearWordLookupCache();
    clearVisionOcrCache();

    let auditEvent: AuditEventRecord | undefined;
    if (includeAuditLog) {
      const clearedAudit = this.auditLog.clearAll(userId);
      if (clearedAudit > 0) purged.auditEvents = clearedAudit;
    } else {
      auditEvent = this.auditLog.record(userId, {
        action: 'workspace_factory_reset',
        feature: 'workspace',
        scope: 'workspace',
        targetLabel: 'Workspace Factory Reset',
        summary: 'Reset workspace to Day-1 clean state across selected features and caches',
        purged,
      });
    }

    this.logger.log(`Workspace reset executed for user ${userId}: ${JSON.stringify(purged)}`);
    return { success: true, purged, auditEvent };
  }

  /**
   * Captures external file/cache identifiers owned by a user, executes SQLite user
   * deletion (CASCADE), and garbage-collects any orphaned disk media, caches, and RAM.
   */
  purgeAccountExternalArtifacts(userId: string, deleteAccountSqlFn: () => void): PurgeCounts {
    const lessonRows = this.sqlite.db
      .prepare('SELECT id, video_id, source_url, source_key FROM lessons WHERE user_id = ?')
      .all(userId) as Array<Record<string, any>>;
    const sourceRows = this.sqlite.db
      .prepare('SELECT source_key, source_url, media_id, media_kind FROM shared_sources WHERE user_id = ?')
      .all(userId) as Array<Record<string, any>>;
    const taRows = this.sqlite.db
      .prepare("SELECT media_id FROM think_aloud_sessions WHERE user_id = ? AND media_id != ''")
      .all(userId) as Array<{ media_id?: string }>;
    const keyRows = this.sqlite.db
      .prepare('SELECT key_fingerprint FROM user_ai_keys WHERE user_id = ?')
      .all(userId) as Array<{ key_fingerprint?: string }>;

    const mediaCandidates: string[] = [];
    const ytCandidates = new Set<string>();
    const urlCandidates = new Set<string>();
    const sourceKeyCandidates = new Set<string>();

    for (const r of lessonRows) {
      const vid = String(r.video_id || '').trim();
      const url = String(r.source_url || '').trim();
      const sk = String(r.source_key || '').trim();
      markMediaHubTargetDeleted(userId, [String(r.id), vid, sk]);
      if (vid) {
        mediaCandidates.push(vid);
        if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) ytCandidates.add(vid);
      }
      if (url) {
        urlCandidates.add(url);
        const extracted = extractYouTubeVideoId(url);
        if (extracted) ytCandidates.add(extracted);
      }
      if (sk) sourceKeyCandidates.add(sk);
    }

    for (const r of sourceRows) {
      const mid = String(r.media_id || '').trim();
      const url = String(r.source_url || '').trim();
      const sk = String(r.source_key || '').trim();
      if (mid) {
        mediaCandidates.push(mid);
        if (r.media_kind === 'youtube' && /^[a-zA-Z0-9_-]{11}$/.test(mid)) ytCandidates.add(mid);
      }
      if (url) urlCandidates.add(url);
      if (sk) sourceKeyCandidates.add(sk);
    }

    for (const r of taRows) {
      if (r.media_id) mediaCandidates.push(String(r.media_id));
    }

    const fingerprints = keyRows.map((k) => String(k.key_fingerprint || '')).filter(Boolean);

    // Execute SQLite CASCADE deletion
    deleteAccountSqlFn();

    const purged: PurgeCounts = {};
    clearModelsCacheForFingerprints(fingerprints);
    clearWordLookupCache();
    clearVisionOcrCache();

    const mediaGc = this.sharedSources.pruneOrphanedMediaFiles(mediaCandidates);
    purged.mediaFiles = mediaGc.filesRemoved;
    purged.bytesFreed = (purged.bytesFreed || 0) + mediaGc.bytesFreed;

    for (const ytId of ytCandidates) {
      if (!this.hasOtherLessonOrSourceForKey(`youtube:${ytId}`, ytId)) {
        const res = this.transcriptService.deleteCacheWithBytes(ytId);
        if (res.removed) {
          purged.transcriptCaches = (purged.transcriptCaches || 0) + 1;
          purged.bytesFreed = (purged.bytesFreed || 0) + res.bytesFreed;
        }
      }
    }

    for (const url of urlCandidates) {
      const stillUsed = this.sqlite.db
        .prepare('SELECT 1 FROM lessons WHERE LOWER(source_url) = LOWER(?) LIMIT 1')
        .get(url);
      if (!stillUsed) {
        const mc = this.mediaTranscription.deleteCacheForUrl(url);
        if (mc.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mc.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mc.bytesFreed;
        }
      }
    }

    for (const sk of sourceKeyCandidates) {
      const digest = extractFileDigestFromSourceKey(sk);
      if (digest && !this.hasOtherLessonOrSourceForKey(sk)) {
        const mf = this.mediaTranscription.deleteCacheForMediaFile('', digest);
        if (mf.filesRemoved > 0) {
          purged.mediaCaches = (purged.mediaCaches || 0) + mf.filesRemoved;
          purged.bytesFreed = (purged.bytesFreed || 0) + mf.bytesFreed;
        }
      }
    }

    return purged;
  }
}
