import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ChunkItem {
  timeRange: string;
  time_range?: string;
  start?: string;
  end?: string;
  startSec: number;
  endSec: number;
  title?: string;
  text: string;
  highlightedHtml: string;
}

export interface SentenceItem {
  id: string;
  index: number;
  timeRange: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  highlightedHtml: string;
  translations?: Record<string, string>;
}

export interface HistoryItem {
  id: string;
  track: 'shadowing' | 'street_talk' | 'phonetics' | 'creator_script';
  trackTitle: string;
  title: string;
  creator: string;
  videoId?: string;
  sourceUrl: string;
  thumbnailUrl: string;
  categoryIcon: string;
  accentDialect: string;
  colorTheme: string;
  durationSeconds: number;
  pacingWpm: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  stats: {
    slangCount: number;
    idiomsCount: number;
    reductionsCount: number;
    fillersCount: number;
    correctionsCount: number;
    totalWords: number;
  };
  keyHighlights: Array<{
    category: string;
    text: string;
    meaning?: string;
    icon: string;
    color: string;
  }>;
  chunks?: ChunkItem[];
  sentences?: SentenceItem[];
  translationsCache?: Record<string, Record<number, string>>;
  slangTable?: Array<{ term: string; meaning: string; delivery: string }>;
  idiomsTable?: Array<{ phrase: string; equivalent: string; usage: string }>;
  reductionsTable?: Array<{ written: string; spoken: string; phenomenon: string; mechanics: string }>;
  asrFixes?: Array<{ timestamp: string; wrong: string; corrected: string; reason: string }>;
  chunksCount: number;
  noteMarkdown: string;
  agentUsed: string;
  createdAt: string;
  completedDrills: number;
}

@Injectable()
export class HistoryRepository {
  private readonly storagePath = path.resolve(__dirname, '../../../../data/history.json');
  private readonly logger = new Logger(HistoryRepository.name);
  private items: HistoryItem[] = [];

  constructor() {
    this.ensureStorageExists();
    this.load();
  }

  private ensureStorageExists() {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.storagePath)) {
      fs.writeFileSync(this.storagePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private load() {
    try {
      const data = fs.readFileSync(this.storagePath, 'utf-8');
      const parsed: HistoryItem[] = JSON.parse(data);
      let modified = false;

      // 1. Strict Track-Aware Deduplication
      const seen = new Set<string>();
      const deduped: HistoryItem[] = [];
      for (const item of parsed) {
        const key = (item.track === 'shadowing' && item.videoId)
          ? `shadowing:v:${item.videoId.toLowerCase()}`
          : (item.sourceUrl ? `u:${item.sourceUrl.toLowerCase()}` : `id:${item.id}`);
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        } else {
          modified = true;
        }
      }
      this.items = deduped;

      // 2. Preserve AI-generated sentences; only fallback if completely empty
      for (const item of this.items) {
        if (!item.sentences || item.sentences.length === 0) {
          if (item.chunks && item.chunks.length > 0) {
            item.sentences = this.synthesizeSentences(item.chunks);
            modified = true;
          }
        }
      }

      if (modified) {
        this.persist();
      }
      this.logger.log(`Loaded and verified ${this.items.length} unique historical practice sessions.`);
    } catch (e: any) {
      this.logger.warn(`Could not parse storage file, initializing clean database: ${e.message}`);
      this.items = [];
      this.persist();
    }
  }

  private synthesizeSentences(chunks: ChunkItem[]): SentenceItem[] {
    const parseTime = (ts?: string): number => {
      if (!ts) return 0;
      const parts = ts.replace(/[\[\]]/g, '').trim().split(':');
      if (parts.length === 3) {
        return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
      }
      if (parts.length === 2) {
        return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
      }
      const f = parseFloat(ts);
      return isNaN(f) ? 0 : f;
    };

    const formatTime = (sec: number): string => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const mm = m < 10 ? `0${m}` : `${m}`;
      const ss = s < 10 ? `0${s}` : `${s}`;
      return `${mm}:${ss}`;
    };

    const DANGLING_END_WORDS = new Set([
      'the', 'a', 'an',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'upon', 'towards',
      'and', 'or', 'but', 'so', 'because', 'nor', 'yet',
      'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'if',
      'my', 'your', 'his', 'her', 'its', 'our', 'their',
      'this', 'these', 'those'
    ]);

    const BREAK_BEFORE_WORDS = new Set([
      'and', 'but', 'so', 'or', 'nor', 'yet',
      'because', 'although', 'though', 'while', 'since', 'if', 'unless',
      'which', 'where', 'when', 'who', 'why', 'how',
      'instead', 'before', 'after', 'during', 'without', 'like'
    ]);

    const BREAK_PHRASES = [
      'he says', 'she says', 'they say', 'i say',
      'for example', 'you know', 'i mean', 'i think',
      'so that', 'might as well', 'instead of', 'throughout the day',
      'as well as', 'in fact', 'back in', 'meant that', 'what i', "that's how"
    ];

    const applyHighlights = (text: string): string => {
      let html = text;
      // Reductions
      html = html.replace(/\bgoing to\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">going to [gonna]</mark>');
      html = html.replace(/\bwant to\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">want to [wanna]</mark>');
      html = html.replace(/\bgot to\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">got to [gotta]</mark>');
      html = html.replace(/\blet me\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">let me [lemme]</mark>');
      html = html.replace(/\bkind of\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">kind of [kinda]</mark>');
      html = html.replace(/\bout of\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">out of [outta]</mark>');
      return html;
    };

    const sentences: SentenceItem[] = [];
    let count = 1;

    for (const chunk of chunks) {
      let cStart = parseTime(chunk.start);
      if (!cStart && chunk.time_range) {
        const match = chunk.time_range.match(/\[([\d:.]+)/);
        if (match) cStart = parseTime(match[1]);
      }
      if (cStart === 0 && chunk.startSec) cStart = chunk.startSec;

      let cEnd = parseTime(chunk.end);
      if (!cEnd && chunk.time_range) {
        const match = chunk.time_range.match(/-\s*([\d:.]+)\]/);
        if (match) cEnd = parseTime(match[1]);
      }
      if (!cEnd || cEnd <= cStart) cEnd = (chunk.endSec && chunk.endSec > cStart) ? chunk.endSec : cStart + 30;
      const cDuration = Math.max(cEnd - cStart, 1);

      const rawText = (chunk.text || '').replace(/\s+/g, ' ').trim();
      if (!rawText) continue;

      const initialSections = rawText.split(/(?<=[.?!;:])\s+/).filter(s => s.trim().length > 0);
      const chunkSubUnits: string[] = [];

      for (const section of initialSections) {
        const words = section.trim().split(/\s+/).filter(Boolean);
        if (words.length <= 11) {
          chunkSubUnits.push(words.join(' '));
          continue;
        }

        let currentUnit: string[] = [];
        let i = 0;

        while (i < words.length) {
          currentUnit.push(words[i]);
          const currentCount = currentUnit.length;
          const remainingWords = words.length - (i + 1);

          if (currentCount >= 4) {
            const nextWord = (words[i + 1] || '').toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');
            const nextTwoWords = ((words[i + 1] || '') + ' ' + (words[i + 2] || '')).toLowerCase();
            const currWordClean = words[i].toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');
            const endsWithPunct = /[,\u2014\u2013:;-]$/.test(words[i]);

            let isBreakPoint = false;

            if (endsWithPunct && currentCount >= 4 && !DANGLING_END_WORDS.has(currWordClean)) {
              isBreakPoint = true;
            } else if (BREAK_PHRASES.some(p => nextTwoWords.startsWith(p)) && currentCount >= 4 && !DANGLING_END_WORDS.has(currWordClean)) {
              isBreakPoint = true;
            } else if (BREAK_BEFORE_WORDS.has(nextWord) && currentCount >= 7 && !DANGLING_END_WORDS.has(currWordClean)) {
              isBreakPoint = true;
            } else if (currentCount >= 11) {
              if (!DANGLING_END_WORDS.has(currWordClean) && remainingWords > 2) {
                isBreakPoint = true;
              } else if (currentCount >= 14) {
                isBreakPoint = true;
              }
            }

            if (isBreakPoint && remainingWords > 0) {
              if (remainingWords >= 4 || currentCount >= 11) {
                chunkSubUnits.push(currentUnit.join(' '));
                currentUnit = [];
              }
            }
          }
          i++;
        }

        if (currentUnit.length > 0) {
          if (currentUnit.length < 4 && chunkSubUnits.length > 0) {
            const prev = chunkSubUnits.pop()!;
            chunkSubUnits.push(prev + ' ' + currentUnit.join(' '));
          } else {
            chunkSubUnits.push(currentUnit.join(' '));
          }
        }
      }

      const totalChars = chunkSubUnits.reduce((acc, u) => acc + u.length, 0) || 1;
      let accumulated = 0;

      for (const unitText of chunkSubUnits) {
        const uLen = unitText.length;
        const startSec = Math.round((cStart + (accumulated / totalChars) * cDuration) * 100) / 100;
        accumulated += uLen;
        const endSec = Math.round((cStart + (accumulated / totalChars) * cDuration) * 100) / 100;
        const durationSec = Math.max(Math.round((endSec - startSec) * 100) / 100, 0.8);

        sentences.push({
          id: `sent-${count}`,
          index: count,
          timeRange: `[${formatTime(startSec)} - ${formatTime(endSec)}]`,
          startSec,
          endSec,
          durationSec,
          text: unitText,
          highlightedHtml: applyHighlights(unitText),
        });
        count++;
      }
    }

    // Post-processing Pass: Merge tiny 1-3 word fragments into adjacent sentences
    const mergedSentences: SentenceItem[] = [];
    for (const s of sentences) {
      const words = s.text.trim().split(/\s+/).filter(Boolean);
      if (words.length < 4 && mergedSentences.length > 0) {
        const prev = mergedSentences[mergedSentences.length - 1];
        prev.text = prev.text.trim() + ' ' + s.text.trim();
        prev.endSec = Math.max(prev.endSec, s.endSec);
        prev.durationSec = Math.max(Math.round((prev.endSec - prev.startSec) * 100) / 100, 0.8);
        prev.timeRange = `[${formatTime(prev.startSec)} - ${formatTime(prev.endSec)}]`;
        prev.highlightedHtml = applyHighlights(prev.text);
      } else {
        mergedSentences.push(s);
      }
    }

    if (mergedSentences.length > 1 && mergedSentences[0].text.trim().split(/\s+/).filter(Boolean).length < 4) {
      const first = mergedSentences.shift()!;
      mergedSentences[0].text = first.text.trim() + ' ' + mergedSentences[0].text.trim();
      mergedSentences[0].startSec = first.startSec;
      mergedSentences[0].durationSec = Math.max(Math.round((mergedSentences[0].endSec - mergedSentences[0].startSec) * 100) / 100, 0.8);
      mergedSentences[0].timeRange = `[${formatTime(first.startSec)} - ${formatTime(mergedSentences[0].endSec)}]`;
      mergedSentences[0].highlightedHtml = applyHighlights(mergedSentences[0].text);
    }

    // Pass 2: Merge non-terminal sentence fragments where combined length <= 16 words
    const finalMerged: SentenceItem[] = [];
    for (const s of mergedSentences) {
      if (finalMerged.length > 0) {
        const prev = finalMerged[finalMerged.length - 1];
        const prevHasTerminal = /[.?!]["']?$/.test(prev.text.trim());
        const combWords = prev.text.trim().split(/\s+/).length + s.text.trim().split(/\s+/).length;
        if (!prevHasTerminal && combWords <= 16) {
          prev.text = prev.text.trim() + ' ' + s.text.trim();
          prev.endSec = Math.max(prev.endSec, s.endSec);
          prev.durationSec = Math.max(Math.round((prev.endSec - prev.startSec) * 100) / 100, 0.8);
          prev.timeRange = `[${formatTime(prev.startSec)} - ${formatTime(prev.endSec)}]`;
          prev.highlightedHtml = applyHighlights(prev.text);
          continue;
        }
      }
      finalMerged.push(s);
    }

    for (let idx = 0; idx < finalMerged.length; idx++) {
      finalMerged[idx].index = idx + 1;
      finalMerged[idx].id = `sent-${idx + 1}`;
    }

    return finalMerged;
  }

  private persist() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.items, null, 2), 'utf-8');
    } catch (e: any) {
      this.logger.error(`Failed to persist history: ${e.message}`);
    }
  }

  findAll(track?: string): HistoryItem[] {
    if (track && track !== 'all') {
      return this.items.filter((i) => i.track === track);
    }
    return [...this.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  findById(id: string): HistoryItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  findByUrlOrVideoId(url: string, videoId?: string): HistoryItem | undefined {
    const cleanUrl = url ? url.trim().toLowerCase() : '';
    return this.items.find((i) => {
      if (cleanUrl && i.sourceUrl && i.sourceUrl.trim().toLowerCase() === cleanUrl) return true;
      if (videoId && i.videoId && i.videoId.toLowerCase() === videoId.toLowerCase() && i.track === 'shadowing') return true;
      return false;
    });
  }

  create(item: HistoryItem): HistoryItem {
    // Check if an existing item matches by ID, sourceUrl, or shadowing videoId
    const existingIndex = this.items.findIndex((i) => {
      if (item.id && i.id === item.id) return true;
      if (item.track === 'shadowing' && i.track === 'shadowing') {
        if (item.videoId && i.videoId && i.videoId.toLowerCase() === item.videoId.toLowerCase()) return true;
        if (item.sourceUrl && i.sourceUrl && i.sourceUrl.toLowerCase() === item.sourceUrl.toLowerCase()) return true;
      } else if (item.track === i.track && item.sourceUrl && i.sourceUrl && item.sourceUrl.toLowerCase() === i.sourceUrl.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (existingIndex >= 0) {
      // Retain or maximize completed drills count
      item.completedDrills = Math.max(item.completedDrills || 0, this.items[existingIndex].completedDrills || 0);
      item.id = this.items[existingIndex].id; // Keep stable ID
      this.items[existingIndex] = item;
      this.logger.log(`Updated existing session in database: ${item.title} (${item.id})`);
    } else {
      this.items.unshift(item);
      this.logger.log(`Created new session in database: ${item.title} (${item.id})`);
    }

    this.persist();
    return item;
  }

  update(id: string, updates: Partial<HistoryItem>): HistoryItem | undefined {
    const item = this.findById(id);
    if (!item) return undefined;
    Object.assign(item, updates);
    this.persist();
    return item;
  }

  delete(id: string): boolean {
    const initialLen = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length !== initialLen) {
      this.persist();
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.items = [];
    this.persist();
    this.logger.log('All practice history has been completely cleared.');
  }

  resetWith(items: HistoryItem[]): void {
    this.items = items;
    this.persist();
    this.logger.log(`History reset with ${items.length} initial items.`);
  }

  resetToDefaultShowcase(): HistoryItem[] {
    this.clearAll();
    this.logger.log('History cleared to clean production state.');
    return [];
  }

  getDefaultShowcaseItems(): HistoryItem[] {
    return [];
  }

  incrementDrill(id: string): HistoryItem | undefined {
    const item = this.findById(id);
    if (item) {
      item.completedDrills = (item.completedDrills || 0) + 1;
      this.persist();
    }
    return item;
  }
}
