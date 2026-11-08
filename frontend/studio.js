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
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
  const PLAYING_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
  const PAUSE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
  const LOOP_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 2 21 6 17 10"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 22 3 18 7 14"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>';
  const TRANSLATE_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>';
  const SPINNER_ICON_SVG =
    '<svg class="trans-spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  const I18N = {
    en: {
      preparingLesson: 'Preparing your lesson...',
      extractingTimings: 'Extracting verbatim speech and exact word timings.',
      backToLibrary: 'Back to Library',
      tryAgain: 'Try Again',
      libraryBack: 'Library',
      layoutSide: 'Transcript',
      layoutTheater: 'Theater',
      layoutTop: 'Top',
      layoutFocus: 'Focus',
      keyLayout: 'Layout',
      masterTransportLabel: 'Master Transport',
      signIn: 'Sign in',
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
      translationLangLabel: 'Language',
      transLangNone: 'None (Off)',
      translateActiveBtn: 'Translate Active',
      activeDoneBtn: 'Active Done',
      activeSentenceDoneHint: 'Active sentence is translated and saved permanently',
      showTranslationsLabel: 'Show translations',
      translateSentenceBtn: 'Translate',
      translateAllBtn: 'Translate All',
      translateRemainingBtn: 'Translate Remaining',
      translatingShort: 'Translating...',
      allTranslatedBtn: 'All Translated',
      allTranslatedHint: 'All sentences are translated and saved permanently — no AI quota used',
      translationOffHint: 'Select a language to enable translation',
      readyToTranslateHint: 'Click Translate on any sentence or Translate All',
      translatedSavedShort: 'translated · Saved',
      allTranslatedSavedHint: 'Saved permanently',
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
      playingBtn: 'Playing',
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
      layoutSide: 'تفريغ',
      layoutTheater: 'مسرح',
      layoutTop: 'علوي',
      layoutFocus: 'تركيز',
      keyLayout: 'تخطيط العرض',
      masterTransportLabel: 'التحكم الرئيسي',
      signIn: 'تسجيل الدخول',
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
      translationLangLabel: 'اللغة',
      transLangNone: 'بدون ترجمة (إيقاف)',
      translateActiveBtn: 'ترجمة الجملة',
      activeDoneBtn: 'تمت ترجمة الجملة',
      activeSentenceDoneHint: 'الجملة الحالية مترجمة ومحفوظة نهائياً',
      showTranslationsLabel: 'إظهار الترجمة',
      translateSentenceBtn: 'ترجمة',
      translateAllBtn: 'ترجمة الكل',
      translateRemainingBtn: 'ترجمة المتبقي',
      translatingShort: 'جارٍ الترجمة...',
      allTranslatedBtn: 'تمت ترجمة الكل',
      allTranslatedHint: 'تمت ترجمة جميع الجمل وحفظها نهائياً — بدون استهلاك رصيد الذكاء الاصطناعي',
      translationOffHint: 'اختر لغة لتفعيل الترجمة',
      readyToTranslateHint: 'اضغط ترجمة على أي جملة أو ترجمة الكل',
      translatedSavedShort: 'مترجم ومحفوظ',
      allTranslatedSavedHint: 'محفوظة نهائياً',
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
      playingBtn: 'يعمل',
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
      translationLangLabel: 'Idioma',
      transLangNone: 'Ninguno (Desactivado)',
      translateActiveBtn: 'Traducir activa',
      activeDoneBtn: 'Activa lista',
      activeSentenceDoneHint: 'La frase activa está traducida y guardada',
      showTranslationsLabel: 'Mostrar traducciones',
      translateSentenceBtn: 'Traducir',
      translateAllBtn: 'Traducir todo',
      translateRemainingBtn: 'Traducir restantes',
      allTranslatedBtn: 'Todo traducido',
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
      translationLangLabel: 'Langue',
      transLangNone: 'Aucun (Désactivé)',
      translateActiveBtn: 'Traduire active',
      activeDoneBtn: 'Active faite',
      activeSentenceDoneHint: 'La phrase active est traduite et enregistrée',
      showTranslationsLabel: 'Afficher les traductions',
      translateSentenceBtn: 'Traduire',
      translateAllBtn: 'Tout traduire',
      translateRemainingBtn: 'Traduire le reste',
      allTranslatedBtn: 'Tout traduit',
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
      translationLangLabel: 'Sprache',
      transLangNone: 'Keine (Aus)',
      translateActiveBtn: 'Aktiv übersetzen',
      activeDoneBtn: 'Aktiv fertig',
      activeSentenceDoneHint: 'Aktiver Satz ist übersetzt und gespeichert',
      showTranslationsLabel: 'Übersetzungen anzeigen',
      translateSentenceBtn: 'Übersetzen',
      translateAllBtn: 'Alle übersetzen',
      translateRemainingBtn: 'Restliche übersetzen',
      allTranslatedBtn: 'Alle übersetzt',
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
      translationLangLabel: 'Dil',
      transLangNone: 'Yok (Kapalı)',
      translateActiveBtn: 'Aktifi Çevir',
      activeDoneBtn: 'Aktif Tamam',
      activeSentenceDoneHint: 'Aktif cümle çevrildi ve kaydedildi',
      showTranslationsLabel: 'Çevirileri göster',
      translateSentenceBtn: 'Çevir',
      translateAllBtn: 'Tümünü Çevir',
      translateRemainingBtn: 'Kalanları Çevir',
      allTranslatedBtn: 'Tümü Çevrildi',
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
    activeSentenceStep: 'idle', // 'idle' | 'playing-once' | 'paused-from-once' | 'looping' | 'paused-from-loop'
    endedNaturally: false,
    speed: 1.0,
    seekTargetStart: 0,
    awaitingOnsetUnmute: false,
    lastSeekTime: 0,
    playbackTicker: null,
    translationLang: localStorage.getItem('flaptap_trans_lang') || 'ar',
    translationRtl: true,
    languages: [],
    translationsByLang: {},
    translatingAllByLang: {},
    translatingSentencesByLang: {},
    analysisInFlight: false,
    dictationIndex: 1,
    dictationLevel: 'medium',
    activeWordLookup: null,
    pendingLookupTerm: '',
    savedTerms: new Set(),
    mediaRecorder: null,
    recordedChunks: [],
    recordedAudioUrl: null,
    autoFollow: true,
    userScrolledAway: false,
    showTranslations: true,
    recordingStartTime: 0,
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

    const noneOption = document.querySelector('#trans-lang-select option[value="none"]');
    if (noneOption) {
      noneOption.textContent = t('transLangNone');
    }

    syncPlaybackButtonsDom();
    syncSavedButtonsDom();
    syncTranslationUiState();
  }

  /* ========================================================================
     ATOMIC PLAYBACK & BUTTON STATE SYNCHRONIZATION
     Prevents stale `.active` / `aria-pressed` across Loop, Play, Flow & Save
     ======================================================================== */

  function syncPlaybackButtonsDom() {
    const activeIdx = studioState.activeSentence?.index ?? (studioState.item?.sentences?.[0]?.index ?? 1);
    const loopIdx = studioState.loopSentenceIndex;
    const isPlaying = Boolean(studioState.isPlaying);

    // 1. Play/Pause Buttons (Pure Icon, 2 States Only: Play vs Pause)
    document.querySelectorAll('[data-play-sent]').forEach((btn) => {
      const idx = Number(btn.dataset.playSent);
      const isThisActive = activeIdx !== null && idx === activeIdx;
      const isThisPlaying = isPlaying && isThisActive;

      btn.classList.toggle('active', isThisPlaying);
      btn.classList.toggle('is-playing', isThisPlaying);
      btn.setAttribute('aria-pressed', isThisPlaying ? 'true' : 'false');
      btn.dataset.playState = isThisPlaying ? 'playing' : 'idle';
      btn.title = isThisPlaying ? t('pauseBtn') : t('playBtn');
      btn.setAttribute('aria-label', isThisPlaying ? t('pauseBtn') : t('playBtn'));
      btn.innerHTML = isThisPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
    });

    // 2. Master Transport Play/Pause Button
    const masterPlayBtn = document.getElementById('deck-play-active-btn');
    const masterPlayIcon = document.getElementById('deck-play-icon');
    const masterPauseIcon = document.getElementById('deck-pause-icon');
    const masterPlayText = document.getElementById('deck-play-btn-text');

    if (masterPlayBtn) {
      masterPlayBtn.classList.toggle('is-playing', isPlaying);
      masterPlayBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    }
    if (masterPlayIcon && masterPauseIcon) {
      masterPlayIcon.hidden = isPlaying;
      masterPauseIcon.hidden = !isPlaying;
    }
    if (masterPlayText) {
      const numStr = `#${String(activeIdx).padStart(2, '0')}`;
      masterPlayText.textContent = isPlaying ? `Pause ${numStr}` : `Play ${numStr}`;
    }

    // 3. Active Sentence Time Badge in Side Deck
    const timeBadge = document.getElementById('active-sentence-time-badge');
    if (timeBadge) {
      timeBadge.textContent =
        studioState.activeSentence?.timeRange ||
        (studioState.item?.sentences?.[0]?.timeRange || '—');
    }

    // 4. Floating Jump Pill Target Number
    const jumpNum = document.getElementById('floating-jump-sent-num');
    if (jumpNum) {
      jumpNum.textContent = `#${String(activeIdx).padStart(2, '0')}`;
    }

    // 5. Coach Mode Play Clip buttons
    document.querySelectorAll('[data-coach-play]').forEach((btn) => {
      const idx = Number(btn.dataset.coachPlay);
      const isCoachPlaying = isPlaying && activeIdx !== null && idx === activeIdx;
      btn.classList.toggle('active', isCoachPlaying);
      btn.setAttribute('aria-pressed', isCoachPlaying ? 'true' : 'false');
    });

    // 6. Listen Mode Dictation Play button
    const dictPlayBtn = document.getElementById('dict-play-btn');
    if (dictPlayBtn) {
      const isDictPlaying = isPlaying && activeIdx === studioState.dictationIndex;
      dictPlayBtn.classList.toggle('active', isDictPlaying);
      dictPlayBtn.setAttribute('aria-pressed', isDictPlaying ? 'true' : 'false');
      const span = dictPlayBtn.querySelector('span') || dictPlayBtn;
      span.textContent = isDictPlaying ? t('pauseClipBtn') : t('playClipBtn');
    }

    // 7. Voice Deck Speaker Replay button
    const replayBtn = document.getElementById('replay-original-btn');
    if (replayBtn) {
      replayBtn.classList.toggle('active', isPlaying);
      replayBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    }

    // 8. Sentence Flow Segmented Control (Auto-Pause | Loop | Continuous)
    document.querySelectorAll('.flow-btn[data-end-action]').forEach((btn) => {
      const isSelected = btn.dataset.endAction === studioState.endAction;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });

  }

  function setSentenceLoop(indexOrNull) {
    const nextIdx =
      indexOrNull !== null && indexOrNull !== undefined ? Number(indexOrNull) : null;
    studioState.loopSentenceIndex = nextIdx;
    if (nextIdx !== null) {
      studioState.endAction = 'loop';
    } else if (studioState.endAction === 'loop') {
      studioState.endAction = 'pause';
    }
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
    if (target === 'top' || target === 'focus') target = 'theater';
    if (!['side', 'theater'].includes(target)) target = 'side';
    studioState.layout = target;
    localStorage.setItem('flaptap_studio_layout', target);

    workspace.setAttribute('data-layout', target);

    document.querySelectorAll('.layout-btn[data-layout-choice]').forEach((btn) => {
      const choice = btn.dataset.layoutChoice;
      const isActive =
        choice === target ||
        (choice === 'theater' && (layoutChoice === 'top' || layoutChoice === 'focus'));
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  window.setStudioLayout = setStudioLayout;
  window.switchStudioLayout = setStudioLayout;

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

    // 1. Render Shadow Mode Sentence Cards
    const sentContainer = document.getElementById('subview-sentences-list');
    if (sentContainer) {
      const isLoopMode =
        studioState.endAction === 'loop' || studioState.loopSentenceIndex !== null;
      sentContainer.innerHTML = sentences
        .map((s) => {
          const isActive = activeIdx === s.index;
          const isThisPlaying = Boolean(studioState.isPlaying && isActive);
          const isLoopActive =
            studioState.loopSentenceIndex === s.index ||
            (isActive && studioState.endAction === 'loop');

          const baseHtml = s.highlightedHtml || escapeHtml(s.text);
          const interactiveHtml = decorateClickableWords(baseHtml, s.index);

          const langCode = studioState.translationLang || 'ar';
          const langMap = getLangTranslationMap(langCode);
          const hasTrans = Boolean(langMap[s.index] && String(langMap[s.index]).trim());
          const inFlightSet = studioState.translatingSentencesByLang[langCode] || new Set();
          const isTranslatingAll = Boolean(studioState.translatingAllByLang[langCode]);
          const isSentLoading = !hasTrans && (isTranslatingAll || inFlightSet.has(s.index));
          const isBoxVisible = hasTrans && Boolean(studioState.showTranslations);

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
                    class="sent-action-btn sent-icon-btn sent-trans-btn ${hasTrans ? 'is-translated' : ''} ${isBoxVisible ? 'active' : ''} ${isSentLoading ? 'is-loading' : ''}"
                    data-trans-btn-sent="${s.index}"
                    data-trans-state="${hasTrans ? 'translated' : (isSentLoading ? 'loading' : 'idle')}"
                    aria-pressed="${isBoxVisible ? 'true' : 'false'}"
                    title="${isSentLoading ? escapeHtml(t('translatingShort')) : (hasTrans ? (isBoxVisible ? 'Hide translation' : 'Show translation') : 'Translate sentence')}"
                    aria-label="${isSentLoading ? escapeHtml(t('translatingShort')) : (hasTrans ? (isBoxVisible ? 'Hide translation' : 'Show translation') : 'Translate sentence')}"
                    ${isSentLoading ? 'disabled' : ''}
                  >
                    ${isSentLoading ? SPINNER_ICON_SVG : TRANSLATE_ICON_SVG}
                  </button>
                  <button
                    type="button"
                    class="sent-action-btn sent-icon-btn sent-play-btn ${isThisPlaying ? 'active is-playing' : ''}"
                    data-play-sent="${s.index}"
                    data-play-state="${isThisPlaying ? 'playing' : 'idle'}"
                    aria-pressed="${isThisPlaying ? 'true' : 'false'}"
                    title="${escapeHtml(isThisPlaying ? t('pauseBtn') : t('playBtn'))}"
                    aria-label="${escapeHtml(isThisPlaying ? t('pauseBtn') : t('playBtn'))}"
                  >
                    ${isThisPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG}
                  </button>
                </div>
              </div>

              <div class="sent-english-line" data-line-sent="${s.index}">${interactiveHtml}</div>

              <div class="sentence-translation-box" data-trans-box="${s.index}" hidden>
                <div
                  class="sentence-translation-text"
                  dir="${studioState.translationRtl ? 'rtl' : 'ltr'}"
                  data-trans-sent="${s.index}"
                ></div>
              </div>
            </article>
          `;
        })
        .join('');
    }

    syncTranslationUiState();

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
     UNIVERSAL MEDIA PLAYERS (YOUTUBE & HTML5) & EXACT PLAYBACK BOUNDARIES
     ======================================================================== */

  function mountMediaDeck(item) {
    const ytDiv = document.getElementById('studio-youtube-player');
    const ttsStage = document.getElementById('tts-audio-stage');

    const vidId = String(item.videoId || item.video_id || '').trim();
    const isExternal = vidId.startsWith('ext_') || (vidId.length > 0 && !vidId.match(/^[a-zA-Z0-9_-]{11}$/));

    if (vidId && isExternal) {
      if (ttsStage) ttsStage.hidden = true;
      if (ytDiv) ytDiv.hidden = false;
      createHtml5Player(vidId);
    } else if (vidId) {
      if (ttsStage) ttsStage.hidden = true;
      if (ytDiv) ytDiv.hidden = false;
      loadYouTubeIframeApi(vidId);
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

  function createHtml5Player(mediaId) {
    if (studioState.ytPlayer) return; // Never remount!
    const container = document.getElementById('video-stage-container');
    if (!container) return;

    let videoEl = document.getElementById('studio-html5-player');
    if (!videoEl) {
      const ytDiv = document.getElementById('studio-youtube-player');
      if (ytDiv) ytDiv.style.display = 'none';

      videoEl = document.createElement('video');
      videoEl.id = 'studio-html5-player';
      videoEl.className = 'studio-html5-video';
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('controls', '');
      videoEl.setAttribute('preload', 'auto');
      videoEl.src = `/api/tracks/shadowing/media/${encodeURIComponent(mediaId)}`;
      container.appendChild(videoEl);

      videoEl.addEventListener('play', () => {
        studioState.isPlaying = true;
        syncPlaybackButtonsDom();
        startPlaybackTicker();
      });

      videoEl.addEventListener('pause', () => {
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      });

      videoEl.addEventListener('ended', () => {
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      });

      videoEl.addEventListener('timeupdate', () => {
        if (!studioState.isPlaying) {
          checkSentenceDrillProgress();
        }
      });
    }

    studioState.ytPlayer = {
      isHtml5: true,
      seekTo(seconds, allowSeekAhead) {
        if (videoEl) videoEl.currentTime = Number(seconds) || 0;
      },
      playVideo() {
        if (videoEl) {
          const p = videoEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      },
      pauseVideo() {
        if (videoEl) videoEl.pause();
      },
      mute() {
        if (videoEl) videoEl.muted = true;
      },
      unMute() {
        if (videoEl) videoEl.muted = false;
      },
      getCurrentTime() {
        return videoEl ? videoEl.currentTime : 0;
      },
      getDuration() {
        return videoEl ? videoEl.duration : 0;
      },
      setPlaybackRate(rate) {
        if (videoEl) videoEl.playbackRate = Number(rate) || 1.0;
      },
      getPlayerState() {
        if (!videoEl) return 2;
        return videoEl.paused ? 2 : 1;
      },
    };

    studioState.ytReady = true;
    try {
      studioState.ytPlayer.setPlaybackRate(studioState.speed);
    } catch {}
    if (studioState.pendingPlaySentenceIndex !== null) {
      const idx = studioState.pendingPlaySentenceIndex;
      studioState.pendingPlaySentenceIndex = null;
      playSentence(idx, { preserveLoop: studioState.loopSentenceIndex === idx });
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
            startPlaybackTicker();
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

    const activeBadge = document.getElementById('active-sentence-time-badge');
    const targetSentence = (studioState.item?.sentences || []).find((s) => s.index === index);
    if (activeBadge && targetSentence) {
      activeBadge.textContent = targetSentence.timeRange || '—';
    }
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

    const wasDifferentSentence = studioState.activeSentence?.index !== sentence.index;
    const shouldInheritLoop =
      options.forceMode === 'loop' ||
      options.preserveLoop === true ||
      (options.forceMode !== 'once' &&
        (studioState.endAction === 'loop' || studioState.loopSentenceIndex !== null));

    if (shouldInheritLoop) {
      studioState.loopSentenceIndex = sentence.index;
      studioState.endAction = 'loop';
      if (!options.keepStep) {
        studioState.activeSentenceStep = 'looping';
      }
    } else {
      studioState.loopSentenceIndex = null;
      if (studioState.endAction === 'loop') {
        studioState.endAction = 'pause';
      }
      if (!options.keepStep) {
        studioState.activeSentenceStep = 'playing-once';
      }
    }

    studioState.endedNaturally = false;
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
              playSentence(sentence.index, { preserveLoop: true, keepStep: true });
              return;
            }
            studioState.isPlaying = false;
            studioState.endedNaturally = true;
            studioState.activeSentenceStep = 'idle';
            syncPlaybackButtonsDom();
          };
          utter.onerror = () => {
            studioState.isPlaying = false;
            studioState.activeSentenceStep = 'idle';
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
    // 1. Seek to exact `startSec`
    // 2. Mute during asynchronous seek, unmute at word onset
    // 3. Play through natural sentence acoustic decay before pausing/looping
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

  function handleSentencePlayButtonClick(idx) {
    if (studioState.isPlaying && studioState.activeSentence?.index === idx) {
      pauseCurrentPlayback();
    } else {
      const isLoopMode =
        studioState.loopSentenceIndex === idx || studioState.endAction === 'loop';
      playSentence(idx, {
        forceMode: isLoopMode ? 'loop' : 'once',
      });
    }
  }

  function handleSentenceLoopButtonClick(idx) {
    const isCurrentlyLooping =
      studioState.loopSentenceIndex === idx ||
      (studioState.activeSentence?.index === idx && studioState.endAction === 'loop');

    if (isCurrentlyLooping) {
      setSentenceLoop(null);
    } else {
      setSentenceLoop(idx);
      if (!studioState.isPlaying || studioState.activeSentence?.index !== idx) {
        playSentence(idx, { forceMode: 'loop' });
      }
    }
    syncPlaybackButtonsDom();
  }

  function handleSentenceTranslateButtonClick(idx) {
    const sIdx = Number(idx);
    if (!Number.isFinite(sIdx) || sIdx <= 0) return;

    let langCode = studioState.translationLang || 'ar';
    if (langCode === 'none') {
      langCode = 'ar';
      studioState.translationLang = 'ar';
      const select = document.getElementById('trans-lang-select');
      if (select) select.value = 'ar';
    }

    const langMap = getLangTranslationMap(langCode);
    const hasTrans = Boolean(langMap[sIdx] && String(langMap[sIdx]).trim());

    if (hasTrans) {
      // Already translated: toggle visibility of this sentence translation box without API calls
      const box = document.querySelector(`[data-trans-box="${sIdx}"]`);
      const transBtn = document.querySelector(`[data-trans-btn-sent="${sIdx}"]`);
      if (box) {
        box.hidden = !box.hidden;
        if (transBtn) {
          transBtn.classList.toggle('active', !box.hidden);
          transBtn.setAttribute('aria-pressed', !box.hidden ? 'true' : 'false');
          transBtn.title = !box.hidden ? 'Hide translation' : 'Show translation';
        }
      }
    } else {
      // Not translated yet: trigger single sentence translation
      translateSingleSentence(sIdx);
    }
  }

  window.handleSentencePlayButtonClick = handleSentencePlayButtonClick;
  window.handleSentenceLoopButtonClick = handleSentenceLoopButtonClick;
  window.handleSentenceTranslateButtonClick = handleSentenceTranslateButtonClick;

  function startPlaybackTicker() {
    if (studioState.playbackTicker) {
      clearInterval(studioState.playbackTicker);
    }
    studioState.playbackTicker = setInterval(checkSentenceDrillProgress, 15);
  }

  function checkSentenceDrillProgress() {
    const player = studioState.ytPlayer;
    if (!player || typeof player.getCurrentTime !== 'function') return;

    const current = Number(player.getCurrentTime() || 0);
    const active = studioState.activeSentence;

    if (active && studioState.awaitingOnsetUnmute && current >= active.startSec - 0.001) {
      if (typeof player.unMute === 'function') player.unMute();
      studioState.awaitingOnsetUnmute = false;
    }

    // Ignore stale pre-seek playhead values for 90ms after issuing an async seek
    if (studioState.lastSeekTime > 0 && Date.now() - studioState.lastSeekTime < 90) {
      return;
    }

    // 1. Real-Time Playhead Tracking: Update active sentence as video progresses
    const sentences = studioState.item?.sentences || [];
    if (sentences.length > 0) {
      const match = sentences.find((s) => current >= s.startSec && current < s.endSec);
      if (match && (!active || active.index !== match.index)) {
        studioState.activeSentence = match;
        updateActiveSentenceDom(match.index);
        syncPlaybackButtonsDom();
        scrollSentenceIntoView(match.index, false);
      }
    }

    // 2. Playback Boundary Enforcement (Exact startSec to endSec - 12ms cutoff)
    if (active) {
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
          studioState.endedNaturally = true;
          studioState.activeSentenceStep = 'idle';
          syncPlaybackButtonsDom();
          syncFloatingJumpButton();
          return;
        }

        // Continuous flow: advance active sentence highlight without seeking/stuttering
        const nextSentence = sentences.find((s) => s.index === active.index + 1);
        if (nextSentence) {
          if (studioState.loopSentenceIndex !== null) {
            studioState.loopSentenceIndex = nextSentence.index;
          }
          studioState.activeSentence = nextSentence;
          studioState.activeSentenceStep = 'playing-once';
          updateActiveSentenceDom(nextSentence.index);
          syncPlaybackButtonsDom();
          scrollSentenceIntoView(nextSentence.index, false);
        } else {
          if (typeof player.pauseVideo === 'function') player.pauseVideo();
          if (studioState.playbackTicker) {
            clearInterval(studioState.playbackTicker);
            studioState.playbackTicker = null;
          }
          studioState.isPlaying = false;
          studioState.endedNaturally = true;
          studioState.activeSentenceStep = 'idle';
          syncPlaybackButtonsDom();
          syncFloatingJumpButton();
        }
      }
    }
  }

  window.checkSentenceDrillProgress = checkSentenceDrillProgress;

  /* ========================================================================
     REAL-TIME AUTO-FOLLOW & FLUID PLAYBACK SCROLL SYNC
     ======================================================================== */

  function scrollSentenceIntoView(index, force) {
    if (!studioState.autoFollow && !force) return;
    if (studioState.userScrolledAway && !force) return;

    if (studioState.mode === 'shadow') {
      const card = document.getElementById(`sent-card-${index}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (studioState.mode === 'read') {
      const readSent = document.querySelector(`.read-sentence[data-read-sent="${index}"]`);
      if (readSent) {
        readSent.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (studioState.mode === 'listen') {
      studioState.dictationIndex = index;
      renderDictationCard();
    }
  }

  function syncAutoFollowButtonDom() {
    const btn = document.getElementById('deck-auto-follow-btn');
    const textEl = document.getElementById('deck-auto-follow-text');
    if (btn) {
      btn.classList.toggle('active', studioState.autoFollow);
      btn.setAttribute('aria-pressed', studioState.autoFollow ? 'true' : 'false');
    }
    if (textEl) {
      textEl.innerHTML = `Auto-Follow: <strong>${studioState.autoFollow ? 'ON' : 'OFF'}</strong>`;
    }
  }

  function syncFloatingJumpButton() {
    const pill = document.getElementById('floating-jump-active-btn');
    if (!pill) return;
    const shouldShow = Boolean(studioState.userScrolledAway && studioState.isPlaying);
    pill.hidden = !shouldShow;
    if (shouldShow) {
      const jumpNum = document.getElementById('floating-jump-sent-num');
      if (jumpNum) {
        const curr = studioState.activeSentence?.index || 1;
        jumpNum.textContent = `#${String(curr).padStart(2, '0')}`;
      }
    }
  }

  /* ========================================================================
     SPEED CONTROL (0.05x Precision + Stepper Buttons)
     ======================================================================== */

  function setStudioSpeed(rawVal) {
    let num = Number(rawVal);
    if (!Number.isFinite(num)) num = 1.0;
    num = Math.max(0.25, Math.min(2.0, num));

    // Exact 0.05x precision fractions (0.25, 0.30, 0.35 ... 1.00 ... 2.00)
    const speed = Math.round(num * 20) / 20;

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

  function stepSpeed(delta) {
    setStudioSpeed(studioState.speed + delta);
  }

  window.setStudioSpeed = setStudioSpeed;
  window.stepSpeed = stepSpeed;

  window.setStudioSpeed = setStudioSpeed;

  /* ========================================================================
     170+ WORLD LANGUAGE TRANSLATION DECK
     Strict 2-Trigger State Machine (Per-Sentence + Translate All) · Quota Lock
     ======================================================================== */

  function getLangTranslationMap(langCode) {
    if (!langCode || langCode === 'none') return {};
    if (!studioState.translationsByLang[langCode]) {
      studioState.translationsByLang[langCode] = {};
    }
    const target = studioState.translationsByLang[langCode];
    const itemCache = studioState.item?.translationsCache?.[langCode];
    if (itemCache && typeof itemCache === 'object') {
      for (const [k, v] of Object.entries(itemCache)) {
        const idx = Number(k);
        if (Number.isFinite(idx) && typeof v === 'string' && v.trim() && !target[idx]) {
          target[idx] = v;
        }
      }
    }
    const sentences = studioState.item?.sentences || [];
    for (const s of sentences) {
      const idx = Number(s.index);
      const val = s.translations?.[langCode];
      if (Number.isFinite(idx) && typeof val === 'string' && val.trim() && !target[idx]) {
        target[idx] = val;
      }
    }
    return target;
  }

  function mergeTranslationsIntoStudioState(langCode, incomingMap) {
    if (!langCode || !incomingMap || typeof incomingMap !== 'object') return;
    const map = getLangTranslationMap(langCode);
    for (const [k, v] of Object.entries(incomingMap)) {
      const idx = Number(k);
      if (Number.isFinite(idx) && typeof v === 'string' && v.trim()) {
        map[idx] = v;
      }
    }
    if (studioState.item) {
      if (!studioState.item.translationsCache) studioState.item.translationsCache = {};
      studioState.item.translationsCache[langCode] = Object.assign(
        {},
        studioState.item.translationsCache[langCode] || {},
        map,
      );
      if (Array.isArray(studioState.item.sentences)) {
        for (const s of studioState.item.sentences) {
          const val = map[Number(s.index)];
          if (!val) continue;
          if (!s.translations) s.translations = {};
          s.translations[langCode] = val;
        }
      }
    }
  }

  async function loadLanguagesCatalog() {
    try {
      const data = await apiFetch('/api/languages', { method: 'GET' });
      studioState.languages = Array.isArray(data.languages) ? data.languages : [];
      const select = document.getElementById('trans-lang-select');
      if (!select) return;

      const optionsHtml = [
        `<option value="none">${escapeHtml(t('transLangNone'))}</option>`,
        ...studioState.languages.map(
          (l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} — ${escapeHtml(l.native)}</option>`,
        ),
      ].join('');
      select.innerHTML = optionsHtml;

      const preferred = studioState.translationLang || data.defaultLanguage || 'ar';
      if (preferred === 'none') {
        select.value = 'none';
        studioState.translationLang = 'none';
      } else if (studioState.languages.some((l) => l.code === preferred)) {
        select.value = preferred;
        studioState.translationLang = preferred;
      } else if (studioState.languages[0]) {
        select.value = studioState.languages[0].code;
        studioState.translationLang = studioState.languages[0].code;
      }

      const langMeta = studioState.languages.find((l) => l.code === studioState.translationLang);
      studioState.translationRtl = Boolean(langMeta?.rtl ?? (studioState.translationLang === 'ar'));
      syncTranslationUiState();
    } catch {}
  }

  function syncTranslationUiState() {
    const langCode = studioState.translationLang || 'ar';
    const select = document.getElementById('trans-lang-select');
    if (select && select.options.length > 0 && select.value !== langCode) {
      if ([...select.options].some((o) => o.value === langCode)) {
        select.value = langCode;
      }
    }

    const allBtn = document.getElementById('trans-all-btn');
    const statusEl = document.getElementById('translation-status-text');
    const sideStatusEl = document.getElementById('side-trans-status-text');
    const sideActiveBtn = document.getElementById('side-trans-active-btn');
    const sideAllBtn = document.getElementById('side-trans-all-btn');
    const visToggle = document.getElementById('side-trans-visibility-toggle');

    if (visToggle) {
      visToggle.checked = Boolean(studioState.showTranslations);
    }

    if (langCode === 'none') {
      if (allBtn) {
        allBtn.hidden = true;
        allBtn.disabled = true;
        allBtn.classList.remove('is-loading', 'is-completed');
        allBtn.dataset.transAllState = 'off';
      }
      if (statusEl) {
        statusEl.textContent = t('translationOffHint');
      }
      if (sideStatusEl) {
        sideStatusEl.textContent = 'Off';
      }
      document.querySelectorAll('.sentence-translation-box').forEach((box) => {
        box.hidden = true;
      });
      document.querySelectorAll('[data-trans-btn-sent]').forEach((btn) => {
        btn.disabled = true;
        btn.classList.remove('is-loading', 'is-translated', 'active');
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML = TRANSLATE_ICON_SVG;
        btn.title = t('translationOffHint');
        btn.dataset.transState = 'off';
      });
      return;
    }

    const langMeta = studioState.languages.find((l) => l.code === langCode);
    const rtl = Boolean(langMeta ? langMeta.rtl : langCode === 'ar');
    studioState.translationRtl = rtl;
    const langName = langMeta ? langMeta.name : langCode.toUpperCase();

    const sentences = studioState.item?.sentences || [];
    const totalSentences = sentences.length;
    const langMap = getLangTranslationMap(langCode);
    const isTranslatingAll = Boolean(studioState.translatingAllByLang[langCode]);
    const inFlightSet = studioState.translatingSentencesByLang[langCode] || new Set();

    let translatedCount = 0;
    for (const s of sentences) {
      const idx = Number(s.index);
      const html = langMap[idx];
      const hasTrans = Boolean(html && String(html).trim());
      if (hasTrans) translatedCount++;
      const isSentLoading = !hasTrans && (isTranslatingAll || inFlightSet.has(idx));

      const box = document.querySelector(`[data-trans-box="${idx}"]`);
      const textEl = document.querySelector(`.sentence-translation-text[data-trans-sent="${idx}"]`);
      const transBtn = document.querySelector(`[data-trans-btn-sent="${idx}"]`);

      if (hasTrans) {
        if (box) {
          box.hidden = !studioState.showTranslations;
        }
        if (textEl) {
          textEl.classList.remove('is-loading');
          textEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
          if (textEl.innerHTML !== html) {
            textEl.innerHTML = html;
          }
        }
      } else if (isSentLoading) {
        if (box) {
          box.hidden = !studioState.showTranslations;
        }
        if (textEl) {
          textEl.classList.add('is-loading');
          textEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
          textEl.textContent = t('translatingStatus');
        }
      } else {
        if (box) {
          box.hidden = true;
        }
        if (textEl) {
          textEl.classList.remove('is-loading');
          textEl.textContent = '';
        }
      }

      if (transBtn) {
        if (isSentLoading) {
          transBtn.disabled = true;
          transBtn.classList.remove('is-translated', 'active');
          transBtn.classList.add('is-loading');
          transBtn.innerHTML = SPINNER_ICON_SVG;
          transBtn.title = t('translatingShort');
          transBtn.setAttribute('aria-label', t('translatingShort'));
          transBtn.setAttribute('aria-pressed', 'false');
          transBtn.dataset.transState = 'loading';
        } else if (hasTrans) {
          transBtn.disabled = false;
          transBtn.classList.remove('is-loading');
          transBtn.classList.add('is-translated');
          const isBoxVisible = Boolean(box && !box.hidden);
          transBtn.classList.toggle('active', isBoxVisible);
          transBtn.setAttribute('aria-pressed', isBoxVisible ? 'true' : 'false');
          transBtn.innerHTML = TRANSLATE_ICON_SVG;
          const hint = isBoxVisible ? 'Hide translation' : 'Show translation';
          transBtn.title = hint;
          transBtn.setAttribute('aria-label', hint);
          transBtn.dataset.transState = 'translated';
        } else {
          transBtn.disabled = isTranslatingAll;
          transBtn.classList.remove('is-loading', 'is-translated', 'active');
          transBtn.setAttribute('aria-pressed', 'false');
          transBtn.innerHTML = TRANSLATE_ICON_SVG;
          transBtn.title = `Translate sentence #${idx}`;
          transBtn.setAttribute('aria-label', `Translate sentence #${idx}`);
          transBtn.dataset.transState = 'idle';
        }
      }
    }

    const untranslatedCount = Math.max(0, totalSentences - translatedCount);
    const activeIdx = studioState.activeSentence?.index || 1;
    const activeHasTrans = Boolean(langMap[activeIdx]);

    if (sideStatusEl) {
      sideStatusEl.classList.remove('is-complete', 'is-translating');
      if (isTranslatingAll) {
        sideStatusEl.classList.add('is-translating');
        sideStatusEl.textContent = `${langName} · Translating...`;
      } else if (totalSentences > 0 && translatedCount >= totalSentences) {
        sideStatusEl.classList.add('is-complete');
        sideStatusEl.textContent = `${langName} · ${totalSentences}/${totalSentences}`;
      } else if (translatedCount > 0) {
        sideStatusEl.textContent = `${langName} · ${translatedCount}/${totalSentences}`;
      } else {
        sideStatusEl.textContent = `${langName} · Ready`;
      }
    }

    if (allBtn) {
      allBtn.hidden = false;
      if (totalSentences > 0 && translatedCount >= totalSentences) {
        allBtn.disabled = true;
        allBtn.classList.remove('is-loading');
        allBtn.classList.add('is-completed');
        allBtn.dataset.transAllState = 'completed';
        allBtn.removeAttribute('aria-busy');
        allBtn.title = t('allTranslatedHint');
        allBtn.innerHTML = `${CHECK_ICON_SVG}<span>${escapeHtml(t('allTranslatedBtn'))}</span>`;
        if (statusEl) {
          statusEl.textContent = `${langName} · ${t('allTranslatedSavedHint')} (${totalSentences}/${totalSentences})`;
        }
      } else if (isTranslatingAll) {
        allBtn.disabled = true;
        allBtn.classList.add('is-loading');
        allBtn.classList.remove('is-completed');
        allBtn.dataset.transAllState = 'loading';
        allBtn.setAttribute('aria-busy', 'true');
        allBtn.title = t('translatingStatus');
        allBtn.innerHTML = `${SPINNER_ICON_SVG}<span>${escapeHtml(t('translatingShort'))} (${translatedCount}/${totalSentences})</span>`;
        if (statusEl) {
          statusEl.textContent = `${langName} · ${t('translatingStatus')}`;
        }
      } else {
        allBtn.disabled = false;
        allBtn.classList.remove('is-loading', 'is-completed');
        allBtn.dataset.transAllState = 'ready';
        allBtn.removeAttribute('aria-busy');
        const label =
          translatedCount > 0
            ? `${t('translateRemainingBtn')} (${untranslatedCount})`
            : `${t('translateAllBtn')} (${totalSentences})`;
        allBtn.title = label;
        allBtn.innerHTML = `${TRANSLATE_ICON_SVG}<span>${escapeHtml(label)}</span>`;
        if (statusEl) {
          if (inFlightSet.size > 0) {
            statusEl.textContent = `${langName} · ${t('translatingStatus')}`;
          } else if (translatedCount > 0) {
            statusEl.textContent = `${langName} · ${translatedCount}/${totalSentences} ${t('translatedSavedShort')}`;
          } else {
            statusEl.textContent = `${langName} · ${t('readyToTranslateHint')}`;
          }
        }
      }
    }
  }

  async function translateSingleSentence(sentenceIndex) {
    if (!studioState.item) return;
    const langCode = studioState.translationLang || 'ar';
    if (langCode === 'none') return;

    const idx = Number(sentenceIndex);
    if (!Number.isFinite(idx) || idx <= 0) return;

    const langMap = getLangTranslationMap(langCode);
    if (langMap[idx]) {
      const box = document.querySelector(`[data-trans-box="${idx}"]`);
      if (box) box.hidden = false;
      syncTranslationUiState();
      return;
    }

    if (studioState.translatingAllByLang[langCode]) return;
    if (!studioState.translatingSentencesByLang[langCode]) {
      studioState.translatingSentencesByLang[langCode] = new Set();
    }
    if (studioState.translatingSentencesByLang[langCode].has(idx)) return;

    studioState.translatingSentencesByLang[langCode].add(idx);
    syncTranslationUiState();

    try {
      const res = await apiFetch('/api/tracks/shadowing/translate-sentences', {
        method: 'POST',
        body: JSON.stringify({
          historyId: studioState.item.id,
          language: langCode,
          force: false,
          sentenceIndices: [idx],
        }),
      });
      studioState.translationRtl = Boolean(res.rtl);
      mergeTranslationsIntoStudioState(langCode, res.translations || {});
      const box = document.querySelector(`[data-trans-box="${idx}"]`);
      if (box) box.hidden = false;
    } catch (error) {
      showToast(error.message);
    } finally {
      studioState.translatingSentencesByLang[langCode]?.delete(idx);
      syncTranslationUiState();
    }
  }

  async function translateAllSentences() {
    if (!studioState.item) return;
    const langCode = studioState.translationLang || 'ar';
    if (langCode === 'none') return;

    const sentences = studioState.item.sentences || [];
    const langMap = getLangTranslationMap(langCode);
    const missing = sentences.filter((s) => !langMap[Number(s.index)]);
    if (missing.length === 0) {
      syncTranslationUiState();
      return;
    }

    if (studioState.translatingAllByLang[langCode]) return;
    studioState.translatingAllByLang[langCode] = true;
    syncTranslationUiState();

    try {
      const res = await apiFetch('/api/tracks/shadowing/translate-sentences', {
        method: 'POST',
        body: JSON.stringify({
          historyId: studioState.item.id,
          language: langCode,
          force: false,
        }),
      });
      studioState.translationRtl = Boolean(res.rtl);
      mergeTranslationsIntoStudioState(langCode, res.translations || {});
    } catch (error) {
      showToast(error.message);
    } finally {
      studioState.translatingAllByLang[langCode] = false;
      syncTranslationUiState();
    }
  }

  window.translateSingleSentence = translateSingleSentence;
  window.translateAllSentences = translateAllSentences;
  window.syncTranslationUiState = syncTranslationUiState;

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
          language:
            studioState.translationLang && studioState.translationLang !== 'none'
              ? studioState.translationLang
              : 'ar',
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
     VOICE RECORDER & ARTICULATORY AUDIT (A/B SEQUENTIAL COMPARISON)
     ======================================================================== */

  let micStream = null;
  let audioContext = null;
  let analyserNode = null;
  let vuInterval = null;
  let recordingTimerInterval = null;

  async function toggleVoiceRecording() {
    const btn = document.getElementById('record-toggle-btn');
    const txt = document.getElementById('record-btn-text');
    const status = document.getElementById('rec-status-label');
    const timerBadge = document.getElementById('rec-timer-badge');
    const vuMeter = document.getElementById('rec-vu-meter');
    const vuFill = document.getElementById('rec-vu-fill');
    const replayBtn = document.getElementById('replay-recording-btn');
    const abBtn = document.getElementById('ab-compare-btn');

    if (studioState.mediaRecorder && studioState.mediaRecorder.state === 'recording') {
      studioState.mediaRecorder.stop();
      return;
    }

    // 1. Immediately pause video playback to avoid microphone bleed
    pauseCurrentPlayback();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Microphone access is not available in this browser.');
      return;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Negotiate supported codec for 100% Safari/WebKit/Chrome reliability
      let chosenType = '';
      const codecs = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
      ];
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        for (const c of codecs) {
          if (MediaRecorder.isTypeSupported(c)) {
            chosenType = c;
            break;
          }
        }
      }

      const options = chosenType ? { mimeType: chosenType } : {};
      const recorder = new MediaRecorder(micStream, options);
      studioState.mediaRecorder = recorder;
      studioState.recordedChunks = [];

      // 3. Web Audio VU meter
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioContext = new AudioCtx();
          const source = audioContext.createMediaStreamSource(micStream);
          analyserNode = audioContext.createAnalyser();
          analyserNode.fftSize = 64;
          source.connect(analyserNode);
          const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

          if (vuMeter) vuMeter.hidden = false;
          clearInterval(vuInterval);
          vuInterval = setInterval(() => {
            if (!analyserNode) return;
            analyserNode.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const pct = Math.min(100, Math.round((avg / 128) * 100));
            if (vuFill) vuFill.style.width = `${pct}%`;
          }, 60);
        }
      } catch {}

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) studioState.recordedChunks.push(e.data);
      };

      recorder.onstop = () => {
        clearInterval(recordingTimerInterval);
        clearInterval(vuInterval);
        if (vuMeter) vuMeter.hidden = true;
        if (vuFill) vuFill.style.width = '0%';
        if (audioContext && audioContext.state !== 'closed') {
          try {
            audioContext.close();
          } catch {}
        }
        if (micStream) {
          micStream.getTracks().forEach((tr) => tr.stop());
          micStream = null;
        }

        const blobType = chosenType || 'audio/webm';
        const blob = new Blob(studioState.recordedChunks, { type: blobType });
        if (studioState.recordedAudioUrl) {
          URL.revokeObjectURL(studioState.recordedAudioUrl);
        }
        studioState.recordedAudioUrl = URL.createObjectURL(blob);

        const audioEl = document.getElementById('recorded-audio-player');
        if (audioEl) {
          audioEl.src = studioState.recordedAudioUrl;
        }

        btn?.classList.remove('recording');
        btn?.setAttribute('aria-pressed', 'false');
        if (txt) txt.textContent = t('recordVoice');
        if (status) status.textContent = t('recSaved');
        if (timerBadge) timerBadge.hidden = true;

        if (replayBtn) replayBtn.disabled = false;
        if (abBtn) abBtn.disabled = false;
      };

      recorder.start(100);
      btn?.classList.add('recording');
      btn?.setAttribute('aria-pressed', 'true');
      if (txt) txt.textContent = t('stopRecord');
      if (status) status.textContent = t('recRecording');

      // Live recording timer badge
      studioState.recordingStartTime = Date.now();
      if (timerBadge) {
        timerBadge.hidden = false;
        timerBadge.textContent = '00:00';
      }
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - studioState.recordingStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        if (timerBadge) timerBadge.textContent = `${mins}:${secs}`;
      }, 500);

    } catch {
      showToast('Microphone permission was denied or unavailable.');
    }
  }

  function playUserRecording(onEnded) {
    const audioEl = document.getElementById('recorded-audio-player');
    if (!studioState.recordedAudioUrl || !audioEl) return;
    audioEl.currentTime = 0;
    if (onEnded) {
      const handler = () => {
        audioEl.removeEventListener('ended', handler);
        onEnded();
      };
      audioEl.addEventListener('ended', handler);
    }
    const p = audioEl.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function startABComparison() {
    const active = studioState.activeSentence || studioState.item?.sentences?.[0];
    if (!active) return;
    if (!studioState.recordedAudioUrl) {
      showToast('Record your voice first to compare with the speaker.');
      return;
    }

    const abBtn = document.getElementById('ab-compare-btn');
    if (abBtn) {
      abBtn.classList.add('active');
      abBtn.disabled = true;
    }

    // 1. Play original speaker sentence clip first
    playSentence(active.index, { forceMode: 'once' });

    // 2. Poll until sentence clip ends naturally, then immediately play user recording!
    const safetyTimer = setTimeout(() => {
      clearInterval(pollDone);
      if (abBtn) {
        abBtn.classList.remove('active');
        abBtn.disabled = false;
      }
    }, 15000);

    const pollDone = setInterval(() => {
      if (!studioState.isPlaying) {
        clearInterval(pollDone);
        clearTimeout(safetyTimer);
        playUserRecording(() => {
          if (abBtn) {
            abBtn.classList.remove('active');
            abBtn.disabled = false;
          }
        });
      }
    }, 40);
  }

  /* ========================================================================
     USER PROFILE HYDRATION IN TOPBAR HEADER
     ======================================================================== */

  async function hydrateStudioUserProfile() {
    const btn = document.getElementById('studio-account-btn');
    const label = document.getElementById('studio-account-label');
    const avatar = document.getElementById('studio-avatar');
    const avatarImg = document.getElementById('studio-avatar-img');
    const guestIcon = document.getElementById('studio-guest-icon');

    if (!studioState.authToken) {
      if (label) label.textContent = t('signIn');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/me', { method: 'GET' });
      if (res && res.user) {
        studioState.user = res.user;
        btn?.classList.add('authenticated');
        if (label) label.textContent = res.user.name.split(' ')[0];
        if (res.user.avatarUrl && avatarImg) {
          avatarImg.src = res.user.avatarUrl;
          avatarImg.hidden = false;
          if (avatar) avatar.hidden = true;
          if (guestIcon) guestIcon.hidden = true;
        } else if (avatar) {
          avatar.textContent = (res.user.name || 'U').charAt(0).toUpperCase();
          avatar.hidden = false;
          if (avatarImg) avatarImg.hidden = true;
          if (guestIcon) guestIcon.hidden = true;
        }
      }
    } catch {}
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
    studioState.translationsByLang = {};
    if (item.translationsCache && typeof item.translationsCache === 'object') {
      for (const [lang, map] of Object.entries(item.translationsCache)) {
        studioState.translationsByLang[lang] = Object.assign({}, map || {});
      }
    }
    studioState.translatingAllByLang = {};
    studioState.translatingSentencesByLang = {};

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
        if (studioState.endAction === 'loop') {
          studioState.loopSentenceIndex = studioState.activeSentence?.index ?? null;
          studioState.activeSentenceStep = studioState.isPlaying ? 'looping' : 'paused-from-once';
        } else {
          studioState.loopSentenceIndex = null;
          studioState.activeSentenceStep = studioState.isPlaying ? 'playing-once' : 'idle';
        }
        syncPlaybackButtonsDom();
      });
    });

    // Speed Slider & Stepper Buttons
    document.getElementById('speed-down-btn')?.addEventListener('click', () => stepSpeed(-0.05));
    document.getElementById('speed-up-btn')?.addEventListener('click', () => stepSpeed(0.05));

    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      setStudioSpeed(e.target.value);
    });

    document.querySelectorAll('#speed-ticks-row .speed-tick').forEach((tick) => {
      tick.addEventListener('click', () => setStudioSpeed(tick.dataset.speed));
    });

    // Master Sentence Transport Controls
    document.getElementById('deck-prev-sent-btn')?.addEventListener('click', () => {
      const curr = studioState.activeSentence?.index || 1;
      if (curr > 1) playSentence(curr - 1);
    });

    document.getElementById('deck-next-sent-btn')?.addEventListener('click', () => {
      const sentences = studioState.item?.sentences || [];
      const curr = studioState.activeSentence?.index || 1;
      if (curr < sentences.length) playSentence(curr + 1);
    });

    document.getElementById('deck-play-active-btn')?.addEventListener('click', () => {
      const curr = studioState.activeSentence?.index || 1;
      handleSentencePlayButtonClick(curr);
    });

    document.getElementById('deck-auto-follow-btn')?.addEventListener('click', () => {
      studioState.autoFollow = !studioState.autoFollow;
      if (studioState.autoFollow) {
        studioState.userScrolledAway = false;
        scrollSentenceIntoView(studioState.activeSentence?.index || 1, true);
      }
      syncAutoFollowButtonDom();
      syncFloatingJumpButton();
    });

    document.getElementById('deck-jump-active-btn')?.addEventListener('click', () => {
      studioState.userScrolledAway = false;
      studioState.autoFollow = true;
      syncAutoFollowButtonDom();
      scrollSentenceIntoView(studioState.activeSentence?.index || 1, true);
      syncFloatingJumpButton();
    });

    document.getElementById('floating-jump-active-btn')?.addEventListener('click', () => {
      studioState.userScrolledAway = false;
      studioState.autoFollow = true;
      syncAutoFollowButtonDom();
      scrollSentenceIntoView(studioState.activeSentence?.index || 1, true);
      syncFloatingJumpButton();
    });

    // User Profile Topbar Button
    document.getElementById('studio-account-btn')?.addEventListener('click', () => {
      if (studioState.authToken) {
        window.location.href = '/?account=open';
      } else {
        redirectToSignInGate();
      }
    });

    // Manual scroll detection: when user scrolls canvas away, show floating jump pill
    window.addEventListener('wheel', (e) => {
      if (e.target.closest('#studio-main-content') && studioState.isPlaying) {
        studioState.userScrolledAway = true;
        syncFloatingJumpButton();
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.target.closest('#studio-main-content') && studioState.isPlaying) {
        studioState.userScrolledAway = true;
        syncFloatingJumpButton();
      }
    }, { passive: true });

    // Shadow Mode Sentence Interactions (Play/Pause, Translate, Click Word, Click Card)
    document.getElementById('subview-sentences-list')?.addEventListener('click', (e) => {
      const transBtn = e.target.closest('[data-trans-btn-sent]');
      if (transBtn) {
        e.stopPropagation();
        const idx = Number(transBtn.dataset.transBtnSent);
        handleSentenceTranslateButtonClick(idx);
        return;
      }

      const playBtn = e.target.closest('[data-play-sent]');
      if (playBtn) {
        e.stopPropagation();
        const idx = Number(playBtn.dataset.playSent);
        handleSentencePlayButtonClick(idx);
        return;
      }

      const wordSpan = e.target.closest('.clickable-word');
      if (wordSpan) {
        e.stopPropagation();
        openWordLookup(wordSpan.dataset.word, Number(wordSpan.dataset.sentIndex), wordSpan);
        return;
      }

      // Full Item Clickable: Clicking anywhere on the sentence card triggers playback
      const card = e.target.closest('.sentence-driller-card[data-sentence-index]');
      if (card) {
        const sentIdx = Number(card.dataset.sentenceIndex);
        if (Number.isFinite(sentIdx)) {
          handleSentencePlayButtonClick(sentIdx);
        }
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

    // Translation Console in Side Deck
    document.getElementById('trans-lang-select')?.addEventListener('change', (e) => {
      studioState.translationLang = e.target.value || 'none';
      localStorage.setItem('flaptap_trans_lang', studioState.translationLang);
      syncTranslationUiState();
    });

    document.getElementById('trans-all-btn')?.addEventListener('click', (e) => {
      if (e.currentTarget?.disabled) return;
      translateAllSentences();
    });

    document.getElementById('side-trans-visibility-toggle')?.addEventListener('change', (e) => {
      studioState.showTranslations = Boolean(e.target.checked);
      syncTranslationUiState();
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

    // Voice Recorder & Articulatory Replay Controls
    document.getElementById('record-toggle-btn')?.addEventListener('click', toggleVoiceRecording);

    document.getElementById('replay-original-btn')?.addEventListener('click', () => {
      const idx = studioState.activeSentence?.index || 1;
      if (studioState.isPlaying && studioState.activeSentence?.index === idx) {
        pauseCurrentPlayback();
      } else {
        playSentence(idx);
      }
    });

    document.getElementById('replay-recording-btn')?.addEventListener('click', () => {
      playUserRecording();
    });

    document.getElementById('ab-compare-btn')?.addEventListener('click', () => {
      startABComparison();
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
        handleSentencePlayButtonClick(currIdx);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currIdx < sentences.length) playSentence(currIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currIdx > 1) playSentence(currIdx - 1);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleSentenceLoopButtonClick(currIdx);
      } else if (e.key === 't' || e.key === 'T') {
        if (studioState.mode === 'shadow' && studioState.translationLang !== 'none') {
          e.preventDefault();
          handleSentenceTranslateButtonClick(currIdx);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        studioState.autoFollow = !studioState.autoFollow;
        if (studioState.autoFollow) {
          studioState.userScrolledAway = false;
          scrollSentenceIntoView(currIdx, true);
        }
        syncAutoFollowButtonDom();
        syncFloatingJumpButton();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        const nextLayout = studioState.layout === 'theater' ? 'side' : 'theater';
        setStudioLayout(nextLayout);
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
    setStudioLayout(studioState.layout === 'theater' ? 'theater' : 'side');
    bindEvents();
    loadLanguagesCatalog();
    hydrateStudioUserProfile();
    loadStudioSession();
  });
})();
