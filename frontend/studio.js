/* ==========================================================================
   FLAPTAP STUDIO ENGINE (studio.js)
   Strict Sign-In Gate · Millisecond Playback Boundaries · 0ms Scalable Modes
   Atomic Button State Synchronization · Dynamic OpenCode Go AI Coach & Lookup
   ========================================================================== */

(function () {
  'use strict';

  const STUDIO_MODES = ['shadow', 'read', 'listen', 'coach', 'notes'];
  const EXACT_SPEED_PRESETS = new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  const RTL_LANGUAGE_CODES = new Set(['ar', 'he', 'fa', 'ur']);

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
  const SPEAKER_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
  const SPINNER_ICON_SVG =
    '<svg class="trans-spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const ITEM_CHECK_ICON_SVG =
    '<svg class="chk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line class="chk-dash" x1="6.5" y1="12" x2="17.5" y2="12"></line><polyline class="chk-tick" points="19.5 7 9.5 17 4.5 12"></polyline></svg>';

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
      flowLoop: 'Loop Once',
      flowContinue: 'Continuous',
      playbackSpeedLabel: 'Playback Speed',
      resetSpeedBtn: 'Reset',
      menuBtnLabel: 'Menu',
      studyToolsLabel: 'Study Tools',
      seekStepLabel: 'Seek Step',
      autoFollowLabel: 'Auto-Follow',
      voiceRecorderSub: 'Shadow & compare',
      translationMenuLabel: 'Translation',
      shortcutsMenuLabel: 'Keyboard Shortcuts',
      mouthFocusBtn: 'Mouth',
      voiceRecorderLabel: 'Voice Comparison',
      recReady: 'Ready',
      recRecording: 'Recording...',
      recSaved: 'Take ready',
      recordVoice: 'Record Voice',
      stopRecord: 'Stop',
      hearSpeaker: 'Speaker',
      replayBtn: 'Replay',
      keyPlay: 'Play/Pause',
      keyReplay: 'Replay',
      keySeek: 'Seek ±2s',
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
      coachConnectedSub: 'Linking, flapping, reductions, and elision in real speech.',
      coachExpressionsSub: 'Idioms, phrasal verbs, and slang worth reusing.',
      coachVocabSub: "High-value words in this speaker's voice.",
      coachSelectionHint: 'Click any word or select any text for instant contextual translation.',
      coachHearPhrase: 'Hear pronunciation',
      coachFocusTips: 'Practice focus',
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
      markComplete: 'Mark done',
      completedLabel: 'Done',
      filterAll: 'All',
      filterRemaining: 'Left',
      filterDone: 'Done',
      showAllItemsBtn: 'Show All',
      emptyRemaining: 'Every item in this section is checked off.',
      emptyCompleted: 'No completed items here yet.',
      jumpActiveTitle: 'Jump to active line',
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
      flowLoop: 'تكرار الجملة (١)',
      flowContinue: 'متواصل',
      playbackSpeedLabel: 'سرعة التشغيل',
      resetSpeedBtn: 'إعادة ضبط',
      menuBtnLabel: 'القائمة',
      studyToolsLabel: 'أدوات الدراسة',
      seekStepLabel: 'خطوة التقديم/التأخير',
      autoFollowLabel: 'المتابعة التلقائية',
      voiceRecorderSub: 'سجّل وقارن نطقك',
      translationMenuLabel: 'الترجمة',
      shortcutsMenuLabel: 'اختصارات لوحة المفاتيح',
      mouthFocusBtn: 'الفم',
      voiceRecorderLabel: 'مقارنة صوتك',
      recReady: 'جاهز',
      recRecording: 'يسجل...',
      recSaved: 'التسجيل جاهز',
      recordVoice: 'سجّل صوتك',
      stopRecord: 'إيقاف',
      hearSpeaker: 'المتحدث',
      replayBtn: 'إعادة',
      keyPlay: 'تشغيل/إيقاف',
      keyReplay: 'إعادة الجملة',
      keySeek: 'تقديم/تأخير ٢ث',
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
      coachConnectedSub: 'الربط والقلب والاختزال في الكلام الطبيعي.',
      coachExpressionsSub: 'تعبيرات وأفعال مركبة وعامية قابلة لإعادة الاستخدام.',
      coachVocabSub: 'كلمات عالية القيمة من صوت المتحدث.',
      coachSelectionHint: 'اضغط على أي كلمة أو حدّد نصاً للترجمة الفورية في السياق.',
      coachHearPhrase: 'اسمع النطق',
      coachFocusTips: 'تركيز التدريب',
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
      markComplete: 'تم',
      completedLabel: 'مكتمل',
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

  const initialTranslationLang = localStorage.getItem('flaptap_trans_lang') || 'ar';

  const studioState = {
    uiLang: localStorage.getItem('flaptap_ui_lang') || 'en',
    theme: localStorage.getItem('flaptap_theme') || 'light',
    guestToken: localStorage.getItem('flaptap_guest_token') || '',
    authToken: localStorage.getItem('flaptap_auth_token') || '',
    user: null,
    item: null,
    mode: 'shadow',
    layout: 'theater',
    ytPlayer: null,
    ytReady: false,
    pendingPlaySentenceIndex: null,
    activeSentence: null,
    isPlaying: false,
    loopSentenceIndex: null,
    endAction: 'loop', // 'loop' | 'pause' | 'continue'
    activeSentenceStep: 'idle', // 'idle' | 'playing-once' | 'paused-from-once' | 'looping' | 'paused-from-loop'
    endedNaturally: false,
    hasStartedPlaybackOnce: false,
    speed: 1.0,
    seekStepSec: (() => {
      const saved = Number(localStorage.getItem('flaptap_seek_step'));
      return Number.isFinite(saved) && saved >= 1 && saved <= 5 ? Math.round(saved * 2) / 2 : 2;
    })(),
    seekTargetStart: 0,
    awaitingOnsetUnmute: false,
    lastSeekTime: 0,
    playbackTicker: null,
    translationLang: initialTranslationLang,
    translationRtl: RTL_LANGUAGE_CODES.has(initialTranslationLang),
    languages: [],
    languagesInFlight: null,
    defaultLanguage: 'ar',
    translationsByLang: {},
    translatingAllByLang: {},
    translatingSentencesByLang: {},
    analysisInFlight: false,
    dictationIndex: 1,
    dictationLevel: 'medium',
    activeWordLookup: null,
    pendingLookupTerm: '',
    savedTerms: new Set(),
    savedVocabularyLoaded: false,
    coachGlosses: null,
    mediaRecorder: null,
    recordedChunks: [],
    recordedAudioUrl: null,
    autoFollow: true,
    userScrolledAway: false,
    showTranslations: true,
    completionFilter: 'all',
    recordingStartTime: 0,
  };

  window.studioState = studioState;

  function t(key) {
    const dict = I18N[studioState.uiLang] || I18N.en;
    return dict[key] !== undefined ? dict[key] : (I18N.en[key] || key);
  }

  const U = window.FlaptapUtils;
  const escapeHtml = U.escapeHtml;
  const normalizeTermKey = U.normalizeTermKey;

  function redirectToSignInGate() {
    const nextPath = window.location.pathname + window.location.search;
    window.location.replace(`/?auth=required&next=${encodeURIComponent(nextPath)}`);
  }

  function apiHeaders(extra) {
    return U.buildAuthHeaders({
      guestToken: studioState.guestToken,
      authToken: studioState.authToken,
      extra,
    });
  }

  async function apiFetch(url, options) {
    return U.apiFetch(url, options, {
      direct: true,
      getHeaders: apiHeaders,
      onUnauthorized: redirectToSignInGate,
    });
  }

  function showToast(msg) {
    U.showToast(msg, 'studio-toast', 3200);
  }

  /* Theme & UI Language */
  function applyTheme(theme) {
    studioState.theme = theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('flaptap_theme', studioState.theme);
    document.documentElement.setAttribute('data-theme', studioState.theme);
    const sun = document.getElementById('studio-icon-sun');
    const moon = document.getElementById('studio-icon-moon');
    if (sun && moon) {
      sun.toggleAttribute('hidden', studioState.theme !== 'dark');
      moon.toggleAttribute('hidden', studioState.theme === 'dark');
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
    refreshAllStudioProgressBars();
    syncCompletionFilter();
    syncDeckLiveSubtitle();

    const coachContent = document.getElementById('coach-content-box');
    if (studioState.item?.aiAnalysis && coachContent && !coachContent.hidden) {
      renderCoachAnalysis(studioState.item.aiAnalysis);
    }
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

    // 3. Active Sentence Time Badge & Counter Pill in Side Deck
    const totalSentences = (studioState.item?.sentences || []).length;
    const counterBadge = document.getElementById('deck-sent-counter-badge');
    if (counterBadge) {
      counterBadge.textContent = totalSentences ? `#${String(activeIdx).padStart(2, '0')} / ${totalSentences}` : '—';
    }
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

    // 5. Coach Mode Play Clip buttons (shared labeled pill, icon + text)
    document.querySelectorAll('[data-coach-play]').forEach((btn) => {
      const idx = Number(btn.dataset.coachPlay);
      const isCoachPlaying = isPlaying && activeIdx !== null && idx === activeIdx;
      const nextState = isCoachPlaying ? 'playing' : 'idle';
      btn.classList.toggle('active', isCoachPlaying);
      btn.classList.toggle('is-playing', isCoachPlaying);
      btn.setAttribute('aria-pressed', isCoachPlaying ? 'true' : 'false');

      if (btn.dataset.playState === nextState) return;
      btn.dataset.playState = nextState;

      const label = isCoachPlaying ? t('pauseBtn') : t('playBtn');
      const labelEl = btn.querySelector('.coach-clip-label');
      const iconEl = btn.querySelector('.coach-clip-icon');
      if (labelEl) labelEl.textContent = label;
      if (iconEl) iconEl.innerHTML = isCoachPlaying ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
      const aria = `${label} #${String(idx).padStart(2, '0')}`;
      btn.setAttribute('aria-label', aria);
      btn.title = aria;
    });

    // 6. Listen Mode Dictation Play button
    const dictPlayBtn = document.getElementById('dict-play-btn');
    if (dictPlayBtn) {
      const isDictPlaying = isPlaying && activeIdx === studioState.dictationIndex;
      dictPlayBtn.classList.toggle('active', isDictPlaying);
      dictPlayBtn.setAttribute('aria-pressed', isDictPlaying ? 'true' : 'false');
      const label = isDictPlaying ? t('pauseClipBtn') : t('playClipBtn');
      const labelEl = dictPlayBtn.querySelector('.dict-play-label');
      if (labelEl) labelEl.textContent = label;
      const useEl = dictPlayBtn.querySelector('use');
      if (useEl) useEl.setAttribute('href', isDictPlaying ? '/icons.svg#pause' : '/icons.svg#play');
      dictPlayBtn.setAttribute('aria-label', label);
      dictPlayBtn.title = label;
    }

    // 7. Voice Deck Speaker Replay button
    const replayBtn = document.getElementById('replay-original-btn');
    if (replayBtn) {
      replayBtn.classList.toggle('active', isPlaying);
      replayBtn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    }

    // 8. Unified Single-Icon Sentence Flow Button (#studio-flow-btn)
    syncFlowButtonDom();
  }

  function getFlowIconSvg(mode) {
    const circleArrows =
      '<path d="M4.3 10.2A8 8 0 0 1 18.8 7.6"></path>' +
      '<polyline points="19.3 4.2 19.2 8 15.4 7.9"></polyline>' +
      '<path d="M19.7 13.8A8 8 0 0 1 5.2 16.4"></path>' +
      '<polyline points="4.7 19.8 4.8 16 8.6 16.1"></polyline>';

    if (mode === 'loop') {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        circleArrows +
        '<path d="M10.9 10.2L12.3 9v6" stroke-width="2.1"></path>' +
        '<line x1="10.7" y1="15" x2="13.7" y2="15" stroke-width="2.1"></line>' +
        '</svg>'
      );
    }
    if (mode === 'continue') {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        circleArrows +
        '<polygon points="10.6 9.3 15.1 12 10.6 14.7" fill="currentColor" stroke="none"></polygon>' +
        '</svg>'
      );
    }
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      circleArrows +
      '<line x1="10.4" y1="9.6" x2="10.4" y2="14.4" stroke-width="2.1"></line>' +
      '<line x1="13.6" y1="9.6" x2="13.6" y2="14.4" stroke-width="2.1"></line>' +
      '</svg>'
    );
  }

  function syncFlowButtonDom() {
    const flowBtn = document.getElementById('studio-flow-btn');
    if (!flowBtn) return;
    const mode =
      studioState.endAction === 'loop' || studioState.endAction === 'continue'
        ? studioState.endAction
        : 'pause';
    flowBtn.dataset.flowState = mode;
    flowBtn.dataset.endAction = mode;
    flowBtn.innerHTML = getFlowIconSvg(mode);
    const labelMap = {
      pause: `${t('playbackFlowLabel')}: ${t('flowPause')}`,
      loop: `${t('playbackFlowLabel')}: ${t('flowLoop')}`,
      continue: `${t('playbackFlowLabel')}: ${t('flowContinue')}`,
    };
    const label = labelMap[mode] || t('playbackFlowLabel');
    flowBtn.setAttribute('aria-label', label);
    flowBtn.setAttribute('title', label);
    flowBtn.setAttribute('aria-pressed', mode !== 'pause' ? 'true' : 'false');
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
        const label = saved ? t('savedStatus') : t('saveToVocabBtn');
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.innerHTML = renderCoachSaveInner(saved);
      });

      document.querySelectorAll('[data-save-vocab]').forEach((btn) => {
        const entry = analysis.vocabulary?.[Number(btn.dataset.saveVocab)];
        const saved = Boolean(entry && studioState.savedTerms.has(normalizeTermKey(entry.term)));
        btn.classList.toggle('is-saved', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        const label = saved ? t('savedStatus') : t('saveToVocabBtn');
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.innerHTML = renderCoachSaveInner(saved);
      });
    }

    if (window.FlaptapWordLookup) {
      window.FlaptapWordLookup.syncSavedButtonDom();
    } else {
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
  }

  function closeWordLookupPopover() {
    studioState.activeWordLookup = null;
    studioState.pendingLookupTerm = '';
    if (window.FlaptapWordLookup) {
      window.FlaptapWordLookup.close();
    }
  }

  /* ========================================================================
     THEATER VIDEO DOCKING (Locked to Theater Mode)
     ======================================================================== */

  function setStudioLayout() {
    const workspace = document.getElementById('studio-main-content');
    if (!workspace) return;
    studioState.layout = 'theater';
    workspace.setAttribute('data-layout', 'theater');
  }

  window.setStudioLayout = setStudioLayout;
  window.switchStudioLayout = setStudioLayout;

  /* ========================================================================
     UNIFIED FLOATING POPOVERS FOR SINGLE-ROW CONTROL BAR & STUDIO COMPLETION
     ======================================================================== */

  const SCB_POPOVER_PAIRS = [
    { triggerId: 'studio-progress-pill', popoverId: 'studio-progress-popover' },
    { triggerId: 'scb-more-btn', popoverId: 'studio-more-popover' },
    { triggerId: 'video-zoom-level-pill', popoverId: 'video-zoom-popover' },
    { triggerId: 'speed-trigger-btn', popoverId: 'speed-popover' },
    { triggerId: 'voice-menu-btn', popoverId: 'voice-popover' },
    { triggerId: 'trans-trigger-btn', popoverId: 'translation-control-deck' },
    { triggerId: 'shortcuts-trigger-btn', popoverId: 'shortcuts-popover' },
  ];

  function resolvePopoverAnchor(triggerEl) {
    if (!triggerEl) return null;
    const morePop = document.getElementById('studio-more-popover');
    if (morePop && morePop.contains(triggerEl)) {
      return document.getElementById('scb-more-btn') || triggerEl;
    }
    const r = triggerEl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      return document.getElementById('scb-more-btn') || triggerEl;
    }
    return triggerEl;
  }

  function closeAllControlPopovers(exceptPopoverId = null) {
    for (const pair of SCB_POPOVER_PAIRS) {
      if (pair.popoverId === exceptPopoverId) continue;
      const pop = document.getElementById(pair.popoverId);
      const trg = document.getElementById(pair.triggerId);
      if (pop) pop.hidden = true;
      if (trg) {
        trg.classList.remove('is-open', 'is-popover-open');
        trg.setAttribute('aria-expanded', 'false');
      }
    }
  }

  function positionControlPopover(popoverEl, triggerEl) {
    const anchorEl = resolvePopoverAnchor(triggerEl);
    if (!popoverEl || !anchorEl) return;
    popoverEl.style.left = '-9999px';
    popoverEl.style.top = '0px';
    popoverEl.hidden = false;

    const tr = anchorEl.getBoundingClientRect();
    const pr = popoverEl.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;

    const width = pr.width || 300;
    const height = pr.height || 140;
    const left = Math.max(8, Math.min(vw - width - 8, tr.left + tr.width / 2 - width / 2));
    let top = tr.bottom + 8;
    if (top + height > vh - 8 && tr.top - height - 8 >= 8) {
      top = tr.top - height - 8;
    } else if (top + height > vh - 8) {
      top = Math.max(8, vh - height - 8);
    }

    popoverEl.style.left = `${Math.round(left)}px`;
    popoverEl.style.top = `${Math.round(top)}px`;
  }

  function toggleControlPopover(triggerId, popoverId) {
    const pop = document.getElementById(popoverId);
    const trg = document.getElementById(triggerId);
    if (!pop || !trg) return;
    const willOpen = Boolean(pop.hidden);
    closeAllControlPopovers(willOpen ? popoverId : null);
    if (willOpen) {
      if (popoverId === 'translation-control-deck' && studioState.mode !== 'shadow') return;
      if (popoverId === 'translation-control-deck') {
        loadLanguagesCatalog().then(() => {
          if (!pop.hidden) positionControlPopover(pop, trg);
        });
      }
      pop.style.display = '';
      positionControlPopover(pop, trg);
      trg.classList.add('is-open', 'is-popover-open');
      trg.setAttribute('aria-expanded', 'true');
      const morePop = document.getElementById('studio-more-popover');
      const moreBtn = document.getElementById('scb-more-btn');
      if (morePop && moreBtn && morePop.contains(trg)) {
        moreBtn.classList.add('is-open', 'is-popover-open');
      }
    } else {
      pop.hidden = true;
      trg.classList.remove('is-open', 'is-popover-open');
      trg.setAttribute('aria-expanded', 'false');
    }
  }

  function getStudioCompletedSet(subject) {
    const arr = studioState.item?.completionProgress?.[subject];
    return new Set(Array.isArray(arr) ? arr.map(Number) : []);
  }

  function renderStudioCheckBtnHtml({ checked = false, subject, index, pill = false } = {}) {
    const titleText = checked ? t('completedLabel') : t('markComplete');
    const pillClass = pill ? ' item-check-btn--pill' : '';
    const inner = pill ? `<span>${escapeHtml(titleText)}</span>` : '';
    return `<button type="button" class="item-check-btn${pillClass}${checked ? ' is-checked' : ''}" data-studio-check-subject="${escapeHtml(subject)}" data-studio-check-index="${Number(index)}" aria-pressed="${checked ? 'true' : 'false'}" aria-label="${escapeHtml(titleText)}" title="${escapeHtml(titleText)}">${ITEM_CHECK_ICON_SVG}${inner}</button>`;
  }

  /**
   * Copy affordance for text that comes straight from the video: whole
   * sentences, cohesive paragraphs, and the exact phrases around them.
   */
  function renderStudioCopyBtnHtml(text, className = '') {
    if (!window.FlaptapCopy) return '';
    return window.FlaptapCopy.buttonHtml(text, className ? { className } : undefined);
  }

  function renderStudioProgressBar(targetId, { total = 0, completed = 0 } = {}) {
    const el = document.getElementById(targetId);
    if (!el) return;
    const safeTotal = Math.max(0, Number(total) || 0);
    if (safeTotal === 0) {
      el.hidden = true;
      el.classList.remove('is-all-done');
      el.innerHTML = '';
      return;
    }
    const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
    const remaining = Math.max(0, safeTotal - safeCompleted);
    const pct = Math.round((safeCompleted / safeTotal) * 100);
    const isAr = studioState.uiLang === 'ar';
    const totalLabel = isAr ? 'الإجمالي' : 'Total';
    const doneLabel = isAr ? 'مكتمل' : 'Completed';
    const remLabel = isAr ? 'المتبقي' : 'Remaining';

    el.hidden = false;
    el.classList.toggle('is-all-done', remaining === 0 && safeTotal > 0);
    el.innerHTML = `
      <div class="subject-progress-stats">
        <span class="sp-stat">
          <span class="sp-stat-label">${totalLabel}:</span>
          <strong class="sp-stat-value ltr-num" data-sp-total>${safeTotal}</strong>
        </span>
        <span class="sp-sep" aria-hidden="true"></span>
        <span class="sp-stat sp-stat--done">
          <span class="sp-stat-label">${doneLabel}:</span>
          <strong class="sp-stat-value ltr-num" data-sp-completed>${safeCompleted}</strong>
        </span>
        <span class="sp-sep" aria-hidden="true"></span>
        <span class="sp-stat">
          <span class="sp-stat-label">${remLabel}:</span>
          <strong class="sp-stat-value ltr-num" data-sp-remaining>${remaining}</strong>
        </span>
      </div>
      <div class="subject-progress-track-wrap">
        <div class="subject-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${safeTotal}" aria-valuenow="${safeCompleted}">
          <div class="subject-progress-fill" style="width: ${pct}%;"></div>
        </div>
        <span class="subject-progress-pct ltr-num">${pct}%</span>
      </div>
    `;
  }

  function syncStudioDeckStickyHeightVar() {
    const deck = document.querySelector('.studio-deck');
    if (!deck) return;
    const isStackedSticky =
      (window.innerWidth <= 768 && window.innerHeight >= 551) || false;
    if (!isStackedSticky) {
      document.documentElement.style.removeProperty('--studio-deck-sticky-h');
      return;
    }
    const rect = deck.getBoundingClientRect();
    const h = Math.max(0, Math.round(rect.height));
    document.documentElement.style.setProperty('--studio-deck-sticky-h', `${h}px`);
  }

  function applyCompletionFilterDom() {
    const filter = studioState.completionFilter || 'all';
    const emptyMsg =
      filter === 'remaining'
        ? t('emptyRemaining')
        : filter === 'completed'
        ? t('emptyCompleted')
        : '';

    const matchVisible = (isDone) => {
      if (filter === 'remaining') return !isDone;
      if (filter === 'completed') return isDone;
      return true;
    };

    // Shadow sentences
    const sentList = document.getElementById('subview-sentences-list');
    const shadowEmpty = document.getElementById('shadow-filter-empty');
    if (sentList) {
      let visibleCount = 0;
      let totalCount = 0;
      sentList.querySelectorAll('.sentence-driller-card').forEach((card) => {
        totalCount++;
        const show = matchVisible(card.classList.contains('is-item-completed'));
        card.hidden = !show;
        if (show) visibleCount++;
      });
      if (shadowEmpty) {
        shadowEmpty.hidden = totalCount === 0 || visibleCount > 0 || filter === 'all';
        const p = shadowEmpty.querySelector('[data-filter-empty-msg]');
        if (p) p.textContent = emptyMsg;
      }
    }

    // Read paragraphs
    const chunkList = document.getElementById('subview-chunks-list');
    const readEmpty = document.getElementById('read-filter-empty');
    if (chunkList) {
      let visibleCount = 0;
      let totalCount = 0;
      chunkList.querySelectorAll('.editorial-paragraph-block').forEach((blk) => {
        totalCount++;
        const show = matchVisible(blk.classList.contains('is-item-completed'));
        blk.hidden = !show;
        if (show) visibleCount++;
      });
      if (readEmpty) {
        readEmpty.hidden = totalCount === 0 || visibleCount > 0 || filter === 'all';
        const p = readEmpty.querySelector('[data-filter-empty-msg]');
        if (p) p.textContent = emptyMsg;
      }
    }

    // Coach grids
    const coachEmpty = document.getElementById('coach-filter-empty');
    const coachGridIds = Object.values(COACH_SECTIONS).map((section) => section.gridId);
    let coachVisible = 0;
    let coachTotal = 0;
    coachGridIds.forEach((gridId) => {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      grid.querySelectorAll('.coach-item-card').forEach((card) => {
        coachTotal++;
        const show = matchVisible(card.classList.contains('is-item-completed'));
        card.hidden = !show;
        if (show) coachVisible++;
      });
    });
    if (coachEmpty) {
      coachEmpty.hidden = coachTotal === 0 || coachVisible > 0 || filter === 'all';
      const p = coachEmpty.querySelector('[data-filter-empty-msg]');
      if (p) p.textContent = emptyMsg;
    }
  }

  function syncCompletionFilter() {
    const filter = studioState.completionFilter || 'all';
    document.querySelectorAll('[data-studio-comp-filter]').forEach((btn) => {
      const active = btn.dataset.studioCompFilter === filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    applyCompletionFilterDom();
  }

  function setCompletionFilter(nextFilter) {
    studioState.completionFilter =
      nextFilter === 'remaining' || nextFilter === 'completed' ? nextFilter : 'all';
    syncCompletionFilter();
  }

  function syncDeckLiveSubtitle() {
    const box = document.getElementById('deck-live-subtitle');
    if (!box) return;
    const item = studioState.item;
    const ttsStage = document.getElementById('tts-audio-stage');
    const isTtsDeck = Boolean(ttsStage && !ttsStage.hidden);
    const active = studioState.activeSentence || item?.sentences?.[0] || null;
    if (!item || !active || isTtsDeck) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const numEl = document.getElementById('deck-live-num');
    const timeEl = document.getElementById('deck-live-time');
    const quoteEl = document.getElementById('deck-live-quote');
    const transEl = document.getElementById('deck-live-trans');
    if (numEl) numEl.textContent = `#${String(active.index || 1).padStart(2, '0')}`;
    if (timeEl) timeEl.textContent = active.timeRange || '00:00.000';
    if (quoteEl) quoteEl.textContent = active.text || '';
    if (transEl) {
      const langCode = studioState.translationLang || 'ar';
      const langMap = getLangTranslationMap(langCode);
      const transHtml = langCode !== 'none' ? langMap[Number(active.index)] : '';
      const hasTrans = Boolean(transHtml && String(transHtml).trim() && studioState.showTranslations);
      transEl.hidden = !hasTrans;
      if (hasTrans) {
        transEl.setAttribute('dir', studioState.translationRtl ? 'rtl' : 'ltr');
        transEl.innerHTML = transHtml;
      } else {
        transEl.textContent = '';
      }
    }
  }

  function computeStudioCompletionStats(item) {
    if (!item) {
      return {
        doneItems: 0,
        totalItems: 0,
        percent: 0,
        isCompleted: false,
        modes: [],
      };
    }

    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const sentSet = getStudioCompletedSet('sentences');
    const uniqueSentIndices = new Set(sentences.map((s) => Number(s.index)).filter((n) => Number.isInteger(n) && n >= 0));
    const shadowTotal = uniqueSentIndices.size;
    const shadowDone = Array.from(uniqueSentIndices).filter((idx) => sentSet.has(idx)).length;

    const chunks = Array.isArray(item.chunks) ? item.chunks : [];
    const paraSet = getStudioCompletedSet('paragraphs');
    const readTotal = chunks.length;
    const readDone = chunks.filter((_, idx) => paraSet.has(idx + 1)).length;

    const listenSet = getStudioCompletedSet('listen');
    const listenTotal = uniqueSentIndices.size;
    const listenDone = Array.from(uniqueSentIndices).filter((idx) => listenSet.has(idx)).length;

    const analysis = item.aiAnalysis;
    const conn = analysis?.connectedSpeech || [];
    const expr = analysis?.expressions || [];
    const vocab = analysis?.vocabulary || [];
    const connSet = getStudioCompletedSet('coachConnected');
    const exprSet = getStudioCompletedSet('coachExpressions');
    const vocabSet = getStudioCompletedSet('coachVocabulary');
    const coachTotal = conn.length + expr.length + vocab.length;
    const coachDone =
      conn.filter((_, idx) => connSet.has(idx)).length +
      expr.filter((_, idx) => exprSet.has(idx)).length +
      vocab.filter((_, idx) => vocabSet.has(idx)).length;

    // Overall lesson progress strictly tracks Shadowing sentences.
    const totalItems = shadowTotal;
    const doneItems = shadowDone;
    const percent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
    const isCompleted = totalItems > 0 && doneItems === totalItems;

    const modes = [
      { mode: 'shadow', label: t('modeShadow'), done: shadowDone, total: shadowTotal },
    ];
    if (readTotal > 0) {
      modes.push({ mode: 'read', label: `${t('modeRead')} (optional)`, done: readDone, total: readTotal });
    }
    if (listenTotal > 0) {
      modes.push({ mode: 'listen', label: `${t('modeListen')} (optional)`, done: listenDone, total: listenTotal });
    }
    if (coachTotal > 0) {
      modes.push({ mode: 'coach', label: `${t('modeCoach')} (optional)`, done: coachDone, total: coachTotal });
    }

    return { doneItems, totalItems, percent, isCompleted, modes };
  }

  let resetConfirmArmTimer = null;

  function syncStudioTopProgressDom(stats = null) {
    const item = studioState.item;
    if (!item) return;
    const computed = stats || computeStudioCompletionStats(item);
    item.isCompleted = computed.isCompleted;
    item.completedDrills = computed.doneItems;

    const pill = document.getElementById('studio-progress-pill');
    const arc = document.getElementById('studio-progress-ring-arc');
    const labelEl = document.getElementById('studio-progress-label');
    const fracEl = document.getElementById('studio-progress-fraction');

    const circumference = 56.5487;
    if (arc) {
      const ratio = computed.totalItems > 0 ? Math.min(1, computed.doneItems / computed.totalItems) : 0;
      arc.style.strokeDasharray = `${circumference}`;
      arc.style.strokeDashoffset = `${(circumference * (1 - ratio)).toFixed(2)}`;
    }

    if (pill) {
      pill.classList.toggle('is-completed', computed.isCompleted);
      pill.classList.toggle('has-progress', computed.doneItems > 0 && !computed.isCompleted);
      const statusText = computed.isCompleted
        ? `${t('completedLabel')} · ${computed.doneItems}/${computed.totalItems} (100%)`
        : `${computed.doneItems}/${computed.totalItems} (${computed.percent}%)`;
      pill.setAttribute('aria-label', statusText);
      pill.title = computed.isCompleted
        ? 'All shadowing sentences are checked — Lesson completed'
        : `${computed.doneItems} of ${computed.totalItems} shadowing sentences checked (${computed.percent}%)`;
    }

    if (labelEl) {
      labelEl.textContent = computed.isCompleted ? t('completedLabel') : `${computed.percent}%`;
    }
    if (fracEl) {
      fracEl.textContent = `${computed.doneItems}/${computed.totalItems}`;
    }

    // Popover breakdown
    const popTitle = document.getElementById('sp-pop-title');
    const popSub = document.getElementById('sp-pop-sub');
    const popBadge = document.getElementById('sp-pop-badge');
    const modeList = document.getElementById('sp-mode-list');
    const popFoot = document.getElementById('sp-pop-foot');
    const resetBtn = document.getElementById('sp-reset-progress-btn');

    if (popTitle) {
      popTitle.textContent = studioState.uiLang === 'ar' ? 'تقدّم التظليل' : 'Shadowing Progress';
    }
    if (popSub) {
      popSub.textContent = computed.isCompleted
        ? (studioState.uiLang === 'ar' ? 'تم إكمال جميع جمل التظليل في هذا الدرس' : 'All shadowing sentences are checked')
        : (studioState.uiLang === 'ar' ? 'يكتمل الدرس تلقائياً عند إنهاء كل جمل التظليل' : 'Completes automatically when all shadowing sentences are checked');
    }
    if (popBadge) {
      popBadge.textContent = `${computed.doneItems}/${computed.totalItems} · ${computed.percent}%`;
      popBadge.classList.toggle('is-completed', computed.isCompleted);
    }

    if (modeList) {
      modeList.innerHTML = computed.modes
        .filter((m) => m.total > 0)
        .map((m) => {
          const mPct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
          const mDone = m.total > 0 && m.done === m.total;
          return `
            <button type="button" class="sp-mode-row${mDone ? ' is-done' : ''}" data-sp-jump-mode="${escapeHtml(m.mode)}">
              <div class="sp-mode-row-top">
                <span class="sp-mode-name">${escapeHtml(m.label)}</span>
                <span class="sp-mode-nums ltr-num">${m.done}/${m.total} · ${mPct}%</span>
              </div>
              <div class="sp-mode-bar-track">
                <div class="sp-mode-bar-fill" style="width: ${mPct}%;"></div>
              </div>
            </button>
          `;
        })
        .join('');
    }

    if (popFoot) {
      popFoot.hidden = computed.doneItems <= 0;
    }
    if (resetBtn && !resetBtn.dataset.armed) {
      resetBtn.textContent = studioState.uiLang === 'ar' ? 'إعادة ضبط التقدّم' : 'Reset Progress';
    }
  }

  function refreshAllStudioProgressBars() {
    const item = studioState.item;
    if (!item) return;

    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const sentSet = getStudioCompletedSet('sentences');
    renderStudioProgressBar('studio-shadow-progress-bar', {
      total: sentences.length,
      completed: sentences.filter((s) => sentSet.has(Number(s.index))).length,
    });

    const chunks = Array.isArray(item.chunks) ? item.chunks : [];
    const paraSet = getStudioCompletedSet('paragraphs');
    renderStudioProgressBar('studio-read-progress-bar', {
      total: chunks.length,
      completed: chunks.filter((_, idx) => paraSet.has(idx + 1)).length,
    });

    const listenSet = getStudioCompletedSet('listen');
    renderStudioProgressBar('studio-listen-progress-bar', {
      total: sentences.length,
      completed: sentences.filter((s) => listenSet.has(Number(s.index))).length,
    });
    syncDictationCompletionButtonDom();

    const analysis = item.aiAnalysis;
    if (analysis) {
      const conn = analysis.connectedSpeech || [];
      const connSet = getStudioCompletedSet('coachConnected');
      const connDoneCount = conn.filter((_, idx) => connSet.has(idx)).length;
      renderStudioProgressBar('studio-coach-connected-progress-bar', {
        total: conn.length,
        completed: connDoneCount,
      });

      const expr = analysis.expressions || [];
      const exprSet = getStudioCompletedSet('coachExpressions');
      const exprDoneCount = expr.filter((_, idx) => exprSet.has(idx)).length;
      renderStudioProgressBar('studio-coach-expressions-progress-bar', {
        total: expr.length,
        completed: exprDoneCount,
      });

      const vocab = analysis.vocabulary || [];
      const vocabSet = getStudioCompletedSet('coachVocabulary');
      const vocabDoneCount = vocab.filter((_, idx) => vocabSet.has(idx)).length;
      renderStudioProgressBar('studio-coach-vocab-progress-bar', {
        total: vocab.length,
        completed: vocabDoneCount,
      });

      renderStudioProgressBar('studio-coach-progress-bar', {
        total: conn.length + expr.length + vocab.length,
        completed: connDoneCount + exprDoneCount + vocabDoneCount,
      });
    } else {
      renderStudioProgressBar('studio-coach-connected-progress-bar', { total: 0, completed: 0 });
      renderStudioProgressBar('studio-coach-expressions-progress-bar', { total: 0, completed: 0 });
      renderStudioProgressBar('studio-coach-vocab-progress-bar', { total: 0, completed: 0 });
      renderStudioProgressBar('studio-coach-progress-bar', { total: 0, completed: 0 });
    }

    const canvas = document.querySelector('.studio-canvas');
    const mode = studioState.mode || 'shadow';
    if (canvas) canvas.dataset.activeMode = mode;
    const dock = document.getElementById('canvas-progress-dock');
    if (dock) {
      const barMap = {
        shadow: 'studio-shadow-progress-bar',
        read: 'studio-read-progress-bar',
        listen: 'studio-listen-progress-bar',
        coach: 'studio-coach-progress-bar',
      };
      const activeBar = barMap[mode] ? document.getElementById(barMap[mode]) : null;
      dock.hidden = mode === 'notes' || (activeBar ? activeBar.hidden : false);
    }
    syncCompletionFilter();
    syncStudioTopProgressDom();
  }

  function syncDictationCompletionButtonDom() {
    const btn = document.getElementById('dict-check-complete-btn');
    const lbl = document.getElementById('dict-complete-label');
    const card = document.querySelector('#mode-panel-listen .dictation-card');
    if (!btn) return;
    const isDone = getStudioCompletedSet('listen').has(Number(studioState.dictationIndex));
    btn.classList.toggle('is-checked', isDone);
    btn.setAttribute('aria-pressed', isDone ? 'true' : 'false');
    const doneLabel = isDone ? t('completedLabel') : t('markComplete');
    btn.setAttribute('aria-label', doneLabel);
    btn.title = doneLabel;
    if (lbl) lbl.textContent = doneLabel;
    if (card) card.classList.toggle('is-item-completed', isDone);
  }

  function updateStudioItemCompletionDom(subject, index, checked) {
    if (subject === 'listen') {
      syncDictationCompletionButtonDom();
    } else {
      const selector = `[data-studio-check-subject="${subject}"][data-studio-check-index="${index}"]`;
      document.querySelectorAll(selector).forEach((btn) => {
        btn.classList.toggle('is-checked', checked);
        btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
        const label = checked ? t('completedLabel') : t('markComplete');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        const pillLabel = btn.querySelector('span');
        if (pillLabel) pillLabel.textContent = label;
        const card = btn.closest('.sentence-driller-card, .editorial-paragraph-block, .coach-item-card');
        if (card) card.classList.toggle('is-item-completed', checked);
      });
    }
    refreshAllStudioProgressBars();
  }

  async function setStudioItemCompletion(subject, index, nextCompleted) {
    const item = studioState.item;
    if (!item?.id) return;
    const numIdx = Number(index);
    if (!Number.isInteger(numIdx) || numIdx < 0) return;

    const progress = { ...(item.completionProgress || {}) };
    const prevArr = Array.isArray(progress[subject]) ? [...progress[subject].map(Number)] : [];
    const set = new Set(prevArr);
    const wasCompleted = set.has(numIdx);
    if (wasCompleted === nextCompleted) return;

    const prevLessonCompleted = Boolean(item.isCompleted);

    if (nextCompleted) set.add(numIdx);
    else set.delete(numIdx);
    progress[subject] = Array.from(set).sort((a, b) => a - b);
    item.completionProgress = progress;

    updateStudioItemCompletionDom(subject, numIdx, nextCompleted);

    try {
      const res = await apiFetch(`/api/history/${encodeURIComponent(item.id)}/item-completion`, {
        method: 'PATCH',
        body: JSON.stringify({ subject, index: numIdx, completed: nextCompleted }),
      });
      if (typeof res?.isCompleted === 'boolean') {
        item.isCompleted = res.isCompleted;
      }
      if (res?.completionProgress) {
        item.completionProgress = res.completionProgress;
      }
      syncStudioTopProgressDom();
      if (!prevLessonCompleted && Boolean(item.isCompleted)) {
        showToast(studioState.uiLang === 'ar' ? 'تم إكمال جميع عناصر الدرس!' : 'All items checked — Lesson completed!');
      }
    } catch (err) {
      progress[subject] = prevArr;
      item.completionProgress = progress;
      updateStudioItemCompletionDom(subject, numIdx, wasCompleted);
      showToast(err?.message || 'Could not update completion.');
    }
  }

  function toggleStudioItemCompletion(subject, index) {
    const isCurrentlyDone = getStudioCompletedSet(subject).has(Number(index));
    return setStudioItemCompletion(subject, index, !isCurrentlyDone);
  }

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
    closeAllControlPopovers();

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

    const transTrigger = document.getElementById('trans-trigger-btn');
    if (transTrigger) {
      transTrigger.hidden = target !== 'shadow';
    }
    const transDeck = document.getElementById('translation-control-deck');
    if (transDeck) {
      transDeck.hidden = true;
      transDeck.style.display = target === 'shadow' ? '' : 'none';
    }

    const legendStrip = document.getElementById('transcript-legend-strip');
    if (legendStrip) {
      legendStrip.style.display = target === 'shadow' || target === 'read' ? '' : 'none';
    }

    const canvas = document.querySelector('.studio-canvas');
    if (canvas) {
      canvas.dataset.activeMode = target;
    }

    if (target === 'listen') {
      renderDictationCard();
    } else if (target === 'coach' && studioState.item) {
      // Cached analysis renders synchronously; only an uncached lesson calls AI.
      const coachContent = document.getElementById('coach-content-box');
      if (!coachContent || coachContent.hidden) {
        triggerDynamicCoachAnalysis(false);
      }
    }

    syncPlaybackButtonsDom();
    refreshAllStudioProgressBars();
    requestAnimationFrame(syncStudioDeckStickyHeightVar);

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
   VERBATIM WORD TOKENIZER FOR TEXT-SELECTION CONTEXTUAL AI LOOKUP
     Preserves `<mark class="hl-...">` AND exact `textContent === sentence.text`
     ======================================================================== */

  function decorateClickableWords(verbatimHtml, sentenceIndex) {
    if (window.FlaptapWordLookup) {
      return window.FlaptapWordLookup.tokenizeClickableWords(verbatimHtml, {
        sentIndex: sentenceIndex,
      });
    }
    return verbatimHtml || '';
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
      const sentDoneSet = getStudioCompletedSet('sentences');
      sentContainer.innerHTML = sentences
        .map((s) => {
          const isActive = activeIdx === s.index;
          const isThisPlaying = Boolean(studioState.isPlaying && isActive);
          const isDone = sentDoneSet.has(Number(s.index));

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
              class="sentence-driller-card ${isActive ? 'active-drilling' : ''}${isDone ? ' is-item-completed' : ''}"
              data-sentence-index="${s.index}"
            >
              <div class="sent-card-top">
                <div class="sent-meta-left">
                  <span class="sent-index-num">#${String(s.index).padStart(2, '0')}</span>
                  <span class="sent-time-badge">${escapeHtml(s.timeRange || '')}</span>
                </div>
                <div class="sent-actions-right">
                  ${renderStudioCopyBtnHtml(s.text, 'sent-action-btn sent-icon-btn sent-copy-btn')}
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
                  <span class="sent-actions-divider" aria-hidden="true"></span>
                  ${renderStudioCheckBtnHtml({ checked: isDone, subject: 'sentences', index: s.index })}
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
      const paraDoneSet = getStudioCompletedSet('paragraphs');
      chunkContainer.innerHTML = chunks
        .map((chunk, idx) => {
          const paraNum = idx + 1;
          const isDone = paraDoneSet.has(paraNum);
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
            <section class="editorial-paragraph-block${isDone ? ' is-item-completed' : ''}" data-paragraph-index="${paraNum}">
              <div class="editorial-paragraph-head">
                <span class="paragraph-time-margin">${escapeHtml(chunk.timeRange || '')}</span>
                <div class="paragraph-head-actions">
                  ${renderStudioCopyBtnHtml(chunk.text, 'paragraph-copy-btn')}
                  ${renderStudioCheckBtnHtml({ checked: isDone, subject: 'paragraphs', index: paraNum })}
                </div>
              </div>
              <p class="paragraph-prose">${proseHtml}</p>
            </section>
          `;
        })
        .join('');
    }

    refreshAllStudioProgressBars();
  }

  /* ========================================================================
     VIDEO ZOOM & FOCAL INSPECTION ENGINE (MOUTH & BODY LANGUAGE FOCUS)
     ======================================================================== */

  const videoZoom = {
    scale: 1.0,           // 1.00 to 5.00
    panX: 0,
    panY: 0,
    isDragging: false,
    hasDragged: false,
    dragStartX: 0,
    dragStartY: 0,
    initialPanX: 0,
    initialPanY: 0,
    passthrough: false,
    idleTimer: null,
    clickTimer: null,
    activeTouches: new Map(),
    initialPinchDist: 0,
    initialPinchScale: 1.0,
    initialPinchMidX: 0,
    initialPinchMidY: 0,
  };

  function applyZoomTransform(animate = false) {
    const stage = document.getElementById('video-zoom-stage');
    const viewport = document.getElementById('video-zoom-viewport');
    if (!stage || !viewport) return;

    const width = viewport.clientWidth || 800;
    const height = viewport.clientHeight || 450;

    videoZoom.scale = Math.min(5.0, Math.max(1.0, Number(videoZoom.scale) || 1.0));

    if (videoZoom.scale <= 1.001) {
      videoZoom.scale = 1.0;
      videoZoom.panX = 0;
      videoZoom.panY = 0;
    } else {
      const minPanX = width * (1.0 - videoZoom.scale);
      const minPanY = height * (1.0 - videoZoom.scale);
      videoZoom.panX = Math.min(0, Math.max(minPanX, videoZoom.panX));
      videoZoom.panY = Math.min(0, Math.max(minPanY, videoZoom.panY));
    }

    if (animate) {
      stage.style.transition = 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)';
    } else {
      stage.style.transition = 'none';
    }

    stage.style.transform = `translate3d(${videoZoom.panX.toFixed(2)}px, ${videoZoom.panY.toFixed(2)}px, 0) scale(${videoZoom.scale.toFixed(4)})`;

    syncZoomUiDom();
  }

  function zoomToFocalPoint(targetScale, focalViewportX, focalViewportY, animate = false) {
    const viewport = document.getElementById('video-zoom-viewport');
    if (!viewport) return;

    const width = viewport.clientWidth || 800;
    const height = viewport.clientHeight || 450;

    targetScale = Math.min(5.0, Math.max(1.0, targetScale));

    if (targetScale <= 1.001) {
      videoZoom.scale = 1.0;
      videoZoom.panX = 0;
      videoZoom.panY = 0;
      applyZoomTransform(animate);
      return;
    }

    const contentX = (focalViewportX - videoZoom.panX) / videoZoom.scale;
    const contentY = (focalViewportY - videoZoom.panY) / videoZoom.scale;

    videoZoom.scale = targetScale;
    videoZoom.panX = focalViewportX - contentX * targetScale;
    videoZoom.panY = focalViewportY - contentY * targetScale;

    applyZoomTransform(animate);
  }

  function zoomByStep(delta, animate = true) {
    const viewport = document.getElementById('video-zoom-viewport');
    const width = viewport ? (viewport.clientWidth || 800) : 800;
    const height = viewport ? (viewport.clientHeight || 450) : 450;
    const target = Math.min(5.0, Math.max(1.0, videoZoom.scale + delta));
    zoomToFocalPoint(target, width / 2, height / 2, animate);
  }

  function panBy(deltaX, deltaY) {
    if (videoZoom.scale <= 1.001) return;
    videoZoom.panX += deltaX;
    videoZoom.panY += deltaY;
    applyZoomTransform(false);
  }

  function focusMouth(animate = true) {
    const viewport = document.getElementById('video-zoom-viewport');
    if (!viewport) return;

    const width = viewport.clientWidth || 800;
    const height = viewport.clientHeight || 450;

    if (videoZoom.scale >= 2.15 && videoZoom.scale <= 2.25) {
      resetZoom(animate);
      return;
    }

    const mouthContentX = width * 0.50;
    const mouthContentY = height * 0.62;
    const targetScale = 2.2;

    videoZoom.scale = targetScale;
    videoZoom.panX = (width / 2) - mouthContentX * targetScale;
    videoZoom.panY = (height / 2) - mouthContentY * targetScale;

    applyZoomTransform(animate);
    showFocalRing(width / 2, height / 2);
  }

  function focusFace(animate = true) {
    const viewport = document.getElementById('video-zoom-viewport');
    if (!viewport) return;

    const width = viewport.clientWidth || 800;
    const height = viewport.clientHeight || 450;

    const faceContentX = width * 0.50;
    const faceContentY = height * 0.40;
    const targetScale = 1.8;

    videoZoom.scale = targetScale;
    videoZoom.panX = (width / 2) - faceContentX * targetScale;
    videoZoom.panY = (height / 2) - faceContentY * targetScale;

    applyZoomTransform(animate);
    showFocalRing(width / 2, height / 2);
  }

  function resetZoom(animate = true) {
    videoZoom.scale = 1.0;
    videoZoom.panX = 0;
    videoZoom.panY = 0;
    applyZoomTransform(animate);
  }

  function updateRadar() {
    const radar = document.getElementById('video-zoom-radar');
    const windowEl = document.getElementById('video-zoom-radar-window');
    const viewport = document.getElementById('video-zoom-viewport');
    if (!radar || !windowEl || !viewport) return;

    if (videoZoom.scale <= 1.01) {
      radar.hidden = true;
      return;
    }

    radar.hidden = false;

    const vpW = viewport.clientWidth || 800;
    const vpH = viewport.clientHeight || 450;
    const radarW = radar.clientWidth || 52;
    const radarH = radar.clientHeight || 29.25;

    const winW = radarW / videoZoom.scale;
    const winH = radarH / videoZoom.scale;

    const leftFrac = (-videoZoom.panX) / (vpW * videoZoom.scale);
    const topFrac = (-videoZoom.panY) / (vpH * videoZoom.scale);

    const winLeft = leftFrac * radarW;
    const winTop = topFrac * radarH;

    windowEl.style.width = `${Math.max(4, winW).toFixed(1)}px`;
    windowEl.style.height = `${Math.max(4, winH).toFixed(1)}px`;
    windowEl.style.transform = `translate3d(${Math.max(0, winLeft).toFixed(1)}px, ${Math.max(0, winTop).toFixed(1)}px, 0)`;
  }

  function syncZoomUiDom() {
    const percent = Math.round(videoZoom.scale * 100);
    const valText = document.getElementById('video-zoom-val-text');
    const popoverVal = document.getElementById('zoom-popover-val');
    const slider = document.getElementById('video-zoom-slider');
    const resetBtn = document.getElementById('video-zoom-reset-btn');
    const outBtn = document.getElementById('video-zoom-out-btn');
    const inBtn = document.getElementById('video-zoom-in-btn');
    const surface = document.getElementById('video-zoom-surface');
    const mouthQuickBtn = document.getElementById('video-zoom-mouth-quick-btn');

    if (valText) valText.textContent = `${percent}%`;
    if (popoverVal) popoverVal.textContent = `${percent}%`;
    if (slider && !slider.matches(':active')) {
      slider.value = percent;
    }

    if (outBtn) {
      outBtn.disabled = videoZoom.scale <= 1.001;
    }
    if (inBtn) {
      inBtn.disabled = videoZoom.scale >= 4.999;
    }

    if (resetBtn) {
      resetBtn.hidden = videoZoom.scale <= 1.001;
    }

    const levelPill = document.getElementById('video-zoom-level-pill');
    if (levelPill) {
      levelPill.classList.toggle('is-custom', videoZoom.scale > 1.001);
    }

    if (mouthQuickBtn) {
      const isMouth = videoZoom.scale >= 2.15 && videoZoom.scale <= 2.25;
      mouthQuickBtn.classList.toggle('active', isMouth);
    }

    if (surface) {
      const needsPanSurface = videoZoom.scale > 1.001 && !videoZoom.passthrough;
      surface.style.pointerEvents = needsPanSurface ? 'auto' : 'none';
      if (videoZoom.isDragging) {
        surface.style.cursor = 'grabbing';
      } else if (videoZoom.scale > 1.001) {
        surface.style.cursor = 'grab';
      } else {
        surface.style.cursor = 'default';
      }
    }

    document.querySelectorAll('.zoom-preset-chip').forEach((chip) => {
      const chipZoom = Number(chip.getAttribute('data-zoom')) || 100;
      chip.classList.toggle('active', Math.abs(chipZoom - percent) < 4);
    });

    updateRadar();
  }

  function setZoomPassthrough(active) {
    videoZoom.passthrough = Boolean(active);
    syncZoomUiDom();
  }

  function showFocalRing(x, y) {
    const ring = document.getElementById('video-focal-ring');
    if (!ring) return;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.hidden = false;
    ring.classList.remove('pulse');
    void ring.offsetWidth;
    ring.classList.add('pulse');
    setTimeout(() => {
      ring.hidden = true;
      ring.classList.remove('pulse');
    }, 450);
  }

  function showActionFlash(isPlaying) {
    const flash = document.getElementById('video-action-flash');
    if (!flash) return;
    flash.innerHTML = isPlaying ? PLAY_ICON_SVG : PAUSE_ICON_SVG;
    flash.hidden = false;
    flash.classList.remove('animate');
    void flash.offsetWidth;
    flash.classList.add('animate');
    setTimeout(() => {
      flash.hidden = true;
      flash.classList.remove('animate');
    }, 380);
  }

  function resetIdleTimer() {
    if (videoZoom.idleTimer) {
      clearTimeout(videoZoom.idleTimer);
      videoZoom.idleTimer = null;
    }
  }

  function initVideoZoomHandlers() {
    const viewport = document.getElementById('video-zoom-viewport');
    const surface = document.getElementById('video-zoom-surface');
    const radar = document.getElementById('video-zoom-radar');
    const popover = document.getElementById('video-zoom-popover');
    const levelPill = document.getElementById('video-zoom-level-pill');
    const slider = document.getElementById('video-zoom-slider');

    if (!surface || !viewport) return;

    syncZoomUiDom();

    surface.addEventListener('pointerdown', (e) => {
      if (videoZoom.passthrough) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      try {
        surface.setPointerCapture(e.pointerId);
      } catch {}

      videoZoom.isDragging = true;
      videoZoom.hasDragged = false;
      videoZoom.dragStartX = e.clientX;
      videoZoom.dragStartY = e.clientY;
      videoZoom.initialPanX = videoZoom.panX;
      videoZoom.initialPanY = videoZoom.panY;

      videoZoom.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (videoZoom.activeTouches.size === 2) {
        const pts = Array.from(videoZoom.activeTouches.values());
        videoZoom.initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        videoZoom.initialPinchScale = videoZoom.scale;
        const rect = viewport.getBoundingClientRect();
        videoZoom.initialPinchMidX = ((pts[0].x + pts[1].x) / 2) - rect.left;
        videoZoom.initialPinchMidY = ((pts[0].y + pts[1].y) / 2) - rect.top;
      }

      resetIdleTimer();
      syncZoomUiDom();
    });

    surface.addEventListener('pointermove', (e) => {
      resetIdleTimer();
      if (videoZoom.passthrough || !videoZoom.isDragging) return;

      if (videoZoom.activeTouches.has(e.pointerId)) {
        videoZoom.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (videoZoom.activeTouches.size === 2 && videoZoom.initialPinchDist > 0) {
        videoZoom.hasDragged = true;
        const pts = Array.from(videoZoom.activeTouches.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const targetScale = videoZoom.initialPinchScale * (currentDist / videoZoom.initialPinchDist);
        zoomToFocalPoint(targetScale, videoZoom.initialPinchMidX, videoZoom.initialPinchMidY, false);
        return;
      }

      const dx = e.clientX - videoZoom.dragStartX;
      const dy = e.clientY - videoZoom.dragStartY;

      if (!videoZoom.hasDragged && Math.hypot(dx, dy) > 4) {
        videoZoom.hasDragged = true;
      }

      if (videoZoom.hasDragged && videoZoom.scale > 1.0) {
        videoZoom.panX = videoZoom.initialPanX + dx;
        videoZoom.panY = videoZoom.initialPanY + dy;
        applyZoomTransform(false);
      }
    });

    const handlePointerEnd = (e) => {
      videoZoom.activeTouches.delete(e.pointerId);

      try {
        surface.releasePointerCapture(e.pointerId);
      } catch {}

      if (!videoZoom.isDragging) return;
      videoZoom.isDragging = false;
      syncZoomUiDom();
    };

    surface.addEventListener('pointerup', handlePointerEnd);
    surface.addEventListener('pointercancel', handlePointerEnd);

    surface.addEventListener('dblclick', (e) => {
      if (videoZoom.passthrough) return;
      if (videoZoom.clickTimer) {
        clearTimeout(videoZoom.clickTimer);
        videoZoom.clickTimer = null;
      }

      const rect = viewport.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (videoZoom.scale <= 1.05) {
        zoomToFocalPoint(2.2, clickX, clickY, true);
        showFocalRing(clickX, clickY);
      } else if (videoZoom.scale < 3.0) {
        zoomToFocalPoint(3.5, clickX, clickY, true);
        showFocalRing(clickX, clickY);
      } else {
        resetZoom(true);
      }
      resetIdleTimer();
    });

    surface.addEventListener('wheel', (e) => {
      if (videoZoom.passthrough) return;

      const rect = viewport.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        const delta = -e.deltaY;
        const factor = e.ctrlKey ? Math.exp(delta * 0.01) : (delta > 0 ? 1.15 : 0.87);
        const targetScale = videoZoom.scale * factor;
        zoomToFocalPoint(targetScale, cursorX, cursorY, false);
        resetIdleTimer();
        return;
      }

      if (videoZoom.scale > 1.01) {
        e.preventDefault();
        e.stopPropagation();

        videoZoom.panX -= e.deltaX;
        videoZoom.panY -= e.deltaY;
        applyZoomTransform(false);
        resetIdleTimer();
        return;
      }
    }, { passive: false });

    viewport.addEventListener('mousemove', resetIdleTimer);

    if (radar) {
      let radarDragging = false;
      const handleRadar = (e) => {
        const rRect = radar.getBoundingClientRect();
        const clickX = Math.min(rRect.width, Math.max(0, e.clientX - rRect.left));
        const clickY = Math.min(rRect.height, Math.max(0, e.clientY - rRect.top));
        const vpW = viewport.clientWidth || 800;
        const vpH = viewport.clientHeight || 450;

        const targetContentX = (clickX / rRect.width) * vpW;
        const targetContentY = (clickY / rRect.height) * vpH;

        videoZoom.panX = (vpW / 2) - targetContentX * videoZoom.scale;
        videoZoom.panY = (vpH / 2) - targetContentY * videoZoom.scale;
        applyZoomTransform(false);
      };

      radar.addEventListener('pointerdown', (e) => {
        radarDragging = true;
        try { radar.setPointerCapture(e.pointerId); } catch {}
        handleRadar(e);
      });
      radar.addEventListener('pointermove', (e) => {
        if (!radarDragging) return;
        handleRadar(e);
      });
      const endRadar = (e) => {
        radarDragging = false;
        try { radar.releasePointerCapture(e.pointerId); } catch {}
      };
      radar.addEventListener('pointerup', endRadar);
      radar.addEventListener('pointercancel', endRadar);
    }

    document.getElementById('video-zoom-in-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomPassthrough(false);
      zoomByStep(0.25, true);
      resetIdleTimer();
    });

    document.getElementById('video-zoom-out-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomPassthrough(false);
      zoomByStep(-0.25, true);
      resetIdleTimer();
    });

    document.getElementById('video-zoom-mouth-quick-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomPassthrough(false);
      focusMouth(true);
      resetIdleTimer();
    });

    document.getElementById('video-zoom-reset-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      resetZoom(true);
      resetIdleTimer();
    });

    document.getElementById('video-zoom-passthrough-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomPassthrough(!videoZoom.passthrough);
      resetIdleTimer();
    });

    slider?.addEventListener('input', (e) => {
      setZoomPassthrough(false);
      const val = Number(e.target.value) || 100;
      const targetScale = val / 100;
      const width = viewport.clientWidth || 800;
      const height = viewport.clientHeight || 450;
      zoomToFocalPoint(targetScale, width / 2, height / 2, false);
      resetIdleTimer();
    });

    document.querySelectorAll('.zoom-preset-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        setZoomPassthrough(false);
        const z = Number(chip.getAttribute('data-zoom')) || 100;
        const width = viewport.clientWidth || 800;
        const height = viewport.clientHeight || 450;
        zoomToFocalPoint(z / 100, width / 2, height / 2, true);
        resetIdleTimer();
      });
    });

    document.getElementById('zoom-focal-mouth-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomPassthrough(false);
      focusMouth(true);
      closeAllControlPopovers();
      resetIdleTimer();
    });

    document.getElementById('zoom-focal-face-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomPassthrough(false);
      focusFace(true);
      closeAllControlPopovers();
      resetIdleTimer();
    });

    window.addEventListener('resize', () => {
      applyZoomTransform(false);
    });

    syncZoomUiDom();
  }

  videoZoom.applyZoomTransform = applyZoomTransform;
  videoZoom.zoomToFocalPoint = zoomToFocalPoint;
  videoZoom.zoomByStep = zoomByStep;
  videoZoom.panBy = panBy;
  videoZoom.focusMouth = focusMouth;
  videoZoom.focusFace = focusFace;
  videoZoom.resetZoom = resetZoom;
  videoZoom.setZoomPassthrough = setZoomPassthrough;
  window.videoZoom = videoZoom;

  /* ========================================================================
     UNIVERSAL MEDIA PLAYERS (YOUTUBE & HTML5) & EXACT PLAYBACK BOUNDARIES
     ======================================================================== */

  function mountMediaDeck(item) {
    const ytDiv = document.getElementById('studio-youtube-player');
    const ttsStage = document.getElementById('tts-audio-stage');
    const zoomViewport = document.getElementById('video-zoom-viewport');

    const vidId = String(item.videoId || item.video_id || '').trim();
    const isExternal = vidId.startsWith('ext_') || (vidId.length > 0 && !vidId.match(/^[a-zA-Z0-9_-]{11}$/));

    if (vidId && isExternal) {
      if (ttsStage) ttsStage.hidden = true;
      if (zoomViewport) zoomViewport.hidden = false;
      if (ytDiv) ytDiv.hidden = false;
      createHtml5Player(vidId);
    } else if (vidId) {
      if (ttsStage) ttsStage.hidden = true;
      if (zoomViewport) zoomViewport.hidden = false;
      if (ytDiv) ytDiv.hidden = false;
      loadYouTubeIframeApi(vidId);
    } else {
      if (zoomViewport) zoomViewport.hidden = true;
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
      const mountParent = document.getElementById('video-zoom-stage') || container;
      mountParent.appendChild(videoEl);

      videoEl.addEventListener('loadedmetadata', () => {
        if (!studioState.hasStartedPlaybackOnce && studioState.activeSentence?.startSec > 0) {
          try {
            videoEl.currentTime = studioState.activeSentence.startSec;
          } catch {}
        }
      });

      videoEl.addEventListener('play', () => {
        if (handleInitialNativePlayStart(studioState.ytPlayer)) return;
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

  function enforceHd1080Quality(player) {
    if (!player) return;
    try {
      const levels =
        typeof player.getAvailableQualityLevels === 'function'
          ? player.getAvailableQualityLevels()
          : [];
      const targetQuality =
        Array.isArray(levels) && levels.length > 0
          ? levels.includes('hd1080')
            ? 'hd1080'
            : levels[0]
          : 'hd1080';
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(targetQuality);
      }
      if (
        typeof player.setPlaybackQualityRange === 'function' &&
        (!Array.isArray(levels) || levels.length === 0 || levels.includes('hd1080'))
      ) {
        player.setPlaybackQualityRange('hd1080', 'hd1080');
      }
    } catch {}
  }

  function handleInitialNativePlayStart(player) {
    if (studioState.hasStartedPlaybackOnce) return false;
    studioState.hasStartedPlaybackOnce = true;
    const active = studioState.activeSentence;
    if (!active) return false;
    const current =
      player && typeof player.getCurrentTime === 'function'
        ? Number(player.getCurrentTime() || 0)
        : 0;
    if ((active.index > 1 || active.startSec > 0.5) && Math.abs(current - active.startSec) > 0.45) {
      playSentence(active.index);
      return true;
    }
    if (studioState.endAction === 'loop' && studioState.loopSentenceIndex === null) {
      studioState.loopSentenceIndex = active.index;
    }
    return false;
  }

  function createYtPlayer(videoId) {
    if (studioState.ytPlayer) return; // Never remount!
    const initialStartSec = Number(studioState.activeSentence?.startSec || 0);
    const playerVars = {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      cc_load_policy: 0,
      vq: 'hd1080',
    };
    if (initialStartSec >= 1) {
      playerVars.start = Math.floor(initialStartSec);
    }
    studioState.ytPlayer = new window.YT.Player('studio-youtube-player', {
      videoId,
      playerVars,
      events: {
        onReady: (ev) => {
          const player = ev?.target || studioState.ytPlayer;
          studioState.ytReady = true;
          enforceHd1080Quality(player);
          try {
            studioState.ytPlayer.setPlaybackRate(studioState.speed);
          } catch {}
          if (studioState.pendingPlaySentenceIndex !== null) {
            const idx = studioState.pendingPlaySentenceIndex;
            studioState.pendingPlaySentenceIndex = null;
            playSentence(idx, { preserveLoop: studioState.loopSentenceIndex === idx });
          } else if (
            !studioState.hasStartedPlaybackOnce &&
            studioState.activeSentence?.startSec > 0 &&
            typeof player.cueVideoById === 'function'
          ) {
            try {
              player.cueVideoById({
                videoId,
                startSeconds: studioState.activeSentence.startSec,
              });
            } catch {}
          }
        },
        onPlaybackQualityChange: (ev) => {
          if (ev?.data && ev.data !== 'hd1080') {
            enforceHd1080Quality(ev?.target || studioState.ytPlayer);
          }
        },
        onStateChange: (ev) => {
          const player = ev?.target || studioState.ytPlayer;
          if (ev?.data === 1) {
            if (handleInitialNativePlayStart(player)) return;
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

    const targetSentence = (studioState.item?.sentences || []).find((s) => s.index === index);
    const activeBadge = document.getElementById('active-sentence-time-badge');
    if (activeBadge && targetSentence) {
      activeBadge.textContent = targetSentence.timeRange || '—';
    }
    const jumpNum = document.getElementById('canvas-active-jump-num');
    if (jumpNum) {
      jumpNum.textContent = `#${String(index || 1).padStart(2, '0')}`;
    }
    syncDeckLiveSubtitle();
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
    studioState.hasStartedPlaybackOnce = true;
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

  /* ========================================================================
     PLAYBACK MICRO-SEEKING (SHADOWING SCRUBBING)
     ======================================================================== */

  function nudgePlayback(deltaSec) {
    const player = studioState.ytPlayer;
    if (!player || typeof player.getCurrentTime !== 'function' || typeof player.seekTo !== 'function') {
      return;
    }

    const current = Number(player.getCurrentTime() || 0);
    const active = studioState.activeSentence;
    let target = current + deltaSec;

    if (active) {
      const isLoop =
        studioState.loopSentenceIndex === active.index || studioState.endAction === 'loop';
      if (isLoop || studioState.endAction === 'pause') {
        // In Auto-Pause or Loop mode, keep within active sentence bounds so the user stays in the current drill
        target = Math.max(active.startSec, Math.min(active.endSec - 0.05, target));
      } else {
        // Continuous flow mode: scrub freely across the media
        const maxDur = typeof player.getDuration === 'function' ? player.getDuration() : 9999;
        target = Math.max(0, Math.min(maxDur, target));
      }
    } else {
      target = Math.max(0, target);
    }

    studioState.lastSeekTime = Date.now();
    player.seekTo(target, true);

    const sign = deltaSec > 0 ? '+' : '';
    const formattedDelta = Number.isInteger(deltaSec) ? `${deltaSec}` : deltaSec.toFixed(1);
    showToast(`${deltaSec < 0 ? 'Rewind' : 'Forward'} ${sign}${formattedDelta}s`);
  }

  function setStudioSeekStep(rawVal) {
    let num = Number(rawVal);
    if (!Number.isFinite(num)) num = 2;
    num = Math.max(1, Math.min(5, num));
    const step = Math.round(num * 2) / 2;
    studioState.seekStepSec = step;
    try {
      localStorage.setItem('flaptap_seek_step', String(step));
    } catch {}

    const selectEl = document.getElementById('seek-step-select');
    if (selectEl) {
      selectEl.value = String(step);
    }

    const downBtn = document.getElementById('seek-step-down-btn');
    if (downBtn) downBtn.disabled = step <= 1.001;
    const upBtn = document.getElementById('seek-step-up-btn');
    if (upBtn) upBtn.disabled = step >= 4.999;

    const labelStr = Number.isInteger(step) ? String(step) : step.toFixed(1);
    const seekLabelEl = document.getElementById('seek-step-label');
    if (seekLabelEl) seekLabelEl.textContent = `${labelStr}s`;
    const backBtn = document.getElementById('deck-seek-back-btn');
    if (backBtn) {
      backBtn.title = `Rewind ${labelStr}s (Left Arrow)`;
      backBtn.setAttribute('aria-label', `Rewind ${labelStr} seconds`);
    }
    const fwdBtn = document.getElementById('deck-seek-fwd-btn');
    if (fwdBtn) {
      fwdBtn.title = `Forward ${labelStr}s (Right Arrow)`;
      fwdBtn.setAttribute('aria-label', `Forward ${labelStr} seconds`);
    }
    const shortcutSeek = document.getElementById('shortcuts-seek-label');
    if (shortcutSeek) {
      shortcutSeek.textContent = `Seek ±${labelStr}s`;
    }
  }

  function stepSeekDuration(delta) {
    setStudioSeekStep((studioState.seekStepSec || 2) + delta);
  }

  window.nudgePlayback = nudgePlayback;
  window.setStudioSeekStep = setStudioSeekStep;
  window.stepSeekDuration = stepSeekDuration;

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

    // 1. Precise Onset Unmute:
    // Only unmute once the playhead has physically repositioned back to the active sentence onset.
    // Prevents unmuting while the player is still resolving the async seek near the previous tail.
    if (active && studioState.awaitingOnsetUnmute) {
      const arrivedAtOnset =
        Math.abs(current - active.startSec) <= 0.15 ||
        (current >= active.startSec - 0.05 && current <= active.startSec + 0.20);
      if (arrivedAtOnset) {
        if (typeof player.unMute === 'function') player.unMute();
        studioState.awaitingOnsetUnmute = false;
      }
    }

    // Ignore stale pre-seek playhead values for 90ms after issuing an async seek
    if (studioState.lastSeekTime > 0 && Date.now() - studioState.lastSeekTime < 90) {
      return;
    }

    const sentences = studioState.item?.sentences || [];

    // 2. Playback Boundary Enforcement (runs FIRST to guarantee loop & auto-pause boundaries)
    if (active) {
      const nextSentence = sentences.find((s) => s.index === active.index + 1);

      // Strict acoustic lead-out boundary:
      // Even if legacy data has contiguous timestamps, ensure boundary stops strictly before next sentence onset
      const safeBoundaryEnd = nextSentence && nextSentence.startSec <= active.endSec + 0.01
        ? Number(Math.max(active.startSec + 0.05, nextSentence.startSec - 0.050).toFixed(3))
        : active.endSec;

      // Play through sentence's full acoustic decay till the end of the sentence
      const endCutoff = Math.max(active.startSec + 0.05, safeBoundaryEnd);

      if (current >= endCutoff) {
        const shouldLoop =
          studioState.loopSentenceIndex === active.index || studioState.endAction === 'loop';

        if (shouldLoop) {
          studioState.awaitingOnsetUnmute = true;
          studioState.lastSeekTime = Date.now();
          if (typeof player.mute === 'function') player.mute();
          player.seekTo(active.startSec, true);
          if (
            typeof player.playVideo === 'function' &&
            (typeof player.getPlayerState !== 'function' || player.getPlayerState() !== 1)
          ) {
            player.playVideo();
          }
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
        return;
      }
    }

    // 3. Real-Time Playhead Tracking: Update active sentence as video progresses naturally
    // Only track across sentences when in Continuous mode, or when playhead is manually scrubbed far away.
    if (sentences.length > 0) {
      const isDrillingSentence =
        studioState.loopSentenceIndex !== null ||
        studioState.endAction === 'loop' ||
        studioState.endAction === 'pause';

      const isOutsideActive =
        !active || current < active.startSec - 0.35 || current > active.endSec + 0.35;

      if (!isDrillingSentence || isOutsideActive) {
        const match = sentences.find((s) => current >= s.startSec && current < s.endSec);
        if (match && (!active || active.index !== match.index)) {
          studioState.activeSentence = match;
          updateActiveSentenceDom(match.index);
          syncPlaybackButtonsDom();
          scrollSentenceIntoView(match.index, false);
        }
      }
    }
  }

  window.checkSentenceDrillProgress = checkSentenceDrillProgress;

  /* ========================================================================
     REAL-TIME AUTO-FOLLOW & FLUID PLAYBACK SCROLL SYNC
     ======================================================================== */

  function getPreviousVisibleListItem(el) {
    if (!el) return null;
    const itemCard = el.closest('.sentence-driller-card, .editorial-paragraph-block, .coach-item-card') || el;
    let prev = itemCard.previousElementSibling;
    while (prev) {
      if (!prev.hidden && window.getComputedStyle(prev).display !== 'none') {
        return prev;
      }
      prev = prev.previousElementSibling;
    }
    return null;
  }

  function scrollElementIntoViewSafe(el, behavior = 'smooth') {
    if (!el) return;
    const deck = document.querySelector('.studio-deck');
    const isStickyMobile =
      window.innerWidth <= 768 &&
      deck &&
      window.getComputedStyle(deck).position === 'sticky';
    const headerDock = document.getElementById('canvas-header-dock');
    const headerDockH =
      headerDock && window.getComputedStyle(headerDock).position === 'sticky'
        ? headerDock.getBoundingClientRect().height || 0
        : 0;
    const prevEl = getPreviousVisibleListItem(el);
    const listTopGap = 10;

    if (!isStickyMobile) {
      const canvas = document.querySelector('.studio-canvas');
      if (canvas && canvas.contains(el) && canvas.scrollHeight > canvas.clientHeight) {
        const canvasRect = canvas.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const elTopInCanvas = elRect.top - canvasRect.top + canvas.scrollTop;
        const elBottomInCanvas = elTopInCanvas + elRect.height;

        const hasPrev = Boolean(prevEl && canvas.contains(prevEl));
        const anchorEl = hasPrev ? prevEl : el;
        const anchorRect = anchorEl.getBoundingClientRect();
        const anchorTopInCanvas = anchorRect.top - canvasRect.top + canvas.scrollTop;

        const prevPrevEl = hasPrev ? getPreviousVisibleListItem(anchorEl) : null;
        let targetScrollTop = Math.max(
          0,
          Math.round(anchorTopInCanvas - headerDockH - (prevPrevEl ? 6 : listTopGap)),
        );
        if (prevPrevEl && canvas.contains(prevPrevEl)) {
          const prevPrevRect = prevPrevEl.getBoundingClientRect();
          const prevPrevBottomInCanvas = prevPrevRect.bottom - canvasRect.top + canvas.scrollTop;
          const minPastPrevPrev = Math.max(0, Math.ceil(prevPrevBottomInCanvas - headerDockH + 3));
          if (targetScrollTop < minPastPrevPrev) {
            targetScrollTop = minPastPrevPrev;
          }
        }

        const minScrollToShowEl = Math.max(0, Math.round(elBottomInCanvas - canvasRect.height + 14));
        if (targetScrollTop < minScrollToShowEl) {
          targetScrollTop = Math.min(
            minScrollToShowEl,
            Math.max(0, Math.round(elTopInCanvas - headerDockH - listTopGap)),
          );
        }
        canvas.scrollTo({ top: targetScrollTop, behavior });
        return;
      }
      el.scrollIntoView({ behavior, block: 'start' });
      return;
    }

    const dockHeight = (deck.getBoundingClientRect().height || 0) + headerDockH;
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    const elRect = el.getBoundingClientRect();
    const elAbsTop = elRect.top + window.scrollY;
    const elAbsBottom = elAbsTop + elRect.height;

    const anchorEl = prevEl || el;
    const anchorAbsTop = anchorEl.getBoundingClientRect().top + window.scrollY;
    const prevPrevEl = prevEl ? getPreviousVisibleListItem(anchorEl) : null;

    let targetY = Math.max(0, Math.round(anchorAbsTop - dockHeight - (prevPrevEl ? 6 : listTopGap)));
    if (prevPrevEl) {
      const prevPrevAbsBottom = prevPrevEl.getBoundingClientRect().bottom + window.scrollY;
      const minYPastPrevPrev = Math.max(0, Math.ceil(prevPrevAbsBottom - dockHeight + 3));
      if (targetY < minYPastPrevPrev) {
        targetY = minYPastPrevPrev;
      }
    }
    const minYToShowEl = Math.max(0, Math.round(elAbsBottom - vh + 14));
    if (targetY < minYToShowEl) {
      targetY = Math.min(minYToShowEl, Math.max(0, Math.round(elAbsTop - dockHeight - listTopGap)));
    }
    window.scrollTo({ top: targetY, behavior });
  }

  function getActiveScrollTargetElement(index) {
    if (studioState.mode === 'shadow') {
      return document.getElementById(`sent-card-${index}`);
    }
    if (studioState.mode === 'read') {
      const readSent = document.querySelector(`.read-sentence[data-read-sent="${index}"]`);
      if (readSent) return readSent;
      const paraDoneSet = getStudioCompletedSet('paragraphs');
      const chunks = studioState.item?.chunks || [];
      const firstParaIdx = chunks.findIndex((_, idx) => !paraDoneSet.has(idx + 1)) + 1;
      return firstParaIdx > 0
        ? document.querySelector(`.editorial-paragraph-block[data-paragraph-index="${firstParaIdx}"]`)
        : null;
    }
    if (studioState.mode === 'coach') {
      const firstUncheckedCoach = document.querySelector(
        '#mode-panel-coach [data-studio-check-subject="coach"]:not(.is-checked)',
      );
      return (
        firstUncheckedCoach?.closest('.coach-card, .coach-item, section') ||
        firstUncheckedCoach ||
        null
      );
    }
    return null;
  }

  function scrollSentenceIntoView(index, force, behavior = 'smooth') {
    if (!studioState.autoFollow && !force) return;
    if (studioState.userScrolledAway && !force) return;

    if (studioState.mode === 'listen') {
      studioState.dictationIndex = index;
      renderDictationCard();
      return;
    }
    const targetEl = getActiveScrollTargetElement(index);
    if (targetEl) {
      scrollElementIntoViewSafe(targetEl, behavior);
    }
  }

  function jumpToActiveItem(opts) {
    const options = opts || {};
    const targetIdx =
      Number(options.index) ||
      studioState.activeSentence?.index ||
      studioState.item?.sentences?.[0]?.index ||
      1;

    if (options.ensureReadableMode && studioState.mode !== 'shadow' && studioState.mode !== 'read') {
      switchStudioMode('shadow');
    }
    if (options.resetFilter && studioState.completionFilter !== 'all') {
      setCompletionFilter('all');
    }

    studioState.userScrolledAway = false;
    studioState.autoFollow = true;
    syncAutoFollowButtonDom();
    syncFloatingJumpButton();

    requestAnimationFrame(() => {
      scrollSentenceIntoView(targetIdx, true, options.behavior || 'smooth');
    });
  }

  function toggleAutoFollow() {
    studioState.autoFollow = !studioState.autoFollow;
    if (studioState.autoFollow) {
      jumpToActiveItem();
      return;
    }
    syncAutoFollowButtonDom();
    syncFloatingJumpButton();
  }

  function syncAutoFollowButtonDom() {
    const btn = document.getElementById('deck-auto-follow-btn');
    const textEl = document.getElementById('deck-auto-follow-text');
    if (btn) {
      btn.classList.toggle('active', studioState.autoFollow);
      btn.setAttribute('aria-pressed', studioState.autoFollow ? 'true' : 'false');
    }
    if (textEl) {
      textEl.innerHTML = `<strong>${studioState.autoFollow ? 'ON' : 'OFF'}</strong>`;
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
    if (badge) {
      badge.textContent = `${speed.toFixed(2)}x`;
      badge.classList.toggle('is-custom', Math.abs(speed - 1.0) >= 0.001);
      badge.setAttribute('aria-label', `${t('playbackSpeedLabel')}: ${speed.toFixed(2)}x (click to reset to 1.00x)`);
    }

    const scbSpeedVal = document.getElementById('scb-speed-value');
    if (scbSpeedVal) scbSpeedVal.textContent = `${speed.toFixed(2)}x`;
    const isCustomSpeed = Math.abs(speed - 1.0) >= 0.001;
    const speedTrigger = document.getElementById('speed-trigger-btn');
    if (speedTrigger) {
      speedTrigger.classList.toggle('is-custom', isCustomSpeed);
      speedTrigger.setAttribute('aria-label', `${t('playbackSpeedLabel')}: ${speed.toFixed(2)}x`);
    }
    const speedGroup = document.getElementById('scb-speed-group');
    if (speedGroup) {
      speedGroup.classList.toggle('is-custom', isCustomSpeed);
    }

    const atMin = speed <= 0.251;
    const atMax = speed >= 1.999;
    ['scb-speed-down-btn', 'speed-down-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = atMin;
    });
    ['scb-speed-up-btn', 'speed-up-btn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = atMax;
    });

    document.querySelectorAll('#quick-speed-bar [data-quick-speed]').forEach((btn) => {
      const targetVal = Number(btn.dataset.quickSpeed);
      const isMatch = Math.abs(targetVal - speed) < 0.001;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    const qsbResetBtn = document.getElementById('qsb-speed-reset-btn');
    if (qsbResetBtn) {
      qsbResetBtn.disabled = !isCustomSpeed;
      qsbResetBtn.classList.toggle('is-active', isCustomSpeed);
    }

    const slider = document.getElementById('speed-slider');
    if (slider) {
      slider.value = String(speed);
      const pct = Math.max(0, Math.min(100, ((speed - 0.25) / 1.75) * 100));
      slider.style.setProperty('--speed-pct', `${pct.toFixed(3)}%`);
    }

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
    if (studioState.languages.length > 0) {
      syncTranslationLanguageOptions(studioState.defaultLanguage);
      return;
    }
    if (studioState.languagesInFlight) return studioState.languagesInFlight;

    studioState.languagesInFlight = (async () => {
      try {
        const data = await apiFetch('/api/languages', { method: 'GET' });
        studioState.languages = Array.isArray(data.languages) ? data.languages : [];
        studioState.defaultLanguage = data.defaultLanguage || 'ar';
        syncTranslationLanguageOptions(studioState.defaultLanguage);
      } catch {
      } finally {
        studioState.languagesInFlight = null;
      }
    })();

    return studioState.languagesInFlight;
  }

  /**
   * Populates the translation picker from the cached catalog. Kept separate so
   * opening the console twice performs zero extra network work.
   */
  function syncTranslationLanguageOptions(defaultLanguage) {
    const select = document.getElementById('trans-lang-select');
    if (!select || studioState.languages.length === 0) return;

    const optionsHtml = [
      `<option value="none">${escapeHtml(t('transLangNone'))}</option>`,
      ...studioState.languages.map(
        (l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} — ${escapeHtml(l.native)}</option>`,
      ),
    ].join('');
    select.innerHTML = optionsHtml;

    const preferred = studioState.translationLang || defaultLanguage || 'ar';
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
    studioState.translationRtl = Boolean(
      langMeta?.rtl ?? RTL_LANGUAGE_CODES.has(studioState.translationLang),
    );
    syncTranslationUiState();
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

    const transTrigger = document.getElementById('trans-trigger-btn');
    const transBadge = document.getElementById('scb-trans-lang-badge');
    if (transBadge) {
      transBadge.textContent = langCode === 'none' ? 'OFF' : langCode.toUpperCase();
    }
    if (transTrigger) {
      const isAllLoading = langCode !== 'none' && Boolean(studioState.translatingAllByLang[langCode]);
      transTrigger.classList.toggle('is-active', langCode !== 'none' && Boolean(studioState.showTranslations));
      transTrigger.classList.toggle('is-translating', isAllLoading);
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
      syncDeckLiveSubtitle();
      return;
    }

    const langMeta = studioState.languages.find((l) => l.code === langCode);
    const rtl = Boolean(langMeta ? langMeta.rtl : RTL_LANGUAGE_CODES.has(langCode));
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
    syncDeckLiveSubtitle();
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
    syncDictationCompletionButtonDom();
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
        correctCount === inputs.length ? 'var(--status-success)' : 'var(--status-danger)';
    }

    if (!revealAll && inputs.length > 0 && correctCount === inputs.length) {
      setStudioItemCompletion('listen', studioState.dictationIndex, true);
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

  const COACH_SECTIONS = {
    connected: {
      kind: 'connected',
      subject: 'coachConnected',
      gridId: 'coach-connected-grid',
      countId: 'coach-connected-count',
    },
    expression: {
      kind: 'expression',
      subject: 'coachExpressions',
      gridId: 'coach-expressions-grid',
      countId: 'coach-expressions-count',
    },
    vocabulary: {
      kind: 'vocabulary',
      subject: 'coachVocabulary',
      gridId: 'coach-vocab-grid',
      countId: 'coach-vocab-count',
    },
  };

  /**
   * Escapes coach prose, then wraps every English token so a single click opens
   * the same contextual lookup popover used by the transcript.
   */
  function renderCoachInteractiveText(rawText, sentenceIndex) {
    const safeHtml = escapeHtml(rawText || '');
    if (!safeHtml) return '';
    return decorateClickableWords(safeHtml, Number(sentenceIndex) || 1);
  }

  function renderCoachClipButtonHtml(sentenceIndex) {
    const idx = Number(sentenceIndex) || 1;
    const num = String(idx).padStart(2, '0');
    const label = t('playBtn');
    return `
      <button
        type="button"
        class="coach-clip-btn icon-action icon-action--sm"
        data-coach-play="${idx}"
        data-play-state="idle"
        aria-pressed="false"
        aria-label="${escapeHtml(label)} #${num}"
        title="${escapeHtml(label)} #${num}"
      >
        <span class="coach-clip-icon" aria-hidden="true">${PLAY_ICON_SVG}</span>
        <span class="coach-clip-label visually-hidden">${escapeHtml(label)}</span>
      </button>`;
  }

  function renderCoachSaveInner(saved) {
    const iconName = saved ? 'bookmark-check' : 'bookmark-plus';
    return `<span class="coach-save-icon" aria-hidden="true">${window.FlaptapIcon ? window.FlaptapIcon(iconName) : ''}</span><span class="visually-hidden">${escapeHtml(
      saved ? t('savedStatus') : t('saveBtn'),
    )}</span>`;
  }

  function renderCoachSaveButtonHtml({ saveKind, index, isSaved }) {
    if (!saveKind) return '';
    const attr = saveKind === 'expression' ? 'data-save-expr' : 'data-save-vocab';
    const label = isSaved ? t('savedStatus') : t('saveToVocabBtn');
    return `
      <button
        type="button"
        class="coach-save-btn icon-action icon-action--sm${isSaved ? ' is-saved' : ''}"
        ${attr}="${Number(index)}"
        aria-pressed="${isSaved ? 'true' : 'false'}"
        aria-label="${escapeHtml(label)}"
        title="${escapeHtml(label)}"
      >${renderCoachSaveInner(isSaved)}</button>`;
  }

  function renderCoachCardHtml({
    section,
    index,
    sentenceIndex,
    phraseText,
    quote = false,
    tag,
    tagClass = '',
    ipa,
    bodyHtml,
    glossKey = '',
    saveKind = null,
    isSaved = false,
    isDone = false,
  }) {
    const kind = section.kind;
    const subject = section.subject;
    const idx = Number(sentenceIndex) || 1;
    const num = String(idx).padStart(2, '0');
    const phraseHtml = renderCoachInteractiveText(phraseText, idx);
    return `
      <article
        class="coach-item-card coach-item-card--${kind}${isDone ? ' is-item-completed' : ''}"
        data-coach-kind="${kind}"
        data-coach-sentence="${idx}"
        style="--coach-card-order: ${Math.min(Number(index) || 0, 10)}"
      >
        <div class="coach-row-rail">
          <span class="coach-sentence-chip ltr-num">${num}</span>
        </div>
        <div class="coach-row-body">
          <div class="coach-item-head">
            <div class="coach-phrase-col">
              <div class="coach-phrase-wrap">
                <span class="coach-phrase" dir="ltr">${quote ? `“${phraseHtml}”` : phraseHtml}</span>
                <button
                  type="button"
                  class="coach-say-btn"
                  data-coach-say="${escapeHtml(phraseText)}"
                  aria-label="${escapeHtml(t('coachHearPhrase'))}"
                  title="${escapeHtml(t('coachHearPhrase'))}"
                >${SPEAKER_ICON_SVG}</button>
              </div>
              ${glossKey ? `<p class="coach-gloss" dir="auto" lang="ar" data-coach-gloss="${escapeHtml(glossKey)}" hidden></p>` : ''}
            </div>
            ${tag ? `<span class="coach-tag${tagClass}" title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>` : ''}
          </div>
          ${ipa ? `<div class="coach-ipa ltr-num">${escapeHtml(ipa)}</div>` : ''}
          ${bodyHtml}
          <div class="coach-item-actions">
            <div class="coach-action-group">
              ${renderCoachClipButtonHtml(idx)}
              ${renderStudioCopyBtnHtml(phraseText, 'coach-copy-btn icon-action icon-action--sm')}
              ${renderCoachSaveButtonHtml({ saveKind, index, isSaved })}
            </div>
            <span class="coach-done-wrap">${renderStudioCheckBtnHtml({ checked: isDone, subject, index })}</span>
          </div>
        </div>
      </article>`;
  }

  /**
   * Arabic meaning for the learnable Coach items (expressions and key
   * vocabulary), authored by the model from the same analysis and cached
   * inside the lesson. It never blocks the English cards when the model is
   * unreachable.
   */
  let coachGlossInFlight = null;

  function coachGlossStamp(analysis) {
    if (!analysis || !studioState.item?.id) return '';
    return [
      studioState.item.id,
      analysis.analyzedAt || '',
      analysis.aiModel || '',
      analysis.connectedSpeech?.length || 0,
      analysis.expressions?.length || 0,
      analysis.vocabulary?.length || 0,
    ].join('|');
  }

  function applyCoachGlosses(entries) {
    const map = entries || {};
    document.querySelectorAll('[data-coach-gloss]').forEach((el) => {
      const key = el.getAttribute('data-coach-gloss');
      const text = typeof map[key] === 'string' ? map[key].trim() : '';
      if (!text) return;
      el.textContent = text;
      el.hidden = false;
    });
  }

  async function hydrateCoachGlosses(analysis) {
    const stamp = coachGlossStamp(analysis);
    if (!stamp) return;

    if (studioState.coachGlosses?.stamp === stamp) {
      applyCoachGlosses(studioState.coachGlosses.entries);
      return;
    }

    if (coachGlossInFlight?.stamp === stamp) return;

    const promise = apiFetch('/api/tracks/shadowing/coach-glosses', {
      method: 'POST',
      body: JSON.stringify({ historyId: studioState.item.id }),
    })
      .then((res) => {
        const entries = res?.glosses && typeof res.glosses === 'object' ? res.glosses : {};
        studioState.coachGlosses = { stamp, entries };
        applyCoachGlosses(entries);
      })
      .catch(() => {
        // English cards stay complete; Arabic simply stays hidden.
      })
      .finally(() => {
        if (coachGlossInFlight?.stamp === stamp) coachGlossInFlight = null;
      });

    coachGlossInFlight = { stamp, promise };
    return promise;
  }

  function syncCoachBadgeFromAnalysis(analysis) {    const total =
      (analysis?.connectedSpeech?.length || 0) +
      (analysis?.expressions?.length || 0) +
      (analysis?.vocabulary?.length || 0);
    const badgeCoach = document.getElementById('badge-coach-count');
    if (badgeCoach) {
      badgeCoach.textContent = String(total);
      badgeCoach.hidden = total === 0;
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

    // Saved-state is needed for the card Save buttons, fetched once, lazily.
    loadSavedVocabularyTerms();

    const cefr = analysis.overview?.cefrLevel || 'B2';
    const headerCefr = document.getElementById('studio-cefr-badge');
    if (headerCefr) {
      headerCefr.textContent = cefr;
      headerCefr.hidden = false;
    }

    document.getElementById('coach-cefr-stamp').textContent = cefr;
    document.getElementById('coach-style-heading').textContent =
      analysis.overview?.speakerStyle || 'Natural American Cadence';
    const summaryEl = document.getElementById('coach-summary-text');
    const briefContextIndex =
      studioState.activeSentence?.index ||
      studioState.item?.sentences?.[0]?.index ||
      1;
    if (summaryEl) {
      summaryEl.innerHTML = renderCoachInteractiveText(
        analysis.overview?.summary || '',
        briefContextIndex,
      );
    }

    const tipsList = document.getElementById('coach-tips-list');
    if (tipsList) {
      tipsList.innerHTML = (analysis.overview?.focusTips || [])
        .map((tip) => `<li>${renderCoachInteractiveText(tip, briefContextIndex)}</li>`)
        .join('');
    }

    const connected = analysis.connectedSpeech || [];
    const expressions = analysis.expressions || [];
    const vocab = analysis.vocabulary || [];

    syncCoachBadgeFromAnalysis(analysis);

    document.getElementById(COACH_SECTIONS.connected.countId).textContent = String(
      connected.length,
    );
    document.getElementById(COACH_SECTIONS.expression.countId).textContent = String(
      expressions.length,
    );
    document.getElementById(COACH_SECTIONS.vocabulary.countId).textContent = String(vocab.length);

    const connDone = getStudioCompletedSet('coachConnected');
    document.getElementById(COACH_SECTIONS.connected.gridId).innerHTML = connected
      .map((entry, index) =>
        renderCoachCardHtml({
          section: COACH_SECTIONS.connected,
          index,
          sentenceIndex: entry.sentenceIndex,
          phraseText: entry.exactPhrase,
          quote: true,
          tag: entry.phenomenon,
          ipa: entry.spokenIpa,
          bodyHtml: `<p class="coach-desc coach-desc--mechanics">${renderCoachInteractiveText(
            entry.mechanics,
            entry.sentenceIndex,
          )}</p>`,
          isDone: connDone.has(index),
        }),
      )
      .join('');

    const exprDone = getStudioCompletedSet('coachExpressions');
    document.getElementById(COACH_SECTIONS.expression.gridId).innerHTML = expressions
      .map((entry, index) => {
        const register = String(entry.register || 'Expression');
        const lowerRegister = register.toLowerCase();
        const isSlang = lowerRegister.includes('slang') || lowerRegister.includes('colloquial');
        const usageNote = entry.usageNote
          ? `<p class="coach-desc coach-desc--note">${renderCoachInteractiveText(
              entry.usageNote,
              entry.sentenceIndex,
            )}</p>`
          : '';
        return renderCoachCardHtml({
          section: COACH_SECTIONS.expression,
          index,
          sentenceIndex: entry.sentenceIndex,
          phraseText: entry.phrase,
          tag: register,
          tagClass: isSlang ? ' is-slang' : '',
          ipa: entry.ipa,
          bodyHtml:
            `<p class="coach-desc coach-desc--meaning">${renderCoachInteractiveText(
              entry.meaning,
              entry.sentenceIndex,
            )}</p>` + usageNote,
          glossKey: `expression:${index}`,
          saveKind: 'expression',
          isSaved: studioState.savedTerms.has(normalizeTermKey(entry.phrase)),
          isDone: exprDone.has(index),
        });
      })
      .join('');

    const vocabDone = getStudioCompletedSet('coachVocabulary');
    document.getElementById(COACH_SECTIONS.vocabulary.gridId).innerHTML = vocab
      .map((entry, index) =>
        renderCoachCardHtml({
          section: COACH_SECTIONS.vocabulary,
          index,
          sentenceIndex: entry.sentenceIndex,
          phraseText: entry.term,
          tag: entry.partOfSpeech || 'word',
          ipa: entry.ipa,
          bodyHtml: `<p class="coach-desc">${renderCoachInteractiveText(
            entry.definition,
            entry.sentenceIndex,
          )}</p>`,
          glossKey: `vocabulary:${index}`,
          saveKind: 'vocabulary',
          isSaved: studioState.savedTerms.has(normalizeTermKey(entry.term)),
          isDone: vocabDone.has(index),
        }),
      )
      .join('');

    syncPlaybackButtonsDom();
    refreshAllStudioProgressBars();
    applyCompletionFilterDom();
    hydrateCoachGlosses(analysis);
  }

  /* ========================================================================
     CONTEXTUAL AI WORD POPOVER & VOCABULARY SAVE
     ======================================================================== */

  let savedVocabularyInFlight = null;

  /**
   * Lazy, single-flight vocabulary hydration. Start Listen must never pay for
   * this request; it is only fetched when a lookup, save button, or Coach view
   * actually needs saved-state information.
   */
  async function loadSavedVocabularyTerms() {
    if (studioState.savedVocabularyLoaded) return studioState.savedTerms;
    if (!savedVocabularyInFlight) {
      savedVocabularyInFlight = apiFetch('/api/vocabulary', { method: 'GET' })
        .then((items) => {
          if (Array.isArray(items)) {
            for (const item of items) {
              const key = normalizeTermKey(item?.term);
              if (key) studioState.savedTerms.add(key);
            }
            studioState.savedVocabularyLoaded = true;
            syncSavedButtonsDom();
          }
        })
        .catch(() => {})
        .finally(() => {
          savedVocabularyInFlight = null;
        });
    }
    return savedVocabularyInFlight;
  }

  async function openWordLookup(word, sentenceIndex, sourceSpan, options = {}) {
    if (!studioState.item || !word || !window.FlaptapWordLookup) return;

    // Vocabulary saved-state is fetched lazily and must not block the popover.
    loadSavedVocabularyTerms();

    const selection = window.FlaptapWordLookup.classifySelection(word);
    const term = selection.text || String(word).trim();
    if (!term) return;

    const scope = options.scope || selection.scope;
    const resolvedSentenceIndex =
      Number(sentenceIndex) || studioState.activeSentence?.index || 1;
    const sentences = studioState.item.sentences || [];
    const preferredSentence = sentences.find((s) => s.index === resolvedSentenceIndex);
    const contextSentence =
      preferredSentence &&
      preferredSentence.text.toLowerCase().includes(term.toLowerCase())
        ? preferredSentence
        : sentences.find((s) => s.text.toLowerCase().includes(term.toLowerCase())) ||
          preferredSentence;

    studioState.pendingLookupTerm = term;

    const data = await window.FlaptapWordLookup.open({
      word: term,
      scope,
      sourceEl: sourceSpan,
      contextSentence: contextSentence?.text || '',
      sentenceIndex: contextSentence?.index || resolvedSentenceIndex,
      endpoint: '/api/tracks/shadowing/define-word',
      payload: {
        historyId: studioState.item.id,
        word: term,
        sentenceIndex: contextSentence?.index || resolvedSentenceIndex,
        lookupScope: scope,
        language:
          studioState.translationLang && studioState.translationLang !== 'none'
            ? studioState.translationLang
            : 'ar',
      },
      fetcher: apiFetch,
      canPlay: true,
      playLabel: t('playClipBtn'),
      onPlay: (lookup) => {
        if (lookup?.sentenceIndex) {
          playSentence(lookup.sentenceIndex);
        }
      },
      canSpeak: true,
      canSave: scope !== 'sentence',
      saveLabel: t('saveToVocabBtn'),
      savedLabel: t('savedInVocabBtn'),
      isSavedFn: (lookupTerm) => studioState.savedTerms.has(normalizeTermKey(lookupTerm)),
      onSave: (lookup) => saveWordToVault(lookup),
    });

    if (data) {
      studioState.activeWordLookup = data;
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
          generalTranslation: entry.generalTranslation || '',
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
    const liveFloating = document.getElementById('rec-live-floating');
    const liveTimer = document.getElementById('rec-live-timer');
    const liveVuFill = document.getElementById('rec-live-vu-fill');
    const voiceMenuBtn = document.getElementById('voice-menu-btn');
    const voiceDot = document.getElementById('scb-voice-dot');
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
            if (liveVuFill) liveVuFill.style.width = `${pct}%`;
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
        if (liveFloating) liveFloating.hidden = true;
        if (liveVuFill) liveVuFill.style.width = '0%';
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
        if (voiceMenuBtn) voiceMenuBtn.classList.add('has-take');
        if (voiceDot) voiceDot.hidden = false;
        const moreRecDot = document.getElementById('scb-more-rec-dot');
        if (moreRecDot) {
          moreRecDot.classList.remove('is-recording');
          moreRecDot.hidden = false;
        }
      };

      recorder.start(100);
      btn?.classList.add('recording');
      btn?.setAttribute('aria-pressed', 'true');
      const moreRecDot = document.getElementById('scb-more-rec-dot');
      if (moreRecDot) {
        moreRecDot.classList.add('is-recording');
        moreRecDot.hidden = false;
      }
      if (txt) txt.textContent = t('stopRecord');
      if (status) status.textContent = t('recRecording');
      if (liveFloating) liveFloating.hidden = false;

      // Live recording timer badge
      studioState.recordingStartTime = Date.now();
      if (timerBadge) {
        timerBadge.hidden = false;
        timerBadge.textContent = '00:00';
      }
      if (liveTimer) liveTimer.textContent = '00:00';
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - studioState.recordingStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        if (timerBadge) timerBadge.textContent = `${mins}:${secs}`;
        if (liveTimer) liveTimer.textContent = `${mins}:${secs}`;
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

  function renderStudioUserProfile(res) {
    const btn = document.getElementById('studio-account-btn');
    const label = document.getElementById('studio-account-label');
    const avatar = document.getElementById('studio-avatar');
    const avatarImg = document.getElementById('studio-avatar-img');
    const guestIcon = document.getElementById('studio-guest-icon');

    if (res && res.authenticated && res.user) {
      studioState.user = res.user;
      btn?.classList.add('authenticated');
      if (label) label.textContent = res.user.name.split(' ')[0];
      if (res.user.avatarUrl && avatarImg) {
        avatarImg.src = res.user.avatarUrl;
        avatarImg.hidden = false;
        if (avatar) avatar.hidden = true;
        if (guestIcon) guestIcon.setAttribute('hidden', '');
      } else if (avatar) {
        avatar.textContent = (res.user.name || 'U').charAt(0).toUpperCase();
        avatar.hidden = false;
        if (avatarImg) avatarImg.hidden = true;
        if (guestIcon) guestIcon.setAttribute('hidden', '');
      }
    } else if (label) {
      label.textContent = t('signIn');
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
    syncStudioTopProgressDom();

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

    const params = new URLSearchParams(window.location.search);
    const jumpTime = Number(params.get('t'));
    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const sentDoneSet = getStudioCompletedSet('sentences');
    const listenDoneSet = getStudioCompletedSet('listen');
    const firstUncompletedSentence =
      sentences.find((s) => !sentDoneSet.has(Number(s.index))) || sentences[0] || null;
    const firstUncompletedListen =
      sentences.find((s) => !listenDoneSet.has(Number(s.index))) || sentences[0] || null;

    let targetSentence = null;
    if (Number.isFinite(jumpTime) && jumpTime > 0 && sentences.length > 0) {
      targetSentence =
        sentences.find((s) => Math.abs(s.startSec - jumpTime) < 0.5) ||
        sentences.find((s) => jumpTime >= s.startSec && jumpTime <= s.endSec) ||
        null;
    }

    const initialTarget = targetSentence || firstUncompletedSentence;
    studioState.hasStartedPlaybackOnce = false;
    if (initialTarget) {
      studioState.activeSentence = initialTarget;
    }

    renderSentencesAndParagraphs();
    mountMediaDeck(item);
    syncPlaybackButtonsDom();
    if (initialTarget) {
      updateActiveSentenceDom(initialTarget.index);
    }
    const firstSentenceIdx = studioState.activeSentence?.index || item.sentences?.[0]?.index || 1;
    const canvasJumpNum = document.getElementById('canvas-active-jump-num');
    if (canvasJumpNum) {
      canvasJumpNum.textContent = `#${String(firstSentenceIdx).padStart(2, '0')}`;
    }
    syncDeckLiveSubtitle();
    requestAnimationFrame(syncStudioDeckStickyHeightVar);

    if (studioState.mode === 'coach') {
      if (item.aiAnalysis) {
        renderCoachAnalysis(item.aiAnalysis);
      } else {
        triggerDynamicCoachAnalysis(false);
      }
    } else if (item.aiAnalysis) {
      // Show the Coach tab count without rendering the panel or fetching vocab.
      syncCoachBadgeFromAnalysis(item.aiAnalysis);
    }

    const overlay = document.getElementById('loader-overlay');
    if (overlay) {
      overlay.classList.remove('loader-error');
      overlay.hidden = true;
    }

    if (firstUncompletedListen) {
      studioState.dictationIndex = Number(firstUncompletedListen.index) || 1;
      if (studioState.mode === 'listen') {
        renderDictationCard();
      }
    }

    if (initialTarget && (targetSentence || studioState.autoFollow)) {
      jumpToActiveItem({ index: initialTarget.index });
    }
  }

  async function loadStudioSession() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const rawUrl = params.get('url');
    const forceExtract = params.get('force') === '1';
    const initialMode = params.get('mode') || 'shadow';

    switchStudioMode(initialMode);

    if (id && studioState.authToken) {
      try {
        const [me, item] = await Promise.all([
          apiFetch('/api/auth/me', { method: 'GET' }),
          apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'GET' }),
        ]);
        if (!me?.authenticated || !me?.user) {
          redirectToSignInGate();
          return;
        }
        studioState.user = me.user;
        renderStudioUserProfile(me);
        hydrateStudioItem(item);
      } catch (error) {
        showFatalLoaderError(error);
      }
      return;
    }

    // Hard Auth Gate BEFORE processing or opening any lesson
    try {
      const me = await apiFetch('/api/auth/me', { method: 'GET' });
      if (!me?.authenticated || !me?.user) {
        redirectToSignInGate();
        return;
      }
      studioState.user = me.user;
      renderStudioUserProfile(me);
    } catch {
      redirectToSignInGate();
      return;
    }

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
    initVideoZoomHandlers();

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

    document.querySelectorAll('.mode-tab-btn[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => switchStudioMode(btn.dataset.mode));
    });

    document.querySelectorAll('[data-studio-comp-filter]').forEach((btn) => {
      btn.addEventListener('click', () => setCompletionFilter(btn.dataset.studioCompFilter));
    });

    document.querySelectorAll('[data-studio-reset-filter]').forEach((btn) => {
      btn.addEventListener('click', () => setCompletionFilter('all'));
    });

    document.getElementById('canvas-active-jump-btn')?.addEventListener('click', () => {
      jumpToActiveItem({ ensureReadableMode: true, resetFilter: true });
    });

    const deckEl = document.querySelector('.studio-deck');
    if (deckEl && typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => syncStudioDeckStickyHeightVar());
      ro.observe(deckEl);
    }
    window.addEventListener('resize', syncStudioDeckStickyHeightVar, { passive: true });
    requestAnimationFrame(syncStudioDeckStickyHeightVar);

    // Unified Single-Icon Sentence Flow Cycling (#studio-flow-btn)
    document.getElementById('studio-flow-btn')?.addEventListener('click', () => {
      const order = ['loop', 'pause', 'continue'];
      const curr = order.includes(studioState.endAction) ? studioState.endAction : 'loop';
      const next = order[(order.indexOf(curr) + 1) % order.length];
      studioState.endAction = next;
      if (next === 'loop') {
        studioState.loopSentenceIndex = studioState.activeSentence?.index ?? null;
        studioState.activeSentenceStep = studioState.isPlaying ? 'looping' : 'paused-from-once';
      } else {
        studioState.loopSentenceIndex = null;
        studioState.activeSentenceStep = studioState.isPlaying ? 'playing-once' : 'idle';
      }
      syncPlaybackButtonsDom();
      const toastMap = {
        pause: t('flowPause'),
        loop: t('flowLoop'),
        continue: t('flowContinue'),
      };
      showToast(`${t('playbackFlowLabel')}: ${toastMap[next] || next}`);
    });

    // Control Bar Popover Triggers
    SCB_POPOVER_PAIRS.forEach(({ triggerId, popoverId }) => {
      document.getElementById(triggerId)?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleControlPopover(triggerId, popoverId);
      });
    });

    document.addEventListener('click', (e) => {
      const clickedInsideAny = SCB_POPOVER_PAIRS.some(({ triggerId, popoverId }) => {
        const pop = document.getElementById(popoverId);
        const trg = document.getElementById(triggerId);
        return (pop && !pop.hidden && pop.contains(e.target)) || (trg && trg.contains(e.target));
      });
      if (!clickedInsideAny) {
        closeAllControlPopovers();
      }
    });

    window.addEventListener('resize', () => {
      SCB_POPOVER_PAIRS.forEach(({ triggerId, popoverId }) => {
        const pop = document.getElementById(popoverId);
        const trg = document.getElementById(triggerId);
        if (pop && !pop.hidden && trg) {
          positionControlPopover(pop, trg);
        }
      });
    }, { passive: true });

    // Speed Slider & Stepper Buttons (inline control bar + quick speed bar + popover)
    document.getElementById('scb-speed-down-btn')?.addEventListener('click', () => stepSpeed(-0.05));
    document.getElementById('scb-speed-up-btn')?.addEventListener('click', () => stepSpeed(0.05));
    document.getElementById('speed-down-btn')?.addEventListener('click', () => stepSpeed(-0.05));
    document.getElementById('speed-up-btn')?.addEventListener('click', () => stepSpeed(0.05));
    document.getElementById('current-speed-badge')?.addEventListener('click', () => setStudioSpeed(1.0));
    document.getElementById('qsb-speed-reset-btn')?.addEventListener('click', () => setStudioSpeed(1.0));
    document.querySelectorAll('#quick-speed-bar [data-quick-speed]').forEach((btn) => {
      btn.addEventListener('click', () => setStudioSpeed(btn.dataset.quickSpeed));
    });

    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
      setStudioSpeed(e.target.value);
    });

    document.querySelectorAll('#speed-ticks-row .speed-tick').forEach((tick) => {
      tick.addEventListener('click', () => setStudioSpeed(tick.dataset.speed));
    });

    // Master Sentence Transport Controls
    document.getElementById('deck-prev-sent-btn')?.addEventListener('click', () => {
      const curr = studioState.activeSentence?.index || 1;
      if (curr > 1) {
        closeWordLookupPopover();
        const prevIdx = curr - 1;
        playSentence(prevIdx);
        studioState.userScrolledAway = false;
        scrollSentenceIntoView(prevIdx, true);
        syncFloatingJumpButton();
      }
    });

    document.getElementById('deck-next-sent-btn')?.addEventListener('click', () => {
      const sentences = studioState.item?.sentences || [];
      const curr = studioState.activeSentence?.index || 1;
      if (curr < sentences.length) {
        closeWordLookupPopover();
        const nextIdx = curr + 1;
        playSentence(nextIdx);
        studioState.userScrolledAway = false;
        scrollSentenceIntoView(nextIdx, true);
        syncFloatingJumpButton();
      }
    });

    document.getElementById('deck-play-active-btn')?.addEventListener('click', () => {
      const curr = studioState.activeSentence?.index || 1;
      handleSentencePlayButtonClick(curr);
    });

    document.getElementById('deck-replay-sent-btn')?.addEventListener('click', () => {
      const curr = studioState.activeSentence?.index || 1;
      playSentence(curr, { forceMode: studioState.endAction === 'loop' ? 'loop' : 'once' });
      studioState.userScrolledAway = false;
      scrollSentenceIntoView(curr, true);
      syncFloatingJumpButton();
    });

    document.getElementById('deck-seek-back-btn')?.addEventListener('click', () => {
      nudgePlayback(-(studioState.seekStepSec || 2));
    });

    document.getElementById('deck-seek-fwd-btn')?.addEventListener('click', () => {
      nudgePlayback(studioState.seekStepSec || 2);
    });

    document.getElementById('seek-step-select')?.addEventListener('change', (e) => {
      setStudioSeekStep(e.target.value);
    });
    document.getElementById('seek-step-up-btn')?.addEventListener('click', () => stepSeekDuration(0.5));
    document.getElementById('seek-step-down-btn')?.addEventListener('click', () => stepSeekDuration(-0.5));
    document.getElementById('scb-seek-spinner')?.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.deltaY === 0) return;
        stepSeekDuration(e.deltaY < 0 ? 0.5 : -0.5);
      },
      { passive: false },
    );

    document.getElementById('deck-auto-follow-btn')?.addEventListener('click', toggleAutoFollow);

    document.getElementById('deck-jump-active-btn')?.addEventListener('click', () => {
      jumpToActiveItem();
    });

    document.getElementById('floating-jump-active-btn')?.addEventListener('click', () => {
      jumpToActiveItem();
    });

    // User Profile Topbar Button
    document.getElementById('studio-account-btn')?.addEventListener('click', () => {
      if (studioState.authToken || studioState.user) {
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

    // Shadow Mode Sentence Interactions (Check Complete, Play/Pause, Translate, Select Text, Click Card)
    document.getElementById('subview-sentences-list')?.addEventListener('click', (e) => {
      const checkBtn = e.target.closest('[data-studio-check-subject]');
      if (checkBtn) {
        e.stopPropagation();
        toggleStudioItemCompletion(
          checkBtn.getAttribute('data-studio-check-subject'),
          Number(checkBtn.getAttribute('data-studio-check-index')),
        );
        return;
      }

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

      // Full Item Clickable: Clicking anywhere on the sentence card triggers playback
      const card = e.target.closest('.sentence-driller-card[data-sentence-index]');
      if (card) {
        const sentIdx = Number(card.dataset.sentenceIndex);
        if (Number.isFinite(sentIdx)) {
          handleSentencePlayButtonClick(sentIdx);
        }
      }
    });

    // Read Mode Paragraph Interactions (Check Complete, Click Sentence)
    document.getElementById('subview-chunks-list')?.addEventListener('click', (e) => {
      const checkBtn = e.target.closest('[data-studio-check-subject]');
      if (checkBtn) {
        e.stopPropagation();
        toggleStudioItemCompletion(
          checkBtn.getAttribute('data-studio-check-subject'),
          Number(checkBtn.getAttribute('data-studio-check-index')),
        );
        return;
      }

      const sentSpan = e.target.closest('.read-sentence[data-read-sent]');
      if (sentSpan) {
        playSentence(Number(sentSpan.dataset.readSent));
      }
    });

    // Outside click dismissal handled centrally by FlaptapWordLookup

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

    document.getElementById('dict-check-complete-btn')?.addEventListener('click', () => {
      toggleStudioItemCompletion('listen', studioState.dictationIndex);
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
      const checkBtn = e.target.closest('[data-studio-check-subject]');
      if (checkBtn) {
        e.stopPropagation();
        toggleStudioItemCompletion(
          checkBtn.getAttribute('data-studio-check-subject'),
          Number(checkBtn.getAttribute('data-studio-check-index')),
        );
        return;
      }

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
        return;
      }

      const sayBtn = e.target.closest('[data-coach-say]');
      if (sayBtn && window.FlaptapWordLookup) {
        const spoken = window.FlaptapWordLookup.speakText(sayBtn.dataset.coachSay, { rate: 0.9 });
        if (spoken) {
          sayBtn.classList.add('is-speaking');
          window.setTimeout(() => sayBtn.classList.remove('is-speaking'), 900);
        }
        return;
      }

    });

    // Select text in every Studio learning mode for a contextual lookup.
    const bindStudioSelectionLookup = (container, sentenceSelector) => {
      if (!container || !window.FlaptapWordLookup?.bindSelectionLookup) return;
      window.FlaptapWordLookup.bindSelectionLookup(container, {
        onSelect: (text, meta) => {
          const node = meta?.range?.startContainer;
          const element = node?.nodeType === 1 ? node : node?.parentElement;
          const word = element?.closest('.clickable-word');
          const sentence = element?.closest(sentenceSelector);
          const sentenceIndex =
            Number(word?.dataset.sentIndex) ||
            Number(sentence?.dataset.sentenceIndex) ||
            Number(sentence?.dataset.readSent) ||
            studioState.activeSentence?.index ||
            studioState.item?.sentences?.[0]?.index ||
            1;
          openWordLookup(text, sentenceIndex, null);
        },
      });
    };

    bindStudioSelectionLookup(
      document.getElementById('subview-sentences-list'),
      '.sentence-driller-card[data-sentence-index]',
    );
    bindStudioSelectionLookup(
      document.getElementById('subview-chunks-list'),
      '.read-sentence[data-read-sent]',
    );

    // Select any text inside Coach for an instant contextual lookup.
    const coachPanel = document.getElementById('mode-panel-coach');
    if (coachPanel && window.FlaptapWordLookup?.bindSelectionLookup) {
      window.FlaptapWordLookup.bindSelectionLookup(coachPanel, {
        onSelect: (text, meta) => {
          const node = meta?.range?.startContainer;
          const element = node?.nodeType === 1 ? node : node?.parentElement;
          const card = element?.closest('[data-coach-sentence]');
          const sentenceIndex =
            Number(card?.dataset.coachSentence) ||
            studioState.activeSentence?.index ||
            studioState.item?.sentences?.[0]?.index ||
            1;
          openWordLookup(text, sentenceIndex, null);
        },
      });
    }

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

    // Popover Mode Jump & Safe Reset listeners
    document.getElementById('sp-mode-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sp-jump-mode]');
      if (!btn) return;
      const mode = btn.getAttribute('data-sp-jump-mode');
      closeAllControlPopovers();
      if (mode) switchStudioMode(mode);
    });

    document.getElementById('sp-reset-progress-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      if (!studioState.item?.id) return;
      if (!btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.classList.add('is-armed');
        btn.textContent = studioState.uiLang === 'ar' ? 'اضغط مجدداً للتأكيد' : 'Confirm reset?';
        clearTimeout(resetConfirmArmTimer);
        resetConfirmArmTimer = setTimeout(() => {
          delete btn.dataset.armed;
          btn.classList.remove('is-armed');
          btn.textContent = studioState.uiLang === 'ar' ? 'إعادة ضبط التقدّم' : 'Reset Progress';
        }, 3000);
        return;
      }

      clearTimeout(resetConfirmArmTimer);
      delete btn.dataset.armed;
      btn.classList.remove('is-armed');
      btn.disabled = true;
      try {
        await apiFetch(`/api/history/${encodeURIComponent(studioState.item.id)}/reset-progress`, {
          method: 'POST',
          body: JSON.stringify({ clearNotes: false }),
        });
        studioState.item.completionProgress = {};
        studioState.item.isCompleted = false;
        studioState.item.completedDrills = 0;
        renderSentencesAndParagraphs();
        renderDictationCard();
        if (studioState.item.aiAnalysis) {
          renderCoachAnalysis(studioState.item.aiAnalysis);
        }
        refreshAllStudioProgressBars();
        closeAllControlPopovers();
        showToast(studioState.uiLang === 'ar' ? 'تم إعادة ضبط التقدّم' : 'Lesson progress reset.');
      } catch (err) {
        showToast(err?.message || 'Could not reset progress.');
      } finally {
        btn.disabled = false;
      }
    });

    // Export Markdown Study Sheet
    document.getElementById('download-markdown-btn')?.addEventListener('click', () => {
      if (!studioState.item) return;
      const notesVal = document.getElementById('study-notes-textarea')?.value || '';
      let md = studioState.item.noteMarkdown || `# ${studioState.item.title}\n`;
      if (notesVal && !md.includes(notesVal)) {
        md = `# ${studioState.item.title}\n\n## Personal Study Notes\n\n${notesVal}\n\n---\n\n${md}`;
      }
      const slug = (studioState.item.title || 'flaptap-lesson')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
      U.downloadBlob(md, `${slug || 'lesson'}.md`, 'text/markdown;charset=utf-8');
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
        const hasOpenCtrlPopover = SCB_POPOVER_PAIRS.some(({ popoverId }) => {
          const p = document.getElementById(popoverId);
          return p && !p.hidden;
        });
        if (hasOpenCtrlPopover) {
          closeAllControlPopovers();
          return;
        }
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

      // Do not intercept native OS / browser shortcuts with Cmd/Meta, Ctrl, or Alt
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const sentences = studioState.item.sentences || [];
      if (!sentences.length) return;

      const currIdx = studioState.activeSentence ? studioState.activeSentence.index : 0;

      if (videoZoom.scale > 1.001 && e.shiftKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          panBy(-40, 0);
          return;
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          panBy(40, 0);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          panBy(0, 40);
          return;
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          panBy(0, -40);
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleSentencePlayButtonClick(currIdx || 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currIdx < sentences.length) {
          closeWordLookupPopover();
          const nextIdx = Math.max(1, currIdx + 1);
          playSentence(nextIdx);
          studioState.userScrolledAway = false;
          scrollSentenceIntoView(nextIdx, true);
          syncFloatingJumpButton();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currIdx > 1) {
          closeWordLookupPopover();
          const prevIdx = currIdx - 1;
          playSentence(prevIdx);
          studioState.userScrolledAway = false;
          scrollSentenceIntoView(prevIdx, true);
          syncFloatingJumpButton();
        } else if (currIdx === 1 && studioState.isPlaying) {
          closeWordLookupPopover();
          playSentence(1);
          studioState.userScrolledAway = false;
          scrollSentenceIntoView(1, true);
          syncFloatingJumpButton();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey || !studioState.isPlaying) {
          if (currIdx < sentences.length) {
            closeWordLookupPopover();
            const nextIdx = Math.max(1, currIdx + 1);
            playSentence(nextIdx);
            studioState.userScrolledAway = false;
            scrollSentenceIntoView(nextIdx, true);
            syncFloatingJumpButton();
          }
        } else {
          nudgePlayback(studioState.seekStepSec || 2);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey || !studioState.isPlaying) {
          if (currIdx > 1) {
            closeWordLookupPopover();
            const prevIdx = currIdx - 1;
            playSentence(prevIdx);
            studioState.userScrolledAway = false;
            scrollSentenceIntoView(prevIdx, true);
            syncFloatingJumpButton();
          } else if (currIdx === 1 && studioState.isPlaying) {
            closeWordLookupPopover();
            playSentence(1);
            studioState.userScrolledAway = false;
            scrollSentenceIntoView(1, true);
            syncFloatingJumpButton();
          }
        } else {
          nudgePlayback(-(studioState.seekStepSec || 2));
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const curr = studioState.activeSentence?.index || 1;
        playSentence(curr, { forceMode: studioState.endAction === 'loop' ? 'loop' : 'once' });
        studioState.userScrolledAway = false;
        scrollSentenceIntoView(curr, true);
        syncFloatingJumpButton();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleSentenceLoopButtonClick(currIdx || 1);
      } else if (e.key === 't' || e.key === 'T') {
        if (studioState.mode === 'shadow' && studioState.translationLang !== 'none') {
          e.preventDefault();
          handleSentenceTranslateButtonClick(currIdx || 1);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleAutoFollow();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomByStep(0.25, true);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomByStep(-0.25, true);
      } else if (e.key === '0') {
        if (videoZoom.scale > 1.001) {
          e.preventDefault();
          resetZoom(true);
        }
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        focusMouth(true);
      } else if (e.key === '[') {
        e.preventDefault();
        stepSpeed(-0.05);
        showToast(`${t('playbackSpeedLabel')}: ${studioState.speed.toFixed(2)}x`);
      } else if (e.key === ']') {
        e.preventDefault();
        stepSpeed(0.05);
        showToast(`${t('playbackSpeedLabel')}: ${studioState.speed.toFixed(2)}x`);
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
    setStudioLayout('theater');
    setStudioSpeed(studioState.speed);
    setStudioSeekStep(studioState.seekStepSec);
    syncFlowButtonDom();
    syncAutoFollowButtonDom();
    bindEvents();
    loadStudioSession();
  });
})();
