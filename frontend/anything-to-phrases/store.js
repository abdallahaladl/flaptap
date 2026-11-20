/* ==========================================================================
   ANYTHING TO PHRASES — SHARED FEATURE STORE & DOMAIN HELPERS (store.js)
   Single responsibility: shared state cache, pub-sub synchronization,
   source-type detection, study-state calculations, and pure formatters.
   Pages communicate exclusively through this store + router callbacks.
   ========================================================================== */

(function (global) {
  'use strict';

  const OPTIONS_STORAGE_KEY = 'flaptap_aex_options';
  const LANGUAGE_STORAGE_KEY = 'flaptap_trans_lang';

  const FALLBACK_LANGUAGES = [
    { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
    { code: 'en', name: 'English', native: 'English' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  ];

  const DEFAULT_OPTIONS = {
    extractionType: 'all',
    style: 'auto',
    level: 'all',
    focus: 'balanced',
    depth: 'adaptive',
    studyGoal: 'full',
    order: 'appearance',
  };

  const OPTION_SPECS = [
    {
      key: 'extractionType',
      selectId: 'aex-type-select',
      configKey: 'extractionTypes',
      fallback: [
        { id: 'all', label: 'All types (Balanced)', shortLabel: 'All types' },
        { id: 'phrases', label: 'Multi-word phrases only', shortLabel: 'Phrases only' },
        { id: 'idiom', label: 'Idioms & expressions', shortLabel: 'Idioms' },
        { id: 'phrasal_verb', label: 'Phrasal verbs', shortLabel: 'Phrasal verbs' },
        { id: 'collocation', label: 'Collocations', shortLabel: 'Collocations' },
        { id: 'slang', label: 'Slang & street talk', shortLabel: 'Slang' },
        { id: 'connected_speech', label: 'Connected speech', shortLabel: 'Connected speech' },
        { id: 'discourse_marker', label: 'Discourse markers', shortLabel: 'Discourse markers' },
        { id: 'pattern', label: 'Sentence patterns', shortLabel: 'Patterns' },
        { id: 'vocabulary', label: 'Vocabulary & hard words', shortLabel: 'Vocabulary' },
      ],
    },
    {
      key: 'style',
      selectId: 'aex-style-select',
      configKey: 'styles',
      fallback: [
        { id: 'auto', label: 'Auto (Match source)', shortLabel: 'Auto style' },
        { id: 'casual_spoken', label: 'Casual spoken', shortLabel: 'Casual spoken' },
        { id: 'american_slang', label: 'American slang', shortLabel: 'American slang' },
        { id: 'standard_american', label: 'Standard American', shortLabel: 'Standard English' },
        { id: 'professional_workplace', label: 'Professional & tech', shortLabel: 'Professional' },
        { id: 'academic_formal', label: 'Formal & academic', shortLabel: 'Formal & academic' },
        { id: 'modern_internet', label: 'Internet & creator', shortLabel: 'Internet & creator' },
      ],
    },
    {
      key: 'level',
      selectId: 'aex-level-select',
      configKey: 'levels',
      fallback: [
        { id: 'all', label: 'Adaptive (All levels)', shortLabel: 'All levels' },
        { id: 'b1_b2', label: 'B1–B2 · Intermediate bridge', shortLabel: 'B1–B2' },
        { id: 'b2_c2', label: 'B2–C2 · Advanced fluency', shortLabel: 'B2–C2' },
        { id: 'a1_a2', label: 'A1–A2 · Foundational', shortLabel: 'A1–A2' },
        { id: 'a1', label: 'A1 · Beginner', shortLabel: 'A1' },
        { id: 'a2', label: 'A2 · Elementary', shortLabel: 'A2' },
        { id: 'b1', label: 'B1 · Intermediate', shortLabel: 'B1' },
        { id: 'b2', label: 'B2 · Upper-Intermediate', shortLabel: 'B2' },
        { id: 'c1', label: 'C1 · Advanced', shortLabel: 'C1' },
        { id: 'c2', label: 'C2 · Mastery', shortLabel: 'C2' },
      ],
    },
    {
      key: 'focus',
      selectId: 'aex-focus-select',
      configKey: 'focuses',
      fallback: [
        { id: 'balanced', label: 'Any topic', shortLabel: 'Any topic' },
        { id: 'everyday', label: 'Everyday & social', shortLabel: 'Everyday' },
        { id: 'professional', label: 'Tech & work', shortLabel: 'Tech & work' },
        { id: 'creator', label: 'Creator & podcast', shortLabel: 'Creator & podcast' },
        { id: 'media', label: 'Movies & TV', shortLabel: 'Movies & TV' },
        { id: 'news_tech', label: 'News & essays', shortLabel: 'News & essays' },
      ],
    },
    {
      key: 'depth',
      selectId: 'aex-depth-select',
      configKey: 'depths',
      fallback: [
        { id: 'adaptive', label: 'Adaptive', shortLabel: 'Adaptive' },
        { id: 'essentials', label: 'Essentials (5–8)', shortLabel: 'Top 5–8' },
        { id: 'focused', label: 'Focused (10–15)', shortLabel: '10–15 items' },
        { id: 'comprehensive', label: 'Comprehensive (Deep)', shortLabel: 'Deep sweep' },
      ],
    },
    {
      key: 'studyGoal',
      selectId: 'aex-goal-select',
      configKey: 'studyGoals',
      fallback: [
        { id: 'full', label: 'Full study guide', shortLabel: 'Full study' },
        { id: 'speaking', label: 'Speaking & pronunciation', shortLabel: 'Speaking' },
        { id: 'active_recall', label: 'Pitfalls & recall', shortLabel: 'Recall' },
        { id: 'workplace', label: 'Workplace tone', shortLabel: 'Workplace' },
        { id: 'flashcards', label: 'Quick flashcards', shortLabel: 'Flashcards' },
      ],
    },
    {
      key: 'order',
      selectId: 'aex-order-select',
      configKey: 'orders',
      fallback: [
        { id: 'appearance', label: 'Source order', shortLabel: 'Source order' },
        { id: 'importance', label: 'Most useful first', shortLabel: 'Most useful' },
        { id: 'difficulty', label: 'Hardest first', shortLabel: 'Hardest first' },
      ],
    },
  ];

  const CATEGORIES_CATALOG = [
    { id: 'all', label: 'All categories', group: 'all', audioDependent: false },
    { id: 'pattern', label: 'Sentence Patterns', group: 'core', audioDependent: false },
    { id: 'vocabulary', label: 'Vocabulary', group: 'core', audioDependent: false },
    { id: 'idiom', label: 'Idioms', group: 'core', audioDependent: false },
    { id: 'phrasal_verb', label: 'Phrasal Verbs', group: 'core', audioDependent: false },
    { id: 'collocation', label: 'Collocations', group: 'core', audioDependent: false },
    { id: 'slang', label: 'Slang & Informal Expressions', group: 'core', audioDependent: false },
    { id: 'conversational_expression', label: 'Conversational Expressions', group: 'core', audioDependent: false },
    { id: 'grammar_structure', label: 'Grammar Structures', group: 'core', audioDependent: false },
    { id: 'discourse_marker', label: 'Discourse Markers', group: 'core', audioDependent: false },
    { id: 'filler', label: 'Fillers', group: 'core', audioDependent: false },
    { id: 'interjection', label: 'Interjections', group: 'core', audioDependent: false },
    { id: 'contraction_reduction', label: 'Contractions & Reductions', group: 'core', audioDependent: false },
    { id: 'metaphor_figurative', label: 'Metaphors & Figurative Language', group: 'core', audioDependent: false },
    { id: 'cultural_reference', label: 'American Cultural References', group: 'core', audioDependent: false },
    { id: 'pragmatics_context', label: 'Pragmatics & Social Context', group: 'core', audioDependent: false },
    { id: 'native_response', label: 'Native-like Responses & Reactions', group: 'core', audioDependent: false },
    { id: 'connected_speech', label: 'Connected Speech', group: 'audio', audioDependent: true },
    { id: 'pronunciation_phonetics', label: 'Pronunciation & Phonetics', group: 'audio', audioDependent: true },
    { id: 'word_sentence_stress', label: 'Word Stress & Sentence Stress', group: 'audio', audioDependent: true },
    { id: 'linking_sound_changes', label: 'Linking & Sound Changes', group: 'audio', audioDependent: true },
  ];

  const AUDIO_CATEGORY_SET = new Set(
    CATEGORIES_CATALOG.filter((c) => c.audioDependent).map((c) => c.id),
  );

  function isAudioDependentCategory(id) {
    return AUDIO_CATEGORY_SET.has(String(id || '').trim().toLowerCase());
  }

  function categoriesCatalog() {
    if (Array.isArray(state.config?.categories) && state.config.categories.length >= 20) {
      return state.config.categories;
    }
    return CATEGORIES_CATALOG;
  }

  const CATEGORY_LABELS = Object.fromEntries(
    CATEGORIES_CATALOG.filter((c) => c.id !== 'all').map((c) => [c.id, c.label]),
  );

  const SOURCE_TYPE_LABELS = {
    youtube: 'YouTube',
    social_video: 'Social video',
    audio: 'Audio',
    video: 'Video',
    article: 'Article',
    pdf: 'PDF',
    text: 'Text',
    markdown: 'Markdown',
    image: 'Image OCR',
    lesson: 'Saved lesson',
  };

  const STUDY_STATE_LABELS = {
    new: 'Not started',
    progress: 'In progress',
    done: 'Completed',
  };

  const LEMMA_STOPWORDS = new Set([
    'a', 'an', 'the', 'to', 'one', "one's", 'somebody', "somebody's", 'someone', "someone's",
    'your', 'our', 'their', 'my', 'his', 'her', 'its', 'it', 'this', 'that', 'these', 'those',
  ]);

  const listeners = new Map();

  const state = {
    activeView: 'extract',
    config: null,
    recentHistory: [],
    historyTotal: 0,
    stats: {
      totalGuides: 0,
      totalItems: 0,
      completedGuides: 0,
      inProgressGuides: 0,
    },
    notesCache: new Map(),
    lessonSources: [],
    lessonSourcesLoaded: false,
    savedTerms: new Set(),
    preferredLanguage: '',
  };

  function subscribe(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`FlaptapA2PStore [${event}] listener error:`, err);
      }
    }
  }

  function ws() {
    return global.FlaptapWorkspace || null;
  }

  function currentUser() {
    return ws()?.getUser?.() || null;
  }

  function languages() {
    const list = ws()?.getLanguages?.() || [];
    return list.length > 0 ? list : FALLBACK_LANGUAGES;
  }

  function languageByCode(code) {
    return languages().find((l) => l.code === code) || null;
  }

  function getPreferredLanguage() {
    if (state.preferredLanguage) return state.preferredLanguage;
    return (
      currentUser()?.nativeLanguage ||
      safeLocalGet(LANGUAGE_STORAGE_KEY) ||
      'ar'
    );
  }

  function setPreferredLanguage(code) {
    const clean = String(code || '').trim();
    if (!clean) return;
    state.preferredLanguage = clean;
    safeLocalSet(LANGUAGE_STORAGE_KEY, clean);
    emit('language:changed', clean);
  }

  function loadSavedOptions() {
    try {
      const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_OPTIONS };
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? { ...DEFAULT_OPTIONS, ...parsed }
        : { ...DEFAULT_OPTIONS };
    } catch {
      return { ...DEFAULT_OPTIONS };
    }
  }

  function saveOptions(opts) {
    safeLocalSet(OPTIONS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_OPTIONS, ...(opts || {}) }));
  }

  function setConfig(cfg) {
    state.config = cfg || null;
    emit('config:changed', state.config);
  }

  function setHistorySnapshot(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    state.recentHistory = items.slice(0, 6);
    state.historyTotal = Number(payload?.total) || items.length;
    if (payload?.stats) {
      state.stats = { ...payload.stats };
    } else {
      state.stats = {
        totalGuides: state.historyTotal,
        totalItems: items.reduce((sum, i) => sum + (Number(i.item_count) || 0), 0),
        completedGuides: items.filter((i) => historyStudyState(i).tone === 'done').length,
        inProgressGuides: items.filter((i) => historyStudyState(i).tone === 'progress').length,
      };
    }
    emit('history:changed', {
      recent: state.recentHistory,
      total: state.historyTotal,
      stats: state.stats,
    });
  }

  function setLessonSources(items) {
    state.lessonSources = Array.isArray(items) ? items : [];
    state.lessonSourcesLoaded = true;
    emit('lessons:changed', state.lessonSources);
  }

  function cacheNote(note) {
    if (!note?.id) return;
    state.notesCache.set(note.id, note);
    // Keep cache bounded
    if (state.notesCache.size > 30) {
      const oldest = state.notesCache.keys().next().value;
      if (oldest) state.notesCache.delete(oldest);
    }
  }

  function getCachedNote(id) {
    return id ? state.notesCache.get(id) || null : null;
  }

  function updateCachedNoteMeta(id, patch) {
    if (!id || !patch) return;
    const cached = state.notesCache.get(id);
    if (cached) {
      Object.assign(cached, patch);
    }
    const recentEntry = state.recentHistory.find((row) => row.id === id);
    if (recentEntry) {
      if (typeof patch.title === 'string') recentEntry.title = patch.title;
      if (typeof patch.isCompleted === 'boolean') recentEntry.is_completed = patch.isCompleted ? 1 : 0;
      if (typeof patch.completedCount === 'number') recentEntry.completed_count = patch.completedCount;
    }
    emit('note:updated', { id, patch });
    emit('history:changed', {
      recent: state.recentHistory,
      total: state.historyTotal,
      stats: state.stats,
    });
  }

  function removeNoteFromCache(id) {
    if (!id) return;
    state.notesCache.delete(id);
    const existed = state.recentHistory.some((r) => r.id === id);
    if (existed) {
      state.recentHistory = state.recentHistory.filter((r) => r.id !== id);
    }
    state.historyTotal = Math.max(0, state.historyTotal - 1);
    state.stats.totalGuides = state.historyTotal;
    emit('note:deleted', { id });
    emit('history:changed', {
      recent: state.recentHistory,
      total: state.historyTotal,
      stats: state.stats,
    });
  }

  function resetUserData() {
    state.recentHistory = [];
    state.historyTotal = 0;
    state.stats = { totalGuides: 0, totalItems: 0, completedGuides: 0, inProgressGuides: 0 };
    state.notesCache.clear();
    state.lessonSources = [];
    state.lessonSourcesLoaded = false;
    state.savedTerms.clear();
    emit('history:changed', { recent: [], total: 0, stats: state.stats });
    emit('lessons:changed', []);
  }

  /* ========================================================================
     SOURCE-TYPE DETECTION & VALIDATION (INSTANT CLIENT FEEDBACK)
     ======================================================================== */

  function isPrivateHost(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h || h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
    if (/\.(local|internal|localhost|lan)$/.test(h)) return true;
    if (/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
    return !h.includes('.');
  }

  function detectUrlSource(raw) {
    const value = String(raw || '').trim();
    if (!value) {
      return { empty: true, valid: false, kind: 'none', label: '', pipeline: '', tone: 'neutral', error: '' };
    }

    // Bare 11-char YouTube ID shortcut
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
      return {
        empty: false,
        valid: true,
        kind: 'youtube',
        label: 'YouTube ID',
        pipeline: 'Fast captions + speech fallback',
        tone: 'video',
        normalizedUrl: `https://www.youtube.com/watch?v=${value}`,
        error: '',
      };
    }

    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      const maybeWithScheme = /^[\w-]+(\.[\w-]+)+/.test(value);
      return {
        empty: false,
        valid: false,
        kind: 'invalid',
        label: 'Invalid link',
        pipeline: '',
        tone: 'error',
        error: maybeWithScheme
          ? 'Include https:// at the start of the link.'
          : 'Enter a valid http(s) URL (video, social clip, podcast, or article).',
      };
    }

    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return {
        empty: false,
        valid: false,
        kind: 'invalid',
        label: 'Unsupported protocol',
        pipeline: '',
        tone: 'error',
        error: 'Only public http:// and https:// links are supported.',
      };
    }

    const host = parsed.hostname.toLowerCase();
    if (isPrivateHost(host)) {
      return {
        empty: false,
        valid: false,
        kind: 'blocked',
        label: 'Private address',
        pipeline: '',
        tone: 'error',
        error: 'Localhost and private network links cannot be fetched.',
      };
    }

    const pathLower = parsed.pathname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('youtube-nocookie.com')) {
      return {
        empty: false,
        valid: true,
        kind: 'youtube',
        label: 'YouTube',
        pipeline: 'Captions + original video',
        tone: 'video',
        hasAudio: true,
        hasVideo: true,
        normalizedUrl: value,
        error: '',
      };
    }
    if (host.includes('tiktok.com')) {
      return { empty: false, valid: true, kind: 'social_video', label: 'TikTok', pipeline: 'Speech-to-text', tone: 'social', hasAudio: true, hasVideo: true, normalizedUrl: value, error: '' };
    }
    if (host.includes('instagram.com')) {
      return { empty: false, valid: true, kind: 'social_video', label: 'Instagram', pipeline: 'Speech-to-text', tone: 'social', hasAudio: true, hasVideo: true, normalizedUrl: value, error: '' };
    }
    if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(host)) {
      return { empty: false, valid: true, kind: 'social_video', label: 'X / Twitter', pipeline: 'Article or speech', tone: 'social', hasAudio: true, hasVideo: true, normalizedUrl: value, error: '' };
    }
    if (host.includes('vimeo.com') || host.includes('loom.com') || host.includes('twitch.tv') || host.includes('ted.com')) {
      const name = host.includes('vimeo') ? 'Vimeo' : host.includes('loom') ? 'Loom' : host.includes('twitch') ? 'Twitch' : 'TED';
      return { empty: false, valid: true, kind: 'video', label: name, pipeline: 'Captions or speech-to-text', tone: 'video', hasAudio: true, hasVideo: true, normalizedUrl: value, error: '' };
    }
    if (/\.(mp3|m4a|wav|aac|flac|ogg|opus)(?:$|\?)/i.test(pathLower)) {
      return { empty: false, valid: true, kind: 'audio', label: 'Audio file', pipeline: 'Speech-to-text', tone: 'audio', hasAudio: true, hasVideo: false, normalizedUrl: value, error: '' };
    }
    if (/\.(mp4|mov|webm|mkv)(?:$|\?)/i.test(pathLower)) {
      return { empty: false, valid: true, kind: 'video', label: 'Direct video', pipeline: 'Speech-to-text', tone: 'video', hasAudio: true, hasVideo: true, normalizedUrl: value, error: '' };
    }
    return {
      empty: false,
      valid: true,
      kind: 'article',
      label: host.replace(/^www\./, ''),
      pipeline: 'Web article reader',
      tone: 'article',
      hasAudio: false,
      hasVideo: false,
      normalizedUrl: value,
      error: '',
    };
  }

  function detectFileSource(file, maxMb = 50) {
    if (!file) return null;
    const name = String(file.name || 'upload');
    const ext = (name.match(/(\.[a-z0-9]{1,8})$/i)?.[1] || '').toLowerCase();
    const mime = String(file.type || '').toLowerCase();
    const sizeMb = file.size / (1024 * 1024);
    const sizeLabel = sizeMb >= 1 ? `${sizeMb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;

    if (file.size > maxMb * 1024 * 1024) {
      return { valid: false, label: 'File too large', pipeline: '', sizeLabel, tone: 'error', hasAudio: false, hasVideo: false, error: `Choose a file smaller than ${maxMb} MB.` };
    }
    if (mime === 'application/pdf' || ext === '.pdf') {
      return { valid: true, label: 'PDF Document', pipeline: 'PDF text extraction', sizeLabel, tone: 'text', hasAudio: false, hasVideo: false, error: '' };
    }
    if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(ext)) {
      return { valid: true, label: 'Image · Vision OCR', pipeline: 'Multimodal OCR + extraction', sizeLabel, tone: 'image', hasAudio: false, hasVideo: false, error: '' };
    }
    if (mime.startsWith('audio/') || /\.(mp3|m4a|wav|aac|flac|ogg|opus)$/.test(ext)) {
      return { valid: true, label: 'Audio · Speech-to-Text', pipeline: 'Whisper transcription + audio clips', sizeLabel, tone: 'audio', hasAudio: true, hasVideo: false, error: '' };
    }
    if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(ext)) {
      return { valid: true, label: 'Video · Speech-to-Text', pipeline: 'Audio transcription + video clips', sizeLabel, tone: 'video', hasAudio: true, hasVideo: true, error: '' };
    }
    if (/\.(srt|vtt)$/.test(ext)) {
      return { valid: true, label: 'Subtitles', pipeline: 'Timestamp cleanup + extraction', sizeLabel, tone: 'text', hasAudio: false, hasVideo: false, error: '' };
    }
    if (/\.(md|markdown)$/.test(ext)) {
      return { valid: true, label: 'Markdown', pipeline: 'Markdown cleanup + extraction', sizeLabel, tone: 'text', hasAudio: false, hasVideo: false, error: '' };
    }
    if (mime.startsWith('text/') || /\.(txt|json|csv|log)$/.test(ext) || mime === 'application/json') {
      return { valid: true, label: 'Document', pipeline: 'Direct text extraction', sizeLabel, tone: 'text', hasAudio: false, hasVideo: false, error: '' };
    }
    return {
      valid: false,
      label: 'Unsupported file',
      pipeline: '',
      sizeLabel,
      tone: 'error',
      hasAudio: false,
      hasVideo: false,
      error: 'Upload PDF, text, Markdown, subtitles (.srt/.vtt), JSON, screenshots, audio, or video.',
    };
  }

  function estimateTextStats(text) {
    const value = String(text || '');
    const trimmed = value.trim();
    const words = (trimmed.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
    const chars = trimmed.length;
    const chunks = chars > 14000 ? Math.min(6, Math.ceil(chars / 14000)) : chars > 0 ? 1 : 0;
    const readMin = Math.max(1, Math.round(words / 200));
    return {
      words,
      chars,
      chunks,
      readMin,
      tooShort: chars > 0 && chars < 20,
      veryLong: chars > 72000,
    };
  }

  /* ========================================================================
     STUDY STATE & VOCABULARY HELPERS
     ======================================================================== */

  function completedIndexSet(note) {
    return new Set(
      Array.isArray(note?.completionProgress?.items)
        ? note.completionProgress.items.map(Number)
        : [],
    );
  }

  function studyState({ total, done }) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeDone = Math.max(0, Math.min(safeTotal, Number(done) || 0));
    const tone =
      safeTotal > 0 && safeDone >= safeTotal
        ? 'done'
        : safeDone > 0
          ? 'progress'
          : 'new';
    return {
      total: safeTotal,
      done: safeDone,
      remaining: Math.max(0, safeTotal - safeDone),
      tone,
      label: STUDY_STATE_LABELS[tone],
      pct: safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0,
    };
  }

  function noteStudyState(note) {
    return studyState({
      total: Array.isArray(note?.items) ? note.items.length : 0,
      done: completedIndexSet(note).size,
    });
  }

  function historyStudyState(item) {
    return studyState({
      total: Number(item?.item_count) || 0,
      done: Number(item?.completed_count) || 0,
    });
  }

  function normalizeTerm(term) {
    return String(term || '')
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function termSignature(term) {
    return String(term || '')
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^\p{L}\p{N}'\s-]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.replace(/^['-]+|['-]+$/g, ''))
      .filter((token) => token && !LEMMA_STOPWORDS.has(token))
      .map((token) => {
        let stem = token.replace(/['’]s$/, '');
        if (stem.length > 4 && /ies$/.test(stem)) stem = `${stem.slice(0, -3)}y`;
        else if (stem.length > 4 && /ing$/.test(stem)) stem = stem.slice(0, -3);
        else if (stem.length > 4 && /ed$/.test(stem)) stem = stem.slice(0, -2);
        else if (stem.length > 4 && /es$/.test(stem)) stem = stem.slice(0, -2);
        else if (stem.length > 3 && /s$/.test(stem)) stem = stem.slice(0, -1);
        if (stem.length > 3 && /e$/.test(stem)) stem = stem.slice(0, -1);
        return stem;
      })
      .filter(Boolean)
      .join(' ');
  }

  function isTermSaved(term) {
    const key = normalizeTerm(term);
    if (!key) return false;
    if (state.savedTerms.has(key)) return true;

    const signature = termSignature(term);
    if (signature && state.savedTerms.has(`sig:${signature}`)) return true;

    if (ws()?.isVocabularySaved?.(term)) return true;

    const vocabulary = global.flaptapState?.vocabItems;
    if (Array.isArray(vocabulary) && signature) {
      return vocabulary.some((entry) => termSignature(entry?.term) === signature);
    }
    return false;
  }

  function rememberSaved(term) {
    const key = normalizeTerm(term);
    if (key) state.savedTerms.add(key);
    const signature = termSignature(term);
    if (signature) state.savedTerms.add(`sig:${signature}`);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatTime(ms) {
    const seconds = Number(ms) / 1000;
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    return `${seconds.toFixed(1)}s`;
  }

  function formatDuration(seconds) {
    const total = Math.round(Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
  }

  function sourceBadgeHtml(sourceType) {
    const escapeHtml = global.FlaptapUtils.escapeHtml;
    const label = SOURCE_TYPE_LABELS[sourceType] || 'Source';
    const modifier =
      sourceType === 'youtube' || sourceType === 'video'
        ? ' is-video'
        : sourceType === 'social_video'
          ? ' is-social'
          : sourceType === 'image'
            ? ' is-image'
            : sourceType === 'audio'
              ? ' is-audio'
              : '';
    return `<span class="aex-source-badge${modifier}">${escapeHtml(label)}</span>`;
  }

  function studyStateChipHtml(stats) {
    const escapeHtml = global.FlaptapUtils.escapeHtml;
    return `<span class="sp-state sp-state--${stats.tone}">${escapeHtml(stats.label)}</span>`;
  }

  function studyStateTrackHtml(stats, options = {}) {
    const escapeHtml = global.FlaptapUtils.escapeHtml;
    const label = `${stats.done} of ${stats.total} studied`;
    return `
      <span class="aex-card-track"${
        options.decorative
          ? ' aria-hidden="true"'
          : ` role="progressbar" aria-valuemin="0" aria-valuemax="${stats.total}" aria-valuenow="${stats.done}" aria-label="${escapeHtml(label)}"`
      }>
        <span class="aex-card-track-fill" style="width:${stats.pct}%"></span>
      </span>
    `;
  }

  function studyStateCount(stats) {
    if (stats.total === 0) return 'No phrases';
    return `${stats.done} / ${stats.total}`;
  }

  function highlightTerm(sentence, term, surface) {
    const escapeHtml = global.FlaptapUtils.escapeHtml;
    const text = String(sentence || '');
    if (!text) return '';
    const candidates = [surface, term].map((s) => String(s || '').trim()).filter(Boolean);
    if (candidates.length === 0) return escapeHtml(text);

    for (const candidate of candidates) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
      let regex;
      try {
        regex = new RegExp(
          `(?<![\\p{L}\\p{N}_])(${escaped}(?:['’]?s|es|ed|d|ing|er|ers)?)(?![\\p{L}\\p{N}_])`,
          'giu',
        );
      } catch {
        continue;
      }
      const matches = Array.from(text.matchAll(regex));
      if (matches.length === 0) continue;

      let output = '';
      let lastIndex = 0;
      for (const match of matches) {
        const index = match.index ?? 0;
        output += escapeHtml(text.slice(lastIndex, index));
        output += `<mark class="lexicon-highlight">${escapeHtml(match[1])}</mark>`;
        lastIndex = index + match[0].length;
      }
      output += escapeHtml(text.slice(lastIndex));
      return output;
    }
    return escapeHtml(text);
  }

  function safeLocalGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function safeLocalSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch {}
  }

  global.FlaptapA2PStore = {
    DEFAULT_OPTIONS,
    OPTION_SPECS,
    CATEGORIES_CATALOG,
    CATEGORY_LABELS,
    SOURCE_TYPE_LABELS,
    STUDY_STATE_LABELS,
    categoriesCatalog,
    isAudioDependentCategory,
    state,
    subscribe,
    emit,
    currentUser,
    languages,
    languageByCode,
    getPreferredLanguage,
    setPreferredLanguage,
    loadSavedOptions,
    saveOptions,
    setConfig,
    setHistorySnapshot,
    setLessonSources,
    cacheNote,
    getCachedNote,
    updateCachedNoteMeta,
    removeNoteFromCache,
    resetUserData,
    detectUrlSource,
    detectFileSource,
    estimateTextStats,
    completedIndexSet,
    studyState,
    noteStudyState,
    historyStudyState,
    isTermSaved,
    rememberSaved,
    formatDate,
    formatTime,
    formatDuration,
    sourceBadgeHtml,
    studyStateChipHtml,
    studyStateTrackHtml,
    studyStateCount,
    highlightTerm,
  };
})(window);
