/* ==========================================================================
   FLAPTAP STUDIO ENGINE (studio.js)
   Strict Sign-In Gate · Millisecond Playback Boundaries · 0ms Scalable Modes
   Atomic Button State Synchronization · Dynamic OpenCode Go AI Coach & Lookup
   ========================================================================== */

(function () {
  'use strict';

  const STUDIO_MODES = ['shadow', 'read', 'listen', 'coach', 'notes'];
  const EXACT_SPEED_PRESETS = new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

  const PLAY_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
  const PAUSE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

  const I18N = {
    en: {
      preparingLesson: 'Preparing your lesson...',
      extractingTimings: 'Extracting verbatim speech and exact word timings.',
      backToLibrary: 'Back to Library',
      tryAgain: 'Try Again',
      libraryBack: 'Library',
      layoutSide: 'Side',
      layoutTop: 'Top',
      layoutFocus: 'Focus',
      exportMd: 'Export .md',
      completeSession: 'Complete',
      ttsHint: 'Powered by browser speech synthesis synced to your speed setting.',
      playbackFlowLabel: 'Sentence Flow',
      flowPause: 'Auto-Pause',
      flowLoop: 'Loop',
      flowContinue: 'Continuous',
      playbackSpeedLabel: 'Playback Speed',
      voiceRecorderLabel: 'Voice Comparison',
      recReady: 'Ready',
      recRecording: 'Recording...',
      recSaved: 'Take ready',
      recordVoice: 'Record Voice',
      stopRecord: 'Stop',
      hearSpeaker: 'Speaker',
      keyPlay: 'Play/Pause',
      keyPrevNext: 'Prev/Next',
      keyLoop: 'Loop',
      keyTrans: 'Translate',
      modeShadow: 'Shadow',
      modeRead: 'Read',
      modeListen: 'Listen',
      modeCoach: 'Coach',
      modeNotes: 'Notes',
      showTranslation: 'Show Translation',
      legendConnected: 'Connected Speech',
      legendExpressions: 'Expressions',
      legendVocab: 'Key Vocabulary',
      clickWordTip: 'Tip: Click any word for contextual definition',
      prevBtn: 'Prev',
      nextBtn: 'Next',
      dictEasy: 'Easy',
      dictMedium: 'Medium',
      dictHard: 'Hard',
      playClipBtn: 'Play Sentence',
      pauseClipBtn: 'Pause',
      checkAnswerBtn: 'Check Answer',
      revealBtn: 'Reveal',
      coachAnalyzingTitle: 'Analyzing speaker prosody & connected speech...',
      coachAnalyzingDesc: 'Extracting verbatim reductions, expressions, and contextual vocabulary for this lesson.',
      prosodyBriefKicker: 'Speaker & Prosody Brief',
      refreshAnalysis: 'Refresh',
      coachConnectedHeading: 'Connected Speech & Mouth Mechanics',
      coachExpressionsHeading: 'Expressions, Phrasal Verbs & Idioms',
      coachVocabHeading: 'Key Contextual Vocabulary',
      notebookHeading: 'Study Notebook',
      notebookSub: 'Saved automatically to your library and included in Markdown exports.',
      savedStatus: 'Saved',
      savingStatus: 'Saving...',
      notesPlaceholder: 'Write pronunciation cues, takeaways, or personal example sentences...',
      saveToVocabBtn: '+ Save to Vocabulary',
      savedInVocabBtn: '✓ Saved in Vault',
      savedWordToast: 'Saved to Vocabulary Vault',
      mdExportedToast: 'Study sheet downloaded successfully (.md)',
      sessionCompletedToast: 'Practice session recorded',
      sentencesUnit: 'sentences',
      playBtn: 'Play',
      pauseBtn: 'Pause',
      loopBtn: 'Loop',
      saveBtn: '+ Save',
      savedShortBtn: '✓ Saved',
      translatingStatus: 'Translating...',
      translatedReady: 'Translated',
      errUnavailableHeadline: 'Video unavailable',
      errUnavailableDetail: 'This YouTube video is private, removed, or unavailable in this region.',
      errNoCaptionsHeadline: 'No English captions found',
      errNoCaptionsDetail: 'This video does not expose an English caption track for verbatim timing.',
      errRateLimitHeadline: 'YouTube is temporarily limiting requests',
      errRateLimitDetail: 'YouTube is rate-limiting caption requests right now. Please wait a moment and try again.',
      errTimeoutHeadline: 'Connection timed out',
      errTimeoutDetail: 'YouTube took too long to respond. Please try again.',
    },
    ar: {
      preparingLesson: 'جارٍ تجهيز الدرس...',
      extractingTimings: 'استخراج النص الحرفي والتوقيت الدقيق لكل كلمة.',
      backToLibrary: 'العودة للمكتبة',
      tryAgain: 'إعادة المحاولة',
      libraryBack: 'المكتبة',
      layoutSide: 'جانبي',
      layoutTop: 'علوي',
      layoutFocus: 'تركيز',
      exportMd: 'تصدير .md',
      completeSession: 'إتمام التدريب',
      ttsHint: 'يعمل عبر النطق الصوتي للمتصفح متزامناً مع السرعة المحددة.',
      playbackFlowLabel: 'تدفق الجمل',
      flowPause: 'توقف تلقائي',
      flowLoop: 'تكرار',
      flowContinue: 'متواصل',
      playbackSpeedLabel: 'سرعة التشغيل',
      voiceRecorderLabel: 'مقارنة صوتك',
      recReady: 'جاهز',
      recRecording: 'يسجل...',
      recSaved: 'التسجيل جاهز',
      recordVoice: 'سجّل صوتك',
      stopRecord: 'إيقاف',
      hearSpeaker: 'المتحدث',
      keyPlay: 'تشغيل/إيقاف',
      keyPrevNext: 'السابق/التالي',
      keyLoop: 'تكرار',
      keyTrans: 'ترجمة',
      modeShadow: 'الترديد',
      modeRead: 'القراءة',
      modeListen: 'الإملاء',
      modeCoach: 'المدرب',
      modeNotes: 'الملاحظات',
      showTranslation: 'إظهار الترجمة',
      legendConnected: 'الكلام المتصل',
      legendExpressions: 'التعبيرات',
      legendVocab: 'المفردات',
      clickWordTip: 'اضغط على أي كلمة لمعرفة معناها في السياق',
      prevBtn: 'السابق',
      nextBtn: 'التالي',
      dictEasy: 'سهل',
      dictMedium: 'متوسط',
      dictHard: 'متقدم',
      playClipBtn: 'تشغيل الجملة',
      pauseClipBtn: 'إيقاف مؤقت',
      checkAnswerBtn: 'تحقق من الإجابة',
      revealBtn: 'إظهار الحل',
      coachAnalyzingTitle: 'جارٍ تحليل إيقاع المتحدث والكلام المتصل...',
      coachAnalyzingDesc: 'استخراج الاختصارات الصوتية والتعبيرات والمفردات السياقية بالذكاء الاصطناعي.',
      prosodyBriefKicker: 'ملخص الأداء الصوتي',
      refreshAnalysis: 'تحديث',
      coachConnectedHeading: 'الكلام المتصل وميكانيكا النطق',
      coachExpressionsHeading: 'التعبيرات والأفعال المركبة',
      coachVocabHeading: 'المفردات السياقية المهمة',
      notebookHeading: 'دفتر الملاحظات',
      notebookSub: 'يُحفظ تلقائياً في قاعدة البيانات ويُدرج في ملف التصدير.',
      savedStatus: 'تم الحفظ',
      savingStatus: 'يحفظ...',
      notesPlaceholder: 'دوّن ملاحظات النطق أو الجمل المهمة هنا...',
      saveToVocabBtn: '+ حفظ في المفردات',
      savedInVocabBtn: '✓ محفوظ في المفردات',
      savedWordToast: 'تم الحفظ في خزنة المفردات',
      mdExportedToast: 'تم تحميل ملخص الدرس بنجاح (.md)',
      sessionCompletedToast: 'تم تسجيل إتمام الجلسة',
      sentencesUnit: 'جملة',
      playBtn: 'تشغيل',
      pauseBtn: 'إيقاف',
      loopBtn: 'تكرار',
      saveBtn: '+ حفظ',
      savedShortBtn: '✓ محفوظ',
      translatingStatus: 'جارٍ الترجمة...',
      translatedReady: 'مترجم',
      errUnavailableHeadline: 'الفيديو غير متاح',
      errUnavailableDetail: 'هذا الفيديو غير متاح أو خاص أو تم حذفه من يوتيوب.',
      errNoCaptionsHeadline: 'لا يتوفر نص إنجليزي',
      errNoCaptionsDetail: 'لا يحتوي هذا الفيديو على مسار نصي إنجليزي للتوقيت الصوتي.',
      errRateLimitHeadline: 'يوتيوب يحدّد الطلبات مؤقتًا',
      errRateLimitDetail: 'يوتيوب يحدّد مؤقتًا طلبات النصوص. يرجى المحاولة بعد قليل.',
      errTimeoutHeadline: 'انتهت مهلة الاتصال',
      errTimeoutDetail: 'استغرق يوتيوب وقتاً طويلاً للاستجابة. يرجى المحاولة مرة أخرى.',
    },
    es: {
      libraryBack: 'Biblioteca',
      modeShadow: 'Sombra',
      modeRead: 'Lectura',
      modeListen: 'Dictado',
      modeCoach: 'Coach',
      modeNotes: 'Notas',
      showTranslation: 'Mostrar traducción',
      completeSession: 'Completar',
      mdExportedToast: 'Study sheet downloaded successfully (.md)',
    },
    fr: {
      libraryBack: 'Bibliothèque',
      modeShadow: 'Shadowing',
      modeRead: 'Lecture',
      modeListen: 'Dictée',
      modeCoach: 'Coach',
      modeNotes: 'Notes',
      showTranslation: 'Afficher la traduction',
      completeSession: 'Terminer',
      mdExportedToast: 'Study sheet downloaded successfully (.md)',
    },
    de: {
      libraryBack: 'Bibliothek',
      modeShadow: 'Shadowing',
      modeRead: 'Lesen',
      modeListen: 'Diktat',
      modeCoach: 'Coach',
      modeNotes: 'Notizen',
      showTranslation: 'Übersetzung anzeigen',
      completeSession: 'Abschließen',
      mdExportedToast: 'Study sheet downloaded successfully (.md)',
    },
    tr: {
      libraryBack: 'Kitaplık',
      modeShadow: 'Gölgeleme',
      modeRead: 'Okuma',
      modeListen: 'Dikte',
      modeCoach: 'Koç',
      modeNotes: 'Notlar',
      showTranslation: 'Çeviriyi Göster',
      completeSession: 'Tamamla',
      mdExportedToast: 'Study sheet downloaded successfully (.md)',
    },
  };

  const studioState = {
    uiLang: localStorage.getItem('flaptap_ui_lang') || 'en',
    theme: localStorage.getItem('flaptap_theme') || 'light',
    guestToken: localStorage.getItem('flaptap_guest_token') || '',
    authToken: localStorage.getItem('flaptap_auth_token') || '',
    user: null,
    item: null,
    mode: 'shadow',
    layout: localStorage.getItem('flaptap_studio_layout') || 'side',
    previousNonFocusLayout: 'side',
    ytPlayer: null,
    ytReady: false,
    pendingPlaySentenceIndex: null,
    activeSentence: null,
    isPlaying: false,
    loopSentenceIndex: null,
    endAction: 'pause', // 'pause' | 'loop' | 'continue'
    speed: 1.0,
    seekTargetStart: 0,
    awaitingOnsetUnmute: false,
    lastSeekTime: 0,
    playbackTicker: null,
    translationEnabled: false,
    translationLang: localStorage.getItem('flaptap_trans_lang') || 'ar',
    translationRtl: true,
    languages: [],
    translationsByLang: {},
    analysisInFlight: false,
    dictationIndex: 1,
    dictationLevel: 'medium',
    activeWordLookup: null,
    pendingLookupTerm: '',
    savedTerms: new Set(),
    mediaRecorder: null,
    recordedChunks: [],
    recordedAudioUrl: null,
  };

  window.studioState = studioState;

  function t(key) {
    const dict = I18N[studioState.uiLang] || I18N.en;
    return dict[key] !== undefined ? dict[key] : (I18N.en[key] || key);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeTermKey(term) {
    return String(term || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function redirectToSignInGate() {
    const nextPath = window.location.pathname + window.location.search;
    window.location.replace(`/?auth=required&next=${encodeURIComponent(nextPath)}`);
  }

  function apiHeaders(extra) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (studioState.guestToken) headers['x-guest-token'] = studioState.guestToken;
    if (studioState.authToken) headers['Authorization'] = `Bearer ${studioState.authToken}`;
    return headers;
  }

  async function apiFetch(url, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    opts.headers = apiHeaders(opts.headers);
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      redirectToSignInGate();
      const authErr = new Error(body?.message || 'Authentication required');
      authErr.status = 401;
      authErr.code = 'auth_required';
      throw authErr;
    }
    if (!res.ok) {
      const err = new Error(body?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = body?.code;
      throw err;
    }
    return body;
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('studio-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
  }

  /* Theme & UI Language */
  function applyTheme(theme) {
    studioState.theme = theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('flaptap_theme', studioState.theme);
    document.documentElement.setAttribute('data-theme', studioState.theme);
    const sun = document.getElementById('studio-icon-sun');
    const moon = document.getElementById('studio-icon-moon');
    if (sun && moon) {
      sun.hidden = studioState.theme !== 'dark';
      moon.hidden = studioState.theme === 'dark';
    }
  }

  function applyUiLanguage(lang) {
    studioState.uiLang = I18N[lang] ? lang : 'en';
    localStorage.setItem('flaptap_ui_lang', studioState.uiLang);
    document.documentElement.setAttribute('lang', studioState.uiLang);
    document.documentElement.setAttribute('dir', studioState.uiLang === 'ar' ? 'rtl' : 'ltr');

    const sel = document.getElementById('studio-ui-lang-select');
    if (sel) sel.value = studioState.uiLang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });

    if (studioState.item) {
      const sentTotalEl = document.getElementById('studio-sentence-total');
      if (sentTotalEl) {
        sentTotalEl.textContent = `${(studioState.item.sentences || []).length} ${t('sentencesUnit')}`;
      }
    }

    syncPlaybackButtonsDom();
    syncSavedButtonsDom();
  }

  /* ========================================================================
     ATOMIC PLAYBACK & BUTTON STATE SYNCHRONIZATION
     Prevents stale `.active` / `aria-pressed` across Loop, Play, Flow & Save
     ======================================================================== */

  function syncPlaybackButtonsDom() {
    const activeIdx = studioState.activeSentence?.index ?? null;
    const loopIdx = studioState.loopSentenceIndex;
    const isPlaying = Boolean(studioState.isPlaying);

    // 1. Per-sentence Loop buttons — strictly at most ONE active
    document.querySelectorAll('[data-loop-sent]').forEach((btn) => {
      const idx = Number(btn.dataset.loopSent);
      const isLooping = loopIdx !== null && idx === loopIdx;
      btn.classList.toggle('active', isLooping);
      btn.setAttribute('aria-pressed', isLooping ? 'true' : 'false');
    });

    // 2. Per-sentence Play/Pause buttons
    document.querySelectorAll('[data-play-sent]').forEach((btn) => {
      const idx = Number(btn.dataset.playSent);
      const isThisPlaying = isPlaying && activeIdx !== null && idx === activeIdx;
      btn.classList.toggle('active', isThisPlaying);
      btn.setAttribute('aria-pressed', isThisPlaying ? 'true' : 'false');
      btn.innerHTML = `${isThisPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG}<span>${escapeHtml(
        isThisPlaying ? t('pauseBtn') : t('playBtn'),
      )}</span>`;
    });

    // 3. Coach Mode Play Clip buttons
    document.querySelectorAll('[data-coach-play]').forEach((btn) => {
      const idx = Number(btn.dataset.coachPlay);
      const isCoachPlaying = isPlaying && activeIdx !== null && idx === activeIdx;
      btn.classList.toggle('active', isCoachPlaying);
      btn.setAttribute('aria-pressed', isCoachPlaying ? 'true' : 'false');
    });

    // 4. Listen Mode Dictation Play button
    const dictPlayBtn = document.getElementById('dict-play-btn');
    if (dictPlayBtn) {
      const isDictPlaying = isPlaying && activeIdx === studioState.dictationIndex;
      dictPlayBtn.classList.toggle('active', isDictPlaying);
      dictPlayBtn.setAttribute('aria-pressed', isDictPlaying ? 'true' : 'false');
      const span = dictPlayBtn.querySelector('span') || dictPlayBtn;
      span.textContent = isDictPlaying ? t('pauseClipBtn') : t('playClipBtn');
    }

    // 5. Voice Deck Speaker Replay button
    const replayBtn = document.getElementById('replay-original-btn');
    if (replayBtn) {
      replayBtn.classList.toggle('active', isPlaying);
      replayBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    }

    // 6. Sentence Flow Segmented Control (Auto-Pause | Loop | Continuous)
    document.querySelectorAll('.flow-btn[data-end-action]').forEach((btn) => {
      const isSelected = btn.dataset.endAction === studioState.endAction;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  function setSentenceLoop(indexOrNull) {
    studioState.loopSentenceIndex =
      indexOrNull !== null && indexOrNull !== undefined ? Number(indexOrNull) : null;
    syncPlaybackButtonsDom();
  }

  window.setSentenceLoop = setSentenceLoop;

  function syncSavedButtonsDom() {
    const analysis = studioState.item?.aiAnalysis;
    if (analysis) {
      document.querySelectorAll('[data-save-expr]').forEach((btn) => {
        const entry = analysis.expressions?.[Number(btn.dataset.saveExpr)];
        const saved = Boolean(entry && studioState.savedTerms.has(normalizeTermKey(entry.phrase)));
        btn.classList.toggle('is-saved', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        btn.innerHTML = `<span>${escapeHtml(saved ? t('savedShortBtn') : t('saveBtn'))}</span>`;
      });

      document.querySelectorAll('[data-save-vocab]').forEach((btn) => {
        const entry = analysis.vocabulary?.[Number(btn.dataset.saveVocab)];
        const saved = Boolean(entry && studioState.savedTerms.has(normalizeTermKey(entry.term)));
        btn.classList.toggle('is-saved', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        btn.innerHTML = `<span>${escapeHtml(saved ? t('savedShortBtn') : t('saveBtn'))}</span>`;
      });
    }

    const wpSaveBtn = document.getElementById('wp-save-btn');
    if (wpSaveBtn) {
      const currentTerm =
        studioState.activeWordLookup?.term || studioState.pendingLookupTerm || '';
      const saved = Boolean(currentTerm && studioState.savedTerms.has(normalizeTermKey(currentTerm)));
      wpSaveBtn.classList.toggle('active', saved);
      wpSaveBtn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      wpSaveBtn.textContent = saved ? t('savedInVocabBtn') : t('saveToVocabBtn');
    }
  }

  function closeWordLookupPopover() {
    const popover = document.getElementById('word-lookup-popover');
    if (popover) popover.hidden = true;
    studioState.activeWordLookup = null;
    studioState.pendingLookupTerm = '';
    document.querySelectorAll('.clickable-word.selected-word').forEach((el) => {
      el.classList.remove('selected-word');
    });
  }

  /* ========================================================================
     FLEXIBLE VIDEO DOCKING (Side | Top | Focus — Zero Remount!)
     ======================================================================== */

  function setStudioLayout(layoutChoice) {
    const workspace = document.getElementById('studio-main-content');
    if (!workspace) return;

    let target = layoutChoice;
    if (layoutChoice === 'focus' && studioState.layout === 'focus') {
      target = studioState.previousNonFocusLayout || 'side';
    } else if (layoutChoice !== 'focus') {
      studioState.previousNonFocusLayout = layoutChoice;
    }

    if (!['side', 'top', 'focus'].includes(target)) target = 'side';
    studioState.layout = target;
    if (target !== 'focus') {
      localStorage.setItem('flaptap_studio_layout', target);
    }

    workspace.setAttribute('data-layout', target);
    workspace.classList.toggle('video-expanded', target === 'focus');

    document.querySelectorAll('.layout-btn[data-layout-choice]').forEach((btn) => {
      const isActive = btn.dataset.layoutChoice === target;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  window.setStudioLayout = setStudioLayout;

  /* ========================================================================
     SCALABLE PRIMARY LEARNING MODES (0ms Switch, Zero Page Reload)
     ======================================================================== */

  function switchStudioMode(modeName) {
    let target = modeName;
    if (target === 'sentences' || target === 'transcript') target = 'shadow';
    if (target === 'chunks') target = 'read';
    if (!STUDIO_MODES.includes(target)) target = 'shadow';

    studioState.mode = target;
    closeWordLookupPopover();

    document.querySelectorAll('.mode-tab-btn[data-mode]').forEach((btn) => {
      const isActive = btn.dataset.mode === target;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    STUDIO_MODES.forEach((m) => {
      const panel = document.getElementById(`mode-panel-${m}`);
      if (panel) {
        panel.style.display = m === target ? '' : 'none';
      }
    });

    const sentList = document.getElementById('subview-sentences-list');
    const chunkList = document.getElementById('subview-chunks-list');
    if (sentList) sentList.style.display = target === 'shadow' ? '' : 'none';
    if (chunkList) chunkList.style.display = target === 'read' ? '' : 'none';

    const transDeck = document.getElementById('translation-control-deck');
    if (transDeck) {
      transDeck.style.display = target === 'shadow' ? '' : 'none';
    }

    const legendStrip = document.getElementById('transcript-legend-strip');
    if (legendStrip) {
      legendStrip.style.display = target === 'shadow' || target === 'read' ? '' : 'none';
    }

    if (target === 'listen') {
      renderDictationCard();
    } else if (target === 'coach' && studioState.item && !studioState.item.aiAnalysis && !studioState.analysisInFlight) {
      triggerDynamicCoachAnalysis(false);
    }

    syncPlaybackButtonsDom();

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', target);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }

  window.switchStudioMode = switchStudioMode;
  window.switchTranscriptMode = function (legacy) {
    switchStudioMode(legacy === 'chunks' ? 'read' : 'shadow');
  };

  /* ========================================================================
     VERBATIM WORD TOKENIZER FOR CLICK-ANY-WORD CONTEXTUAL AI LOOKUP
     Preserves `<mark class="hl-...">` AND exact `textContent === sentence.text`
     ======================================================================== */

  function decorateClickableWords(verbatimHtml, sentenceIndex) {
    const container = document.createElement('div');
    container.innerHTML = verbatimHtml || '';

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        if (!text.trim()) return;
        const frag = document.createDocumentFragment();
        const parts = text.split(/([\p{L}\p{N}''-]+)/gu);
        for (const part of parts) {
          if (!part) continue;
          if (/^[\p{L}\p{N}]/u.test(part) && part.length >= 2) {
            const span = document.createElement('span');
            span.className = 'clickable-word';
            span.dataset.word = part;
            span.dataset.sentIndex = String(sentenceIndex);
            span.textContent = part;
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(part));
          }
        }
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.from(node.childNodes).forEach(walk);
      }
    }

    Array.from(container.childNodes).forEach(walk);
    return container.innerHTML;
  }

  /* ========================================================================
     RENDER SENTENCES (SHADOW MODE) & COHESIVE PARAGRAPHS (READ MODE)
     ======================================================================== */

  function renderSentencesAndParagraphs() {
    const item = studioState.item;
    if (!item) return;

    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const chunks = Array.isArray(item.chunks) ? item.chunks : [];

    document.getElementById('badge-sentences-count').textContent = String(sentences.length);
    document.getElementById('badge-paragraphs-count').textContent = String(chunks.length);

    const activeIdx = studioState.activeSentence?.index || null;
    const langCache =
      studioState.translationsByLang[studioState.translationLang] ||
      item.translationsCache?.[studioState.translationLang] ||
      null;

    // 1. Render Shadow Mode Sentence Cards
    const sentContainer = document.getElementById('subview-sentences-list');
    if (sentContainer) {
      sentContainer.innerHTML = sentences
        .map((s) => {
          const isActive = activeIdx === s.index;
          const isLooping = studioState.loopSentenceIndex === s.index;
          const isThisPlaying = studioState.isPlaying && isActive;
          const baseHtml = s.highlightedHtml || escapeHtml(s.text);
          const interactiveHtml = decorateClickableWords(baseHtml, s.index);

          const transHtml =
            langCache && langCache[s.index]
              ? langCache[s.index]
              : (s.translations?.[studioState.translationLang] || '—');

          return `
            <article
              id="sent-card-${s.index}"
              class="sentence-driller-card ${isActive ? 'active-drilling' : ''}"
              data-sentence-index="${s.index}"
            >
              <div class="sent-card-top">
                <div class="sent-meta-left">
                  <span class="sent-index-num">#${String(s.index).padStart(2, '0')}</span>
                  <span class="sent-time-badge">${escapeHtml(s.timeRange || '')}</span>
                </div>
                <div class="sent-actions-right">
                  <button
                    type="button"
                    class="sent-action-btn ${isLooping ? 'active' : ''}"
                    data-loop-sent="${s.index}"
                    aria-pressed="${isLooping ? 'true' : 'false'}"
                    title="Loop this sentence"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                    <span>${escapeHtml(t('loopBtn'))}</span>
                  </button>
                  <button
                    type="button"
                    class="sent-action-btn ${isThisPlaying ? 'active' : ''}"
                    data-play-sent="${s.index}"
                    aria-pressed="${isThisPlaying ? 'true' : 'false'}"
                    title="Play or pause sentence"
                  >
                    ${isThisPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG}
                    <span>${escapeHtml(isThisPlaying ? t('pauseBtn') : t('playBtn'))}</span>
                  </button>
                </div>
              </div>

              <div class="sent-english-line" data-line-sent="${s.index}">${interactiveHtml}</div>

              <div class="sentence-translation-box" ${studioState.translationEnabled ? '' : 'hidden'}>
                <div
                  class="sentence-translation-text"
                  dir="${studioState.translationRtl ? 'rtl' : 'ltr'}"
                  data-trans-sent="${s.index}"
                >${transHtml}</div>
              </div>
            </article>
          `;
        })
        .join('');
    }

    // 2. Render Read Mode Cohesive Editorial Paragraphs
    const chunkContainer = document.getElementById('subview-chunks-list');
    if (chunkContainer) {
      const sentenceMap = new Map(sentences.map((s) => [s.index, s]));
      chunkContainer.innerHTML = chunks
        .map((chunk, idx) => {
          let proseHtml = '';
          if (Array.isArray(chunk.sentenceIndices) && chunk.sentenceIndices.length > 0) {
            proseHtml = chunk.sentenceIndices
              .map((sIdx) => {
                const s = sentenceMap.get(sIdx);
                if (!s) return '';
                const sHtml = decorateClickableWords(s.highlightedHtml || escapeHtml(s.text), s.index);
                const readingCls = activeIdx === s.index ? 'active-reading' : '';
                return `<span class="read-sentence ${readingCls}" data-read-sent="${s.index}">${sHtml}</span>`;
              })
              .filter(Boolean)
              .join(' ');
          } else {
            proseHtml = chunk.highlightedHtml || escapeHtml(chunk.text);
          }

          return `
            <section class="editorial-paragraph-block" data-paragraph-index="${idx + 1}">
              <span class="paragraph-time-margin">${escapeHtml(chunk.timeRange || '')}</span>
              <p class="paragraph-prose">${proseHtml}</p>
            </section>
          `;
        })
        .join('');
    }
  }

  /* ========================================================================
     YOUTUBE PLAYER & EXACT MILLISECOND PLAYBACK BOUNDARIES
     ======================================================================== */

  function mountMediaDeck(item) {
    const ytDiv = document.getElementById('studio-youtube-player');
    const ttsStage = document.getElementById('tts-audio-stage');

    if (item.videoId) {
      if (ttsStage) ttsStage.hidden = true;
      if (ytDiv) ytDiv.hidden = false;
      loadYouTubeIframeApi(item.videoId);
    } else {
      if (ytDiv) ytDiv.hidden = true;
      if (ttsStage) {
        ttsStage.hidden = false;
        document.getElementById('tts-stage-tag').textContent = item.trackTitle || 'Spoken Audio Deck';
        if (item.sentences?.[0]) {
          document.getElementById('tts-active-quote').textContent = `“${item.sentences[0].text}”`;
        }
      }
    }
  }

  function loadYouTubeIframeApi(videoId) {
    if (window.YT && window.YT.Player) {
      createYtPlayer(videoId);
      return;
    }

    window.onYouTubeIframeAPIReady = function () {
      createYtPlayer(videoId);
    };

    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }

  function createYtPlayer(videoId) {
    if (studioState.ytPlayer) return; // Never remount!
    studioState.ytPlayer = new window.YT.Player('studio-youtube-player', {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          studioState.ytReady = true;
          try {
            studioState.ytPlayer.setPlaybackRate(studioState.speed);
          } catch {}
          if (studioState.pendingPlaySentenceIndex !== null) {
            const idx = studioState.pendingPlaySentenceIndex;
            studioState.pendingPlaySentenceIndex = null;
            playSentence(idx, { preserveLoop: studioState.loopSentenceIndex === idx });
          }
        },
        onStateChange: (ev) => {
          if (ev?.data === 1) {
            studioState.isPlaying = true;
            syncPlaybackButtonsDom();
          } else if (ev?.data === 2 || ev?.data === 0) {
            studioState.isPlaying = false;
            syncPlaybackButtonsDom();
          }
        },
      },
    });
  }

  function updateActiveSentenceDom(index) {
    document.querySelectorAll('.sentence-driller-card.active-drilling').forEach((el) =>
      el.classList.remove('active-drilling'),
    );
    document.querySelectorAll('.read-sentence.active-reading').forEach((el) =>
      el.classList.remove('active-reading'),
    );

    const card = document.getElementById(`sent-card-${index}`);
    if (card) {
      card.classList.add('active-drilling');
    }
    document.querySelectorAll(`.read-sentence[data-read-sent="${index}"]`).forEach((el) => {
      el.classList.add('active-reading');
    });
  }

  function pauseCurrentPlayback() {
    if (studioState.playbackTicker) {
      clearInterval(studioState.playbackTicker);
      studioState.playbackTicker = null;
    }
    if (studioState.ytPlayer && typeof studioState.ytPlayer.pauseVideo === 'function') {
      try {
        studioState.ytPlayer.pauseVideo();
      } catch {}
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    studioState.isPlaying = false;
    syncPlaybackButtonsDom();
  }

  window.pauseCurrentPlayback = pauseCurrentPlayback;

  function playSentence(index, opts) {
    const options = opts || {};
    const targetIdx = Number(index);
    const sentences = studioState.item?.sentences || [];
    const sentence = sentences.find((s) => Number(s.index) === targetIdx);
    if (!sentence) return;

    // Reset per-item Loop automatically whenever moving to a different sentence
    if (
      !options.preserveLoop &&
      studioState.loopSentenceIndex !== null &&
      studioState.loopSentenceIndex !== sentence.index
    ) {
      studioState.loopSentenceIndex = null;
    }

    studioState.activeSentence = sentence;
    studioState.seekTargetStart = sentence.startSec;
    studioState.isPlaying = true;
    updateActiveSentenceDom(sentence.index);
    syncPlaybackButtonsDom();

    // Fallback Web Speech TTS for video-less Dialogue / Pronunciation workouts
    if (!studioState.item?.videoId && !studioState.ytPlayer) {
      const quoteEl = document.getElementById('tts-active-quote');
      if (quoteEl) quoteEl.textContent = `“${sentence.text}”`;
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(sentence.text);
          utter.lang = 'en-US';
          utter.rate = Math.max(0.5, Math.min(2.0, studioState.speed));
          utter.onstart = () => {
            studioState.isPlaying = true;
            syncPlaybackButtonsDom();
          };
          utter.onend = () => {
            const shouldRepeat =
              studioState.loopSentenceIndex === sentence.index || studioState.endAction === 'loop';
            if (shouldRepeat && studioState.activeSentence?.index === sentence.index) {
              playSentence(sentence.index, { preserveLoop: true });
              return;
            }
            studioState.isPlaying = false;
            syncPlaybackButtonsDom();
          };
          utter.onerror = () => {
            studioState.isPlaying = false;
            syncPlaybackButtonsDom();
          };
          window.speechSynthesis.speak(utter);
        } catch {
          studioState.isPlaying = false;
          syncPlaybackButtonsDom();
        }
      } else {
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      }
      return;
    }

    const player = studioState.ytPlayer;
    if (!player || typeof player.seekTo !== 'function') {
      studioState.pendingPlaySentenceIndex = sentence.index;
      return;
    }

    // Playback Boundary Law:
    // 1. Seek to exact `startSec` (zero fixed -50ms lead-in)
    // 2. Mute during asynchronous seek, unmute at word onset
    // 3. Stop at `endSec - 12ms` before next word's onset
    studioState.awaitingOnsetUnmute = true;
    studioState.lastSeekTime = Date.now();

    try {
      if (typeof player.mute === 'function') player.mute();
      if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(studioState.speed);
      player.seekTo(sentence.startSec, true);
      if (typeof player.playVideo === 'function') player.playVideo();
    } catch {}

    startPlaybackTicker();
  }

  window.playSentence = playSentence;

  function startPlaybackTicker() {
    if (studioState.playbackTicker) {
      clearInterval(studioState.playbackTicker);
    }
    studioState.playbackTicker = setInterval(checkSentenceDrillProgress, 15);
  }

  function checkSentenceDrillProgress() {
    const player = studioState.ytPlayer;
    const active = studioState.activeSentence;
    if (!player || !active || typeof player.getCurrentTime !== 'function') return;

    const current = Number(player.getCurrentTime() || 0);

    if (studioState.awaitingOnsetUnmute && current >= active.startSec - 0.001) {
      if (typeof player.unMute === 'function') player.unMute();
      studioState.awaitingOnsetUnmute = false;
    }

    // Ignore stale pre-seek playhead values for 90ms after issuing an async seek
    if (studioState.lastSeekTime > 0 && Date.now() - studioState.lastSeekTime < 90) {
      return;
    }

    const endCutoff = Math.max(
      active.startSec + 0.05,
      Number((active.endSec - 0.012).toFixed(3)),
    );

    if (current >= endCutoff) {
      const shouldLoop =
        studioState.loopSentenceIndex === active.index || studioState.endAction === 'loop';

      if (shouldLoop) {
        studioState.awaitingOnsetUnmute = true;
        studioState.lastSeekTime = Date.now();
        if (typeof player.mute === 'function') player.mute();
        player.seekTo(active.startSec, true);
        if (typeof player.playVideo === 'function') player.playVideo();
        return;
      }

      if (studioState.endAction === 'pause') {
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
        if (studioState.playbackTicker) {
          clearInterval(studioState.playbackTicker);
          studioState.playbackTicker = null;
        }
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
        return;
      }

      // Continuous flow: advance active sentence highlight without seeking/stuttering
      const sentences = studioState.item?.sentences || [];
      const nextSentence = sentences.find((s) => s.index === active.index + 1);
      if (nextSentence) {
        if (studioState.loopSentenceIndex !== null && studioState.loopSentenceIndex !== nextSentence.index) {
          studioState.loopSentenceIndex = null;
        }
        studioState.activeSentence = nextSentence;
        updateActiveSentenceDom(nextSentence.index);
        syncPlaybackButtonsDom();
      } else {
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
        if (studioState.playbackTicker) {
          clearInterval(studioState.playbackTicker);
          studioState.playbackTicker = null;
        }
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      }
    }
  }

  window.checkSentenceDrillProgress = checkSentenceDrillProgress;

  /* ========================================================================
     SPEED CONTROL (0.10x Snap + Exact Presets)
     ======================================================================== */

  function setStudioSpeed(rawVal) {
    let num = Number(rawVal);
    if (!Number.isFinite(num)) num = 1.0;
    num = Math.max(0.25, Math.min(2.0, num));

    const roundedQuarter = Math.round(num * 100) / 100;
    const speed = EXACT_SPEED_PRESETS.has(roundedQuarter)
      ? roundedQuarter
      : Math.round(num * 10) / 10;

    studioState.speed = speed;

    const badge = document.getElementById('current-speed-badge');
    if (badge) badge.textContent = `${speed.toFixed(2)}x`;

    const slider = document.getElementById('speed-slider');
    if (slider) slider.value = String(speed);

    document.querySelectorAll('#speed-ticks-row .speed-tick').forEach((tick) => {
      const tickVal = Number(tick.dataset.speed);
      const isMatch = Math.abs(tickVal - speed) < 0.001;
      tick.classList.toggle('active', isMatch);
      tick.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    if (studioState.ytPlayer && typeof studioState.ytPlayer.setPlaybackRate === 'function') {
      try {
        studioState.ytPlayer.setPlaybackRate(speed);
      } catch {}
    }
  }

  window.setStudioSpeed = setStudioSpeed;

  /* ========================================================================
     170+ WORLD LANGUAGE TRANSLATION DECK (With Cache Bypass Control)
     ======================================================================== */

  async function loadLanguagesCatalog() {
    try {
      const data = await apiFetch('/api/languages', { method: 'GET' });
      studioState.languages = Array.isArray(data.languages) ? data.languages : [];
      const select = document.getElementById('trans-lang-select');
      if (!select) return;

      select.innerHTML = studioState.languages
        .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} — ${escapeHtml(l.native)}</option>`)
        .join('');

      const preferred = studioState.translationLang || data.defaultLanguage || 'ar';
      if (studioState.languages.some((l) => l.code === preferred)) {
        select.value = preferred;
        studioState.translationLang = preferred;
      } else if (studioState.languages[0]) {
        select.value = studioState.languages[0].code;
        studioState.translationLang = studioState.languages[0].code;
      }

      const langMeta = studioState.languages.find((l) => l.code === studioState.translationLang);
      studioState.translationRtl = Boolean(langMeta?.rtl);
    } catch {}
  }

  async function requestTranslations(forceRefresh) {
    if (!studioState.item) return;
    const force = Boolean(forceRefresh);
    const langCode = studioState.translationLang || 'ar';
    const statusEl = document.getElementById('translation-status-text');
    const refreshBtn = document.getElementById('trans-refresh-btn');

    const langMeta = studioState.languages.find((l) => l.code === langCode);
    studioState.translationRtl = Boolean(langMeta?.rtl ?? (langCode === 'ar'));

    document.querySelectorAll('.sentence-translation-box').forEach((box) => {
      box.hidden = !studioState.translationEnabled;
    });

    if (!studioState.translationEnabled) {
      if (statusEl) statusEl.textContent = '';
      return;
    }

    const existing = !force ? studioState.translationsByLang[langCode] : null;
    const totalSentences = (studioState.item.sentences || []).length;
    if (existing && Object.keys(existing).length >= totalSentences) {
      applyTranslationsToDom(existing, studioState.translationRtl);
      if (statusEl) statusEl.textContent = t('translatedReady');
      return;
    }

    if (statusEl) statusEl.textContent = t('translatingStatus');
    if (refreshBtn) refreshBtn.disabled = true;
    document.querySelectorAll('.sentence-translation-text').forEach((el) => {
      el.setAttribute('dir', studioState.translationRtl ? 'rtl' : 'ltr');
      if (force || !el.textContent || el.textContent === '—') el.textContent = '...';
    });

    try {
      const res = await apiFetch('/api/tracks/shadowing/translate-sentences', {
        method: 'POST',
        body: JSON.stringify({
          historyId: studioState.item.id,
          language: langCode,
          force,
        }),
      });

      studioState.translationRtl = Boolean(res.rtl);
      studioState.translationsByLang[langCode] = res.translations || {};
      applyTranslationsToDom(res.translations || {}, Boolean(res.rtl));
      if (statusEl) statusEl.textContent = `${res.languageName} · ${t('translatedReady')}`;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message;
      showToast(error.message);
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  function applyTranslationsToDom(translations, rtl) {
    document.querySelectorAll('.sentence-translation-text[data-trans-sent]').forEach((el) => {
      const idx = Number(el.dataset.transSent);
      const html = translations[idx] ?? translations[String(idx)];
      el.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      if (html) {
        el.innerHTML = html;
      }
    });
  }

  /* ========================================================================
     MODE 3: LISTEN (ACTIVE CLOZE DICTATION)
     ======================================================================== */

  function renderDictationCard() {
    const sentences = studioState.item?.sentences || [];
    if (sentences.length === 0) return;

    const idx = Math.max(1, Math.min(sentences.length, studioState.dictationIndex));
    studioState.dictationIndex = idx;
    const sentence = sentences.find((s) => s.index === idx) || sentences[0];

    document.getElementById('dict-progress-label').textContent = `${idx} / ${sentences.length}`;
    document.getElementById('dict-time-badge').textContent = sentence.timeRange || '';
    document.getElementById('dict-feedback-text').textContent = '';

    const prevBtn = document.getElementById('dict-prev-btn');
    const nextBtn = document.getElementById('dict-next-btn');
    if (prevBtn) prevBtn.disabled = idx <= 1;
    if (nextBtn) nextBtn.disabled = idx >= sentences.length;

    document.querySelectorAll('[data-dict-level]').forEach((pill) => {
      const isAct = pill.dataset.dictLevel === studioState.dictationLevel;
      pill.classList.toggle('active', isAct);
      pill.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });

    const tokens = sentence.text.split(/\s+/).filter(Boolean);
    const ratio =
      studioState.dictationLevel === 'easy'
        ? 0.22
        : studioState.dictationLevel === 'hard'
          ? 0.52
          : 0.35;

    const DICTATION_STOP_WORDS = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
      'had', 'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its',
      'may', 'now', 'see', 'who', 'did', 'him', 'she', 'too', 'that', 'this',
      'with', 'from', 'they', 'will', 'have', 'been', 'were', 'what', 'when',
      'your', 'into', 'than', 'then', 'them', 'some', 'there', 'their', 'about',
    ]);

    const contentIndices = [];
    const fallbackIndices = [];
    tokens.forEach((tok, i) => {
      const clean = tok.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
      if (clean.length < 3) return;
      if (clean.length >= 4 && !DICTATION_STOP_WORDS.has(clean.toLowerCase())) {
        contentIndices.push(i);
      } else {
        fallbackIndices.push(i);
      }
    });

    const targetBlanks = Math.max(1, Math.round(tokens.length * ratio));
    const eligibleIndices =
      contentIndices.length >= targetBlanks
        ? contentIndices
        : [...contentIndices, ...fallbackIndices];
    const blankSet = new Set();
    if (eligibleIndices.length > 0) {
      const step = Math.max(1, eligibleIndices.length / targetBlanks);
      for (let k = 0; k < targetBlanks && k < eligibleIndices.length; k++) {
        const pick = eligibleIndices[Math.min(eligibleIndices.length - 1, Math.floor(k * step))];
        blankSet.add(pick);
      }
    }

    const htmlParts = tokens.map((tok, i) => {
      if (!blankSet.has(i)) return escapeHtml(tok);
      const match = /^([^\p{L}\p{N}']*)([\p{L}\p{N}''-]+)([^\p{L}\p{N}']*)$/u.exec(tok);
      if (!match) return escapeHtml(tok);
      const [, leading, answer, trailing] = match;
      const widthCh = Math.max(5, answer.length + 2);
      return `${escapeHtml(leading)}<input type="text" class="cloze-input" style="width:${widthCh}ch" data-answer="${escapeHtml(answer)}" autocomplete="off" spellcheck="false" aria-label="Missing word" />${escapeHtml(trailing)}`;
    });

    const area = document.getElementById('dictation-sentence-area');
    if (area) {
      area.innerHTML = htmlParts.join(' ');
      const firstInput = area.querySelector('.cloze-input');
      firstInput?.focus();
    }

    syncPlaybackButtonsDom();
  }

  function checkDictationAnswers(revealAll) {
    const inputs = Array.from(document.querySelectorAll('#dictation-sentence-area .cloze-input'));
    if (inputs.length === 0) return;

    let correctCount = 0;
    const norm = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'");

    for (const inp of inputs) {
      const expected = inp.dataset.answer || '';
      if (revealAll) {
        inp.value = expected;
        inp.classList.remove('incorrect');
        inp.classList.add('correct');
        correctCount++;
      } else if (norm(inp.value) === norm(expected)) {
        inp.classList.remove('incorrect');
        inp.classList.add('correct');
        correctCount++;
      } else {
        inp.classList.remove('correct');
        inp.classList.add('incorrect');
      }
    }

    const feedback = document.getElementById('dict-feedback-text');
    if (feedback) {
      feedback.textContent = revealAll
        ? `Revealed (${inputs.length} words)`
        : `${correctCount} / ${inputs.length} correct`;
      feedback.style.color =
        correctCount === inputs.length ? 'var(--accent-forest)' : 'var(--accent-vermilion)';
    }
  }

  /* ========================================================================
     MODE 4: DYNAMIC AI COACH (OpenCode Go — Zero Static Regexes!)
     ======================================================================== */

  async function triggerDynamicCoachAnalysis(force) {
    if (!studioState.item || studioState.analysisInFlight) return;

    if (!force && studioState.item.aiAnalysis) {
      renderCoachAnalysis(studioState.item.aiAnalysis);
      return;
    }

    studioState.analysisInFlight = true;
    const loadingBox = document.getElementById('coach-loading-box');
    const errorBox = document.getElementById('coach-error-box');
    const contentBox = document.getElementById('coach-content-box');
    const refreshBtn = document.getElementById('coach-refresh-btn');
    if (loadingBox) loadingBox.hidden = false;
    if (errorBox) errorBox.hidden = true;
    if (contentBox) contentBox.hidden = true;
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const res = await apiFetch('/api/tracks/shadowing/analyze', {
        method: 'POST',
        body: JSON.stringify({
          historyId: studioState.item.id,
          force: Boolean(force),
        }),
      });

      if (res.analysis) {
        studioState.item.aiAnalysis = res.analysis;
        if (Array.isArray(res.sentences) && res.sentences.length > 0) {
          const oldSentences = studioState.item.sentences || [];
          studioState.item.sentences = res.sentences.map((s, idx) => ({
            ...s,
            translations: s.translations || oldSentences[idx]?.translations,
          }));
          renderSentencesAndParagraphs();
          syncPlaybackButtonsDom();
        }
        renderCoachAnalysis(res.analysis);
      }
    } catch (error) {
      if (loadingBox) loadingBox.hidden = true;
      if (errorBox) {
        errorBox.hidden = false;
        document.getElementById('coach-error-msg').textContent = error.message;
      }
    } finally {
      studioState.analysisInFlight = false;
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  function renderCoachAnalysis(analysis) {
    if (!analysis) return;

    const loadingBox = document.getElementById('coach-loading-box');
    const errorBox = document.getElementById('coach-error-box');
    const contentBox = document.getElementById('coach-content-box');
    if (loadingBox) loadingBox.hidden = true;
    if (errorBox) errorBox.hidden = true;
    if (contentBox) contentBox.hidden = false;

    const cefr = analysis.overview?.cefrLevel || 'B2';
    const headerCefr = document.getElementById('studio-cefr-badge');
    if (headerCefr) {
      headerCefr.textContent = cefr;
      headerCefr.hidden = false;
    }

    document.getElementById('coach-cefr-stamp').textContent = cefr;
    document.getElementById('coach-style-heading').textContent =
      analysis.overview?.speakerStyle || 'Natural American Cadence';
    document.getElementById('coach-summary-text').textContent = analysis.overview?.summary || '';

    const tipsList = document.getElementById('coach-tips-list');
    if (tipsList) {
      tipsList.innerHTML = (analysis.overview?.focusTips || [])
        .map((tip) => `<li>${escapeHtml(tip)}</li>`)
        .join('');
    }

    const connected = analysis.connectedSpeech || [];
    const expressions = analysis.expressions || [];
    const vocab = analysis.vocabulary || [];

    const totalInsights = connected.length + expressions.length + vocab.length;
    const badgeCoach = document.getElementById('badge-coach-count');
    if (badgeCoach) {
      badgeCoach.textContent = String(totalInsights);
      badgeCoach.hidden = totalInsights === 0;
    }

    document.getElementById('coach-connected-count').textContent = String(connected.length);
    document.getElementById('coach-expressions-count').textContent = String(expressions.length);
    document.getElementById('coach-vocab-count').textContent = String(vocab.length);

    document.getElementById('coach-connected-grid').innerHTML = connected
      .map(
        (c) => `
        <article class="coach-item-card">
          <div class="coach-item-head">
            <span class="coach-phrase">“${escapeHtml(c.exactPhrase)}”</span>
            <span class="coach-tag">${escapeHtml(c.phenomenon)}</span>
          </div>
          ${c.spokenIpa ? `<div class="coach-ipa">${escapeHtml(c.spokenIpa)}</div>` : ''}
          <p class="coach-desc">${escapeHtml(c.mechanics)}</p>
          <div class="coach-item-actions">
            <span class="sent-index-num">#${String(c.sentenceIndex || 1).padStart(2, '0')}</span>
            <button type="button" class="sent-action-btn" data-coach-play="${Number(c.sentenceIndex) || 1}" aria-pressed="false">
              ${PLAY_ICON_SVG}
              <span>${escapeHtml(t('playBtn'))}</span>
            </button>
          </div>
        </article>
      `,
      )
      .join('');

    document.getElementById('coach-expressions-grid').innerHTML = expressions
      .map((e, i) => {
        const isSaved = studioState.savedTerms.has(normalizeTermKey(e.phrase));
        return `
        <article class="coach-item-card">
          <div class="coach-item-head">
            <span class="coach-phrase">${escapeHtml(e.phrase)}</span>
            <span class="coach-tag">${escapeHtml(e.register || 'Expression')}</span>
          </div>
          <p class="coach-desc" style="color: var(--ink); font-weight: 500;">${escapeHtml(e.meaning)}</p>
          ${e.usageNote ? `<p class="coach-desc">${escapeHtml(e.usageNote)}</p>` : ''}
          <div class="coach-item-actions">
            <button type="button" class="sent-action-btn" data-coach-play="${Number(e.sentenceIndex) || 1}" aria-pressed="false">
              ${PLAY_ICON_SVG}
              <span>#${String(e.sentenceIndex || 1).padStart(2, '0')}</span>
            </button>
            <button type="button" class="sent-action-btn ${isSaved ? 'is-saved' : ''}" data-save-expr="${i}" aria-pressed="${isSaved ? 'true' : 'false'}">
              <span>${escapeHtml(isSaved ? t('savedShortBtn') : t('saveBtn'))}</span>
            </button>
          </div>
        </article>
      `;
      })
      .join('');

    document.getElementById('coach-vocab-grid').innerHTML = vocab
      .map((v, i) => {
        const isSaved = studioState.savedTerms.has(normalizeTermKey(v.term));
        return `
        <article class="coach-item-card">
          <div class="coach-item-head">
            <span class="coach-phrase">${escapeHtml(v.term)}</span>
            <span class="coach-tag">${escapeHtml(v.partOfSpeech || 'word')}</span>
          </div>
          ${v.ipa ? `<div class="coach-ipa">${escapeHtml(v.ipa)}</div>` : ''}
          <p class="coach-desc">${escapeHtml(v.definition)}</p>
          <div class="coach-item-actions">
            <button type="button" class="sent-action-btn" data-coach-play="${Number(v.sentenceIndex) || 1}" aria-pressed="false">
              ${PLAY_ICON_SVG}
              <span>#${String(v.sentenceIndex || 1).padStart(2, '0')}</span>
            </button>
            <button type="button" class="sent-action-btn ${isSaved ? 'is-saved' : ''}" data-save-vocab="${i}" aria-pressed="${isSaved ? 'true' : 'false'}">
              <span>${escapeHtml(isSaved ? t('savedShortBtn') : t('saveBtn'))}</span>
            </button>
          </div>
        </article>
      `;
      })
      .join('');

    syncPlaybackButtonsDom();
  }

  /* ========================================================================
     CONTEXTUAL AI WORD POPOVER & VOCABULARY SAVE
     ======================================================================== */

  async function loadSavedVocabularyTerms() {
    try {
      const items = await apiFetch('/api/vocabulary', { method: 'GET' });
      if (Array.isArray(items)) {
        studioState.savedTerms = new Set(items.map((v) => normalizeTermKey(v.term)));
        syncSavedButtonsDom();
      }
    } catch {}
  }

  async function openWordLookup(word, sentenceIndex, sourceSpan) {
    if (!studioState.item || !word) return;
    const popover = document.getElementById('word-lookup-popover');
    if (!popover) return;

    document.querySelectorAll('.clickable-word.selected-word').forEach((el) => {
      el.classList.remove('selected-word');
    });
    if (sourceSpan) {
      sourceSpan.classList.add('selected-word');
    }

    studioState.activeWordLookup = null;
    studioState.pendingLookupTerm = word;
    syncSavedButtonsDom();

    popover.hidden = false;
    document.getElementById('wp-term').textContent = word;
    document.getElementById('wp-ipa').textContent = '...';
    document.getElementById('wp-pos').textContent = '';
    document.getElementById('wp-def').textContent = 'Looking up contextual meaning...';
    document.getElementById('wp-trans').textContent = '';
    document.getElementById('wp-tip').textContent = '';

    try {
      const data = await apiFetch('/api/tracks/shadowing/define-word', {
        method: 'POST',
        body: JSON.stringify({
          historyId: studioState.item.id,
          word,
          sentenceIndex: Number(sentenceIndex) || 1,
          language: studioState.translationLang || 'ar',
        }),
      });

      if (studioState.pendingLookupTerm !== word) return;
      studioState.activeWordLookup = data;
      document.getElementById('wp-term').textContent = data.term || word;
      document.getElementById('wp-ipa').textContent = data.ipa || '';
      document.getElementById('wp-pos').textContent = data.partOfSpeech || '';
      document.getElementById('wp-def').textContent = data.definition || '';
      const transEl = document.getElementById('wp-trans');
      transEl.textContent = data.translation || '';
      transEl.setAttribute('dir', data.rtl ? 'rtl' : 'ltr');
      document.getElementById('wp-tip').textContent = data.spokenTip || '';
      syncSavedButtonsDom();
    } catch (error) {
      document.getElementById('wp-def').textContent = error.message;
    }
  }

  async function saveWordToVault(entry) {
    if (!entry || !studioState.item) return;
    const termValue = entry.term || entry.phrase;
    if (!termValue) return;
    const sentences = studioState.item.sentences || [];
    const sent = sentences.find((s) => s.index === Number(entry.sentenceIndex)) || sentences[0];

    try {
      await apiFetch('/api/vocabulary', {
        method: 'POST',
        body: JSON.stringify({
          term: termValue,
          ipa: entry.ipa || '',
          partOfSpeech: entry.partOfSpeech || entry.register || '',
          definition: entry.definition || entry.meaning || '',
          translation: entry.translation || '',
          contextSentence: entry.contextSentence || sent?.text || '',
          lessonId: studioState.item.id,
          videoId: studioState.item.videoId || '',
          lessonTitle: studioState.item.title || '',
          timestampSec: entry.timestampSec ?? sent?.startSec ?? 0,
        }),
      });
      studioState.savedTerms.add(normalizeTermKey(termValue));
      syncSavedButtonsDom();
      showToast(t('savedWordToast'));
    } catch (error) {
      showToast(error.message);
    }
  }

  /* ========================================================================
     VOICE RECORDER
     ======================================================================== */

  async function toggleVoiceRecording() {
    const btn = document.getElementById('record-toggle-btn');
    const txt = document.getElementById('record-btn-text');
    const status = document.getElementById('rec-status-label');
    const audioEl = document.getElementById('recorded-audio-player');

    if (studioState.mediaRecorder && studioState.mediaRecorder.state === 'recording') {
      studioState.mediaRecorder.stop();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Microphone access is not available in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      studioState.recordedChunks = [];
      const recorder = new MediaRecorder(stream);
      studioState.mediaRecorder = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) studioState.recordedChunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(studioState.recordedChunks, { type: 'audio/webm' });
        if (studioState.recordedAudioUrl) {
          URL.revokeObjectURL(studioState.recordedAudioUrl);
        }
        studioState.recordedAudioUrl = URL.createObjectURL(blob);
        if (audioEl) {
          audioEl.src = studioState.recordedAudioUrl;
          audioEl.hidden = false;
        }
        btn?.classList.remove('recording');
        btn?.setAttribute('aria-pressed', 'false');
        if (txt) txt.textContent = t('recordVoice');
        if (status) status.textContent = t('recSaved');
      };

      recorder.start();
      btn?.classList.add('recording');
      btn?.setAttribute('aria-pressed', 'true');
      if (txt) txt.textContent = t('stopRecord');
      if (status) status.textContent = t('recRecording');
    } catch {
      showToast('Microphone permission was denied.');
    }
  }

  /* ========================================================================
     LOADER & ACCURATE FAILURE CLASSIFICATION
     ======================================================================== */

  function showFatalLoaderError(error) {
    if (Number(error?.status) === 401 || error?.code === 'auth_required') {
      redirectToSignInGate();
      return;
    }

    const overlay = document.getElementById('loader-overlay');
    const headline = document.getElementById('loader-headline');
    const sub = document.getElementById('loader-subheadline');
    const actions = document.getElementById('loader-error-actions');
    const retryBtn = document.getElementById('loader-retry-btn');

    if (!overlay) return;
    overlay.hidden = false;
    overlay.classList.add('loader-error');
    if (actions) actions.style.display = 'flex';

    const code = error?.code || '';
    const status = Number(error?.status) || 0;

    let isRetryable = false;
    if (code === 'video_unavailable' || status === 404) {
      headline.textContent = t('errUnavailableHeadline');
      sub.textContent = error?.message || t('errUnavailableDetail');
      isRetryable = false;
    } else if (code === 'no_captions' || code === 'invalid_url' || status === 422 || status === 400) {
      headline.textContent = t('errNoCaptionsHeadline');
      sub.textContent = error?.message || t('errNoCaptionsDetail');
      isRetryable = false;
    } else if (code === 'rate_limited') {
      headline.textContent = t('errRateLimitHeadline');
      sub.textContent = t('errRateLimitDetail');
      isRetryable = true;
    } else if (code === 'timeout') {
      headline.textContent = t('errTimeoutHeadline');
      sub.textContent = t('errTimeoutDetail');
      isRetryable = true;
    } else {
      headline.textContent = t('errRateLimitHeadline');
      sub.textContent = error?.message || t('errTimeoutDetail');
      isRetryable = status >= 500 || status === 0;
    }

    if (retryBtn) {
      retryBtn.style.display = isRetryable ? 'inline-flex' : 'none';
    }
  }

  /* ========================================================================
     SINGLE-PASS STUDIO HYDRATION (Strictly Authenticated)
     ======================================================================== */

  function hydrateStudioItem(item) {
    studioState.item = item;
    studioState.translationsByLang = Object.assign({}, item.translationsCache || {});

    document.title = `${item.title || 'Lesson'} — Flaptap Studio`;
    document.getElementById('studio-title').textContent = item.title || 'English Lesson';
    document.getElementById('studio-creator').textContent = item.creator || 'Speaker';
    document.getElementById('studio-wpm').textContent = `${Number(item.pacingWpm || 145)} WPM`;
    document.getElementById('studio-sentence-total').textContent = `${(item.sentences || []).length} ${t('sentencesUnit')}`;
    document.getElementById('drill-counter-badge').textContent = String(item.completedDrills || 0);

    if (item.cefrLevel || item.aiAnalysis?.overview?.cefrLevel) {
      const cefrEl = document.getElementById('studio-cefr-badge');
      cefrEl.textContent = item.cefrLevel || item.aiAnalysis.overview.cefrLevel;
      cefrEl.hidden = false;
    }

    const notesArea = document.getElementById('study-notes-textarea');
    const localNote = localStorage.getItem(`notes_${item.id}`);
    if (notesArea) {
      notesArea.value = item.studyNotes || localNote || '';
    }

    renderSentencesAndParagraphs();
    mountMediaDeck(item);
    syncPlaybackButtonsDom();

    if (item.aiAnalysis) {
      renderCoachAnalysis(item.aiAnalysis);
    } else {
      setTimeout(() => triggerDynamicCoachAnalysis(false), 120);
    }

    const overlay = document.getElementById('loader-overlay');
    if (overlay) {
      overlay.classList.remove('loader-error');
      overlay.hidden = true;
    }

    const params = new URLSearchParams(window.location.search);
    const jumpTime = Number(params.get('t'));
    if (Number.isFinite(jumpTime) && jumpTime > 0 && Array.isArray(item.sentences)) {
      const target =
        item.sentences.find((s) => Math.abs(s.startSec - jumpTime) < 0.5) ||
        item.sentences.find((s) => jumpTime >= s.startSec && jumpTime <= s.endSec);
      if (target) {
        studioState.activeSentence = target;
        updateActiveSentenceDom(target.index);
        syncPlaybackButtonsDom();
        document.getElementById(`sent-card-${target.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  async function loadStudioSession() {
    // Hard Auth Gate BEFORE processing or opening any lesson
    try {
      const me = await apiFetch('/api/auth/me', { method: 'GET' });
      if (!me?.authenticated || !me?.user) {
        redirectToSignInGate();
        return;
      }
      studioState.user = me.user;
    } catch {
      redirectToSignInGate();
      return;
    }

    loadSavedVocabularyTerms();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const rawUrl = params.get('url');
    const forceExtract = params.get('force') === '1';
    const initialMode = params.get('mode') || 'shadow';

    switchStudioMode(initialMode);

    if (id) {
      try {
        const item = await apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'GET' });
        hydrateStudioItem(item);
      } catch (error) {
        showFatalLoaderError(error);
      }
      return;
    }

    if (rawUrl) {
      try {
        const item = await apiFetch('/api/tracks/shadowing/process', {
          method: 'POST',
          body: JSON.stringify({ url: rawUrl, force: forceExtract }),
        });
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('url');
        nextUrl.searchParams.delete('force');
        nextUrl.searchParams.set('id', item.id);
        nextUrl.searchParams.set('mode', studioState.mode);
        window.history.replaceState({}, '', nextUrl.toString());

        hydrateStudioItem(item);
      } catch (error) {
        showFatalLoaderError(error);
      }
      return;
    }

    window.location.href = '/';
  }

  /* ========================================================================
     EVENT LISTENERS & KEYBOARD SHORTCUTS
     ======================================================================== */

  function bindEvents() {
    document.getElementById('studio-theme-toggle')?.addEventListener('click', () => {
      applyTheme(studioState.theme === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('studio-ui-lang-select')?.addEventListener('change', (e) => {
      applyUiLanguage(e.target.value);
    });

    document.getElementById('loader-retry-btn')?.addEventListener('click', () => {
      const overlay = document.getElementById('loader-overlay');
      overlay?.classList.remove('loader-error');
      document.getElementById('loader-error-actions').style.display = 'none';
      document.getElementById('loader-headline').textContent = t('preparingLesson');
      document.getElementById('loader-subheadline').textContent = t('extractingTimings');
      loadStudioSession();
    });

    document.querySelectorAll('.layout-btn[data-layout-choice]').forEach((btn) => {
      btn.addEventListener('click', () => setStudioLayout(btn.dataset.layoutChoice));
    });

    document.querySelectorAll('.mode-tab-btn[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => switchStudioMode(btn.dataset.mode));
    });

    // Flow segmented buttons (Auto-Pause | Loop | Continuous)
    document.querySelectorAll('.flow-btn[data-end-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        studioState.endAction = btn.dataset.endAction;
        if (studioState.endAction !== 'loop') {
          studioState.loopSentenceIndex = null;
        }
        syncPlaybackButtonsDom();
      });
    });

    // Speed Slider & Preset Ticks
    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      setStudioSpeed(e.target.value);
    });

    document.querySelectorAll('#speed-ticks-row .speed-tick').forEach((tick) => {
      tick.addEventListener('click', () => setStudioSpeed(tick.dataset.speed));
    });

    // Shadow Mode Sentence Interactions (Play/Pause, Loop, Click Word, Click Line)
    document.getElementById('subview-sentences-list')?.addEventListener('click', (e) => {
      const playBtn = e.target.closest('[data-play-sent]');
      if (playBtn) {
        const idx = Number(playBtn.dataset.playSent);
        if (studioState.isPlaying && studioState.activeSentence?.index === idx) {
          pauseCurrentPlayback();
        } else {
          playSentence(idx);
        }
        return;
      }

      const loopBtn = e.target.closest('[data-loop-sent]');
      if (loopBtn) {
        const idx = Number(loopBtn.dataset.loopSent);
        const nextLoop = studioState.loopSentenceIndex === idx ? null : idx;
        setSentenceLoop(nextLoop);
        if (nextLoop === idx) {
          playSentence(idx, { preserveLoop: true });
        }
        return;
      }

      const wordSpan = e.target.closest('.clickable-word');
      if (wordSpan) {
        e.stopPropagation();
        openWordLookup(wordSpan.dataset.word, Number(wordSpan.dataset.sentIndex), wordSpan);
        return;
      }

      const line = e.target.closest('[data-line-sent]');
      if (line) {
        playSentence(Number(line.dataset.lineSent));
      }
    });

    // Read Mode Paragraph Interactions (Click Sentence or Alt+Click Word)
    document.getElementById('subview-chunks-list')?.addEventListener('click', (e) => {
      const wordSpan = e.target.closest('.clickable-word');
      if (wordSpan && e.altKey) {
        e.stopPropagation();
        openWordLookup(wordSpan.dataset.word, Number(wordSpan.dataset.sentIndex), wordSpan);
        return;
      }
      const sentSpan = e.target.closest('.read-sentence[data-read-sent]');
      if (sentSpan) {
        playSentence(Number(sentSpan.dataset.readSent));
      }
    });

    // Outside click dismisses Word Lookup Popover cleanly
    document.addEventListener('click', (e) => {
      const popover = document.getElementById('word-lookup-popover');
      if (!popover || popover.hidden) return;
      if (popover.contains(e.target) || e.target.closest('.clickable-word')) return;
      closeWordLookupPopover();
    });

    // Translation Deck
    document.getElementById('translation-toggle-checkbox')?.addEventListener('change', (e) => {
      studioState.translationEnabled = Boolean(e.target.checked);
      requestTranslations(false);
    });

    document.getElementById('trans-lang-select')?.addEventListener('change', (e) => {
      studioState.translationLang = e.target.value;
      localStorage.setItem('flaptap_trans_lang', studioState.translationLang);
      if (studioState.translationEnabled) {
        requestTranslations(false);
      }
    });

    document.getElementById('trans-refresh-btn')?.addEventListener('click', () => {
      if (!studioState.translationEnabled) {
        const cb = document.getElementById('translation-toggle-checkbox');
        if (cb) cb.checked = true;
        studioState.translationEnabled = true;
      }
      requestTranslations(true);
    });

    // Listen Mode (Cloze Dictation)
    document.getElementById('dict-prev-btn')?.addEventListener('click', () => {
      if (studioState.dictationIndex > 1) {
        studioState.dictationIndex--;
        renderDictationCard();
        playSentence(studioState.dictationIndex);
      }
    });

    document.getElementById('dict-next-btn')?.addEventListener('click', () => {
      const max = (studioState.item?.sentences || []).length;
      if (studioState.dictationIndex < max) {
        studioState.dictationIndex++;
        renderDictationCard();
        playSentence(studioState.dictationIndex);
      }
    });

    document.querySelectorAll('[data-dict-level]').forEach((pill) => {
      pill.addEventListener('click', () => {
        studioState.dictationLevel = pill.dataset.dictLevel;
        renderDictationCard();
      });
    });

    document.getElementById('dict-play-btn')?.addEventListener('click', () => {
      if (studioState.isPlaying && studioState.activeSentence?.index === studioState.dictationIndex) {
        pauseCurrentPlayback();
      } else {
        playSentence(studioState.dictationIndex);
      }
    });

    document.getElementById('dict-check-btn')?.addEventListener('click', () => {
      checkDictationAnswers(false);
    });

    document.getElementById('dict-reveal-btn')?.addEventListener('click', () => {
      checkDictationAnswers(true);
    });

    document.getElementById('dictation-sentence-area')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkDictationAnswers(false);
      }
    });

    // Coach Mode Actions
    document.getElementById('coach-retry-btn')?.addEventListener('click', () => {
      triggerDynamicCoachAnalysis(true);
    });

    document.getElementById('coach-refresh-btn')?.addEventListener('click', () => {
      triggerDynamicCoachAnalysis(true);
    });

    document.getElementById('mode-panel-coach')?.addEventListener('click', (e) => {
      const playClip = e.target.closest('[data-coach-play]');
      if (playClip) {
        const idx = Number(playClip.dataset.coachPlay) || 1;
        if (studioState.isPlaying && studioState.activeSentence?.index === idx) {
          pauseCurrentPlayback();
        } else {
          playSentence(idx);
        }
        return;
      }

      const saveExpr = e.target.closest('[data-save-expr]');
      if (saveExpr && studioState.item?.aiAnalysis) {
        const entry = studioState.item.aiAnalysis.expressions[Number(saveExpr.dataset.saveExpr)];
        if (entry) saveWordToVault(entry);
        return;
      }

      const saveVocab = e.target.closest('[data-save-vocab]');
      if (saveVocab && studioState.item?.aiAnalysis) {
        const entry = studioState.item.aiAnalysis.vocabulary[Number(saveVocab.dataset.saveVocab)];
        if (entry) saveWordToVault(entry);
      }
    });

    // Word Lookup Popover
    document.getElementById('wp-close-btn')?.addEventListener('click', closeWordLookupPopover);

    document.getElementById('wp-play-btn')?.addEventListener('click', () => {
      if (studioState.activeWordLookup?.sentenceIndex) {
        playSentence(studioState.activeWordLookup.sentenceIndex);
      }
    });

    document.getElementById('wp-save-btn')?.addEventListener('click', () => {
      if (studioState.activeWordLookup) {
        saveWordToVault(studioState.activeWordLookup);
      }
    });

    // Study Notes Auto-Save (localStorage + SQLite)
    let notesDebounce = null;
    document.getElementById('study-notes-textarea')?.addEventListener('input', (e) => {
      if (!studioState.item) return;
      const val = e.target.value;
      localStorage.setItem(`notes_${studioState.item.id}`, val);
      const indicator = document.getElementById('notes-save-indicator');
      if (indicator) indicator.textContent = t('savingStatus');

      clearTimeout(notesDebounce);
      notesDebounce = setTimeout(async () => {
        try {
          const res = await apiFetch(`/api/history/${encodeURIComponent(studioState.item.id)}/notes`, {
            method: 'PUT',
            body: JSON.stringify({ studyNotes: val }),
          });
          studioState.item.studyNotes = val;
          if (res.noteMarkdown) studioState.item.noteMarkdown = res.noteMarkdown;
          if (indicator) indicator.textContent = t('savedStatus');
        } catch {
          if (indicator) indicator.textContent = t('savedStatus');
        }
      }, 450);
    });

    // Complete Session (Increment Drill & Streak)
    document.getElementById('complete-drill-btn')?.addEventListener('click', async () => {
      if (!studioState.item) return;
      try {
        const updated = await apiFetch(`/api/history/${encodeURIComponent(studioState.item.id)}/drill`, {
          method: 'POST',
          body: JSON.stringify({ mode: studioState.mode }),
        });
        studioState.item.completedDrills = updated.completedDrills;
        document.getElementById('drill-counter-badge').textContent = String(updated.completedDrills || 0);
        showToast(t('sessionCompletedToast'));
      } catch (err) {
        showToast(err.message);
      }
    });

    // Export Markdown Study Sheet
    document.getElementById('download-obsidian-btn')?.addEventListener('click', () => {
      if (!studioState.item) return;
      const notesVal = document.getElementById('study-notes-textarea')?.value || '';
      let md = studioState.item.noteMarkdown || `# ${studioState.item.title}\n`;
      if (notesVal && !md.includes(notesVal)) {
        md = `# ${studioState.item.title}\n\n## Personal Study Notes\n\n${notesVal}\n\n---\n\n${md}`;
      }
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      const slug = (studioState.item.title || 'flaptap-lesson')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
      a.href = URL.createObjectURL(blob);
      a.download = `${slug || 'lesson'}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      showToast(t('mdExportedToast'));
    });

    // Voice Recorder
    document.getElementById('record-toggle-btn')?.addEventListener('click', toggleVoiceRecording);
    document.getElementById('replay-original-btn')?.addEventListener('click', () => {
      const idx = studioState.activeSentence?.index || 1;
      if (studioState.isPlaying && studioState.activeSentence?.index === idx) {
        pauseCurrentPlayback();
      } else {
        playSentence(idx);
      }
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const popover = document.getElementById('word-lookup-popover');
        if (popover && !popover.hidden) {
          closeWordLookupPopover();
          return;
        }
      }

      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        return;
      }
      if (!studioState.item) return;

      const sentences = studioState.item.sentences || [];
      const currIdx = studioState.activeSentence?.index || 1;

      if (e.code === 'Space') {
        e.preventDefault();
        if (studioState.isPlaying) {
          pauseCurrentPlayback();
        } else {
          playSentence(currIdx, { preserveLoop: studioState.loopSentenceIndex === currIdx });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currIdx < sentences.length) playSentence(currIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currIdx > 1) playSentence(currIdx - 1);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        const nextLoop = studioState.loopSentenceIndex === currIdx ? null : currIdx;
        setSentenceLoop(nextLoop);
        if (nextLoop === currIdx) {
          playSentence(currIdx, { preserveLoop: true });
        }
      } else if (e.key === 't' || e.key === 'T') {
        if (studioState.mode === 'shadow') {
          e.preventDefault();
          const cb = document.getElementById('translation-toggle-checkbox');
          if (cb) {
            cb.checked = !cb.checked;
            studioState.translationEnabled = cb.checked;
            requestTranslations(false);
          }
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      if (studioState.mediaRecorder && studioState.mediaRecorder.state === 'recording') {
        try {
          studioState.mediaRecorder.stop();
        } catch {}
      }
      if (studioState.recordedAudioUrl) {
        URL.revokeObjectURL(studioState.recordedAudioUrl);
      }
    });
  }

  /* Bootstrap */
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(studioState.theme);
    applyUiLanguage(studioState.uiLang);
    setStudioLayout(studioState.layout === 'top' ? 'top' : 'side');
    bindEvents();
    loadLanguagesCatalog();
    loadStudioSession();
  });
})();
