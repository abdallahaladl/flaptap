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
  const REPLAY_START_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><polyline points="3 3 3 8 8 8"></polyline><polygon points="10.2 8.8 15.8 12 10.2 15.2 10.2 8.8" fill="currentColor" stroke="none"></polygon></svg>';
  const LOOP_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 2 21 6 17 10"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 22 3 18 7 14"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>';
  const TRANSLATE_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"></path><path d="m4 14 6-6 2-3"></path><path d="M2 5h12"></path><path d="M7 2h1"></path><path d="m22 22-5-10-5 10"></path><path d="M14 18h6"></path></svg>';
  const SPEAKER_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
  const MUTE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
  const SPINNER_ICON_SVG =
    '<svg class="trans-spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
  const CHECK_ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const ITEM_CHECK_ICON_SVG =
    window.FlaptapCheck?.ICON_SVG ||
    '<svg class="ft-check-svg chk-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path class="ft-check-tick chk-tick" d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35" pathLength="1" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  const I18N = {
    en: {
      preparingLesson: 'Preparing Studio',
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
      flowShadow: 'Shadow Pause',
      flowWord: 'Word Loop',
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
      keyPlay: 'Play / Pause',
      keyReplay: 'Replay from start',
      keySeek: 'Seek ±2s',
      keyPrevNext: 'Prev / Next line',
      keyLoop: 'Toggle loop',
      keyFlowCycle: 'Cycle flow mode',
      keyMute: 'Mute / Unmute',
      keySpeedStep: 'Speed ±0.05x',
      keyQuickSpeed: 'Quick 0.75x / 0.5x / 1x',
      keySpeedReset: 'Reset speed 1.00x',
      keyRecordVoice: 'Record / Stop voice',
      keyReplayVoice: 'Play your voice',
      keyABCompare: 'A/B Compare',
      keyCheckDone: 'Mark line done',
      keyCheckNext: 'Done & next line',
      keyTrans: 'Translate line',
      keyTransToggleAll: 'Show / hide all trans.',
      keyFollow: 'Auto-Follow',
      keyJumpActive: 'Jump to active line',
      keyMouth: 'Mouth / Face focus',
      keyZoom: 'Zoom in / out / reset',
      keyPan: 'Pan when zoomed',
      keyModes: 'Switch modes',
      keyLayoutPicker: 'Layout picker / cycle',
      keyDictReplay: 'Dictation replay',
      keyHelpEsc: 'Shortcuts / Close',
      shortcutsAnyLayout: 'Any layout',
      shortcutsCatPlayback: 'Playback & Sentences',
      shortcutsCatSpeedVoice: 'Speed & Shadowing',
      shortcutsCatStudy: 'Study & Translation',
      shortcutsCatVideoModes: 'Video & Modes',
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
      toolsTitle: 'Transcript Tools',
      wordClickLabel: 'Word click',
      wordClickDefine: 'Define',
      wordClickWord: 'Play word',
      wordClickFromHere: 'Play from here',
      copyViewBtn: 'Copy transcript',
      speakerRenameBtn: 'Rename speaker',
      legendLabel: 'Legend',
      highlightOnTitle: 'Live word highlight is ON (click to turn off)',
      highlightOffTitle: 'Live word highlight is OFF (click to turn on)',
      highlightOnToast: 'Live word highlight on',
      highlightOffToast: 'Live word highlight off',
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
      replayStartBtn: 'Play from start',
      jumpPlayTitle: 'Play or pause sentence',
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
      errLiveFetchDisabledHeadline: 'Live transcript fetching is paused',
      errLiveFetchDisabledDetail: 'Live fetching is disabled by guard policy. Open a cached lesson or import a transcript instead.',
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
      pacingShort: 'Short',
      pacingNormal: 'Normal',
      pacingSwitched: 'Switched line length',
      pacingSwitchFailed: 'Could not switch sentence length.',
      clearLessonCachesBtn: 'Clear Caches',
      deleteLessonBtn: 'Delete Lesson',
    },
    ar: {
      preparingLesson: 'تجهيز الاستوديو',
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
      keyPlay: 'تشغيل / إيقاف',
      keyReplay: 'إعادة الجملة من البداية',
      keySeek: 'تقديم / تأخير ٢ث',
      keyPrevNext: 'الجملة السابقة / التالية',
      keyLoop: 'تفعيل / إيقاف التكرار',
      keyFlowCycle: 'تبديل وضع التدفق',
      keyMute: 'كتم / تشغيل الصوت',
      keySpeedStep: 'السرعة ±0.05x',
      keyQuickSpeed: 'سرعة سريعة 0.75 / 0.5 / 1x',
      keySpeedReset: 'إعادة السرعة 1.00x',
      keyRecordVoice: 'تسجيل / إيقاف صوتك',
      keyReplayVoice: 'تشغيل تسجيلك',
      keyABCompare: 'مقارنة A/B',
      keyCheckDone: 'تحديد الجملة كمكتملة',
      keyCheckNext: 'إكمال والانتقال للتالية',
      keyTrans: 'ترجمة الجملة',
      keyTransToggleAll: 'إظهار / إخفاء كل الترجمات',
      keyFollow: 'المتابعة التلقائية',
      keyJumpActive: 'الانتقال للجملة النشطة',
      keyMouth: 'تركيز الفم / الوجه',
      keyZoom: 'تكبير / تصغير / إعادة',
      keyPan: 'تحريك الفيديو المكبّر',
      keyModes: 'تبديل الأوضاع',
      keyLayoutPicker: 'اختيار / تبديل التخطيط',
      keyDictReplay: 'إعادة الجملة بالإملاء',
      keyHelpEsc: 'الاختصارات / إغلاق',
      shortcutsAnyLayout: 'أي لغة لوحة مفاتيح',
      shortcutsCatPlayback: 'التشغيل والجمل',
      shortcutsCatSpeedVoice: 'السرعة والترديد',
      shortcutsCatStudy: 'الدراسة والترجمة',
      shortcutsCatVideoModes: 'الفيديو والأوضاع',
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
      toolsTitle: 'أدوات النص',
      wordClickLabel: 'النقر على الكلمة',
      wordClickDefine: 'تعريف',
      wordClickWord: 'تشغيل الكلمة',
      wordClickFromHere: 'من هنا',
      copyViewBtn: 'نسخ النص',
      speakerRenameBtn: 'إعادة تسمية المتحدث',
      legendLabel: 'المفتاح',
      highlightOnTitle: 'التظليل الحي للكلمات مفعّل (اضغط لإيقافه)',
      highlightOffTitle: 'التظليل الحي للكلمات متوقف (اضغط لتفعيله)',
      highlightOnToast: 'التظليل الحي مفعّل',
      highlightOffToast: 'التظليل الحي متوقف',
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
      replayStartBtn: 'التشغيل من البداية',
      jumpPlayTitle: 'تشغيل أو إيقاف الجملة',
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
      errLiveFetchDisabledHeadline: 'تم إيقاف جلب النصوص المباشر مؤقتًا',
      errLiveFetchDisabledDetail: 'تم تعطيل الجلب المباشر بسياسة الحماية. افتح درسًا محفوظًا أو استورد النص يدويًا.',
      errTimeoutHeadline: 'انتهت مهلة الاتصال',
      errTimeoutDetail: 'استغرق يوتيوب وقتاً طويلاً للاستجابة. يرجى المحاولة مرة أخرى.',
      markComplete: 'تم',
      completedLabel: 'مكتمل',
      pacingShort: 'قصيرة',
      pacingNormal: 'عادية',
      pacingSwitched: 'تم تبديل طول السطور',
      pacingSwitchFailed: 'تعذر تغيير طول السطور.',
      clearLessonCachesBtn: 'مسح الكاش',
      deleteLessonBtn: 'حذف الدرس',
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
      pacingShort: 'Cortas',
      pacingNormal: 'Normal',
      pacingSwitched: 'Longitud de líneas actualizada',
      pacingSwitchFailed: 'No se pudo cambiar la longitud.',
      toolsTitle: 'Herramientas de transcripción',
      wordClickLabel: 'Clic en palabra',
      wordClickDefine: 'Definir',
      wordClickWord: 'Reproducir palabra',
      wordClickFromHere: 'Desde aquí',
      copyViewBtn: 'Copiar transcripción',
      speakerRenameBtn: 'Renombrar hablante',
      legendLabel: 'Leyenda',
      highlightOnTitle: 'El resaltado en vivo está activado (clic para desactivar)',
      highlightOffTitle: 'El resaltado en vivo está desactivado (clic para activar)',
      highlightOnToast: 'Resaltado en vivo activado',
      highlightOffToast: 'Resaltado en vivo desactivado',
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
      pacingShort: 'Courtes',
      pacingNormal: 'Normal',
      pacingSwitched: 'Longueur des lignes mise à jour',
      pacingSwitchFailed: 'Impossible de changer la longueur.',
      toolsTitle: 'Outils de transcription',
      wordClickLabel: 'Clic sur un mot',
      wordClickDefine: 'Définir',
      wordClickWord: 'Lire le mot',
      wordClickFromHere: "Lire à partir d'ici",
      copyViewBtn: 'Copier la transcription',
      speakerRenameBtn: "Renommer l’intervenant",
      legendLabel: 'Légende',
      highlightOnTitle: 'Surbrillance en direct activée (cliquer pour désactiver)',
      highlightOffTitle: 'Surbrillance en direct désactivée (cliquer pour activer)',
      highlightOnToast: 'Surbrillance en direct activée',
      highlightOffToast: 'Surbrillance en direct désactivée',
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
      pacingShort: 'Kurz',
      pacingNormal: 'Normal',
      pacingSwitched: 'Zeilenlänge gewechselt',
      pacingSwitchFailed: 'Zeilenlänge konnte nicht geändert werden.',
      toolsTitle: 'Transkript-Werkzeuge',
      wordClickLabel: 'Wortklick',
      wordClickDefine: 'Definieren',
      wordClickWord: 'Wort abspielen',
      wordClickFromHere: 'Ab hier abspielen',
      copyViewBtn: 'Transkript kopieren',
      speakerRenameBtn: 'Sprecher umbenennen',
      legendLabel: 'Legende',
      highlightOnTitle: 'Live-Worthervorhebung ist AN (zum Ausschalten klicken)',
      highlightOffTitle: 'Live-Worthervorhebung ist AUS (zum Einschalten klicken)',
      highlightOnToast: 'Live-Hervorhebung an',
      highlightOffToast: 'Live-Hervorhebung aus',
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
      pacingShort: 'Kısa',
      pacingNormal: 'Normal',
      pacingSwitched: 'Satır uzunluğu değiştirildi',
      pacingSwitchFailed: 'Satır uzunluğu değiştirilemedi.',
      toolsTitle: 'Transkript Araçları',
      wordClickLabel: 'Kelime tıklaması',
      wordClickDefine: 'Tanımla',
      wordClickWord: 'Kelimeyi oynat',
      wordClickFromHere: 'Buradan oynat',
      copyViewBtn: 'Transkripti kopyala',
      speakerRenameBtn: 'Konuşmacıyı yeniden adlandır',
      legendLabel: 'Gösterge',
      highlightOnTitle: 'Canlı kelime vurgusu AÇIK (kapatmak için tıkla)',
      highlightOffTitle: 'Canlı kelime vurgusu KAPALI (açmak için tıkla)',
      highlightOnToast: 'Canlı vurgu açık',
      highlightOffToast: 'Canlı vurgu kapalı',
    },
  };

  const VALID_PACING_MODES = ['short', 'normal'];
  const PACING_STORAGE_KEY = 'flaptap_shadowing_pacing';

  function normalizePacingMode(raw) {
    const val = String(raw || '').trim().toLowerCase();
    if (val === 'balanced' || val === 'full') return 'normal'; // Legacy labels
    return VALID_PACING_MODES.includes(val) ? val : 'short';
  }

  function getSavedPacingMode() {
    try {
      return normalizePacingMode(localStorage.getItem(PACING_STORAGE_KEY));
    } catch {
      return 'short';
    }
  }

  const initialTranslationLang = localStorage.getItem('flaptap_trans_lang') || 'ar';

  const studioState = {
    uiLang: localStorage.getItem('flaptap_ui_lang') || 'en',
    theme: localStorage.getItem('flaptap_theme') || 'light',
    guestToken: localStorage.getItem('flaptap_guest_token') || '',
    authToken: localStorage.getItem('flaptap_auth_token') || '',
    user: null,
    item: null,
    mode: 'shadow',
    readView: 'paragraphs', // 'paragraphs' | 'ideas' | 'speakers' | 'raw'
    layout: 'theater',
    ytPlayer: null,
    ytReady: false,
    pendingPlaySentenceIndex: null,
    activeSentence: null,
    isPlaying: false,
    loopSentenceIndex: null,
    endAction: 'loop', // 'loop' | 'pause' | 'shadow' | 'word' | 'continue'
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
    userMuted: false,
    lastSeekTime: 0,
    pendingSeek: null,
    playbackTicker: null,
    wordClickMode: localStorage.getItem('flaptap_word_click_mode') || 'define', // 'define' | 'word' | 'from-here'
    wordCushion: localStorage.getItem('flaptap_word_cushion') || 'natural', // 'natural' | 'exact'
    showRepairs: true,
    karaokeEnabled: localStorage.getItem('flaptap_karaoke') !== 'off',
    speakerFilter: 'all',
    speakerEditorOpen: false,
    searchQuery: '',
    searchMatches: [],
    searchMatchIdx: 0,
    videoHidden: false,
    selectedTimedWord: null,
    activeRange: null, // { startSec, endSec, label, mode: 'word' | 'range' | 'continuous', wordObj? }
    shadowPauseTimer: null,
    shadowPauseRaf: null,
    shadowPauseResumeFn: null,
    karaokeRaf: null,
    activeWordEl: null,
    activeWordIndex: -1,
    reviewing: false,
    reviewAbort: null,
    reviewAiSelector: null,
    enhancementsInFlight: false,
    transcriptActionInFlight: false,
    retryCountdownTimer: null,
    autoCloudTranscribing: false,
    autoCloudAttemptedIds: new Set(),
    shadowingConfig: {
      aiConfigured: true,
      cloudStt: { available: false, provider: null, model: '' },
    },
    isSwitchingPacing: false,
    infoPopoverPinned: false,
    infoPopoverCloseTimer: null,
    scrubbing: false,
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

  const MC = window.FlaptapStudioModeController;
  const modeState = MC ? MC.createModeState() : null;

  function hasLessonVideo(item = studioState.item) {
    if (!item) return false;
    const media = item.media || null;
    const vidId = String(media?.youtubeId || item.videoId || item.video_id || '').trim();
    const isYtId = /^[a-zA-Z0-9_-]{11}$/.test(vidId);
    if ((media?.mediaKind === 'youtube' || (!media?.mediaKind && isYtId)) && isYtId) return true;
    const streamUrl =
      media?.streamUrl || (media?.mediaId ? `/api/sources/media/${encodeURIComponent(media.mediaId)}` : '');
    return Boolean(media?.mediaKind === 'video' && streamUrl && media?.hasVideo !== false);
  }

  function hasTimedMedia(item = studioState.item) {
    if (!item) return false;
    const media = item.media || null;
    const vidId = String(media?.youtubeId || item.videoId || item.video_id || '').trim();
    const isYtId = /^[a-zA-Z0-9_-]{11}$/.test(vidId);
    if (isYtId) return true;
    const streamUrl =
      media?.streamUrl || (media?.mediaId ? `/api/sources/media/${encodeURIComponent(media.mediaId)}` : '');
    return Boolean(streamUrl);
  }

  function getCanonicalReadParagraphs(item = studioState.item, speakerFilter = 'all') {
    if (!item) return [];
    const flowParas = window.FlaptapStudioReaderFlow?.getParagraphs?.(item, {
      source: 'reviewed',
      speakerFilter,
    });
    if (Array.isArray(flowParas) && flowParas.length > 0) return flowParas;
    return Array.isArray(item.chunks) ? item.chunks : [];
  }

  function getActiveCompletionFilter() {
    if (MC && modeState) {
      return MC.getCompletionFilter(modeState, studioState.mode);
    }
    return studioState.completionFilter || 'all';
  }

  function applyStudioModeChrome() {
    const item = studioState.item;
    const mode = studioState.mode || 'shadow';
    const readView = studioState.readView || 'paragraphs';
    const canvas = document.querySelector('.studio-canvas');
    if (canvas) {
      canvas.dataset.activeMode = mode;
      canvas.dataset.readView = mode === 'read' ? readView : '';
    }

    if (!MC) return null;
    const TT = window.FlaptapStudioTranscriptTools;
    const repairCount = Number(
      item?.repairCount ||
        item?.transcriptData?.reviewed?.quality?.repairedWords ||
        item?.transcriptData?.reviewed?.quality?.repairedSentences ||
        0,
    );
    const speakers = item && TT ? TT.getSpeakersList(item) : [];
    const bm = window.FlaptapStudioReaderFlow?.getBookmark?.() || item?.transcriptData?.readingBookmark || null;

    const caps = MC.resolveCapabilities({
      mode,
      readView,
      item,
      hasVideo: hasLessonVideo(item),
      hasTimedMedia: hasTimedMedia(item),
      repairCount,
      speakerCount: speakers.length,
      speakerEditorOpen: Boolean(studioState.speakerEditorOpen),
      hasBookmark: Boolean(bm && Number(bm.sentenceIndex) >= 1),
    });

    const searchInput = document.getElementById('studio-search-input');
    MC.applyChrome(caps, {
      toolsBar: document.getElementById('studio-transcript-tools'),
      readSubbarWrap: document.getElementById('studio-read-subbar-wrap'),
      readSubbar: document.getElementById('studio-read-subbar'),
      searchWrap: document.querySelector('.studio-search-wrap'),
      mobileSearchToggle: document.getElementById('studio-mobile-search-toggle'),
      searchInput,
      pacingGroup: document.getElementById('studio-pacing-group'),
      karaokeBtn: document.getElementById('studio-toggle-karaoke'),
      repairsBtn: document.getElementById('studio-toggle-repairs'),
      toolsMenuBtn: document.getElementById('studio-tools-menu-btn'),
      speakerBar: document.getElementById('studio-speaker-bar'),
      progressDock: document.getElementById('canvas-progress-dock'),
      compFilter: document.querySelector('.studio-comp-filter'),
      activeJumpBtn: document.getElementById('canvas-active-jump-btn'),
      transTrigger: document.getElementById('trans-trigger-btn'),
      transDeck: document.getElementById('translation-control-deck'),
      bookmarkPill: document.getElementById('reader-bookmark-pill'),
      videoToggleBtn: document.getElementById('studio-video-toggle-btn'),
    });

    if (caps.showSpeakerBar) {
      renderSpeakerBar();
    }
    syncDeckLiveSubtitle();
    return caps;
  }

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
    const karaokeLangBtn = document.getElementById('studio-toggle-karaoke');
    if (karaokeLangBtn) {
      karaokeLangBtn.title = t(studioState.karaokeEnabled ? 'highlightOnTitle' : 'highlightOffTitle');
    }

    const coachContent = document.getElementById('coach-content-box');
    if (studioState.item?.aiAnalysis && coachContent && !coachContent.hidden) {
      renderCoachAnalysis(studioState.item.aiAnalysis);
    }

    window.FlaptapStudioLayouts?.onUiLanguageChange(studioState.uiLang);
  }

  /* ========================================================================
     ATOMIC PLAYBACK & BUTTON STATE SYNCHRONIZATION
     Prevents stale `.active` / `aria-pressed` across Loop, Play, Flow & Save
     ======================================================================== */

  function syncPlaybackButtonsDom() {
    const activeIdx = studioState.activeSentence?.index ?? (studioState.item?.sentences?.[0]?.index ?? 1);
    const loopIdx = studioState.loopSentenceIndex;
    const isPlaying = Boolean(studioState.isPlaying);

    // 1. Play/Pause & Play-from-Start Buttons + Active Card Playing Class
    document.querySelectorAll('.sentence-driller-card[data-sentence-index]').forEach((card) => {
      const idx = Number(card.dataset.sentenceIndex);
      const isThisPlaying = isPlaying && activeIdx !== null && idx === activeIdx;
      card.classList.toggle('is-playing', isThisPlaying);
    });

    document.querySelectorAll('[data-replay-sent]').forEach((btn) => {
      const label = t('replayStartBtn');
      btn.title = `${label} (R)`;
      btn.setAttribute('aria-label', label);
    });

    document.querySelectorAll('[data-play-sent]').forEach((btn) => {
      const idx = Number(btn.dataset.playSent);
      const isThisActive = activeIdx !== null && idx === activeIdx;
      const isThisPlaying = isPlaying && isThisActive;
      const nextState = isThisPlaying ? 'playing' : 'idle';

      btn.classList.toggle('active', isThisPlaying);
      btn.classList.toggle('is-playing', isThisPlaying);
      btn.setAttribute('aria-pressed', isThisPlaying ? 'true' : 'false');
      btn.title = isThisPlaying ? t('pauseBtn') : t('playBtn');
      btn.setAttribute('aria-label', isThisPlaying ? t('pauseBtn') : t('playBtn'));
      if (btn.dataset.playState === nextState) return;
      btn.dataset.playState = nextState;
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

    // 5b. Range Play buttons (Paragraphs, Ideas, Speaker Turns, Raw Original)
    const activeRangeKey = isPlaying && studioState.activeRange ? studioState.activeRange.rangeKey : '';
    document.querySelectorAll('[data-play-range-start]').forEach((btn) => {
      const s = Number(btn.getAttribute('data-play-range-start'));
      const e = Number(btn.getAttribute('data-play-range-end'));
      const btnKey = btn.getAttribute('data-play-range-key') || `${s.toFixed(3)}-${e.toFixed(3)}`;
      const isThisRangePlaying = Boolean(activeRangeKey && activeRangeKey === btnKey);
      btn.classList.toggle('active', isThisRangePlaying);
      btn.classList.toggle('is-playing', isThisRangePlaying);
      btn.setAttribute('aria-pressed', isThisRangePlaying ? 'true' : 'false');
      const idleLabel = btn.getAttribute('data-idle-label') || 'Play';
      const nextLabel = isThisRangePlaying ? t('pauseBtn') : idleLabel;
      if (btn.textContent !== nextLabel) {
        btn.textContent = nextLabel;
      }
      btn.setAttribute('aria-label', nextLabel);
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
    if (mode === 'shadow') {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        circleArrows +
        '<path d="M9.5 11.5c1-1.3 2.5-1.3 3.5 0M10.5 14c.8-.8 2-.8 2.8 0" stroke-width="2"></path>' +
        '</svg>'
      );
    }
    if (mode === 'word') {
      return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        circleArrows +
        '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"></circle>' +
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
    const allowed = ['loop', 'pause', 'shadow', 'word', 'continue'];
    const mode = allowed.includes(studioState.endAction) ? studioState.endAction : 'pause';
    flowBtn.dataset.flowState = mode;
    flowBtn.dataset.endAction = mode;
    flowBtn.innerHTML = getFlowIconSvg(mode);
    const labelMap = {
      pause: `${t('playbackFlowLabel')}: ${t('flowPause')}`,
      loop: `${t('playbackFlowLabel')}: ${t('flowLoop')}`,
      shadow: `${t('playbackFlowLabel')}: ${t('flowShadow')}`,
      word: `${t('playbackFlowLabel')}: ${t('flowWord')}`,
      continue: `${t('playbackFlowLabel')}: ${t('flowContinue')}`,
    };
    const label = labelMap[mode] || t('playbackFlowLabel');
    flowBtn.setAttribute('aria-label', label);
    flowBtn.setAttribute('title', `${label} (L: Loop · Shift+L: Cycle)`);
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
     MULTI-LAYOUT ENGINE DELEGATION (Zero-Remount CSS Grid Orchestration)
     ======================================================================== */

  function setStudioLayout(nextLayout = 'theater', options = {}) {
    if (window.FlaptapStudioLayouts) {
      const meta = window.FlaptapStudioLayouts.setLayout(nextLayout, options);
      studioState.layout = meta?.id || nextLayout;
      return meta;
    }
    const workspace = document.getElementById('studio-main-content');
    if (!workspace) return null;
    studioState.layout = nextLayout || 'theater';
    workspace.setAttribute('data-layout', studioState.layout);
    return null;
  }

  window.setStudioLayout = setStudioLayout;
  window.switchStudioLayout = setStudioLayout;

  /* ========================================================================
     UNIFIED FLOATING POPOVERS FOR SINGLE-ROW CONTROL BAR & STUDIO COMPLETION
     ======================================================================== */

  const SCB_POPOVER_PAIRS = [
    { triggerId: 'studio-progress-pill', popoverId: 'studio-progress-popover' },
    { triggerId: 'studio-layout-btn', popoverId: 'studio-layout-popover' },
    { triggerId: 'studio-review-btn', popoverId: 'studio-review-popover' },
    { triggerId: 'studio-export-btn', popoverId: 'studio-export-popover' },
    { triggerId: 'scb-more-btn', popoverId: 'studio-more-popover' },
    { triggerId: 'video-zoom-level-pill', popoverId: 'video-zoom-popover' },
    { triggerId: 'speed-trigger-btn', popoverId: 'speed-popover' },
    { triggerId: 'voice-menu-btn', popoverId: 'voice-popover' },
    { triggerId: 'trans-trigger-btn', popoverId: 'translation-control-deck' },
    { triggerId: 'studio-shortcuts-btn', popoverId: 'shortcuts-popover' },
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
    if (exceptPopoverId !== 'studio-layout-popover') {
      window.FlaptapStudioLayouts?.onPopoverStateChange(false);
    }
  }

  function closeStudioToolsPopover() {
    const pop = document.getElementById('studio-tools-popover');
    const btn = document.getElementById('studio-tools-menu-btn');
    if (pop) pop.hidden = true;
    if (btn) {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleStudioToolsPopover() {
    const pop = document.getElementById('studio-tools-popover');
    const btn = document.getElementById('studio-tools-menu-btn');
    if (!pop) return;
    const willOpen = pop.hidden;
    closeAllControlPopovers();
    pop.hidden = !willOpen;
    if (btn) {
      btn.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
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
    closeStudioToolsPopover();
    closeAllControlPopovers(willOpen ? popoverId : null);
    if (willOpen) {
      if (popoverId === 'translation-control-deck' && studioState.mode !== 'shadow') return;
      if (popoverId === 'translation-control-deck') {
        loadLanguagesCatalog().then(() => {
          if (!pop.hidden) positionControlPopover(pop, trg);
        });
      }
      if (popoverId === 'studio-review-popover') {
        ensureStudioReviewAiSelector();
        void fetchShadowingConfig().then(() => syncEnhancementsPopoverUi());
        syncEnhancementsPopoverUi();
        loadLanguagesCatalog().then(() => {
          syncEnhancementsPopoverUi();
          if (!pop.hidden) positionControlPopover(pop, trg);
        });
      }
      pop.style.display = '';
      if (popoverId === 'studio-layout-popover' && (window.innerWidth || 1024) <= 640) {
        pop.style.left = '';
        pop.style.top = '';
        pop.hidden = false;
      } else {
        positionControlPopover(pop, trg);
      }
      trg.classList.add('is-open', 'is-popover-open');
      trg.setAttribute('aria-expanded', 'true');
      if (popoverId === 'studio-layout-popover') {
        window.FlaptapStudioLayouts?.onPopoverStateChange(true);
      }
      const morePop = document.getElementById('studio-more-popover');
      const moreBtn = document.getElementById('scb-more-btn');
      if (morePop && moreBtn && morePop.contains(trg)) {
        moreBtn.classList.add('is-open', 'is-popover-open');
      }
    } else {
      pop.hidden = true;
      trg.classList.remove('is-open', 'is-popover-open');
      trg.setAttribute('aria-expanded', 'false');
      if (popoverId === 'studio-layout-popover') {
        window.FlaptapStudioLayouts?.onPopoverStateChange(false);
      }
    }
  }

  function getStudioCompletedSet(subject) {
    const arr = studioState.item?.completionProgress?.[subject];
    return new Set(Array.isArray(arr) ? arr.map(Number) : []);
  }

  function renderStudioCheckBtnHtml({ checked = false, subject, index, pill = false } = {}) {
    const titleText = checked ? t('completedLabel') : t('markComplete');
    if (window.FlaptapCheck?.buttonHtml) {
      return window.FlaptapCheck.buttonHtml({
        checked,
        pill,
        text: pill ? titleText : '',
        label: titleText,
        attrs: `data-studio-check-subject="${escapeHtml(subject)}" data-studio-check-index="${Number(index)}"`,
      });
    }
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

  function renderStudioProgressBar(targetId, { total = 0, completed = 0, compact = false } = {}) {
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

    el.hidden = false;
    el.classList.toggle('is-all-done', remaining === 0 && safeTotal > 0);
    if (compact) {
      el.innerHTML = `<span class="coach-mini-prog ltr-num" aria-label="${safeCompleted} of ${safeTotal} completed"><strong data-sp-completed>${safeCompleted}</strong><span class="coach-mini-sep">/</span><span data-sp-total>${safeTotal}</span></span>`;
      return;
    }

    const isAr = studioState.uiLang === 'ar';
    const totalLabel = isAr ? 'الإجمالي' : 'Total';
    const doneLabel = isAr ? 'مكتمل' : 'Completed';
    const remLabel = isAr ? 'المتبقي' : 'Remaining';

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
    const topbar = document.querySelector('.studio-topbar');
    if (topbar) {
      const th = Math.max(0, Math.round(topbar.getBoundingClientRect().height));
      if (th > 0) {
        document.documentElement.style.setProperty('--studio-topbar-h', `${th}px`);
      }
    }
    const deck = document.querySelector('.studio-deck');
    const consoleEl = document.querySelector('.studio-media-console');
    if (consoleEl) {
      const ch = Math.max(0, Math.round(consoleEl.getBoundingClientRect().height));
      if (ch > 0) {
        document.documentElement.style.setProperty('--studio-bottom-dock-h', `${ch}px`);
      }
    }
    if (!deck) return;
    const ws = document.getElementById('studio-main-content');
    const mobileLayout = ws?.getAttribute('data-mobile-layout') || 'docked';
    const isScrollDock =
      window.innerWidth <= 768 &&
      window.innerHeight >= 551 &&
      mobileLayout === 'scroll-dock';
    if (!isScrollDock) {
      document.documentElement.style.removeProperty('--studio-deck-sticky-h');
      return;
    }
    const rect = deck.getBoundingClientRect();
    const h = Math.max(0, Math.round(rect.height));
    document.documentElement.style.setProperty('--studio-deck-sticky-h', `${h}px`);
  }

  function applyCompletionFilterDom() {
    const mode = studioState.mode || 'shadow';
    const filter = getActiveCompletionFilter();
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

    if (mode === 'shadow') {
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
      indexKaraokeWords();
      return;
    }

    if (mode === 'read') {
      const chunkList = document.getElementById('subview-chunks-list');
      const readEmpty = document.getElementById('read-filter-empty');
      const isParas = (studioState.readView || 'paragraphs') === 'paragraphs';
      if (chunkList && isParas) {
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
      } else if (readEmpty) {
        readEmpty.hidden = true;
      }
      indexKaraokeWords();
      return;
    }

    if (mode === 'coach') {
      const coachEmpty = document.getElementById('coach-filter-empty');
      let coachVisible = 0;
      let coachTotal = 0;
      Object.values(COACH_SECTIONS).forEach((section) => {
        const grid = document.getElementById(section.gridId);
        const secEl = grid?.closest('.coach-section');
        if (!grid) return;
        let secVisible = 0;
        let secTotal = 0;
        grid.querySelectorAll('.coach-item-card').forEach((card) => {
          secTotal++;
          coachTotal++;
          const show = matchVisible(card.classList.contains('is-item-completed'));
          card.hidden = !show;
          if (show) {
            secVisible++;
            coachVisible++;
          }
        });
        if (secEl) {
          secEl.hidden = secTotal > 0 && secVisible === 0 && filter !== 'all';
        }
      });
      if (coachEmpty) {
        coachEmpty.hidden = coachTotal === 0 || coachVisible > 0 || filter === 'all';
        const p = coachEmpty.querySelector('[data-filter-empty-msg]');
        if (p) p.textContent = emptyMsg;
      }
    }
  }

  function syncCompletionFilter() {
    const filter = getActiveCompletionFilter();
    studioState.completionFilter = filter;
    document.querySelectorAll('[data-studio-comp-filter]').forEach((btn) => {
      const active = btn.dataset.studioCompFilter === filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    applyCompletionFilterDom();
  }

  function setCompletionFilter(nextFilter) {
    const valid = nextFilter === 'remaining' || nextFilter === 'completed' ? nextFilter : 'all';
    if (MC && modeState) {
      MC.setCompletionFilter(modeState, studioState.mode, valid);
    }
    studioState.completionFilter = valid;
    syncCompletionFilter();
  }

  function syncDeckLiveSubtitle() {
    const box = document.getElementById('deck-live-subtitle');
    const item = studioState.item;
    const isListenMode = studioState.mode === 'listen';
    const ttsStage = document.getElementById('tts-audio-stage');
    const isTtsDeck = Boolean(ttsStage && !ttsStage.hidden);
    const active = studioState.activeSentence || item?.sentences?.[0] || null;

    if (isTtsDeck) {
      const quoteEl = document.getElementById('tts-active-quote');
      if (quoteEl) {
        if (isListenMode) {
          quoteEl.textContent = 'Listen carefully and type the missing words.';
        } else if (active?.text) {
          quoteEl.textContent = `“${active.text}”`;
        }
      }
    }

    if (!box) return;
    if (!item || !active || isTtsDeck || isListenMode) {
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

    const paragraphs = getCanonicalReadParagraphs(item);
    const paraSet = getStudioCompletedSet('paragraphs');
    const readTotal = paragraphs.length;
    const readDone = paragraphs.filter((p, idx) => paraSet.has(Number(p.index) || idx + 1)).length;

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
      popFoot.hidden = false;
    }
    if (resetBtn) {
      resetBtn.hidden = computed.doneItems <= 0;
      if (!resetBtn.dataset.armed) {
        resetBtn.textContent = studioState.uiLang === 'ar' ? 'إعادة ضبط التقدّم' : 'Reset Progress';
      }
    }
    const clearCacheBtn = document.getElementById('sp-clear-cache-btn');
    if (clearCacheBtn) {
      clearCacheBtn.textContent = t('clearLessonCachesBtn');
    }
    const deleteLessonBtn = document.getElementById('sp-delete-lesson-btn');
    if (deleteLessonBtn) {
      deleteLessonBtn.textContent = t('deleteLessonBtn');
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

    const paragraphs = getCanonicalReadParagraphs(item);
    const paraSet = getStudioCompletedSet('paragraphs');
    renderStudioProgressBar('studio-read-progress-bar', {
      total: paragraphs.length,
      completed: paragraphs.filter((p, idx) => paraSet.has(Number(p.index) || idx + 1)).length,
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
        compact: true,
      });

      const expr = analysis.expressions || [];
      const exprSet = getStudioCompletedSet('coachExpressions');
      const exprDoneCount = expr.filter((_, idx) => exprSet.has(idx)).length;
      renderStudioProgressBar('studio-coach-expressions-progress-bar', {
        total: expr.length,
        completed: exprDoneCount,
        compact: true,
      });

      const vocab = analysis.vocabulary || [];
      const vocabSet = getStudioCompletedSet('coachVocabulary');
      const vocabDoneCount = vocab.filter((_, idx) => vocabSet.has(idx)).length;
      renderStudioProgressBar('studio-coach-vocab-progress-bar', {
        total: vocab.length,
        completed: vocabDoneCount,
        compact: true,
      });

      renderStudioProgressBar('studio-coach-progress-bar', {
        total: conn.length + expr.length + vocab.length,
        completed: connDoneCount + exprDoneCount + vocabDoneCount,
      });
    } else {
      renderStudioProgressBar('studio-coach-connected-progress-bar', { total: 0, completed: 0, compact: true });
      renderStudioProgressBar('studio-coach-expressions-progress-bar', { total: 0, completed: 0, compact: true });
      renderStudioProgressBar('studio-coach-vocab-progress-bar', { total: 0, completed: 0, compact: true });
      renderStudioProgressBar('studio-coach-progress-bar', { total: 0, completed: 0 });
    }

    const canvas = document.querySelector('.studio-canvas');
    const mode = studioState.mode || 'shadow';
    if (canvas) canvas.dataset.activeMode = mode;
    applyStudioModeChrome();
    syncCompletionFilter();
    syncStudioTopProgressDom();
  }

  function syncDictationCompletionButtonDom(animate = false) {
    const btn = document.getElementById('dict-check-complete-btn');
    const lbl = document.getElementById('dict-complete-label');
    const card = document.querySelector('#mode-panel-listen .dictation-card');
    if (!btn) return;
    const isDone = getStudioCompletedSet('listen').has(Number(studioState.dictationIndex));
    const doneLabel = isDone ? t('completedLabel') : t('markComplete');
    if (window.FlaptapCheck?.setState) {
      window.FlaptapCheck.setState(btn, isDone, { label: doneLabel, animate });
    } else {
      btn.classList.toggle('is-checked', isDone);
      btn.setAttribute('aria-pressed', isDone ? 'true' : 'false');
      btn.setAttribute('aria-label', doneLabel);
      btn.title = doneLabel;
    }
    if (lbl) lbl.textContent = doneLabel;
    if (card) card.classList.toggle('is-item-completed', isDone);
  }

  function updateStudioItemCompletionDom(subject, index, checked) {
    if (subject === 'listen') {
      syncDictationCompletionButtonDom(true);
    } else {
      const selector = `[data-studio-check-subject="${subject}"][data-studio-check-index="${index}"]`;
      const label = checked ? t('completedLabel') : t('markComplete');
      document.querySelectorAll(selector).forEach((btn) => {
        if (window.FlaptapCheck?.setState) {
          window.FlaptapCheck.setState(btn, checked, { label, animate: true });
        } else {
          btn.classList.toggle('is-checked', checked);
          btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
          btn.setAttribute('aria-label', label);
          btn.setAttribute('title', label);
          const pillLabel = btn.querySelector('span');
          if (pillLabel) pillLabel.textContent = label;
        }
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
        const isAr = studioState.uiLang === 'ar';
        const originBtn =
          subject === 'listen'
            ? document.getElementById('dictation-complete-btn')
            : document.querySelector(
                `[data-studio-check-subject="${CSS.escape(String(subject))}"][data-studio-check-index="${CSS.escape(String(numIdx))}"]`,
              );
        if (window.FlaptapCelebrate?.trigger) {
          window.FlaptapCelebrate.trigger({
            title: isAr ? 'تم إكمال الدرس!' : 'Lesson Completed!',
            subtitle: isAr ? 'تم إكمال جميع عناصر الدرس بنجاح' : 'All items in this lesson are checked off',
            originEl: originBtn,
          });
        } else {
          showToast(isAr ? 'تم إكمال جميع عناصر الدرس!' : 'All items checked — Lesson completed!');
        }
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

  function switchReadView(viewName, opts = {}) {
    const valid = ['paragraphs', 'ideas', 'speakers', 'raw'];
    const target = valid.includes(viewName) ? viewName : 'paragraphs';
    studioState.readView = target;

    document.querySelectorAll('[data-read-view]').forEach((btn) => {
      const act = btn.getAttribute('data-read-view') === target;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-selected', act ? 'true' : 'false');
    });

    document.querySelectorAll('[data-read-panel]').forEach((panel) => {
      const match = panel.getAttribute('data-read-panel') === target;
      panel.hidden = !match;
      if (panel.id === 'subview-chunks-list') {
        panel.style.display = studioState.mode === 'read' && match ? '' : 'none';
      }
    });

    ensureActiveViewRendered();
    applyStudioModeChrome();
    refreshAllStudioProgressBars();

    const readEmpty = document.getElementById('read-filter-empty');
    if (readEmpty && target !== 'paragraphs') readEmpty.hidden = true;

    window.FlaptapStudioReaderFlow?.syncReaderToolbar(studioState.item);
    syncSearchMatchesDom();
    indexKaraokeWords();
    requestAnimationFrame(syncStudioDeckStickyHeightVar);

    if (!opts.skipUrlSync) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', studioState.mode);
        if (studioState.mode === 'read') {
          url.searchParams.set('view', target);
        } else {
          url.searchParams.delete('view');
        }
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }

  function switchStudioMode(modeName, opts = {}) {
    let target = modeName;
    let forcedReadView = opts.readView || null;
    if (target === 'sentences' || target === 'transcript') target = 'shadow';
    if (target === 'chunks' || target === 'paragraphs') {
      target = 'read';
      forcedReadView = forcedReadView || 'paragraphs';
    }
    if (target === 'ideas' || target === 'speakers' || target === 'raw') {
      forcedReadView = target;
      target = 'read';
    }
    if (!STUDIO_MODES.includes(target)) target = 'shadow';

    const prevMode = studioState.mode || 'shadow';
    const plan = MC
      ? MC.computeTransitionPlan(prevMode, target, {
          activeSentence: studioState.activeSentence,
          dictationIndex: studioState.dictationIndex,
          isPlaying: studioState.isPlaying,
          activeRange: studioState.activeRange,
        })
      : {
          cancelShadowPause: prevMode === 'shadow' && target !== 'shadow',
          syncDictationToActive: target === 'listen',
          pauseIfPlayingMismatch: false,
          resetUserScrolledAway: target === 'shadow' && prevMode !== 'shadow',
          scrollActiveIfAutoFollow: prevMode !== target && (target === 'shadow' || target === 'read'),
        };

    if (plan.cancelShadowPause) {
      cancelShadowPause();
    }
    if (plan.syncDictationToActive && studioState.activeSentence?.index) {
      studioState.dictationIndex = Number(studioState.activeSentence.index) || 1;
    }
    if (plan.pauseIfPlayingMismatch && studioState.isPlaying) {
      pauseCurrentPlayback();
    }

    studioState.mode = target;
    closeWordLookupPopover();
    closeAllControlPopovers();
    closeStudioToolsPopover();

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
    if (sentList) sentList.style.display = target === 'shadow' ? '' : 'none';

    if (target === 'read') {
      switchReadView(forcedReadView || studioState.readView || 'paragraphs', { skipUrlSync: true });
    } else {
      const chunkList = document.getElementById('subview-chunks-list');
      if (chunkList) chunkList.style.display = 'none';
      ensureActiveViewRendered();
    }

    const searchInput = document.getElementById('studio-search-input');
    if (searchInput && MC && modeState) {
      const restoredQuery = MC.getSearchQuery(modeState, target);
      if (searchInput.value !== restoredQuery) {
        searchInput.value = restoredQuery;
      }
      studioState.searchQuery = restoredQuery;
    }

    if (target === 'listen') {
      renderDictationCard();
    } else if (target === 'coach' && studioState.item) {
      if ((studioState.item.sentences || []).length === 0) {
        const loadingBox = document.getElementById('coach-loading-box');
        const errorBox = document.getElementById('coach-error-box');
        const contentBox = document.getElementById('coach-content-box');
        if (loadingBox) loadingBox.hidden = true;
        if (contentBox) contentBox.hidden = true;
        if (errorBox) {
          errorBox.hidden = false;
          const title = document.getElementById('coach-error-title');
          const msg = document.getElementById('coach-error-msg');
          if (title) title.textContent = 'Waiting for Transcript';
          if (msg) msg.textContent = 'Fetch captions or paste a transcript in Shadow mode first to unlock AI Prosody Coach.';
        }
      } else {
        const coachContent = document.getElementById('coach-content-box');
        if (!coachContent || coachContent.hidden) {
          triggerDynamicCoachAnalysis(false);
        }
      }
    }

    applyStudioModeChrome();
    syncPlaybackButtonsDom();
    refreshAllStudioProgressBars();
    syncSearchMatchesDom();
    indexKaraokeWords();

    if (plan.resetUserScrolledAway) {
      studioState.userScrolledAway = false;
    }
    if (plan.scrollActiveIfAutoFollow && studioState.autoFollow && studioState.activeSentence?.index) {
      const targetIdx = studioState.activeSentence.index;
      requestAnimationFrame(() => {
        scrollSentenceIntoView(targetIdx, false);
        syncFloatingJumpButton();
      });
    } else {
      syncFloatingJumpButton();
    }

    requestAnimationFrame(syncStudioDeckStickyHeightVar);

    if (!opts.skipUrlSync) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', target);
        if (target === 'read') {
          url.searchParams.set('view', studioState.readView || 'paragraphs');
        } else {
          url.searchParams.delete('view');
        }
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }

  window.switchStudioMode = switchStudioMode;
  window.switchReadView = switchReadView;
  window.switchTranscriptMode = function (legacy) {
    switchStudioMode(legacy === 'chunks' ? 'read' : 'shadow');
  };

  /* ========================================================================
   VERBATIM WORD TOKENIZER FOR TEXT-SELECTION CONTEXTUAL AI LOOKUP
     Preserves `<mark class="hl-...">` AND exact `textContent === sentence.text`
     ======================================================================== */

  function decorateClickableWords(verbatimHtml, sentenceIndex, sentenceObj) {
    if (sentenceObj && window.FlaptapStudioTranscriptTools?.decorateTimedWordsHtml) {
      return window.FlaptapStudioTranscriptTools.decorateTimedWordsHtml(verbatimHtml, sentenceObj, {
        showRepairs: studioState.showRepairs,
        searchQuery: studioState.searchQuery,
      });
    }
    if (window.FlaptapWordLookup) {
      return window.FlaptapWordLookup.tokenizeClickableWords(verbatimHtml, {
        sentIndex: sentenceIndex,
      });
    }
    return verbatimHtml || '';
  }

  /* ========================================================================
     RENDER SENTENCES (SHADOW MODE) & ALL READ VIEWS (PARAGRAPHS/IDEAS/SPEAKERS/RAW)
     ======================================================================== */

  function renderSpeakerBar() {
    const bar = document.getElementById('studio-speaker-bar');
    const singleBtn = document.getElementById('studio-single-spk-btn');
    const TT = window.FlaptapStudioTranscriptTools;
    if (!bar || !TT || !studioState.item) return;

    const speakers = TT.getSpeakersList(studioState.item);
    if (singleBtn) {
      singleBtn.hidden = speakers.length !== 1;
      if (speakers.length === 1) {
        singleBtn.title = `${t('speakerRenameBtn')}: ${speakers[0].name}`;
      }
    }

    const html = TT.renderSpeakerBarHtml(studioState.item, studioState);
    if (!html) {
      bar.hidden = true;
      bar.innerHTML = '';
    } else {
      bar.hidden = false;
      bar.innerHTML = html;
    }
  }

  function syncReviewStatusChrome() {
    const item = studioState.item;
    if (!item) return;
    const TT = window.FlaptapStudioTranscriptTools;

    const platEl = document.getElementById('studio-platform-badge');
    const platLabel = TT?.formatPlatformLabel?.(item.platform || (item.videoId ? 'youtube' : '')) || '';
    if (platEl) {
      platEl.textContent = platLabel;
      platEl.hidden = !platLabel;
    }

    const hasSentences = Array.isArray(item.sentences) && item.sentences.length > 0;
    const revStatus = item.reviewStatus || (item.transcriptData?.reviewed ? 'ready' : 'pending');
    const isReviewed = revStatus === 'ready';
    const revPill = document.getElementById('studio-review-status-pill');
    if (revPill) {
      revPill.hidden = !item.transcriptData && hasSentences;
      const pillText = !hasSentences ? 'Video Ready' : isReviewed ? 'AI Reviewed' : 'Raw Ready';
      const textSpan = revPill.querySelector('.studio-review-pill-text');
      if (textSpan) textSpan.textContent = pillText;
      else revPill.textContent = pillText;
      revPill.classList.toggle('is-reviewed', isReviewed && hasSentences);
    }

    const revDot = document.getElementById('studio-review-dot');
    if (revDot) {
      revDot.hidden = !isReviewed && hasSentences;
    }

    const repairCount = Number(
      item.repairCount ||
        item.transcriptData?.reviewed?.quality?.repairedWords ||
        item.transcriptData?.reviewed?.quality?.repairedSentences ||
        0,
    );
    const repToggle = document.getElementById('studio-toggle-repairs');
    const repCnt = document.getElementById('studio-repairs-count');
    if (repCnt) repCnt.textContent = String(repairCount);
    if (repToggle) {
      repToggle.hidden = repairCount <= 0;
      repToggle.classList.toggle('active', studioState.showRepairs);
      repToggle.setAttribute('aria-pressed', studioState.showRepairs ? 'true' : 'false');
    }

    syncEnhancementsPopoverUi();
  }

  async function fetchShadowingConfig() {
    try {
      const cfg = await apiFetch('/api/tracks/shadowing/config', { method: 'GET' });
      if (cfg && typeof cfg === 'object') {
        studioState.shadowingConfig = {
          aiConfigured: cfg.aiConfigured !== false,
          cloudStt: cfg.cloudStt || { available: false, provider: null, model: '' },
        };
      }
    } catch {}
    return studioState.shadowingConfig;
  }

  function syncEnhancementsPopoverUi() {
    const item = studioState.item;
    if (!item) return;

    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const hasSentences = sentences.length > 0;
    const isReviewed =
      (item.reviewStatus || (item.transcriptData?.reviewed ? 'ready' : 'pending')) === 'ready';
    const hasCoach = Boolean(item.aiAnalysis);
    const isYoutube =
      (item.platform || '').toLowerCase() === 'youtube' ||
      (Boolean(item.videoId) && !item.media?.streamUrl);
    const platformLabel =
      window.FlaptapStudioTranscriptTools?.formatPlatformLabel?.(item.platform || '') || '';

    const sourceBadge = document.getElementById('studio-enhance-source-badge');
    if (sourceBadge) {
      const engine = item.transcriptData?.providerEngine || '';
      let label = hasSentences ? 'Transcript Ready' : 'Captions Pending';
      if (hasSentences) {
        if (engine.startsWith('cloud_whisper')) label = 'Cloud Whisper';
        else if (engine.startsWith('manual_')) label = 'Imported';
        else if (engine === 'faster_whisper') label = 'Speech-to-Text';
        else if (isYoutube) label = 'YouTube Captions';
        else if (platformLabel) label = `${platformLabel} Captions`;
      }
      sourceBadge.textContent = label;
      sourceBadge.classList.toggle('is-reviewed', hasSentences);
    }

    const retryRow = document.getElementById('enhance-row-retry-captions');
    const retryCheck = document.getElementById('enhance-check-retry-captions');
    const retryTitle = document.getElementById('enhance-retry-title');
    if (retryRow) retryRow.hidden = !isYoutube && !item.sourceUrl;
    if (retryTitle) {
      retryTitle.textContent = hasSentences ? 'Re-fetch Source Captions' : 'Retry YouTube Captions';
    }
    if (retryCheck) retryCheck.disabled = Boolean(studioState.enhancementsInFlight);

    const cloudStt = studioState.shadowingConfig?.cloudStt;
    const providerLabel =
      cloudStt?.provider === 'groq'
        ? 'Groq'
        : cloudStt?.provider === 'openai'
          ? 'OpenAI'
          : cloudStt?.provider || '';
    const trBadge = document.getElementById('enhance-transcribe-badge');
    const trSub = document.getElementById('enhance-transcribe-sub');
    const trCheck = document.getElementById('enhance-check-transcribe');
    if (trBadge) {
      if (cloudStt?.available) {
        trBadge.textContent = `${providerLabel} Cloud · 0% CPU`;
        trBadge.className = 'studio-enhance-badge is-cloud';
      } else {
        trBadge.textContent = 'Uses Device CPU';
        trBadge.className = 'studio-enhance-badge is-cpu';
      }
    }
    if (trSub) {
      trSub.textContent = cloudStt?.available
        ? `Fast speech-to-text via ${providerLabel} cloud API (zero laptop fan spin).`
        : 'Runs local Whisper on this device only when you check this option.';
    }
    if (trCheck) trCheck.disabled = Boolean(studioState.enhancementsInFlight);

    const willHaveTranscript =
      hasSentences || Boolean(retryCheck?.checked);

    const popStatus = document.getElementById('studio-review-popover-status');
    const revCheck = document.getElementById('enhance-check-review');
    const revRow = document.getElementById('enhance-row-review');
    if (popStatus) {
      popStatus.textContent = isReviewed ? 'Done' : 'Pending';
      popStatus.classList.toggle('is-reviewed', isReviewed);
    }
    if (revCheck) revCheck.disabled = Boolean(studioState.enhancementsInFlight) || !willHaveTranscript;
    revRow?.classList.toggle('is-disabled', !willHaveTranscript);

    const coachStatus = document.getElementById('studio-enhance-coach-status');
    const coachCheck = document.getElementById('enhance-check-coach');
    const coachRow = document.getElementById('enhance-row-coach');
    if (coachStatus) {
      coachStatus.textContent = hasCoach ? 'Ready' : 'Pending';
      coachStatus.className = `studio-enhance-badge${hasCoach ? ' is-ready' : ''}`;
    }
    if (coachCheck) coachCheck.disabled = Boolean(studioState.enhancementsInFlight) || !willHaveTranscript;
    coachRow?.classList.toggle('is-disabled', !willHaveTranscript);

    const langCode = studioState.translationLang || 'ar';
    const langObj = (studioState.languages || []).find((l) => l.code === langCode);
    const langLabel = langObj ? langObj.name : langCode.toUpperCase();
    const langMap = getLangTranslationMap(langCode);
    const transDoneCount = sentences.filter((s) => Boolean(langMap[Number(s.index)])).length;
    const transTitle = document.getElementById('studio-enhance-trans-title');
    const transStatus = document.getElementById('studio-enhance-trans-status');
    const transSub = document.getElementById('enhance-enhance-trans-sub') || document.getElementById('studio-enhance-trans-sub');
    const transCheck = document.getElementById('enhance-check-translate');
    const transRow = document.getElementById('enhance-row-translate');
    const canTrans = willHaveTranscript && langCode !== 'none';
    if (transTitle) transTitle.textContent = `Translate All (${langLabel})`;
    if (transStatus) {
      transStatus.textContent = hasSentences ? `${transDoneCount}/${sentences.length}` : 'Pending';
      transStatus.className = `studio-enhance-badge ltr-num${hasSentences && transDoneCount >= sentences.length ? ' is-ready' : ''}`;
    }
    if (transSub) {
      transSub.textContent = langCode === 'none'
        ? 'Select a target language in the Translation menu first.'
        : `Translate missing lines to ${langLabel}.`;
    }
    if (transCheck) transCheck.disabled = Boolean(studioState.enhancementsInFlight) || !canTrans;
    transRow?.classList.toggle('is-disabled', !canTrans);

    syncEnhancementsRunButton();
  }

  function syncEnhancementsRunButton() {
    const btn = document.getElementById('studio-run-enhancements-btn');
    const cancelBtn = document.getElementById('studio-cancel-enhancements-btn');
    const checks = Array.from(document.querySelectorAll('#studio-enhance-list .studio-enhance-check'));
    const selectedCount = checks.filter((c) => !c.disabled && c.checked).length;

    if (cancelBtn) {
      cancelBtn.hidden = !studioState.enhancementsInFlight;
    }
    if (btn) {
      btn.disabled = Boolean(studioState.enhancementsInFlight) || selectedCount === 0;
      btn.textContent = studioState.enhancementsInFlight
        ? 'Running...'
        : selectedCount > 0
          ? `Run Selected (${selectedCount})`
          : 'Run Selected';
    }
  }

  function renderShadowView() {
    const item = studioState.item;
    const sentContainer = document.getElementById('subview-sentences-list');
    if (!item || !sentContainer) return;
    const TT = window.FlaptapStudioTranscriptTools;
    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const spkFilter = studioState.speakerFilter || 'all';
    const speakers = TT ? TT.getSpeakersList(item) : [];
    const showSpkChipOnLines = speakers.length > 1;
    const activeIdx = studioState.activeSentence?.index || null;

    if (sentences.length === 0) {
      const pendingStatus = item.transcriptStatus || item.transcriptData?.transcriptStatus || 'pending';
      const pendingTitle =
        pendingStatus === 'no_captions'
          ? 'No Captions on Source Video'
          : pendingStatus === 'rate_limited'
            ? 'Provider Captions Rate-Limited'
            : 'Original Provider Transcript Required';
      const pendingReason =
        item.transcriptError ||
        item.transcriptData?.transcriptError ||
        'Shadowing only uses original transcripts directly from the source provider. Retry fetching source captions or paste the original transcript.';

      sentContainer.innerHTML = `
        <div class="studio-pending-transcript-card" id="studio-pending-transcript-card">
          <div class="studio-pending-head">
            <div class="studio-pending-icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div>
              <h2 class="studio-pending-title">${escapeHtml(pendingTitle)}</h2>
              <p class="studio-pending-desc">${escapeHtml(pendingReason)}</p>
            </div>
          </div>
          <div class="studio-pending-actions">
            <button type="button" class="btn-vox btn-sm" data-pending-action="retry-captions">Retry Source Captions</button>
            <button type="button" class="btn-secondary btn-sm" data-pending-action="toggle-paste">Paste Transcript / SRT</button>
          </div>
          <div class="studio-pending-paste-wrap" id="studio-pending-paste-wrap" hidden>
            <textarea id="studio-pending-paste-input" class="studio-enhance-paste-input" rows="5" placeholder="Paste SRT, WebVTT, [00:12] lines, or plain transcript text..."></textarea>
            <div class="studio-enhance-paste-actions">
              <button type="button" class="btn-vox btn-xs" data-pending-action="apply-paste">Apply Transcript</button>
              <button type="button" class="btn-secondary btn-xs" data-pending-action="toggle-paste">Cancel</button>
            </div>
          </div>
        </div>
      `;
    } else {
      const sentDoneSet = getStudioCompletedSet('sentences');
      const visibleSentences =
        spkFilter === 'all' ? sentences : sentences.filter((s) => s.speakerId === spkFilter);

      sentContainer.innerHTML = visibleSentences
        .map((s) => {
          const isActive = activeIdx === s.index;
          const isThisPlaying = Boolean(studioState.isPlaying && isActive);
          const isDone = sentDoneSet.has(Number(s.index));

          const baseHtml = s.highlightedHtml || escapeHtml(s.text);
          const interactiveHtml = decorateClickableWords(baseHtml, s.index, s);

          const langCode = studioState.translationLang || 'ar';
          const langMap = getLangTranslationMap(langCode);
          const hasTrans = Boolean(langMap[s.index] && String(langMap[s.index]).trim());
          const inFlightSet = studioState.translatingSentencesByLang[langCode] || new Set();
          const isTranslatingAll = Boolean(studioState.translatingAllByLang[langCode]);
          const isSentLoading = !hasTrans && (isTranslatingAll || inFlightSet.has(s.index));
          const isBoxVisible = hasTrans && Boolean(studioState.showTranslations);

          const spkHtml =
            showSpkChipOnLines && s.speakerId && TT
              ? `<span class="studio-spk-chip is-mini" style="--spk-color:${TT.speakerColor(item, s.speakerId)}">${escapeHtml(TT.speakerName(item, s.speakerId, s.speaker || s.speakerName))}</span>`
              : '';
          const repairedWordsCount = Array.isArray(s.words)
            ? s.words.filter((w) => w.repaired || w.rawWord).length
            : 0;
          const repairCount = repairedWordsCount || (s.repaired ? 1 : 0);
          const repairBadgeHtml =
            studioState.showRepairs && repairCount > 0
              ? `<button type="button" class="studio-info-badge is-repair" data-info-kind="repairs" data-sent-idx="${s.index}" title="${repairCount} ASR repair(s) — click for diff">✦ ${repairCount}</button>`
              : '';
          const overlapBadgeHtml = s.isOverlap || s.overlapGroupId
            ? `<button type="button" class="studio-info-badge is-overlap" data-info-kind="overlap" data-sent-idx="${s.index}" title="Overlapping speakers separated">Overlap</button>`
            : '';

          return `
            <article
              id="sent-card-${s.index}"
              class="sentence-driller-card ${isActive ? 'active-drilling' : ''}${isThisPlaying ? ' is-playing' : ''}${isDone ? ' is-item-completed' : ''}"
              data-sentence-index="${s.index}"
            >
              <div class="sent-card-top">
                <div class="sent-meta-left" title="${escapeHtml(t('jumpPlayTitle'))}">
                  <span class="sent-index-num">#${String(s.index).padStart(2, '0')}</span>
                  ${spkHtml}
                  <span class="sent-time-badge">${escapeHtml(s.timeRange || '')}</span>
                  ${repairBadgeHtml}
                  ${overlapBadgeHtml}
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
                    class="sent-action-btn sent-icon-btn sent-replay-btn"
                    data-replay-sent="${s.index}"
                    title="${escapeHtml(t('replayStartBtn'))}"
                    aria-label="${escapeHtml(t('replayStartBtn'))}"
                  >
                    ${REPLAY_START_ICON_SVG}
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
  }

  function renderReadParagraphsView() {
    const item = studioState.item;
    const chunkContainer = document.getElementById('subview-chunks-list');
    if (!item || !chunkContainer) return;
    const TT = window.FlaptapStudioTranscriptTools;
    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const chunks = Array.isArray(item.chunks) ? item.chunks : [];
    const spkFilter = studioState.speakerFilter || 'all';
    const speakers = TT ? TT.getSpeakersList(item) : [];
    const showSpkChipOnLines = speakers.length > 1;
    const activeIdx = studioState.activeSentence?.index || null;
    const paraDoneSet = getStudioCompletedSet('paragraphs');

    if (window.FlaptapStudioReaderFlow) {
      chunkContainer.innerHTML = window.FlaptapStudioReaderFlow.renderContinuousParagraphsView(
        item,
        {
          speakerFilter: spkFilter,
          showRepairs: studioState.showRepairs,
          searchQuery: studioState.searchQuery,
          activeSentenceIndex: activeIdx,
          paraDoneSet,
          renderCopyBtnHtml: renderStudioCopyBtnHtml,
          renderCheckBtnHtml: renderStudioCheckBtnHtml,
        },
      );
      window.FlaptapStudioReaderFlow.syncReaderToolbar(item);
      return;
    }

    const sentenceMap = new Map(sentences.map((s) => [s.index, s]));
    chunkContainer.innerHTML = chunks
      .map((chunk, idx) => {
        const paraNum = idx + 1;
        const isDone = paraDoneSet.has(paraNum);
        let proseHtml = '';
        let matchedSents = [];
        if (Array.isArray(chunk.sentenceIndices) && chunk.sentenceIndices.length > 0) {
          matchedSents = chunk.sentenceIndices
            .map((sIdx) => sentenceMap.get(sIdx))
            .filter(Boolean)
            .filter((s) => spkFilter === 'all' || s.speakerId === spkFilter);
          if (spkFilter !== 'all' && matchedSents.length === 0) return '';
          proseHtml = matchedSents
            .map((s) => {
              const sHtml = decorateClickableWords(s.highlightedHtml || escapeHtml(s.text), s.index, s);
              const readingCls = activeIdx === s.index ? 'active-reading' : '';
              return `<span class="read-sentence ${readingCls}" data-read-sent="${s.index}">${sHtml}</span>`;
            })
            .filter(Boolean)
            .join(' ');
        } else {
          proseHtml = chunk.highlightedHtml || escapeHtml(chunk.text);
        }

        const pStart = Number(chunk.startSec ?? matchedSents[0]?.startSec ?? 0);
        const pEnd = Number(chunk.endSec ?? matchedSents[matchedSents.length - 1]?.endSec ?? pStart + 2);
        const spkChipHtml =
          showSpkChipOnLines && chunk.speakerId && TT
            ? `<span class="studio-spk-chip is-mini" style="--spk-color:${TT.speakerColor(item, chunk.speakerId)}">${escapeHtml(TT.speakerName(item, chunk.speakerId, chunk.speaker || chunk.speakerName))}</span>`
            : '';

        return `
          <section class="editorial-paragraph-block${isDone ? ' is-item-completed' : ''}" data-paragraph-index="${paraNum}">
            <div class="editorial-paragraph-head">
              <div class="paragraph-head-left">
                ${spkChipHtml}
                <span class="paragraph-time-margin">${escapeHtml(chunk.timeRange || '')}</span>
              </div>
              <div class="paragraph-head-actions">
                <button type="button" class="btn-secondary btn-xs paragraph-play-btn" data-play-range-start="${pStart.toFixed(3)}" data-play-range-end="${pEnd.toFixed(3)}" data-idle-label="Play" data-play-range-label="Paragraph ${paraNum}">Play</button>
                ${renderStudioCopyBtnHtml(chunk.text, 'paragraph-copy-btn')}
                ${renderStudioCheckBtnHtml({ checked: isDone, subject: 'paragraphs', index: paraNum })}
              </div>
            </div>
            <p class="paragraph-prose">${proseHtml}</p>
          </section>
        `;
      })
      .filter(Boolean)
      .join('');
  }

  function renderReadIdeasView() {
    const item = studioState.item;
    const TT = window.FlaptapStudioTranscriptTools;
    const ideasEl = document.getElementById('subview-ideas-list');
    if (!item || !TT || !ideasEl) return;
    ideasEl.innerHTML = TT.renderIdeasView(item, {
      speakerFilter: studioState.speakerFilter || 'all',
      showRepairs: studioState.showRepairs,
      searchQuery: studioState.searchQuery,
    });
  }

  function renderReadSpeakersView() {
    const item = studioState.item;
    const TT = window.FlaptapStudioTranscriptTools;
    const speakersEl = document.getElementById('subview-speakers-list');
    if (!item || !TT || !speakersEl) return;
    speakersEl.innerHTML = TT.renderSpeakersView(item, {
      speakerFilter: studioState.speakerFilter || 'all',
      showRepairs: studioState.showRepairs,
      searchQuery: studioState.searchQuery,
    });
  }

  function renderReadRawView() {
    const item = studioState.item;
    const TT = window.FlaptapStudioTranscriptTools;
    const rawEl = document.getElementById('subview-raw-list');
    if (!item || !rawEl) return;
    const activeIdx = studioState.activeSentence?.index || null;
    const renderOpts = {
      speakerFilter: studioState.speakerFilter || 'all',
      showRepairs: false,
      searchQuery: studioState.searchQuery,
      activeSentenceIndex: activeIdx,
    };
    rawEl.innerHTML = window.FlaptapStudioReaderFlow
      ? window.FlaptapStudioReaderFlow.renderContinuousRawView(item, renderOpts)
      : TT?.renderRawView(item, renderOpts) || '';
  }

  function invalidateTranscriptViews() {
    const item = studioState.item;
    if (!item) return;
    if (MC && modeState) MC.markAllViewsDirty(modeState);
    const sentences = Array.isArray(item.sentences) ? item.sentences : [];
    const paragraphs = getCanonicalReadParagraphs(item);
    const sentBadge = document.getElementById('badge-sentences-count');
    const paraBadge = document.getElementById('badge-paragraphs-count');
    if (sentBadge) sentBadge.textContent = String(sentences.length);
    if (paraBadge) paraBadge.textContent = String(paragraphs.length);
    window.FlaptapStudioReaderFlow?.syncReaderToolbar(item);
    renderSpeakerBar();
    syncReviewStatusChrome();
  }

  function ensureActiveViewRendered() {
    const item = studioState.item;
    if (!item) return;
    const mode = studioState.mode || 'shadow';
    const readView = studioState.readView || 'paragraphs';
    const key = MC ? MC.getViewKey(mode, readView) : mode === 'read' ? `read:${readView}` : mode;

    if (!MC || !modeState || MC.isViewDirty(modeState, key)) {
      if (key === 'shadow') {
        renderShadowView();
      } else if (key === 'read:paragraphs') {
        renderReadParagraphsView();
      } else if (key === 'read:ideas') {
        renderReadIdeasView();
      } else if (key === 'read:speakers') {
        renderReadSpeakersView();
      } else if (key === 'read:raw') {
        renderReadRawView();
      }
      if (MC && modeState) MC.markViewClean(modeState, key);
    }

    applyStudioModeChrome();
    refreshAllStudioProgressBars();
    syncSearchMatchesDom();
    syncPlaybackButtonsDom();
    indexKaraokeWords();
  }

  function renderSentencesAndParagraphs() {
    if (!studioState.item) return;
    invalidateTranscriptViews();
    ensureActiveViewRendered();
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

    if (videoZoom.scale >= 1.75 && videoZoom.scale <= 1.85) {
      resetZoom(animate);
      return;
    }

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

  function showActionFlash(kind) {
    const flash = document.getElementById('video-action-flash');
    if (!flash) return;
    let iconHtml = PLAY_ICON_SVG;
    if (kind === 'replay') {
      iconHtml = REPLAY_START_ICON_SVG;
    } else if (kind === 'mute') {
      iconHtml = MUTE_ICON_SVG;
    } else if (kind === 'unmute') {
      iconHtml = SPEAKER_ICON_SVG;
    } else if (kind === 'pause' || kind === false) {
      iconHtml = PAUSE_ICON_SVG;
    } else {
      iconHtml = PLAY_ICON_SVG;
    }
    flash.innerHTML = iconHtml;
    flash.hidden = false;
    flash.classList.remove('animate');
    void flash.offsetWidth;
    flash.classList.add('animate');
    window.clearTimeout(flash.__flashTimer);
    flash.__flashTimer = window.setTimeout(() => {
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
    const audioStage = document.getElementById('studio-audio-stage');
    const zoomViewport = document.getElementById('video-zoom-viewport');
    const zoomHud = document.getElementById('video-zoom-hud');
    const videoToggleBtn = document.getElementById('studio-video-toggle-btn');
    const timelineBar = document.getElementById('studio-timeline-bar');

    const playerCard = document.querySelector('.player-frame-card');

    const media = item.media || null;
    const vidId = String(media?.youtubeId || item.videoId || item.video_id || '').trim();
    const isYtId = /^[a-zA-Z0-9_-]{11}$/.test(vidId);
    const streamUrl = media?.streamUrl || (media?.mediaId ? `/api/sources/media/${encodeURIComponent(media.mediaId)}` : '');
    const mediaKind = media?.mediaKind || (vidId && isYtId ? 'youtube' : streamUrl ? 'audio' : 'none');

    const clockTotal = document.getElementById('studio-clock-total');
    if (clockTotal && window.FlaptapStudioTranscriptTools) {
      const durSec = Number(item.durationSeconds || 0);
      clockTotal.textContent = window.FlaptapStudioTranscriptTools.formatClockMs(durSec * 1000);
    }

    if (mediaKind === 'youtube' && vidId) {
      playerCard?.classList.remove('is-audio-only-media');
      if (ttsStage) ttsStage.hidden = true;
      if (audioStage) audioStage.hidden = true;
      if (zoomViewport) zoomViewport.hidden = false;
      if (zoomHud) zoomHud.hidden = false;
      if (ytDiv) ytDiv.hidden = false;
      if (videoToggleBtn) videoToggleBtn.hidden = false;
      if (timelineBar) timelineBar.hidden = false;
      const aTitle = document.getElementById('studio-audio-stage-title');
      if (aTitle) aTitle.textContent = item.title || 'Audio Focus Mode';
      loadYouTubeIframeApi(vidId);
      if (localStorage.getItem('flaptap_studio_video_hidden') === '1') {
        toggleVideoVisibility(true, { persist: false });
      }
    } else if ((mediaKind === 'video' || mediaKind === 'audio') && streamUrl) {
      const isVideo = mediaKind === 'video' && media?.hasVideo !== false;
      playerCard?.classList.toggle('is-audio-only-media', !isVideo);
      if (ttsStage) ttsStage.hidden = true;
      if (ytDiv) ytDiv.hidden = true;
      if (zoomViewport) zoomViewport.hidden = !isVideo;
      if (zoomHud) zoomHud.hidden = !isVideo;
      if (audioStage) {
        audioStage.hidden = isVideo;
        const badgeEl = document.getElementById('studio-audio-stage-badge');
        const titleEl = document.getElementById('studio-audio-stage-title');
        if (badgeEl) {
          badgeEl.textContent =
            window.FlaptapStudioTranscriptTools?.formatPlatformLabel?.(item.platform) || 'Audio Track';
        }
        if (titleEl) titleEl.textContent = item.title || 'Audio Lesson';
      }
      if (videoToggleBtn) videoToggleBtn.hidden = !isVideo;
      if (timelineBar) timelineBar.hidden = false;
      createHtml5Player(streamUrl, isVideo);
      if (isVideo && localStorage.getItem('flaptap_studio_video_hidden') === '1') {
        toggleVideoVisibility(true, { persist: false });
      }
    } else {
      playerCard?.classList.remove('is-audio-only-media');
      if (zoomViewport) zoomViewport.hidden = true;
      if (zoomHud) zoomHud.hidden = true;
      if (ytDiv) ytDiv.hidden = true;
      if (audioStage) audioStage.hidden = true;
      if (videoToggleBtn) videoToggleBtn.hidden = true;
      if (timelineBar) timelineBar.hidden = true;
      if (ttsStage) {
        ttsStage.hidden = false;
        document.getElementById('tts-stage-tag').textContent = item.trackTitle || 'Spoken Audio Deck';
        if (item.sentences?.[0]) {
          document.getElementById('tts-active-quote').textContent =
            studioState.mode === 'listen'
              ? 'Listen carefully and type the missing words.'
              : `“${item.sentences[0].text}”`;
        }
      }
    }
  }

  function createHtml5Player(streamUrl, isVideo = true) {
    if (studioState.ytPlayer) return; // Never remount!
    const container = document.getElementById('video-stage-container');
    if (!container) return;

    let mediaEl = document.getElementById('studio-html5-player');
    if (!mediaEl) {
      const ytDiv = document.getElementById('studio-youtube-player');
      if (ytDiv) ytDiv.style.display = 'none';

      mediaEl = document.createElement(isVideo ? 'video' : 'audio');
      mediaEl.id = 'studio-html5-player';
      mediaEl.className = isVideo ? 'studio-html5-video' : 'studio-html5-audio';
      if (isVideo) {
        mediaEl.setAttribute('playsinline', '');
        mediaEl.setAttribute('controls', '');
      }
      mediaEl.setAttribute('preload', 'auto');
      mediaEl.src = streamUrl;
      const mountParent = isVideo
        ? document.getElementById('video-zoom-stage') || container
        : document.getElementById('studio-audio-stage') || container;
      mountParent.appendChild(mediaEl);

      mediaEl.addEventListener('loadedmetadata', () => {
        const dur = Number(mediaEl.duration || 0);
        if (dur > 0 && window.FlaptapStudioTranscriptTools) {
          const clockTotal = document.getElementById('studio-clock-total');
          if (clockTotal) clockTotal.textContent = window.FlaptapStudioTranscriptTools.formatClockMs(dur * 1000);
        }
        if (!studioState.hasStartedPlaybackOnce && studioState.activeSentence?.startSec > 0) {
          try {
            mediaEl.currentTime = studioState.activeSentence.startSec;
          } catch {}
        }
      });

      mediaEl.addEventListener('seeking', () => {
        resetPlaybackClockAnchor(mediaEl.currentTime);
        clearActiveKaraokeWord();
      });

      mediaEl.addEventListener('seeked', () => {
        resetPlaybackClockAnchor(mediaEl.currentTime);
        clearActiveKaraokeWord();
      });

      mediaEl.addEventListener('play', () => {
        if (handleInitialNativePlayStart(studioState.ytPlayer)) return;
        studioState.isPlaying = true;
        syncPlaybackButtonsDom();
        startPlaybackTicker();
        startKaraokeRaf();
      });

      mediaEl.addEventListener('pause', () => {
        if (
          studioState.pendingSeek &&
          Date.now() - studioState.pendingSeek.issuedAt < 2500
        ) {
          return;
        }
        if (studioState.playbackTicker) {
          clearInterval(studioState.playbackTicker);
          studioState.playbackTicker = null;
        }
        stopKaraokeRaf();
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      });

      mediaEl.addEventListener('ended', () => {
        studioState.pendingSeek = null;
        studioState.awaitingOnsetUnmute = false;
        if (studioState.playbackTicker) {
          clearInterval(studioState.playbackTicker);
          studioState.playbackTicker = null;
        }
        stopKaraokeRaf();
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      });

      mediaEl.addEventListener('timeupdate', () => {
        if (!studioState.isPlaying) {
          checkSentenceDrillProgress();
        }
      });
    }

    studioState.ytPlayer = {
      isHtml5: true,
      seekTo(seconds) {
        if (mediaEl) mediaEl.currentTime = Number(seconds) || 0;
      },
      playVideo() {
        if (mediaEl) {
          const p = mediaEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      },
      pauseVideo() {
        if (mediaEl) mediaEl.pause();
      },
      mute() {
        if (mediaEl) mediaEl.muted = true;
      },
      unMute() {
        if (mediaEl) mediaEl.muted = false;
      },
      getCurrentTime() {
        return mediaEl ? mediaEl.currentTime : 0;
      },
      getDuration() {
        return mediaEl ? mediaEl.duration : 0;
      },
      setPlaybackRate(rate) {
        if (mediaEl) mediaEl.playbackRate = Number(rate) || 1.0;
      },
      getPlayerState() {
        if (!mediaEl) return 2;
        return mediaEl.paused ? 2 : 1;
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
      disablekb: 1,
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
          if (player) delete player.__flaptapAwaitingReady;
          if (studioState.ytPlayer) delete studioState.ytPlayer.__flaptapAwaitingReady;
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
          if (ev?.data === 1 || ev?.data === 2 || ev?.data === 3) {
            reclaimFocusFromPlayerIframe();
          }
          if (ev?.data === 1) {
            if (handleInitialNativePlayStart(player)) return;
            studioState.isPlaying = true;
            syncPlaybackButtonsDom();
            startPlaybackTicker();
            startKaraokeRaf();
          } else if (ev?.data === 2 || ev?.data === 0) {
            // Ignore transient PAUSED (2) emitted by YouTube while an async seekTo()+playVideo() is settling.
            if (
              ev?.data === 2 &&
              studioState.pendingSeek &&
              Date.now() - studioState.pendingSeek.issuedAt < 2500
            ) {
              return;
            }
            if (ev?.data === 0) {
              studioState.pendingSeek = null;
              studioState.awaitingOnsetUnmute = false;
            }
            if (studioState.playbackTicker) {
              clearInterval(studioState.playbackTicker);
              studioState.playbackTicker = null;
            }
            studioState.isPlaying = false;
            syncPlaybackButtonsDom();
          }
        },
      },
    });
    if (studioState.ytPlayer && !studioState.ytReady) {
      studioState.ytPlayer.__flaptapAwaitingReady = true;
    }
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

  function cancelShadowPause() {
    if (studioState.shadowPauseTimer) {
      clearTimeout(studioState.shadowPauseTimer);
      studioState.shadowPauseTimer = null;
    }
    if (studioState.shadowPauseRaf) {
      cancelAnimationFrame(studioState.shadowPauseRaf);
      studioState.shadowPauseRaf = null;
    }
    studioState.shadowPauseResumeFn = null;
    const bar = document.getElementById('studio-shadow-pause-bar');
    if (bar) bar.hidden = true;
  }

  function startShadowPause(durationSec, onDone) {
    cancelShadowPause();
    const pauseMs = Math.max(1100, Math.min(4800, Math.round((durationSec / Math.max(0.5, studioState.speed)) * 900)));
    const bar = document.getElementById('studio-shadow-pause-bar');
    const countdown = document.getElementById('studio-shadow-countdown');
    const fill = document.getElementById('studio-shadow-fill');
    const startedAt = performance.now();
    const endAt = startedAt + pauseMs;
    studioState.shadowPauseResumeFn = onDone;

    if (bar) bar.hidden = false;
    const tick = () => {
      const now = performance.now();
      const remMs = Math.max(0, endAt - now);
      const pct = Math.min(100, ((now - startedAt) / pauseMs) * 100);
      if (countdown) countdown.textContent = `Speak now… ${(remMs / 1000).toFixed(1)}s`;
      if (fill) fill.style.width = `${pct.toFixed(1)}%`;
      if (remMs > 0 && studioState.shadowPauseResumeFn) {
        studioState.shadowPauseRaf = requestAnimationFrame(tick);
      }
    };
    studioState.shadowPauseRaf = requestAnimationFrame(tick);
    studioState.shadowPauseTimer = setTimeout(() => {
      const fn = studioState.shadowPauseResumeFn;
      cancelShadowPause();
      if (typeof fn === 'function') fn();
    }, pauseMs);
  }

  function stopKaraokeRaf() {
    if (studioState.karaokeRaf) {
      cancelAnimationFrame(studioState.karaokeRaf);
      studioState.karaokeRaf = null;
    }
  }

  /**
   * Live word-highlight index for the currently visible transcript view.
   *
   * The transcript provider already ships native millisecond word timings
   * (YouTube JSON3 `tOffsetMs`, Whisper word offsets for uploaded media), and
   * they are persisted on every sentence as `words[i].startMs/endMs`. We index
   * the rendered word spans once per render and then only run a binary search
   * against that index while the media clock advances — no per-frame DOM
   * queries and no re-tokenizing.
   */
  const karaokeIndex = {
    root: null,
    spans: [], // Sorted { key, startMs, endMs } for O(log n) lookup
    byKey: new Map(), // key -> word span element
  };

  function getKaraokeScopeSelector() {
    if (studioState.mode === 'shadow') return '#subview-sentences-list';
    if (studioState.mode !== 'read') return null;
    if (studioState.readView === 'ideas') return '#subview-ideas-list';
    if (studioState.readView === 'speakers') return '#subview-speakers-list';
    if (studioState.readView === 'raw') return '#subview-raw-list';
    return '#subview-chunks-list';
  }

  function indexKaraokeWords() {
    const selector = getKaraokeScopeSelector();
    const root = selector ? document.querySelector(selector) : null;
    const spans = [];
    const byKey = new Map();

    if (root) {
      root.querySelectorAll('.studio-word[data-word-i]').forEach((el) => {
        const startMs = Number(el.dataset.startMs);
        const endMs = Number(el.dataset.endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
        if (el.closest('[hidden]')) return;
        const key = `${el.dataset.sentIndex || 0}:${el.dataset.wordI}`;
        if (byKey.has(key)) return;
        byKey.set(key, el);
        spans.push({ key, startMs, endMs });
      });
    }

    spans.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    karaokeIndex.root = root;
    karaokeIndex.spans = spans;
    karaokeIndex.byKey = byKey;

    if (studioState.activeWordEl) {
      studioState.activeWordEl.classList.remove('is-speaking');
      studioState.activeWordEl = null;
    }
    studioState.activeWordIndex = -1;
  }

  function clearActiveKaraokeWord() {
    if (studioState.activeWordEl) {
      studioState.activeWordEl.classList.remove('is-speaking');
      studioState.activeWordEl = null;
    }
    studioState.activeWordIndex = -1;
  }

  /**
   * Media clock: native HTML5 media reports an exact `currentTime` every frame.
   * The YouTube IFrame bridge reports the same media clock, sometimes quantized.
   * We only bridge a stale/quantized reading forward (never backward, never more
   * than 220ms ahead of the provider's own time), so the word highlight follows
   * the real speech clock instead of an independent dead-reckoning timer.
   */
  const playbackClock = {
    estimateSec: 0,
    lastRawSec: -1,
    lastChangePerf: 0,
    lastTickPerf: 0,
    speed: 1,
    active: false,
  };

  function resetPlaybackClockAnchor(sec = 0) {
    const cleanSec = Math.max(0, Number(sec) || 0);
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    playbackClock.estimateSec = cleanSec;
    playbackClock.lastRawSec = cleanSec;
    playbackClock.lastChangePerf = nowPerf;
    playbackClock.lastTickPerf = nowPerf;
    playbackClock.speed = Math.max(0.25, Number(studioState.speed) || 1);
    playbackClock.active = false;
  }

  function getSmoothedPlaybackTimeSec(rawSec) {
    const raw = Math.max(0, Number(rawSec) || 0);
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const speed = Math.max(0.25, Number(studioState.speed) || 1);
    let playing = Boolean(studioState.isPlaying) && !studioState.pendingSeek;
    if (playing && typeof studioState.ytPlayer?.getPlayerState === 'function') {
      try {
        playing = studioState.ytPlayer.getPlayerState() === 1;
      } catch {}
    }

    if (!playing) {
      resetPlaybackClockAnchor(raw);
      return raw;
    }

    // A real seek (backwards jump) or a rate change invalidates the bridge.
    if (!playbackClock.active || raw < playbackClock.lastRawSec - 0.25 || speed !== playbackClock.speed) {
      resetPlaybackClockAnchor(raw);
      playbackClock.active = true;
      return raw;
    }

    if (raw > playbackClock.lastRawSec + 0.0005) {
      playbackClock.lastRawSec = raw;
      playbackClock.lastChangePerf = nowPerf;
      playbackClock.estimateSec = Math.max(playbackClock.estimateSec, raw);
    } else if (nowPerf - playbackClock.lastChangePerf > 60) {
      const dtSec = Math.min(0.06, Math.max(0, (nowPerf - playbackClock.lastTickPerf) / 1000));
      playbackClock.estimateSec = Math.min(raw + 0.22, playbackClock.estimateSec + dtSec * speed);
    }
    playbackClock.lastTickPerf = nowPerf;
    return Math.max(raw, playbackClock.estimateSec);
  }

  function readPlaybackTimeSec() {
    try {
      return Number(studioState.ytPlayer?.getCurrentTime?.() || 0);
    } catch {
      return 0;
    }
  }

  function updateTimelineAndKaraoke(currentSec) {
    const TT = window.FlaptapStudioTranscriptTools;
    if (!TT) return;
    const nowMs = Math.max(0, currentSec * 1000);
    const playerDur =
      studioState.ytPlayer && typeof studioState.ytPlayer.getDuration === 'function'
        ? Number(studioState.ytPlayer.getDuration() || 0)
        : 0;
    const totalSec = playerDur > 0 ? playerDur : Number(studioState.item?.durationSeconds || 0);

    const clockNow = document.getElementById('studio-clock-now');
    if (clockNow) clockNow.textContent = TT.formatClockMs(nowMs);
    if (totalSec > 0 && !studioState.scrubbing) {
      const pct = Math.max(0, Math.min(100, (currentSec / totalSec) * 100));
      const fill = document.getElementById('studio-scrub-fill');
      const thumb = document.getElementById('studio-scrub-thumb');
      const track = document.getElementById('studio-scrub-track');
      if (fill) fill.style.width = `${pct.toFixed(2)}%`;
      if (thumb) thumb.style.left = `${pct.toFixed(2)}%`;
      if (track) track.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    // User preference: word-by-word live highlight can be switched off (timeline/clock still update)
    if (!studioState.karaokeEnabled) {
      clearActiveKaraokeWord();
      return;
    }

    // Never highlight a stale or previous sentence's word while a seek/loop restart is settling
    if (studioState.pendingSeek) {
      resetPlaybackClockAnchor(currentSec);
      clearActiveKaraokeWord();
      return;
    }

    if (!karaokeIndex.spans.length) {
      clearActiveKaraokeWord();
      return;
    }

    const hitIdx = TT.findWordAtTimeMs(karaokeIndex.spans, nowMs);
    if (hitIdx < 0) {
      clearActiveKaraokeWord();
      return;
    }

    const hit = karaokeIndex.spans[hitIdx];
    if (hit.key === studioState.activeWordIndex) return;

    const el = karaokeIndex.byKey.get(hit.key);
    if (!el) {
      clearActiveKaraokeWord();
      return;
    }

    if (studioState.activeWordEl && studioState.activeWordEl !== el) {
      studioState.activeWordEl.classList.remove('is-speaking');
    }
    el.classList.add('is-speaking');
    studioState.activeWordEl = el;
    studioState.activeWordIndex = hit.key;
  }

  function startKaraokeRaf() {
    stopKaraokeRaf();
    const step = () => {
      if (!studioState.isPlaying || !studioState.ytPlayer) {
        studioState.karaokeRaf = null;
        return;
      }
      try {
        const rawCur = readPlaybackTimeSec();
        updateTimelineAndKaraoke(getSmoothedPlaybackTimeSec(rawCur));
      } catch {}
      studioState.karaokeRaf = requestAnimationFrame(step);
    };
    studioState.karaokeRaf = requestAnimationFrame(step);
  }

  function pauseCurrentPlayback() {
    cancelShadowPause();
    stopKaraokeRaf();
    if (studioState.playbackTicker) {
      clearInterval(studioState.playbackTicker);
      studioState.playbackTicker = null;
    }
    const wasAwaitingUnmute = Boolean(studioState.awaitingOnsetUnmute);
    studioState.pendingSeek = null;
    studioState.awaitingOnsetUnmute = false;
    studioState.activeRange = null;
    if (studioState.ytPlayer) {
      if (wasAwaitingUnmute && !studioState.userMuted && typeof studioState.ytPlayer.unMute === 'function') {
        try {
          studioState.ytPlayer.unMute();
        } catch {}
      }
      if (typeof studioState.ytPlayer.pauseVideo === 'function') {
        try {
          studioState.ytPlayer.pauseVideo();
        } catch {}
      }
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

  function playRange(startSec, endSec, opts = {}) {
    const player = studioState.ytPlayer;
    if (!player || player.__flaptapAwaitingReady || typeof player.seekTo !== 'function') return;
    cancelShadowPause();
    const s = Math.max(0, Number(startSec) || 0);
    const e = Math.max(s + 0.08, Number(endSec) || s + 0.4);
    const rangeKey = opts.rangeKey || `${s.toFixed(3)}-${e.toFixed(3)}`;
    studioState.activeRange = {
      startSec: s,
      endSec: e,
      rangeKey,
      label: opts.label || 'Clip',
      mode: opts.mode || 'range',
      wordObj: opts.wordObj || null,
    };
    const sentences = studioState.item?.sentences || [];
    const matchedSent = opts.sentIndex
      ? sentences.find((x) => Number(x.index) === Number(opts.sentIndex))
      : sentences.find((x) => s >= Number(x.startSec) - 0.15 && s <= Number(x.endSec) + 0.15);
    if (matchedSent) {
      studioState.activeSentence = matchedSent;
      updateActiveSentenceDom(matchedSent.index);
    }
    studioState.hasStartedPlaybackOnce = true;
    studioState.endedNaturally = false;
    studioState.isPlaying = true;
    const preSeekTime = Number(player.getCurrentTime?.() || 0);
    studioState.pendingSeek = {
      targetSec: s,
      sentenceIndex: matchedSent?.index || opts.sentIndex || studioState.activeSentence?.index || 1,
      issuedAt: Date.now(),
      preSeekTime,
    };
    studioState.awaitingOnsetUnmute = true;
    studioState.lastSeekTime = Date.now();
    const clipLabel = document.getElementById('studio-active-clip-label');
    if (clipLabel) {
      clipLabel.textContent = opts.label || '';
      clipLabel.hidden = !opts.label;
    }
    try {
      if (typeof player.mute === 'function') player.mute();
      if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(studioState.speed);
      player.seekTo(s, true);
      if (typeof player.playVideo === 'function') player.playVideo();
    } catch {}
    syncPlaybackButtonsDom();
    startPlaybackTicker();
    startKaraokeRaf();
  }

  function handleRangePlayButtonClick(rangeBtn) {
    if (!rangeBtn) return;
    const s = Number(rangeBtn.getAttribute('data-play-range-start'));
    const e = Number(rangeBtn.getAttribute('data-play-range-end'));
    const rangeKey = rangeBtn.getAttribute('data-play-range-key') || `${s.toFixed(3)}-${e.toFixed(3)}`;
    if (
      studioState.isPlaying &&
      studioState.activeRange &&
      studioState.activeRange.rangeKey === rangeKey
    ) {
      pauseCurrentPlayback();
      return;
    }
    playRange(s, e, {
      rangeKey,
      label: rangeBtn.getAttribute('data-play-range-label') || 'Section',
    });
  }

  function playWord(wordObj) {
    if (!wordObj || !Number.isFinite(wordObj.startMs)) return;
    const isExact = studioState.wordCushion === 'exact';
    const preMs = isExact ? 0 : 25;
    const postMs = isExact ? 0 : 55;
    const startSec = Math.max(0, (wordObj.startMs - preMs) / 1000);
    const endSec = Math.max(startSec + 0.09, (wordObj.endMs + postMs) / 1000);
    studioState.selectedTimedWord = wordObj;
    const defBtn = document.getElementById('studio-define-word-btn');
    if (defBtn) {
      defBtn.hidden = false;
      defBtn.textContent = `Define “${wordObj.word}”`;
    }
    playRange(startSec, endSec, {
      mode: 'word',
      label: `Word: “${wordObj.word}”`,
      wordObj,
      sentIndex: wordObj.sentIndex,
    });
  }

  function playContinuousFrom(startSec, label) {
    const player = studioState.ytPlayer;
    if (!player || player.__flaptapAwaitingReady || typeof player.seekTo !== 'function') return;
    cancelShadowPause();
    studioState.activeRange = null;
    studioState.loopSentenceIndex = null;
    studioState.endAction = 'continue';
    studioState.hasStartedPlaybackOnce = true;
    studioState.endedNaturally = false;
    studioState.isPlaying = true;
    const s = Math.max(0, Number(startSec) || 0);
    const match = (studioState.item?.sentences || []).find((x) => s >= x.startSec && s <= x.endSec);
    if (match) {
      studioState.activeSentence = match;
      updateActiveSentenceDom(match.index);
    }
    const clipLabel = document.getElementById('studio-active-clip-label');
    if (clipLabel) clipLabel.textContent = label || 'Continuous';
    studioState.lastSeekTime = Date.now();
    try {
      if (!studioState.userMuted && typeof player.unMute === 'function') player.unMute();
      if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(studioState.speed);
      player.seekTo(s, true);
      if (typeof player.playVideo === 'function') player.playVideo();
    } catch {}
    syncPlaybackButtonsDom();
    startPlaybackTicker();
    startKaraokeRaf();
  }

  window.playWord = playWord;
  window.playRange = playRange;
  window.playContinuousFrom = playContinuousFrom;

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
    studioState.activeRange = null;
    cancelShadowPause();
    studioState.activeSentence = sentence;
    studioState.seekTargetStart = sentence.startSec;
    studioState.isPlaying = true;
    const clipLabel = document.getElementById('studio-active-clip-label');
    if (clipLabel) {
      clipLabel.textContent = '';
      clipLabel.hidden = true;
    }
    clearActiveKaraokeWord();
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
    if (!player || player.__flaptapAwaitingReady || typeof player.seekTo !== 'function') {
      studioState.pendingPlaySentenceIndex = sentence.index;
      return;
    }

    // Playback Boundary Law:
    // 1. Seek to exact `startSec`
    // 2. Mute during asynchronous seek, unmute at word onset
    // 3. Play through natural sentence acoustic decay before pausing/looping
    const preSeekTime =
      typeof player.getCurrentTime === 'function' ? Number(player.getCurrentTime() || 0) : 0;
    studioState.pendingSeek = {
      targetSec: sentence.startSec,
      sentenceIndex: sentence.index,
      issuedAt: Date.now(),
      preSeekTime,
    };
    studioState.awaitingOnsetUnmute = true;
    studioState.lastSeekTime = Date.now();

    try {
      if (typeof player.mute === 'function') player.mute();
      if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(studioState.speed);
      player.seekTo(sentence.startSec, true);
      if (typeof player.playVideo === 'function') player.playVideo();
    } catch {}

    startPlaybackTicker();
    startKaraokeRaf();
  }

  window.playSentence = playSentence;

  function getSentenceEndCutoff(sentence) {
    const sentences = studioState.item?.sentences || [];
    const nextSentence = sentences.find((s) => s.index === sentence.index + 1);
    const safeBoundaryEnd =
      nextSentence && nextSentence.startSec <= sentence.endSec + 0.01
        ? Number(Math.max(sentence.startSec + 0.05, nextSentence.startSec - 0.050).toFixed(3))
        : sentence.endSec;
    return Math.max(sentence.startSec + 0.05, safeBoundaryEnd);
  }

  function resumeActiveSentence(sentence) {
    const player = studioState.ytPlayer;
    if (!player || player.__flaptapAwaitingReady || typeof player.playVideo !== 'function') {
      return false;
    }
    const isLoopMode =
      studioState.loopSentenceIndex === sentence.index || studioState.endAction === 'loop';
    if (isLoopMode) {
      studioState.loopSentenceIndex = sentence.index;
      studioState.endAction = 'loop';
      studioState.activeSentenceStep = 'looping';
    } else {
      studioState.loopSentenceIndex = null;
      studioState.activeSentenceStep = 'playing-once';
    }
    studioState.endedNaturally = false;
    studioState.pendingSeek = null;
    studioState.awaitingOnsetUnmute = false;
    studioState.isPlaying = true;
    updateActiveSentenceDom(sentence.index);
    syncPlaybackButtonsDom();
    try {
      if (typeof player.setPlaybackRate === 'function') player.setPlaybackRate(studioState.speed);
      player.playVideo();
    } catch {}
    startPlaybackTicker();
    return true;
  }

  function handleSentencePlayButtonClick(idx) {
    const targetIdx = Number(idx);
    if (studioState.isPlaying && studioState.activeSentence?.index === targetIdx) {
      pauseCurrentPlayback();
      return;
    }

    const active = studioState.activeSentence;
    const player = studioState.ytPlayer;
    if (
      active &&
      active.index === targetIdx &&
      studioState.hasStartedPlaybackOnce &&
      !studioState.endedNaturally &&
      player &&
      typeof player.getCurrentTime === 'function'
    ) {
      const current = Number(player.getCurrentTime() || 0);
      const endCutoff = getSentenceEndCutoff(active);
      if (current > active.startSec + 0.05 && current < endCutoff - 0.08) {
        if (resumeActiveSentence(active)) return;
      }
    }

    const isLoopMode =
      studioState.loopSentenceIndex === targetIdx || studioState.endAction === 'loop';
    playSentence(targetIdx, {
      forceMode: isLoopMode ? 'loop' : 'once',
    });
  }

  function pulseReplayButton(el) {
    if (!el) return;
    el.classList.remove('is-replaying');
    void el.offsetWidth;
    el.classList.add('is-replaying');
    window.clearTimeout(el.__replayAnimTimer);
    el.__replayAnimTimer = window.setTimeout(() => {
      el.classList.remove('is-replaying');
    }, 360);
  }

  function getActiveShortcutSentenceIndex() {
    const sentences = studioState.item?.sentences || [];
    if (!sentences.length) return 0;
    if (studioState.mode === 'listen') {
      const idx = Number(studioState.dictationIndex);
      if (Number.isFinite(idx) && idx >= 1 && idx <= sentences.length) return idx;
    }
    const activeIdx = Number(studioState.activeSentence?.index);
    if (Number.isFinite(activeIdx) && activeIdx >= 1) return activeIdx;
    return Number(sentences[0]?.index || 1);
  }

  function replayActiveSentenceFromStart(targetIdxOverride, opts) {
    const options = opts || {};
    const targetIdx = Number(targetIdxOverride) || getActiveShortcutSentenceIndex();
    if (!Number.isFinite(targetIdx) || targetIdx <= 0) return;

    const isLoopMode =
      studioState.loopSentenceIndex === targetIdx || studioState.endAction === 'loop';
    playSentence(targetIdx, {
      forceMode: isLoopMode ? 'loop' : 'once',
    });

    studioState.userScrolledAway = false;
    scrollSentenceIntoView(targetIdx, true);
    syncFloatingJumpButton();

    pulseReplayButton(document.querySelector(`[data-replay-sent="${targetIdx}"]`));
    pulseReplayButton(document.getElementById('deck-replay-sent-btn'));
    if (options.showFlash !== false) {
      showActionFlash('replay');
    }
  }

  function handleSentenceReplayFromStartClick(idx) {
    replayActiveSentenceFromStart(idx, { showFlash: false });
  }

  window.handleSentenceReplayFromStartClick = handleSentenceReplayFromStartClick;
  window.replayActiveSentenceFromStart = replayActiveSentenceFromStart;

  function navigateSentenceByDelta(delta) {
    const sentences = studioState.item?.sentences || [];
    if (!sentences.length || !delta) return false;

    if (studioState.mode === 'listen') {
      const curr = Number(studioState.dictationIndex) || 1;
      const next = Math.max(1, Math.min(sentences.length, curr + delta));
      if (next === curr) {
        if (delta < 0 && curr === 1) {
          replayActiveSentenceFromStart(1, { showFlash: false });
          return true;
        }
        return false;
      }
      closeWordLookupPopover();
      studioState.dictationIndex = next;
      renderDictationCard();
      playSentence(next);
      return true;
    }

    const currIdx = getActiveShortcutSentenceIndex();
    const currentPos = sentences.findIndex((s) => Number(s.index) === currIdx);
    const basePos = currentPos >= 0 ? currentPos : 0;
    const nextPos = basePos + delta;

    if (nextPos < 0) {
      if (studioState.isPlaying) {
        closeWordLookupPopover();
        replayActiveSentenceFromStart(sentences[0].index, { showFlash: false });
        return true;
      }
      return false;
    }
    if (nextPos >= sentences.length) {
      return false;
    }

    const targetIdx = Number(sentences[nextPos].index);
    closeWordLookupPopover();
    playSentence(targetIdx);
    studioState.userScrolledAway = false;
    scrollSentenceIntoView(targetIdx, true);
    syncFloatingJumpButton();
    return true;
  }

  function cycleSentenceFlow() {
    const order = ['loop', 'pause', 'shadow', 'word', 'continue'];
    const curr = order.includes(studioState.endAction) ? studioState.endAction : 'loop';
    const next = order[(order.indexOf(curr) + 1) % order.length];
    cancelShadowPause();
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
      shadow: t('flowShadow'),
      word: t('flowWord'),
      continue: t('flowContinue'),
    };
    showToast(`${t('playbackFlowLabel')}: ${toastMap[next] || next}`);
  }

  function cycleQuickSpeed() {
    const curr = Number(studioState.speed) || 1.0;
    let next = 1.0;
    if (Math.abs(curr - 1.0) < 0.001) {
      next = 0.75;
    } else if (Math.abs(curr - 0.75) < 0.001) {
      next = 0.5;
    } else {
      next = 1.0;
    }
    setStudioSpeed(next);
    showToast(`${t('playbackSpeedLabel')}: ${studioState.speed.toFixed(2)}x`);
  }

  function toggleStudioMute() {
    const player = studioState.ytPlayer;
    if (!player) return;
    studioState.userMuted = !studioState.userMuted;
    try {
      if (studioState.userMuted) {
        if (typeof player.mute === 'function') player.mute();
      } else if (typeof player.unMute === 'function') {
        player.unMute();
      }
    } catch {}
    showActionFlash(studioState.userMuted ? 'mute' : 'unmute');
    showToast(studioState.userMuted ? 'Muted' : 'Unmuted');
  }

  function toggleAllTranslationsVisibility() {
    if (studioState.translationLang === 'none') {
      studioState.translationLang = studioState.defaultLanguage || 'ar';
      try {
        localStorage.setItem('flaptap_trans_lang', studioState.translationLang);
      } catch {}
      studioState.showTranslations = true;
    } else {
      studioState.showTranslations = !studioState.showTranslations;
    }
    syncTranslationUiState();
    showToast(studioState.showTranslations ? 'Translations shown' : 'Translations hidden');
  }

  function toggleActiveItemCompletion({ advanceAfter = false } = {}) {
    const sentences = studioState.item?.sentences || [];
    if (!sentences.length) return;
    const currIdx = getActiveShortcutSentenceIndex();

    if (studioState.mode === 'read') {
      const paragraphs = getCanonicalReadParagraphs(studioState.item);
      const activeSentObj = sentences.find((s) => Number(s.index) === currIdx) || null;
      const paraPos = paragraphs.findIndex((p) => {
        if (Array.isArray(p.sentenceIndices) && p.sentenceIndices.includes(currIdx)) return true;
        if (Array.isArray(p.sentences) && p.sentences.some((s) => Number(s.index) === currIdx)) return true;
        if (activeSentObj && Number.isFinite(p.startSec) && Number.isFinite(p.endSec)) {
          const mid = (Number(activeSentObj.startSec) + Number(activeSentObj.endSec)) / 2;
          return mid >= Number(p.startSec) - 0.05 && mid <= Number(p.endSec) + 0.05;
        }
        return false;
      });
      if (paraPos >= 0) {
        const targetPara = paragraphs[paraPos];
        const paraNum = Number(targetPara.index) || paraPos + 1;
        if (advanceAfter) {
          setStudioItemCompletion('paragraphs', paraNum, true);
          const nextPara = paragraphs[paraPos + 1];
          const nextSentIdx =
            (Array.isArray(nextPara?.sentenceIndices) && Number(nextPara.sentenceIndices[0])) ||
            (Array.isArray(nextPara?.sentences) && Number(nextPara.sentences[0]?.index)) ||
            NaN;
          if (Number.isFinite(nextSentIdx) && nextSentIdx > 0) {
            closeWordLookupPopover();
            playSentence(nextSentIdx);
            studioState.userScrolledAway = false;
            scrollSentenceIntoView(nextSentIdx, true);
            syncFloatingJumpButton();
          } else {
            navigateSentenceByDelta(1);
          }
          showToast(`Paragraph #${paraNum} done`);
        } else {
          const wasDone = getStudioCompletedSet('paragraphs').has(paraNum);
          toggleStudioItemCompletion('paragraphs', paraNum);
          showToast(wasDone ? `Paragraph #${paraNum} unmarked` : `Paragraph #${paraNum} done`);
        }
        return;
      }
    }

    if (studioState.mode === 'listen') {
      const idx = Number(studioState.dictationIndex) || currIdx;
      if (advanceAfter) {
        setStudioItemCompletion('listen', idx, true);
        navigateSentenceByDelta(1);
        showToast(`Dictation #${String(idx).padStart(2, '0')} done`);
      } else {
        const wasDone = getStudioCompletedSet('listen').has(idx);
        toggleStudioItemCompletion('listen', idx);
        showToast(
          wasDone
            ? `Dictation #${String(idx).padStart(2, '0')} unmarked`
            : `Dictation #${String(idx).padStart(2, '0')} done`,
        );
      }
      return;
    }

    if (advanceAfter) {
      setStudioItemCompletion('sentences', currIdx, true);
      navigateSentenceByDelta(1);
      showToast(`Sentence #${String(currIdx).padStart(2, '0')} done`);
    } else {
      const wasDone = getStudioCompletedSet('sentences').has(currIdx);
      toggleStudioItemCompletion('sentences', currIdx);
      showToast(
        wasDone
          ? `Sentence #${String(currIdx).padStart(2, '0')} unmarked`
          : `Sentence #${String(currIdx).padStart(2, '0')} done`,
      );
    }
  }

  let pointerInYtControlStrip = false;
  let iframeFocusReclaimTimer = null;

  function isPlayerIframeElement(el) {
    if (!el || el.tagName !== 'IFRAME') return false;
    const stage = document.getElementById('video-stage-container');
    return Boolean(stage && stage.contains(el));
  }

  function reclaimFocusFromPlayerIframe() {
    if (document.visibilityState !== 'visible') return false;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
    const activeEl = document.activeElement;
    if (!isPlayerIframeElement(activeEl)) return false;
    try {
      activeEl.blur();
    } catch {}
    if (document.body) {
      if (!document.body.hasAttribute('tabindex')) {
        document.body.setAttribute('tabindex', '-1');
      }
      try {
        document.body.focus({ preventScroll: true });
      } catch {}
    }
    return true;
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
      backBtn.title = `Rewind ${labelStr}s (A / ←)`;
      backBtn.setAttribute('aria-label', `Rewind ${labelStr} seconds`);
    }
    const fwdBtn = document.getElementById('deck-seek-fwd-btn');
    if (fwdBtn) {
      fwdBtn.title = `Forward ${labelStr}s (D / →)`;
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

    // 1. Asynchronous Seek Resolution & Precise Onset Unmute:
    // Wait until the player's playhead has physically arrived at the pending seek target
    // before enforcing end-of-sentence boundaries or playhead-to-sentence tracking.
    // Prevents stale pre-seek getCurrentTime() values from snapping activeSentence back
    // to the previous sentence and looping it repeatedly.
    const pending = studioState.pendingSeek;
    if (pending) {
      if (studioState.lastSeekTime === 0) {
        studioState.pendingSeek = null;
      } else {
        const elapsed = Date.now() - pending.issuedAt;
        const target = pending.targetSec;
        const isHtml5 = Boolean(player.isHtml5);
        const mediaEl = isHtml5 ? document.getElementById('studio-html5-player') : null;
        const html5Arrived =
          isHtml5 &&
          current >= target - 0.15 &&
          (!mediaEl?.seeking || elapsed >= 80);
        const arrivedTight = current >= target - 0.15 && current <= target + 0.45;
        const isBackwardSeek = pending.preSeekTime > target + 0.08;
        const movedFromPreSeek = isBackwardSeek
          ? current <= Math.min(target + 0.15, pending.preSeekTime - 0.04)
          : Math.abs(current - pending.preSeekTime) > 0.015;
        const preSeekInZone =
          pending.preSeekTime >= target - 0.15 && pending.preSeekTime <= target + 0.55;
        const settledWaitMs = isBackwardSeek ? 380 : 120;
        const pastCutoffSafety =
          elapsed >= 250 &&
          active &&
          current >= getSentenceEndCutoff(active) &&
          Math.abs(current - pending.preSeekTime) > 0.05;
        const arrived =
          html5Arrived ||
          pastCutoffSafety ||
          (arrivedTight && (!preSeekInZone || movedFromPreSeek || elapsed >= settledWaitMs)) ||
          (elapsed >= 450 && movedFromPreSeek && current >= target - 1.0 && current <= target + 0.85) ||
          elapsed >= 2500;

        if (!arrived) {
          return;
        }
        resetPlaybackClockAnchor(current);
        studioState.pendingSeek = null;
        if (studioState.awaitingOnsetUnmute) {
          if (!studioState.userMuted && typeof player.unMute === 'function') player.unMute();
          studioState.awaitingOnsetUnmute = false;
        }
      }
    } else if (studioState.lastSeekTime > 0 && Date.now() - studioState.lastSeekTime < 90) {
      // Ignore stale pre-seek playhead values briefly after manual micro-seek nudges
      return;
    }

    const onsetRef = studioState.activeRange
      ? studioState.activeRange.startSec
      : active?.startSec;
    if (studioState.awaitingOnsetUnmute && Number.isFinite(onsetRef)) {
      const arrivedAtOnset =
        Math.abs(current - onsetRef) <= 0.15 ||
        (current >= onsetRef - 0.05 && current <= onsetRef + 0.25);
      if (arrivedAtOnset) {
        if (!studioState.userMuted && typeof player.unMute === 'function') player.unMute();
        studioState.awaitingOnsetUnmute = false;
      }
    }

    const sentences = studioState.item?.sentences || [];
    const effectiveFlow = MC
      ? MC.resolveEffectiveFlow(studioState.mode, studioState.endAction)
      : studioState.endAction;

    // 1.5 Active Word or Section Range Boundary Enforcement (Paragraph, Idea, Speaker Turn, Raw Cue, Word Clip)
    const activeRange = studioState.activeRange;
    if (activeRange) {
      if (current >= activeRange.endSec) {
        if (activeRange.mode === 'word' && effectiveFlow === 'word') {
          studioState.pendingSeek = {
            targetSec: activeRange.startSec,
            sentenceIndex: studioState.activeSentence?.index || 1,
            issuedAt: Date.now(),
            preSeekTime: current,
          };
          studioState.awaitingOnsetUnmute = true;
          studioState.lastSeekTime = Date.now();
          if (typeof player.mute === 'function') player.mute();
          player.seekTo(activeRange.startSec, true);
          if (typeof player.playVideo === 'function') player.playVideo();
          return;
        }
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
        if (studioState.playbackTicker) {
          clearInterval(studioState.playbackTicker);
          studioState.playbackTicker = null;
        }
        stopKaraokeRaf();
        studioState.activeRange = null;
        studioState.isPlaying = false;
        syncPlaybackButtonsDom();
      }
      return;
    }

    // 2. Playback Boundary Enforcement (runs FIRST to guarantee loop, shadow pause & auto-pause boundaries)
    if (active) {
      const nextSentence = sentences.find((s) => s.index === active.index + 1);
      const endCutoff = getSentenceEndCutoff(active);

      if (current >= endCutoff) {
        if (effectiveFlow === 'shadow') {
          if (typeof player.pauseVideo === 'function') player.pauseVideo();
          if (studioState.playbackTicker) {
            clearInterval(studioState.playbackTicker);
            studioState.playbackTicker = null;
          }
          stopKaraokeRaf();
          studioState.isPlaying = false;
          syncPlaybackButtonsDom();
          const durSec = Math.max(0.8, active.endSec - active.startSec);
          startShadowPause(durSec, () => {
            if (MC ? MC.resolveEffectiveFlow(studioState.mode, studioState.endAction) === 'shadow' : studioState.endAction === 'shadow') {
              playSentence(active.index, { forceMode: 'once' });
            }
          });
          return;
        }

        const shouldLoop =
          effectiveFlow === 'loop' ||
          (studioState.mode === 'shadow' && studioState.loopSentenceIndex === active.index);

        if (shouldLoop) {
          clearActiveKaraokeWord();
          studioState.pendingSeek = {
            targetSec: active.startSec,
            sentenceIndex: active.index,
            issuedAt: Date.now(),
            preSeekTime: current,
          };
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

        if (effectiveFlow === 'pause') {
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
      const isDrillingSentence = effectiveFlow === 'loop' || effectiveFlow === 'pause';

      const msSinceSeek = studioState.lastSeekTime > 0 ? Date.now() - studioState.lastSeekTime : Infinity;
      const isInitialSeekJitter =
        !isDrillingSentence &&
        active &&
        msSinceSeek < 350 &&
        Math.abs(current - active.startSec) <= 0.15;
      const isOutsideActive = isDrillingSentence
        ? !active ||
          (msSinceSeek > 2500 &&
            (current < active.startSec - 1.5 || current > active.endSec + 1.5))
        : !active ||
          (!isInitialSeekJitter &&
            !studioState.pendingSeek &&
            (current < active.startSec - 0.08 || current > active.endSec + 0.06));

      if (!isDrillingSentence || isOutsideActive) {
        const match = sentences.find((s) => current >= s.startSec && current < s.endSec);
        if (match && (!active || active.index !== match.index)) {
          if (studioState.loopSentenceIndex !== null) {
            studioState.loopSentenceIndex = match.index;
          }
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
    const headerDock = document.getElementById('canvas-header-dock');
    const headerDockStyle = headerDock ? window.getComputedStyle(headerDock) : null;
    const headerDockH =
      headerDock && headerDockStyle?.position === 'sticky'
        ? headerDock.getBoundingClientRect().height || 0
        : 0;
    const prevEl = getPreviousVisibleListItem(el);
    const listTopGap = 10;

    const canvas = document.querySelector('.studio-canvas');
    const canvasStyle = canvas ? window.getComputedStyle(canvas) : null;
    const canvasIsScroller = Boolean(
      canvas &&
      canvas.contains(el) &&
      canvasStyle &&
      canvasStyle.overflowY !== 'visible' &&
      canvas.scrollHeight > canvas.clientHeight + 2,
    );

    if (canvasIsScroller) {
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

    const isWindowScrollLayout =
      window.innerWidth <= 768 ||
      (canvasStyle && canvasStyle.overflowY === 'visible');
    if (!isWindowScrollLayout) {
      el.scrollIntoView({ behavior, block: 'start' });
      return;
    }

    const deckStickyH =
      deck && window.getComputedStyle(deck).position === 'sticky'
        ? deck.getBoundingClientRect().height || 0
        : 0;
    const headerStickyTop =
      headerDock && headerDockStyle?.position === 'sticky'
        ? (parseFloat(headerDockStyle.top) || 0) + headerDockH
        : 0;
    const dockHeight = Math.max(deckStickyH, headerStickyTop);
    const consoleEl = document.querySelector('.studio-media-console');
    const bottomDockH =
      consoleEl && window.getComputedStyle(consoleEl).position === 'fixed'
        ? consoleEl.getBoundingClientRect().height || 0
        : 0;
    const vh = (window.innerHeight || document.documentElement.clientHeight || 800) - bottomDockH;
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
      const readView = studioState.readView || 'paragraphs';
      if (readView === 'ideas') {
        const row = document.querySelector(`#subview-ideas-list .studio-idea-sent-row[data-sentence-index="${index}"]`);
        return row?.closest('.studio-idea-card') || row || null;
      }
      if (readView === 'speakers') {
        const cards = Array.from(document.querySelectorAll('#subview-speakers-list .studio-turn-card[data-turn-sents]'));
        const match = cards.find((c) => (c.getAttribute('data-turn-sents') || '').split(',').map(Number).includes(Number(index)));
        return match || cards[0] || null;
      }
      if (readView === 'raw') {
        return (
          document.querySelector(`#subview-raw-list .read-sentence[data-read-sent="${index}"]`) ||
          document.querySelector(`#subview-raw-list .read-sentence[data-canon-index="${index}"]`) ||
          null
        );
      }
      const readSent = document.querySelector(`#subview-chunks-list .read-sentence[data-read-sent="${index}"]`);
      if (readSent) return readSent;
      const paraDoneSet = getStudioCompletedSet('paragraphs');
      const paragraphs = getCanonicalReadParagraphs(studioState.item);
      const firstParaIdx = paragraphs.findIndex((p, idx) => !paraDoneSet.has(Number(p.index) || idx + 1)) + 1;
      return firstParaIdx > 0
        ? document.querySelector(`.editorial-paragraph-block[data-paragraph-index="${firstParaIdx}"]`)
        : null;
    }
    if (studioState.mode === 'coach') {
      const firstUncheckedCoach = document.querySelector(
        '#mode-panel-coach [data-studio-check-subject^="coach"]:not(.is-checked)',
      );
      return (
        firstUncheckedCoach?.closest('.coach-item-card, section') ||
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
        studioState.item.analysisStatus = 'ready';
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
        syncReviewStatusChrome();
        applyStudioModeChrome();
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

  function clearRetryCountdown() {
    if (studioState.retryCountdownTimer) {
      clearInterval(studioState.retryCountdownTimer);
      studioState.retryCountdownTimer = null;
    }
    const retryBtn = document.getElementById('loader-retry-btn');
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.textContent = t('tryAgain');
    }
  }

  function formatCooldownDuration(sec) {
    const s = Math.max(0, Math.ceil(Number(sec) || 0));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  }

  function showFatalLoaderError(error) {
    if (Number(error?.status) === 401 || error?.code === 'auth_required') {
      redirectToSignInGate();
      return;
    }

    clearRetryCountdown();

    const overlay = document.getElementById('loader-overlay');
    const headline = document.getElementById('loader-headline');
    const sub = document.getElementById('loader-subheadline');
    const actions = document.getElementById('loader-error-actions');
    const retryBtn = document.getElementById('loader-retry-btn');

    if (!overlay) return;
    overlay.hidden = false;
    overlay.classList.add('loader-error');
    if (sub) sub.hidden = false;
    if (actions) actions.style.display = 'flex';

    const code = error?.code || '';
    const status = Number(error?.status) || 0;
    const retryAfterSec = Math.max(0, Math.ceil(Number(error?.retryAfterSec) || 0));

    let isRetryable = false;
    if (code === 'video_unavailable' || status === 404) {
      headline.textContent = t('errUnavailableHeadline');
      sub.textContent = error?.message || t('errUnavailableDetail');
      isRetryable = false;
    } else if (code === 'live_fetch_disabled') {
      headline.textContent = t('errLiveFetchDisabledHeadline');
      sub.textContent = error?.message || t('errLiveFetchDisabledDetail');
      isRetryable = false;
    } else if (code === 'no_captions' || code === 'invalid_url' || status === 422 || status === 400) {
      headline.textContent = t('errNoCaptionsHeadline');
      sub.textContent = error?.message || t('errNoCaptionsDetail');
      isRetryable = false;
    } else if (code === 'rate_limited') {
      headline.textContent = t('errRateLimitHeadline');
      sub.textContent = error?.message || t('errRateLimitDetail');
      isRetryable = true;
    } else if (code === 'timeout') {
      headline.textContent = t('errTimeoutHeadline');
      sub.textContent = error?.message || t('errTimeoutDetail');
      isRetryable = true;
    } else {
      headline.textContent = t('errRateLimitHeadline');
      sub.textContent = error?.message || t('errTimeoutDetail');
      isRetryable = status >= 500 || status === 0;
    }

    if (retryBtn) {
      retryBtn.style.display = isRetryable ? 'inline-flex' : 'none';
      if (isRetryable && code === 'rate_limited' && retryAfterSec > 0) {
        let remaining = retryAfterSec;
        retryBtn.disabled = true;
        retryBtn.textContent = `${t('tryAgain')} (${formatCooldownDuration(remaining)})`;
        studioState.retryCountdownTimer = setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            clearRetryCountdown();
            return;
          }
          retryBtn.textContent = `${t('tryAgain')} (${formatCooldownDuration(remaining)})`;
        }, 1000);
      }
    }
  }

  /* ========================================================================
     CONSOLIDATED TRANSCRIPT CAPABILITIES:
     AI VERBATIM REVIEW SSE · INLINE TITLE & SPEAKER RENAME · LIVE SEARCH ·
     REPAIR DIFF POPOVER · SCRUB BAR · WORD CLICK MODES · 7-FORMAT EXPORTER
     ======================================================================== */

  function ensureStudioReviewAiSelector() {
    if (studioState.reviewAiSelector || !window.FlaptapAiSelector) return;
    const mount = document.getElementById('studio-review-ai-mount');
    if (!mount) return;
    studioState.reviewAiSelector = window.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'studio-rev-aisel',
      persistenceKey: 'shadowing_review',
      title: 'Review Model',
      compact: true,
      showRunButton: false,
      hideMetaChips: true,
      fetcher: apiFetch,
    });
    studioState.reviewAiSelector.init();
  }

  function getSavedReviewOptions() {
    if (studioState.reviewAiSelector) {
      const sel = studioState.reviewAiSelector.getSelection?.();
      if (sel && (sel.keyId || sel.model)) {
        return { keyId: sel.keyId || undefined, model: sel.model || undefined, variant: sel.variant || undefined };
      }
    }
    try {
      const raw = sessionStorage.getItem('flaptap_shadowing_review_opts');
      if (raw) return JSON.parse(raw);
    } catch {}
    try {
      const rawLs = localStorage.getItem('flaptap_aisel_shadowing_review');
      if (rawLs) {
        const p = JSON.parse(rawLs);
        return { keyId: p.keyId || undefined, model: p.model || undefined, variant: p.variant || undefined };
      }
    } catch {}
    return {};
  }

  async function runTranscriptReview({ force = false } = {}) {
    const item = studioState.item;
    const TT = window.FlaptapStudioTranscriptTools;
    if (!item?.id || !TT || studioState.reviewing) return;

    closeAllControlPopovers();
    studioState.reviewing = true;
    const ac = new AbortController();
    studioState.reviewAbort = ac;

    const banner = document.getElementById('studio-review-banner');
    const msgEl = document.getElementById('studio-review-msg');
    const pctEl = document.getElementById('studio-review-pct');
    const fillEl = document.getElementById('studio-review-fill');
    if (banner) banner.hidden = false;
    if (msgEl) msgEl.textContent = 'Starting AI Verbatim Review...';
    if (pctEl) pctEl.textContent = '5%';
    if (fillEl) fillEl.style.width = '5%';

    try {
      const reviewOpts = Object.assign({}, getSavedReviewOptions(), { force: Boolean(force) });
      const updated = await TT.streamReviewLesson({
        lessonId: item.id,
        opts: reviewOpts,
        headers: apiHeaders(),
        signal: ac.signal,
        onProgress: (ev) => {
          const pct = Math.max(0, Math.min(100, Number(ev?.percent || 0)));
          if (msgEl && ev?.message) msgEl.textContent = ev.message;
          if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
          if (fillEl) fillEl.style.width = `${pct}%`;
        },
      });
      if (updated) {
        studioState.item = Object.assign({}, studioState.item, updated);
        syncStudioPacingUi(studioState.item);
        if (studioState.activeSentence) {
          const nextActive = (studioState.item.sentences || []).find(
            (s) => Number(s.index) === Number(studioState.activeSentence.index),
          );
          if (nextActive) studioState.activeSentence = nextActive;
        }
        renderSentencesAndParagraphs();
        syncPlaybackButtonsDom();
        syncDeckLiveSubtitle();
        showToast('AI Verbatim Review complete — speakers, repairs & ideas ready');
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        showToast('AI Verbatim Review cancelled');
      } else {
        showToast(err?.message || 'AI Verbatim Review failed.');
      }
    } finally {
      studioState.reviewing = false;
      studioState.reviewAbort = null;
      if (banner) banner.hidden = true;
    }
  }

  function applyUpdatedTranscriptItem(nextItem) {
    if (!nextItem) return;
    studioState.item = nextItem;
    studioState.translationsByLang = {};
    if (nextItem.translationsCache && typeof nextItem.translationsCache === 'object') {
      for (const [lang, map] of Object.entries(nextItem.translationsCache)) {
        studioState.translationsByLang[lang] = Object.assign({}, map || {});
      }
    }
    studioState.translatingAllByLang = {};
    studioState.translatingSentencesByLang = {};

    document.title = `${nextItem.title || 'Lesson'} — Flaptap Studio`;
    const titleEl = document.getElementById('studio-title');
    if (titleEl) titleEl.textContent = nextItem.title || 'English Lesson';
    const creatorEl = document.getElementById('studio-creator');
    if (creatorEl) creatorEl.textContent = nextItem.creator || 'Speaker';
    const wpmEl = document.getElementById('studio-wpm');
    if (wpmEl) wpmEl.textContent = `${Number(nextItem.pacingWpm || 145)} WPM`;

    const sentences = Array.isArray(nextItem.sentences) ? nextItem.sentences : [];
    const sentTotalEl = document.getElementById('studio-sentence-total');
    if (sentTotalEl) sentTotalEl.textContent = `${sentences.length} ${t('sentencesUnit')}`;

    const prevIdx = Number(studioState.activeSentence?.index || 1);
    const nextActive = sentences.find((s) => Number(s.index) === prevIdx) || sentences[0] || null;
    studioState.activeSentence = nextActive;
    studioState.dictationIndex = nextActive ? Number(nextActive.index) || 1 : 1;

    syncStudioPacingUi(nextItem);
    renderSentencesAndParagraphs();
    syncPlaybackButtonsDom();
    syncStudioTopProgressDom();
    if (nextActive) {
      updateActiveSentenceDom(nextActive.index);
    } else {
      syncDeckLiveSubtitle();
    }
    if (studioState.mode === 'listen') {
      renderDictationCard();
    }
    syncEnhancementsPopoverUi();
  }

  async function retryLessonCaptions({ silentToast = false } = {}) {
    const item = studioState.item;
    if (!item?.id || studioState.transcriptActionInFlight) return null;
    studioState.transcriptActionInFlight = true;
    try {
      const updated = await apiFetch(`/api/tracks/shadowing/${encodeURIComponent(item.id)}/captions/retry`, {
        method: 'POST',
      });
      if (updated) {
        applyUpdatedTranscriptItem(updated);
        if (!silentToast) showToast('Source captions loaded');
      }
      return updated;
    } catch (err) {
      showToast(err?.message || 'Could not fetch source captions right now.');
      throw err;
    } finally {
      studioState.transcriptActionInFlight = false;
      syncEnhancementsPopoverUi();
    }
  }

  async function importLessonTranscript(rawText) {
    const item = studioState.item;
    if (!item?.id || studioState.transcriptActionInFlight) return null;
    const clean = String(rawText || '').trim();
    if (!clean) {
      showToast('Paste transcript text, SRT, or WebVTT first.');
      return null;
    }
    studioState.transcriptActionInFlight = true;
    try {
      const updated = await apiFetch(`/api/tracks/shadowing/${encodeURIComponent(item.id)}/transcript/import`, {
        method: 'POST',
        body: JSON.stringify({ rawText: clean }),
      });
      if (updated) {
        const pasteBox = document.getElementById('studio-enhance-paste-box');
        if (pasteBox) pasteBox.hidden = true;
        applyUpdatedTranscriptItem(updated);
        showToast(`Loaded ${(updated.sentences || []).length} lines`);
      }
      return updated;
    } catch (err) {
      showToast(err?.message || 'Could not import transcript.');
      throw err;
    } finally {
      studioState.transcriptActionInFlight = false;
      syncEnhancementsPopoverUi();
    }
  }

  async function runExplicitTranscription() {
    showToast(
      'Third-party transcription (Whisper / Groq) is disabled. Shadowing only uses original transcripts from the source provider.',
    );
    return null;
  }

  async function maybeAutoCloudTranscribe() {
    return;
  }

  async function runSelectedEnhancements() {
    if (studioState.enhancementsInFlight || !studioState.item?.id) return;
    const doRetry = Boolean(document.getElementById('enhance-check-retry-captions')?.checked);
    const doReview = Boolean(document.getElementById('enhance-check-review')?.checked);
    const doCoach = Boolean(document.getElementById('enhance-check-coach')?.checked);
    const doTranslate = Boolean(document.getElementById('enhance-check-translate')?.checked);

    if (!doRetry && !doReview && !doCoach && !doTranslate) return;

    closeAllControlPopovers();
    studioState.enhancementsInFlight = true;
    syncEnhancementsPopoverUi();

    try {
      if (doRetry) {
        await retryLessonCaptions({ silentToast: doReview || doCoach || doTranslate });
      }
      if ((studioState.item?.sentences || []).length === 0) {
        showToast('Load or paste a transcript first.');
        return;
      }
      if (doReview) {
        await runTranscriptReview({ force: studioState.item?.reviewStatus === 'ready' });
      }
      if (doCoach) {
        await triggerDynamicCoachAnalysis(studioState.item?.analysisStatus === 'ready');
      }
      if (doTranslate) {
        await translateAllSentences();
      }
      document.querySelectorAll('#studio-enhance-list .studio-enhance-check').forEach((c) => {
        c.checked = false;
      });
    } catch {
      // Individual task helpers show concise error toast
    } finally {
      studioState.enhancementsInFlight = false;
      syncEnhancementsPopoverUi();
    }
  }

  function syncStudioPacingUi(item, modeOverride = null) {
    const group = document.getElementById('studio-pacing-group');
    if (!group) return;
    const isShadowing = Boolean(item && item.track === 'shadowing');
    group.hidden = !isShadowing;
    if (!isShadowing) return;
    const activeMode = normalizePacingMode(modeOverride || item.pacingMode || 'short');
    group.querySelectorAll('[data-pacing]').forEach((btn) => {
      const act = btn.dataset.pacing === activeMode;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-checked', act ? 'true' : 'false');
    });
  }

  function formatPacingSwitchedToast(mode, count) {
    const n = Number(count) || 0;
    if (studioState.uiLang === 'en') {
      const label = mode === 'normal' ? 'Normal lines' : 'Short lines';
      return `${label} · ${n} ${n === 1 ? 'line' : 'lines'}`;
    }
    const key = mode === 'normal' ? 'pacingNormal' : 'pacingShort';
    return `${t(key)} · ${n} ${t('sentencesUnit')}`;
  }

  async function switchStudioPacing(nextMode) {
    const targetMode = normalizePacingMode(nextMode);
    const item = studioState.item;
    if (!item?.id || item.track !== 'shadowing' || studioState.isSwitchingPacing) return;

    const prevMode = normalizePacingMode(item.pacingMode || 'short');
    if (prevMode === targetMode) return;

    if (!studioState.user && !studioState.authToken) {
      redirectToSignInGate();
      return;
    }

    const player = studioState.ytPlayer;
    const wasPlaying = Boolean(studioState.isPlaying);
    const wasLooping = studioState.endAction === 'loop';
    let anchorTimeSec = (studioState.activeSentence?.startSec ?? 0) + 0.05;
    try {
      if (player && typeof player.getCurrentTime === 'function') {
        const cur = Number(player.getCurrentTime());
        if (Number.isFinite(cur) && cur > 0) {
          const act = studioState.activeSentence;
          if (wasPlaying || !act || (cur >= Number(act.startSec) - 0.1 && cur <= Number(act.endSec) + 0.25)) {
            anchorTimeSec = cur;
          }
        }
      }
    } catch {}

    const group = document.getElementById('studio-pacing-group');
    studioState.isSwitchingPacing = true;
    group?.classList.add('is-switching');
    syncStudioPacingUi(item, targetMode);

    try {
      const data = await apiFetch(`/api/tracks/shadowing/${encodeURIComponent(item.id)}/pacing`, {
        method: 'PATCH',
        body: JSON.stringify({ pacingMode: targetMode }),
      });

      const nextItem = data?.item;
      if (!nextItem) {
        throw new Error(t('pacingSwitchFailed'));
      }

      try {
        localStorage.setItem(PACING_STORAGE_KEY, targetMode);
      } catch {}

      studioState.item = nextItem;

      // Refresh translation map cleanly so zero stale sentence-index translations linger
      studioState.translationsByLang = {};
      if (nextItem.translationsCache && typeof nextItem.translationsCache === 'object') {
        for (const [lang, map] of Object.entries(nextItem.translationsCache)) {
          studioState.translationsByLang[lang] = Object.assign({}, map || {});
        }
      }
      studioState.translatingAllByLang = {};
      studioState.translatingSentencesByLang = {};

      // Clear transient playback/karaoke state without touching or remounting studioState.ytPlayer
      cancelShadowPause();
      studioState.pendingSeek = null;
      clearActiveKaraokeWord();
      studioState.activeRange = null;

      // Resolve new anchor sentence by timestamp
      const sentences = Array.isArray(nextItem.sentences) ? nextItem.sentences : [];
      let matched = sentences.find(
        (s) => anchorTimeSec >= Number(s.startSec) - 0.02 && anchorTimeSec <= Number(s.endSec) + 0.02,
      );
      if (!matched && sentences.length > 0) {
        matched = sentences.reduce((best, s) =>
          Math.abs(Number(s.startSec) - anchorTimeSec) < Math.abs(Number(best.startSec) - anchorTimeSec) ? s : best,
        );
      }
      if (!matched && sentences.length > 0) {
        matched = sentences[0];
      }

      studioState.activeSentence = matched || null;
      studioState.loopSentenceIndex = wasLooping && matched ? matched.index : null;
      studioState.dictationIndex = matched ? Number(matched.index) || 1 : 1;

      syncStudioPacingUi(nextItem);

      const sentTotalEl = document.getElementById('studio-sentence-total');
      if (sentTotalEl) {
        sentTotalEl.textContent = `${sentences.length} ${t('sentencesUnit')}`;
      }

      // Re-render all dependent Studio surfaces cleanly without remounting media deck
      renderSentencesAndParagraphs();

      if (nextItem.aiAnalysis) {
        const coachContent = document.getElementById('coach-content-box');
        if (studioState.mode === 'coach' || (coachContent && !coachContent.hidden)) {
          renderCoachAnalysis(nextItem.aiAnalysis);
        } else {
          syncCoachBadgeFromAnalysis(nextItem.aiAnalysis);
        }
      }

      if (matched) {
        updateActiveSentenceDom(matched.index);
      } else {
        syncDeckLiveSubtitle();
      }
      syncPlaybackButtonsDom();

      if (studioState.mode === 'listen') {
        renderDictationCard();
      }

      if (matched) {
        requestAnimationFrame(() => {
          const targetEl = getActiveScrollTargetElement(matched.index);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }

      // Keep active playback flowing seamlessly with zero stutter
      if (wasPlaying && matched) {
        try {
          if (player && typeof player.getCurrentTime === 'function' && typeof player.seekTo === 'function') {
            const curNow = Number(player.getCurrentTime());
            if (
              !Number.isFinite(curNow) ||
              curNow < Number(matched.startSec) - 0.1 ||
              curNow > Number(matched.endSec)
            ) {
              player.seekTo(Number(matched.startSec), true);
            }
          }
        } catch {}
      }

      showToast(formatPacingSwitchedToast(targetMode, data.sentenceCount ?? sentences.length));
    } catch (err) {
      if (err?.status === 401 || err?.code === 'auth_required') {
        redirectToSignInGate();
        return;
      }
      syncStudioPacingUi(studioState.item, prevMode);
      showToast(err?.message || t('pacingSwitchFailed'));
    } finally {
      studioState.isSwitchingPacing = false;
      group?.classList.remove('is-switching');
    }
  }

  function setWordClickMode(mode) {
    const valid = ['define', 'word', 'from-here'];
    const target = valid.includes(mode) ? mode : 'define';
    studioState.wordClickMode = target;
    try {
      localStorage.setItem('flaptap_word_click_mode', target);
    } catch {}
    document.querySelectorAll('[data-word-click-mode]').forEach((btn) => {
      const act = btn.getAttribute('data-word-click-mode') === target;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-pressed', act ? 'true' : 'false');
    });
  }

  function setWordCushion(cushion) {
    const target = cushion === 'exact' ? 'exact' : 'natural';
    studioState.wordCushion = target;
    try {
      localStorage.setItem('flaptap_word_cushion', target);
    } catch {}
    document.querySelectorAll('[data-word-cushion]').forEach((btn) => {
      const act = btn.getAttribute('data-word-cushion') === target;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-pressed', act ? 'true' : 'false');
    });
  }

  function toggleVideoVisibility(forcedState, opts = {}) {
    const ws = document.getElementById('studio-main-content');
    const card = document.querySelector('.player-frame-card');
    const btn = document.getElementById('studio-video-toggle-btn');
    const audioStage = document.getElementById('studio-audio-stage');
    const zoomHud = document.getElementById('video-zoom-hud');
    if (!card) return;
    const nextHidden =
      typeof forcedState === 'boolean' ? forcedState : !studioState.videoHidden;
    studioState.videoHidden = nextHidden;
    if (ws) ws.setAttribute('data-video-hidden', nextHidden ? '1' : '0');
    card.classList.toggle('is-video-hidden', nextHidden);
    if (audioStage) audioStage.hidden = !nextHidden;
    if (zoomHud) zoomHud.hidden = nextHidden;
    if (btn) {
      btn.textContent = nextHidden ? 'Show Video' : 'Hide Video';
      btn.classList.toggle('active', nextHidden);
    }
    if (opts.persist !== false) {
      try {
        localStorage.setItem('flaptap_studio_video_hidden', nextHidden ? '1' : '0');
      } catch {}
    }
    requestAnimationFrame(() => {
      syncStudioDeckStickyHeightVar();
      window.FlaptapStudioLayouts?.updateSplitResizerGeometry();
    });
  }

  function hideInfoPopover(immediate = false) {
    clearTimeout(studioState.infoPopoverCloseTimer);
    const pop = document.getElementById('studio-info-popover');
    if (!pop) return;
    const closeNow = () => {
      pop.hidden = true;
      studioState.infoPopoverPinned = false;
    };
    if (immediate) closeNow();
    else studioState.infoPopoverCloseTimer = setTimeout(closeNow, 180);
  }

  function showInfoPopover(kind, sentIdx, anchorEl, { pinned = false, wordObj = null } = {}) {
    const TT = window.FlaptapStudioTranscriptTools;
    const pop = document.getElementById('studio-info-popover');
    if (!TT || !pop || !anchorEl || !studioState.item) return;
    clearTimeout(studioState.infoPopoverCloseTimer);
    studioState.infoPopoverPinned = Boolean(pinned);
    pop.innerHTML = TT.buildInfoPopoverHtml(studioState.item, kind, sentIdx, wordObj);
    pop.style.left = '-9999px';
    pop.style.top = '0px';
    pop.hidden = false;

    const ar = anchorEl.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const left = Math.max(8, Math.min(vw - pr.width - 8, ar.left + ar.width / 2 - pr.width / 2));
    let top = ar.top - pr.height - 8;
    if (top < 8) top = Math.min(vh - pr.height - 8, ar.bottom + 8);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function syncSearchMatchesDom() {
    const activeQ =
      MC && modeState ? MC.getSearchQuery(modeState, studioState.mode) : studioState.searchQuery;
    studioState.searchQuery = activeQ;
    const q = activeQ.trim().toLowerCase();
    const countEl = document.getElementById('studio-search-count');
    const prevBtn = document.getElementById('studio-search-prev');
    const nextBtn = document.getElementById('studio-search-next');
    const clearBtn = document.getElementById('studio-search-clear');

    const hits = [];
    if (studioState.mode === 'coach') {
      const coachBox = document.getElementById('coach-content-box');
      const cards = coachBox ? Array.from(coachBox.querySelectorAll('.coach-item-card')) : [];
      for (const card of cards) {
        card.classList.remove('is-search-current');
        const isHit = Boolean(q && !card.hidden && (card.textContent || '').toLowerCase().includes(q));
        card.classList.toggle('is-search-hit', isHit);
        if (isHit) hits.push(card);
      }
    } else {
      const scopeSelector =
        studioState.mode === 'shadow'
          ? '#subview-sentences-list'
          : studioState.readView === 'ideas'
            ? '#subview-ideas-list'
            : studioState.readView === 'speakers'
              ? '#subview-speakers-list'
              : studioState.readView === 'raw'
                ? '#subview-raw-list'
                : '#subview-chunks-list';

      const root = document.querySelector(scopeSelector);
      const words = root ? Array.from(root.querySelectorAll('.studio-word')) : [];
      for (const el of words) {
        el.classList.remove('is-search-current');
        const isHit = Boolean(q && (el.textContent || '').toLowerCase().includes(q));
        el.classList.toggle('is-search-hit', isHit);
        if (isHit) hits.push(el);
      }
    }

    studioState.searchMatches = hits;
    if (!q) {
      studioState.searchMatchIdx = 0;
      if (countEl) countEl.hidden = true;
      if (prevBtn) prevBtn.hidden = true;
      if (nextBtn) nextBtn.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      return;
    }

    if (clearBtn) clearBtn.hidden = false;
    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = hits.length ? `${Math.min(studioState.searchMatchIdx + 1, hits.length)}/${hits.length}` : '0/0';
    }
    if (prevBtn) prevBtn.hidden = hits.length <= 1;
    if (nextBtn) nextBtn.hidden = hits.length <= 1;
    if (hits.length > 0) {
      const idx = Math.max(0, Math.min(hits.length - 1, studioState.searchMatchIdx));
      studioState.searchMatchIdx = idx;
      hits[idx].classList.add('is-search-current');
    }
  }

  function jumpSearchMatch(delta) {
    const hits = studioState.searchMatches || [];
    if (!hits.length) return;
    hits[studioState.searchMatchIdx]?.classList.remove('is-search-current');
    studioState.searchMatchIdx = (studioState.searchMatchIdx + delta + hits.length) % hits.length;
    const target = hits[studioState.searchMatchIdx];
    if (target) {
      target.classList.add('is-search-current');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const countEl = document.getElementById('studio-search-count');
    if (countEl) countEl.textContent = `${studioState.searchMatchIdx + 1}/${hits.length}`;
  }

  function openInlineTitleEditor() {
    if (!studioState.item) return;
    const row = document.getElementById('studio-title-row');
    const editWrap = document.getElementById('studio-title-edit-wrap');
    const input = document.getElementById('studio-title-input');
    if (!row || !editWrap || !input) return;
    input.value = studioState.item.title || '';
    row.hidden = true;
    editWrap.hidden = false;
    input.focus();
    input.select();
  }

  function closeInlineTitleEditor() {
    const row = document.getElementById('studio-title-row');
    const editWrap = document.getElementById('studio-title-edit-wrap');
    if (row) row.hidden = false;
    if (editWrap) editWrap.hidden = true;
  }

  async function saveInlineTitle() {
    const item = studioState.item;
    const input = document.getElementById('studio-title-input');
    if (!item?.id || !input) return;
    const nextTitle = input.value.trim();
    if (!nextTitle) {
      showToast('Title cannot be empty.');
      return;
    }
    if (nextTitle === item.title) {
      closeInlineTitleEditor();
      return;
    }
    try {
      const res = await apiFetch(`/api/tracks/shadowing/${encodeURIComponent(item.id)}/title`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle }),
      });
      const updatedTitle = res?.data?.title || nextTitle;
      item.title = updatedTitle;
      const titleEl = document.getElementById('studio-title');
      if (titleEl) titleEl.textContent = updatedTitle;
      document.title = `${updatedTitle} — Flaptap Studio`;
      closeInlineTitleEditor();
      showToast('Lesson title updated');
    } catch (err) {
      showToast(err?.message || 'Could not rename lesson.');
    }
  }

  async function saveRenamedSpeakers(formEl) {
    const item = studioState.item;
    if (!item?.id || !formEl) return;
    const map = {};
    formEl.querySelectorAll('[data-spk-rename-id]').forEach((inp) => {
      const id = inp.getAttribute('data-spk-rename-id');
      const val = inp.value.trim();
      if (id && val) map[id] = val;
    });
    if (!Object.keys(map).length) return;
    try {
      const res = await apiFetch(`/api/tracks/shadowing/${encodeURIComponent(item.id)}/speakers`, {
        method: 'PATCH',
        body: JSON.stringify({ speakers: map }),
      });
      if (res?.data) {
        studioState.item = Object.assign({}, studioState.item, res.data);
      }
      studioState.speakerEditorOpen = false;
      renderSentencesAndParagraphs();
      showToast('Speaker names updated');
    } catch (err) {
      showToast(err?.message || 'Could not rename speakers.');
    }
  }

  function resolveExportViewKey() {
    const sel = document.getElementById('studio-export-view-select');
    const chosen = sel ? sel.value : 'active';
    if (chosen && chosen !== 'active') return chosen;
    if (studioState.mode === 'read') return studioState.readView || 'paragraphs';
    return 'sentences';
  }

  async function exportStructuredTranscript(format) {
    const item = studioState.item;
    if (!item?.id) return;
    const view = resolveExportViewKey();
    const ts = document.getElementById('studio-export-ts')?.checked ? '1' : '0';
    const spk = document.getElementById('studio-export-spk')?.checked ? '1' : '0';
    const url = `/api/tracks/shadowing/${encodeURIComponent(item.id)}/export?view=${encodeURIComponent(view)}&format=${encodeURIComponent(format)}&timestamps=${ts}&speakers=${spk}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: apiHeaders(),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Export failed (${res.status})`);
      }
      const text = await res.text();
      const disp = res.headers.get('Content-Disposition') || '';
      const fnMatch = disp.match(/filename="([^"]+)"/i);
      const filename = fnMatch ? fnMatch[1] : `shadowing-${view}.${format}`;
      const mime = res.headers.get('Content-Type') || 'text/plain;charset=utf-8';
      U.downloadBlob(text, filename, mime);
      closeAllControlPopovers();
      showToast(`Exported ${filename}`);
    } catch (err) {
      showToast(err?.message || 'Export failed.');
    }
  }

  function handleStudioWordInteraction(wordEl, e) {
    if (!wordEl) return false;
    const text = wordEl.dataset.word || wordEl.textContent?.trim() || '';
    const sentIdx = Number(wordEl.dataset.sentIndex) || studioState.activeSentence?.index || 1;
    const startMs = Number(wordEl.dataset.startMs);
    const endMs = Number(wordEl.dataset.endMs);
    const hasTiming = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
    const wordObj = hasTiming
      ? { word: text, sentIndex: sentIdx, startMs, endMs, wordI: Number(wordEl.dataset.wordI || 0) }
      : null;

    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      openWordLookup(text, sentIdx, wordEl);
      return true;
    }
    if (e.shiftKey && hasTiming) {
      e.preventDefault();
      e.stopPropagation();
      playContinuousFrom(startMs / 1000, `From “${text}”`);
      return true;
    }
    if (studioState.wordClickMode === 'word' && wordObj) {
      e.preventDefault();
      e.stopPropagation();
      playWord(wordObj);
      return true;
    }
    if (studioState.wordClickMode === 'from-here' && hasTiming) {
      e.preventDefault();
      e.stopPropagation();
      playContinuousFrom(startMs / 1000, `From “${text}”`);
      return true;
    }
    return false;
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
    window.FlaptapStudioReaderFlow?.hydrate(item);
    window.FlaptapStudioReaderAi?.hydrate(item);
    syncStudioPacingUi(item);
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
      if ((item.sentences || []).length === 0) {
        const loadingBox = document.getElementById('coach-loading-box');
        const errorBox = document.getElementById('coach-error-box');
        const contentBox = document.getElementById('coach-content-box');
        if (loadingBox) loadingBox.hidden = true;
        if (contentBox) contentBox.hidden = true;
        if (errorBox) {
          errorBox.hidden = false;
          const title = document.getElementById('coach-error-title');
          const msg = document.getElementById('coach-error-msg');
          if (title) title.textContent = 'Waiting for Transcript';
          if (msg) msg.textContent = 'Fetch captions or paste a transcript in Shadow mode first to unlock AI Prosody Coach.';
        }
      } else if (item.aiAnalysis) {
        renderCoachAnalysis(item.aiAnalysis);
      } else {
        triggerDynamicCoachAnalysis(false);
      }
    } else if (item.aiAnalysis) {
      // Show the Coach tab count without rendering the panel or fetching vocab.
      syncCoachBadgeFromAnalysis(item.aiAnalysis);
    }

    clearRetryCountdown();
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

  /**
   * Legacy lessons (`balanced` from the old Medium mode, or `full` from the old
   * uncapped Full mode) heal once to the smart `normal` mode on open. The server
   * preserves completion coverage and translations through the regroup.
   */
  async function healLegacyLessonPacing(item) {
    if (!item || item.track !== 'shadowing' || !item.id) return item;
    const stored = String(item.pacingMode || '').trim().toLowerCase();
    if (stored !== 'balanced' && stored !== 'full') return item;
    try {
      const res = await apiFetch(`/api/tracks/shadowing/${encodeURIComponent(item.id)}/pacing`, {
        method: 'PATCH',
        body: JSON.stringify({ pacingMode: 'normal' }),
      });
      if (res?.item) {
        try {
          localStorage.setItem(PACING_STORAGE_KEY, 'normal');
        } catch {}
        return res.item;
      }
    } catch {}
    return item;
  }

  async function loadStudioSession() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const rawUrl = params.get('url');
    const forceExtract = params.get('force') === '1';
    const wantsAutoReview = params.get('autoreview') === '1';
    const initialMode = params.get('mode') || 'shadow';
    const initialView = params.get('view') || null;

    switchStudioMode(initialMode, { readView: initialView, skipUrlSync: true });

    const maybeAutoReview = (loadedItem) => {
      if (!wantsAutoReview || !loadedItem) return;
      try {
        const clean = new URL(window.location.href);
        clean.searchParams.delete('autoreview');
        window.history.replaceState({}, '', clean.toString());
      } catch {}
      if (loadedItem.reviewStatus !== 'ready' && loadedItem.transcriptData) {
        runTranscriptReview({ force: false });
      }
    };

    if (id && studioState.authToken) {
      try {
        const [me, item] = await Promise.all([
          apiFetch('/api/auth/me', { method: 'GET' }),
          apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'GET' }),
          fetchShadowingConfig(),
        ]);
        if (!me?.authenticated || !me?.user) {
          redirectToSignInGate();
          return;
        }
        studioState.user = me.user;
        renderStudioUserProfile(me);
        const healedItem = await healLegacyLessonPacing(item);
        hydrateStudioItem(healedItem);
        maybeAutoReview(healedItem);
      } catch (error) {
        showFatalLoaderError(error);
      }
      return;
    }

    if (rawUrl && studioState.authToken) {
      try {
        const pacingMode = normalizePacingMode(params.get('pacing') || getSavedPacingMode());
        const [me, item] = await Promise.all([
          apiFetch('/api/auth/me', { method: 'GET' }),
          apiFetch('/api/tracks/shadowing/process', {
            method: 'POST',
            body: JSON.stringify({
              url: rawUrl,
              force: forceExtract,
              pacingMode,
            }),
          }),
          fetchShadowingConfig(),
        ]);
        if (!me?.authenticated || !me?.user) {
          redirectToSignInGate();
          return;
        }
        studioState.user = me.user;
        renderStudioUserProfile(me);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('url');
        nextUrl.searchParams.delete('force');
        nextUrl.searchParams.delete('autoreview');
        nextUrl.searchParams.delete('pacing');
        nextUrl.searchParams.set('id', item.id);
        nextUrl.searchParams.set('mode', studioState.mode);
        if (studioState.mode === 'read') {
          nextUrl.searchParams.set('view', studioState.readView || 'paragraphs');
        }
        window.history.replaceState({}, '', nextUrl.toString());

        hydrateStudioItem(item);
        maybeAutoReview(item);
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
        const [item] = await Promise.all([
          apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'GET' }),
          fetchShadowingConfig(),
        ]);
        const healedItem = await healLegacyLessonPacing(item);
        hydrateStudioItem(healedItem);
        maybeAutoReview(healedItem);
      } catch (error) {
        showFatalLoaderError(error);
      }
      return;
    }

    if (rawUrl) {
      try {
        const pacingMode = normalizePacingMode(params.get('pacing') || getSavedPacingMode());
        const [item] = await Promise.all([
          apiFetch('/api/tracks/shadowing/process', {
            method: 'POST',
            body: JSON.stringify({
              url: rawUrl,
              force: forceExtract,
              pacingMode,
            }),
          }),
          fetchShadowingConfig(),
        ]);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('url');
        nextUrl.searchParams.delete('force');
        nextUrl.searchParams.delete('autoreview');
        nextUrl.searchParams.delete('pacing');
        nextUrl.searchParams.set('id', item.id);
        nextUrl.searchParams.set('mode', studioState.mode);
        if (studioState.mode === 'read') {
          nextUrl.searchParams.set('view', studioState.readView || 'paragraphs');
        }
        window.history.replaceState({}, '', nextUrl.toString());

        hydrateStudioItem(item);
        maybeAutoReview(item);
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
      e.target.blur?.();
    });

    document.getElementById('loader-retry-btn')?.addEventListener('click', () => {
      clearRetryCountdown();
      const overlay = document.getElementById('loader-overlay');
      overlay?.classList.remove('loader-error');
      document.getElementById('loader-error-actions').style.display = 'none';
      document.getElementById('loader-headline').textContent = t('preparingLesson');
      const subEl = document.getElementById('loader-subheadline');
      if (subEl) {
        subEl.hidden = true;
        subEl.textContent = t('extractingTimings');
      }
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

    // Resume the media clock instantly after a backgrounded tab (rAF is paused while hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      resetPlaybackClockAnchor(readPlaybackTimeSec());
      if (studioState.isPlaying) startKaraokeRaf();
    });

    // Unified Single-Icon Sentence Flow Cycling (#studio-flow-btn)
    document.getElementById('studio-flow-btn')?.addEventListener('click', () => {
      cycleSentenceFlow();
    });

    // Control Bar Popover Triggers
    SCB_POPOVER_PAIRS.forEach(({ triggerId, popoverId }) => {
      document.getElementById(triggerId)?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleControlPopover(triggerId, popoverId);
      });
    });

    // Compact Transcript Tools Popover
    document.getElementById('studio-tools-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStudioToolsPopover();
    });
    document.getElementById('studio-tools-pop-close')?.addEventListener('click', () => {
      closeStudioToolsPopover();
      document.getElementById('studio-tools-menu-btn')?.focus();
    });
    document.getElementById('studio-tools-popover')?.addEventListener('click', (e) => {
      if (e.target.closest('#studio-copy-view-btn, #studio-single-spk-btn')) {
        closeStudioToolsPopover();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const pop = document.getElementById('studio-tools-popover');
      if (!pop || pop.hidden) return;
      e.preventDefault();
      closeStudioToolsPopover();
      document.getElementById('studio-tools-menu-btn')?.focus();
    });

    document.addEventListener('click', (e) => {
      const clickedInsideAny = SCB_POPOVER_PAIRS.some(({ triggerId, popoverId }) => {
        const pop = document.getElementById(popoverId);
        const trg = document.getElementById(triggerId);
        return (pop && !pop.hidden && pop.contains(e.target)) || (trg && trg.contains(e.target));
      });
      const toolsPop = document.getElementById('studio-tools-popover');
      const toolsBtn = document.getElementById('studio-tools-menu-btn');
      const clickedInsideTools =
        (toolsPop && !toolsPop.hidden && toolsPop.contains(e.target)) ||
        (toolsBtn && toolsBtn.contains(e.target));
      if (!clickedInsideAny) {
        closeAllControlPopovers();
      }
      if (!clickedInsideTools) {
        closeStudioToolsPopover();
      }
    });

    window.addEventListener('resize', () => {
      SCB_POPOVER_PAIRS.forEach(({ triggerId, popoverId }) => {
        const pop = document.getElementById(popoverId);
        const trg = document.getElementById(triggerId);
        if (pop && !pop.hidden && trg && trg.getAttribute('aria-expanded') === 'true') {
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
      navigateSentenceByDelta(-1);
    });

    document.getElementById('deck-next-sent-btn')?.addEventListener('click', () => {
      navigateSentenceByDelta(1);
    });

    document.getElementById('deck-play-active-btn')?.addEventListener('click', () => {
      const curr = getActiveShortcutSentenceIndex() || 1;
      handleSentencePlayButtonClick(curr);
    });

    document.getElementById('deck-replay-sent-btn')?.addEventListener('click', () => {
      replayActiveSentenceFromStart(null, { showFlash: false });
    });

    document.getElementById('deck-seek-back-btn')?.addEventListener('click', () => {
      nudgePlayback(-(studioState.seekStepSec || 2));
    });

    document.getElementById('deck-seek-fwd-btn')?.addEventListener('click', () => {
      nudgePlayback(studioState.seekStepSec || 2);
    });

    document.getElementById('seek-step-select')?.addEventListener('change', (e) => {
      setStudioSeekStep(e.target.value);
      e.target.blur?.();
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

    // Shadow Mode Sentence Interactions (Check Complete, Play/Pause, Translate, Drag-Select Text, Full-Card Click & Dblclick)
    // Shadow Mode Sentence Interactions (Check Complete, Translate, Play from Start, Play/Pause, Click Word, Click Header/Card)
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

      const replayBtn = e.target.closest('[data-replay-sent]');
      if (replayBtn) {
        e.stopPropagation();
        const idx = Number(replayBtn.dataset.replaySent);
        handleSentenceReplayFromStartClick(idx);
        return;
      }

      const playBtn = e.target.closest('[data-play-sent]');
      if (playBtn) {
        e.stopPropagation();
        const idx = Number(playBtn.dataset.playSent);
        handleSentencePlayButtonClick(idx);
        return;
      }

      if (e.target.closest('.clickable-word, .sent-english-line, .sentence-translation-box')) {
        return;
      }

      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel.toString() || '').trim().length > 0) {
        return;
      }

      // Clicking card header/frame (outside words, buttons, and translation text) plays/pauses
      const card = e.target.closest('.sentence-driller-card[data-sentence-index]');
      if (card) {
        const sentIdx = Number(card.dataset.sentenceIndex);
        if (Number.isFinite(sentIdx)) {
          handleSentencePlayButtonClick(sentIdx);
        }
      }
    });

    // Read Mode Paragraph Interactions (Bookmark, Check Complete, Play Paragraph, Word Click, Click Sentence)
    document.getElementById('subview-chunks-list')?.addEventListener('click', (e) => {
      const bmBtn = e.target.closest('[data-bookmark-sent]');
      if (bmBtn) {
        e.stopPropagation();
        const sentEl = bmBtn.closest('.reader-flow-sent');
        window.FlaptapStudioReaderFlow?.setBookmark(
          {
            sentenceIndex: Number(bmBtn.getAttribute('data-bookmark-sent')),
            startMs: Number(bmBtn.getAttribute('data-bookmark-ms') || 0),
            view: bmBtn.getAttribute('data-bookmark-view') || 'reviewed',
            excerpt: sentEl?.textContent || '',
          },
          studioState.item,
        );
        return;
      }

      const checkBtn = e.target.closest('[data-studio-check-subject]');
      if (checkBtn) {
        e.stopPropagation();
        toggleStudioItemCompletion(
          checkBtn.getAttribute('data-studio-check-subject'),
          Number(checkBtn.getAttribute('data-studio-check-index')),
        );
        return;
      }

      const rangeBtn = e.target.closest('[data-play-range-start]');
      if (rangeBtn) {
        e.stopPropagation();
        handleRangePlayButtonClick(rangeBtn);
        return;
      }

      const wordEl = e.target.closest('.studio-word');
      if (wordEl) {
        if (handleStudioWordInteraction(wordEl, e)) return;
        return; // Let FlaptapWordLookup show the selection action bar on single-word click
      }

      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel.toString() || '').trim().length > 0) return;

      const sentSpan = e.target.closest('.read-sentence[data-read-sent]');
      if (sentSpan) {
        const sMs = Number(sentSpan.getAttribute('data-start-ms'));
        const eMs = Number(sentSpan.getAttribute('data-end-ms'));
        if (Number.isFinite(sMs) && Number.isFinite(eMs) && eMs > sMs && studioState.ytPlayer) {
          playRange(sMs / 1000, eMs / 1000, {
            mode: 'range',
            label: `Line #${sentSpan.getAttribute('data-canon-index') || sentSpan.dataset.readSent}`,
            sentIndex: Number(sentSpan.dataset.readSent),
          });
        } else {
          playSentence(Number(sentSpan.dataset.readSent));
        }
      }
    });

    // Structured Read Views (Ideas, Speakers, Raw Original) + Shadow Timed Words & Repair Badges
    const transcriptPanels = [
      'subview-sentences-list',
      'subview-chunks-list',
      'subview-ideas-list',
      'subview-speakers-list',
      'subview-raw-list',
    ];
    transcriptPanels.forEach((panelId) => {
      const el = document.getElementById(panelId);
      if (!el) return;

      el.addEventListener('click', (e) => {
        const bmBtn = e.target.closest('[data-bookmark-sent]');
        if (bmBtn && panelId !== 'subview-chunks-list') {
          e.stopPropagation();
          const sentEl = bmBtn.closest('.reader-flow-sent');
          window.FlaptapStudioReaderFlow?.setBookmark(
            {
              sentenceIndex: Number(bmBtn.getAttribute('data-bookmark-sent')),
              startMs: Number(bmBtn.getAttribute('data-bookmark-ms') || 0),
              view: bmBtn.getAttribute('data-bookmark-view') || 'raw',
              excerpt: sentEl?.textContent || '',
            },
            studioState.item,
          );
          return;
        }

        const infoBtn = e.target.closest('[data-info-kind]');
        if (infoBtn) {
          e.stopPropagation();
          showInfoPopover(
            infoBtn.getAttribute('data-info-kind'),
            Number(infoBtn.getAttribute('data-sent-idx') || 0),
            infoBtn,
            { pinned: true },
          );
          return;
        }

        const reviewBtn = e.target.closest('[data-trigger-ai-review]');
        if (reviewBtn) {
          e.stopPropagation();
          runTranscriptReview({ force: false });
          return;
        }

        if (panelId !== 'subview-sentences-list' && panelId !== 'subview-chunks-list') {
          const playSentBtn = e.target.closest('[data-play-sent]');
          if (playSentBtn) {
            e.stopPropagation();
            handleSentencePlayButtonClick(Number(playSentBtn.dataset.playSent));
            return;
          }
          const rangeBtn = e.target.closest('[data-play-range-start]');
          if (rangeBtn) {
            e.stopPropagation();
            handleRangePlayButtonClick(rangeBtn);
            return;
          }
        }

        if (panelId !== 'subview-chunks-list') {
          const wordEl = e.target.closest('.studio-word');
          if (wordEl && handleStudioWordInteraction(wordEl, e)) return;
        }
      });

      el.addEventListener('contextmenu', (e) => {
        const wordEl = e.target.closest('.studio-word');
        if (!wordEl) return;
        e.preventDefault();
        const text = wordEl.dataset.word || wordEl.textContent?.trim() || '';
        const sentIdx = Number(wordEl.dataset.sentIndex) || studioState.activeSentence?.index || 1;
        if (text) openWordLookup(text, sentIdx, wordEl);
      });

      el.addEventListener('mouseover', (e) => {
        if (studioState.infoPopoverPinned) return;
        const infoBtn = e.target.closest('[data-info-kind]');
        if (infoBtn) {
          showInfoPopover(
            infoBtn.getAttribute('data-info-kind'),
            Number(infoBtn.getAttribute('data-sent-idx') || 0),
            infoBtn,
          );
          return;
        }
        const repWord = e.target.closest('.studio-word.is-repaired');
        if (repWord && repWord.dataset.repairedFrom) {
          showInfoPopover('word-repair', Number(repWord.dataset.sentIndex || 0), repWord, {
            wordObj: { word: repWord.dataset.word || repWord.textContent, repairedFrom: repWord.dataset.repairedFrom },
          });
        }
      });

      el.addEventListener('mouseout', (e) => {
        if (studioState.infoPopoverPinned) return;
        if (e.target.closest('[data-info-kind], .studio-word.is-repaired')) {
          hideInfoPopover(false);
        }
      });
    });

    // Read Sub-View Switcher (Paragraphs | Ideas | Speakers | Raw Original)
    document.querySelectorAll('[data-read-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchReadView(btn.getAttribute('data-read-view') || 'paragraphs');
      });
    });

    // Word Click Mode & Word Cushion Controls
    setWordClickMode(studioState.wordClickMode);
    setWordCushion(studioState.wordCushion);
    document.querySelectorAll('[data-word-click-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setWordClickMode(btn.getAttribute('data-word-click-mode')));
    });
    document.querySelectorAll('[data-word-cushion]').forEach((btn) => {
      btn.addEventListener('click', () => setWordCushion(btn.getAttribute('data-word-cushion')));
    });

    // Real-time Shadowing Pacing Switcher (Short | Full)
    const studioPacingGroup = document.getElementById('studio-pacing-group');
    studioPacingGroup?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pacing]');
      if (!btn) return;
      switchStudioPacing(btn.dataset.pacing);
    });
    studioPacingGroup?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const pills = Array.from(studioPacingGroup.querySelectorAll('[data-pacing]'));
      if (!pills.length) return;
      const idx = pills.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = document.documentElement.getAttribute('dir') === 'rtl' ? -1 : 1;
      const delta = (e.key === 'ArrowRight' ? 1 : -1) * dir;
      const nextPill = pills[(idx + delta + pills.length) % pills.length];
      if (nextPill) {
        nextPill.focus();
        switchStudioPacing(nextPill.dataset.pacing);
      }
    });

    const karaokeBtn = document.getElementById('studio-toggle-karaoke');
    const syncKaraokeBtn = () => {
      if (!karaokeBtn) return;
      karaokeBtn.classList.toggle('active', studioState.karaokeEnabled);
      karaokeBtn.setAttribute('aria-pressed', studioState.karaokeEnabled ? 'true' : 'false');
      karaokeBtn.title = t(studioState.karaokeEnabled ? 'highlightOnTitle' : 'highlightOffTitle');
      karaokeBtn.setAttribute('aria-label', 'Live word highlight');
    };
    syncKaraokeBtn();
    karaokeBtn?.addEventListener('click', () => {
      studioState.karaokeEnabled = !studioState.karaokeEnabled;
      localStorage.setItem('flaptap_karaoke', studioState.karaokeEnabled ? 'on' : 'off');
      if (!studioState.karaokeEnabled) clearActiveKaraokeWord();
      syncKaraokeBtn();
      showToast(t(studioState.karaokeEnabled ? 'highlightOnToast' : 'highlightOffToast'));
    });

    document.getElementById('studio-toggle-repairs')?.addEventListener('click', () => {
      studioState.showRepairs = !studioState.showRepairs;
      renderSentencesAndParagraphs();
    });

    document.getElementById('studio-copy-view-btn')?.addEventListener('click', async () => {
      const TT = window.FlaptapStudioTranscriptTools;
      if (!TT || !studioState.item) return;
      const text = TT.buildActiveViewPlainText(studioState.item, studioState.mode, studioState.readView);
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied active view to clipboard');
      } catch {
        showToast('Copy failed — please allow clipboard access.');
      }
    });

    document.getElementById('studio-define-word-btn')?.addEventListener('click', () => {
      const w = studioState.selectedTimedWord;
      if (!w) return;
      openWordLookup(w.word, w.sentIndex, document.getElementById('studio-define-word-btn'));
    });

    document.getElementById('studio-video-toggle-btn')?.addEventListener('click', () => toggleVideoVisibility());
    document.getElementById('studio-ask-ai-btn')?.addEventListener('click', () => {
      window.FlaptapStudioReaderAi?.toggle();
    });
    document.getElementById('reader-bookmark-resume-btn')?.addEventListener('click', () => {
      window.FlaptapStudioReaderFlow?.jumpToBookmark();
    });
    document.getElementById('reader-bookmark-clear-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.FlaptapStudioReaderFlow?.setBookmark(null, studioState.item);
    });

    window.FlaptapStudioReaderFlow?.configure({
      apiFetch,
      showToast,
      switchReadView,
    });
    window.FlaptapStudioReaderAi?.configure({
      apiFetch,
      apiHeaders,
      showToast,
      playRange,
      speakText: window.FlaptapWordLookup?.speakText,
    });
    window.FlaptapStudioReaderAi?.bindDomEvents();
    document.getElementById('studio-skip-pause-btn')?.addEventListener('click', () => {
      const fn = studioState.shadowPauseResumeFn;
      cancelShadowPause();
      if (typeof fn === 'function') fn();
    });

    // Inline Title Rename
    document.getElementById('studio-rename-btn')?.addEventListener('click', openInlineTitleEditor);
    document.getElementById('studio-title-cancel-btn')?.addEventListener('click', closeInlineTitleEditor);
    document.getElementById('studio-title-save-btn')?.addEventListener('click', saveInlineTitle);
    document.getElementById('studio-title-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveInlineTitle();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeInlineTitleEditor();
      }
    });

    // Speaker Filter & Persistent Inline Speaker Rename
    document.getElementById('studio-single-spk-btn')?.addEventListener('click', () => {
      studioState.speakerEditorOpen = !studioState.speakerEditorOpen;
      renderSpeakerBar();
    });

    document.getElementById('studio-speaker-bar')?.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('[data-spk-filter]');
      if (filterBtn) {
        studioState.speakerFilter = filterBtn.getAttribute('data-spk-filter') || 'all';
        renderSentencesAndParagraphs();
        return;
      }
      if (e.target.closest('#studio-spk-rename-toggle')) {
        studioState.speakerEditorOpen = !studioState.speakerEditorOpen;
        renderSpeakerBar();
        return;
      }
      if (e.target.closest('#studio-spk-rename-cancel')) {
        studioState.speakerEditorOpen = false;
        renderSpeakerBar();
      }
    });

    document.getElementById('studio-speaker-bar')?.addEventListener('submit', (e) => {
      const form = e.target.closest('#studio-speaker-rename-form');
      if (!form) return;
      e.preventDefault();
      saveRenamedSpeakers(form);
    });

    // Unified Studio Enhancements Checklist & Cancel
    document.getElementById('studio-enhance-list')?.addEventListener('change', (e) => {
      if (e.target.closest('.studio-enhance-check')) {
        syncEnhancementsPopoverUi();
      }
    });
    document.getElementById('studio-enhance-model-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = document.getElementById('studio-review-ai-mount');
      if (!wrap) return;
      const open = wrap.hidden;
      wrap.hidden = !open;
      e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) ensureStudioReviewAiSelector();
    });
    document.getElementById('studio-enhance-paste-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const box = document.getElementById('studio-enhance-paste-box');
      if (!box) return;
      const open = box.hidden;
      box.hidden = !open;
      e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) document.getElementById('studio-enhance-paste-input')?.focus();
    });
    document.getElementById('studio-enhance-paste-cancel')?.addEventListener('click', () => {
      const box = document.getElementById('studio-enhance-paste-box');
      if (box) box.hidden = true;
    });
    document.getElementById('studio-enhance-paste-apply')?.addEventListener('click', () => {
      const inp = document.getElementById('studio-enhance-paste-input');
      if (inp) void importLessonTranscript(inp.value);
    });
    document.getElementById('studio-run-enhancements-btn')?.addEventListener('click', () => {
      void runSelectedEnhancements();
    });
    document.getElementById('studio-cancel-enhancements-btn')?.addEventListener('click', () => {
      studioState.reviewAbort?.abort?.();
    });
    document.getElementById('studio-review-cancel-btn')?.addEventListener('click', () => {
      studioState.reviewAbort?.abort?.();
    });

    // Pending-Captions Instant Empty Card Actions inside #subview-sentences-list
    document.getElementById('subview-sentences-list')?.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-pending-action]');
      if (!actionBtn) return;
      const act = actionBtn.getAttribute('data-pending-action');
      if (act === 'retry-captions') {
        void retryLessonCaptions();
      } else if (act === 'toggle-paste') {
        const wrap = document.getElementById('studio-pending-paste-wrap');
        if (wrap) {
          wrap.hidden = !wrap.hidden;
          if (!wrap.hidden) document.getElementById('studio-pending-paste-input')?.focus();
        }
      } else if (act === 'apply-paste') {
        const inp = document.getElementById('studio-pending-paste-input');
        if (inp) void importLessonTranscript(inp.value);
      } else if (act === 'transcribe') {
        void runExplicitTranscription({ allowLocalWhisper: false });
      }
    });

    // Unified 7-Format Export Popover Actions
    document.querySelectorAll('[data-export-fmt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        exportStructuredTranscript(btn.getAttribute('data-export-fmt') || 'txt');
      });
    });
    document.getElementById('studio-export-copy-btn')?.addEventListener('click', async () => {
      const TT = window.FlaptapStudioTranscriptTools;
      if (!TT || !studioState.item) return;
      const view = resolveExportViewKey();
      const text = TT.buildActiveViewPlainText(
        studioState.item,
        view === 'sentences' ? 'shadow' : 'read',
        view === 'sentences' ? 'paragraphs' : view,
      );
      try {
        await navigator.clipboard.writeText(text);
        closeAllControlPopovers();
        showToast('Copied transcript to clipboard');
      } catch {
        showToast('Copy failed.');
      }
    });

    // Live In-Transcript Search
    const searchInput = document.getElementById('studio-search-input');
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value || '';
      if (MC && modeState) MC.setSearchQuery(modeState, studioState.mode, q);
      studioState.searchQuery = q;
      studioState.searchMatchIdx = 0;
      syncSearchMatchesDom();
      if (studioState.searchMatches.length > 0) {
        studioState.searchMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        jumpSearchMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        searchInput.value = '';
        if (MC && modeState) MC.setSearchQuery(modeState, studioState.mode, '');
        studioState.searchQuery = '';
        syncSearchMatchesDom();
        searchInput.blur();
      }
    });
    document.getElementById('studio-search-prev')?.addEventListener('click', () => jumpSearchMatch(-1));
    document.getElementById('studio-search-next')?.addEventListener('click', () => jumpSearchMatch(1));
    document.getElementById('studio-search-clear')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (MC && modeState) MC.setSearchQuery(modeState, studioState.mode, '');
      studioState.searchQuery = '';
      syncSearchMatchesDom();
    });

    // Interactive Scrubbable Millisecond Timeline Bar
    const scrubTrack = document.getElementById('studio-scrub-track');
    const scrubTooltip = document.getElementById('studio-scrub-tooltip');
    if (scrubTrack) {
      const getTotalDurSec = () => {
        const pDur = Number(studioState.ytPlayer?.getDuration?.() || 0);
        return pDur > 0 ? pDur : Number(studioState.item?.durationSeconds || 0);
      };
      const ratioFromEvent = (e) => {
        const rect = scrubTrack.getBoundingClientRect();
        if (!rect.width) return 0;
        return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      };
      const seekToRatio = (ratio) => {
        const dur = getTotalDurSec();
        if (!dur) return;
        const sec = ratio * dur;
        const fill = document.getElementById('studio-scrub-fill');
        const thumb = document.getElementById('studio-scrub-thumb');
        if (fill) fill.style.width = `${(ratio * 100).toFixed(2)}%`;
        if (thumb) thumb.style.left = `${(ratio * 100).toFixed(2)}%`;
        updateTimelineAndKaraoke(sec);
        if (studioState.ytPlayer && typeof studioState.ytPlayer.seekTo === 'function') {
          studioState.lastSeekTime = Date.now();
          studioState.ytPlayer.seekTo(sec, true);
        }
      };

      scrubTrack.addEventListener('pointerdown', (e) => {
        studioState.scrubbing = true;
        try { scrubTrack.setPointerCapture(e.pointerId); } catch {}
        seekToRatio(ratioFromEvent(e));
      });
      scrubTrack.addEventListener('pointermove', (e) => {
        const ratio = ratioFromEvent(e);
        const dur = getTotalDurSec();
        if (scrubTooltip && dur > 0 && window.FlaptapStudioTranscriptTools) {
          scrubTooltip.hidden = false;
          scrubTooltip.textContent = window.FlaptapStudioTranscriptTools.formatClockMs(ratio * dur * 1000);
          scrubTooltip.style.left = `${(ratio * 100).toFixed(1)}%`;
        }
        if (studioState.scrubbing) {
          seekToRatio(ratio);
        }
      });
      const endScrub = (e) => {
        if (!studioState.scrubbing) return;
        studioState.scrubbing = false;
        try { scrubTrack.releasePointerCapture(e.pointerId); } catch {}
      };
      scrubTrack.addEventListener('pointerup', endScrub);
      scrubTrack.addEventListener('pointercancel', endScrub);
      scrubTrack.addEventListener('pointerleave', () => {
        if (!studioState.scrubbing && scrubTooltip) scrubTooltip.hidden = true;
      });
    }

    // Dismiss pinned Repair/Overlap info popover on outside click
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('studio-info-popover');
      if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-info-kind]')) {
        hideInfoPopover(true);
      }
    });

    // Outside click dismissal handled centrally by FlaptapWordLookup

    // Translation Console in Side Deck
    document.getElementById('trans-lang-select')?.addEventListener('change', (e) => {
      studioState.translationLang = e.target.value || 'none';
      localStorage.setItem('flaptap_trans_lang', studioState.translationLang);
      syncTranslationUiState();
      e.target.blur?.();
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
      if (e.code === 'Enter' || e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        if (e.shiftKey) {
          replayActiveSentenceFromStart(studioState.dictationIndex, { showFlash: true });
        } else {
          checkDictationAnswers(false);
        }
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
          playSentence(idx, { forceMode: 'once' });
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

    // Select text in every Studio learning mode for Play (ms-exact), Ask AI, Translate, Bookmark, Copy.
    const bindStudioSelectionLookup = (container, sentenceSelector) => {
      if (!container || !window.FlaptapWordLookup?.bindSelectionLookup) return;
      const resolveMeta = (text, range, sourceEl) => {
        const node = range?.startContainer;
        const element = node?.nodeType === 1 ? node : node?.parentElement;
        const word = element?.closest?.('.clickable-word');
        const sentence = element?.closest?.(sentenceSelector);
        const fallbackIdx =
          Number(word?.dataset?.sentIndex) ||
          Number(sentence?.dataset?.sentenceIndex) ||
          Number(sentence?.dataset?.readSent) ||
          Number(sentence?.dataset?.canonIndex) ||
          studioState.activeSentence?.index ||
          studioState.item?.sentences?.[0]?.index ||
          1;
        const timing = window.FlaptapStudioReaderFlow?.resolveSelectionTimeRange?.(range, fallbackIdx) || null;
        return {
          text,
          range,
          sourceEl: sourceEl || null,
          sentenceIndex: timing?.sentenceIndex || fallbackIdx,
          startMs: timing?.startMs,
          endMs: timing?.endMs,
          speaker: timing?.speaker || sentence?.getAttribute?.('data-speaker') || '',
          view: timing?.view || (container.id === 'subview-raw-list' ? 'raw' : 'reviewed'),
        };
      };

      window.FlaptapWordLookup.bindSelectionLookup(container, {
        maxLength: 1500,
        actions: ({ text, range }) => {
          const preview = text.length > 24 ? `${text.slice(0, 23)}…` : text;
          const timing = window.FlaptapStudioReaderFlow?.resolveSelectionTimeRange?.(range) || null;
          const hasAudioTiming = Boolean(
            timing && Number.isFinite(timing.startMs) && Number.isFinite(timing.endMs) && timing.endMs > timing.startMs,
          );
          const isReadSurface =
            container.id === 'subview-chunks-list' || container.id === 'subview-raw-list';

          const list = [
            {
              id: 'play-selection',
              label: 'Play',
              title: hasAudioTiming ? 'Hear speaker pronounce this exact excerpt' : 'Speak excerpt aloud',
              icon: 'play',
              emphasis: 'accent',
              run: ({ text: selText, range: selRange }) => {
                const m = resolveMeta(selText, selRange, null);
                if (
                  Number.isFinite(m.startMs) &&
                  Number.isFinite(m.endMs) &&
                  m.endMs > m.startMs &&
                  studioState.ytPlayer
                ) {
                  const exact = studioState.wordCushion === 'exact';
                  const startSec = Math.max(0, (m.startMs - (exact ? 0 : 25)) / 1000);
                  const endSec = Math.max(startSec + 0.12, (m.endMs + (exact ? 0 : 75)) / 1000);
                  playRange(startSec, endSec, {
                    mode: 'range',
                    label: preview,
                    sentIndex: m.sentenceIndex,
                  });
                } else {
                  window.FlaptapWordLookup?.speakText?.(selText);
                }
              },
            },
            {
              id: 'ask-ai',
              label: 'Ask AI',
              title: 'Ask AI Companion (voice or text) with full transcript context',
              icon: 'sparkles',
              run: ({ text: selText, range: selRange }) => {
                const m = resolveMeta(selText, selRange, null);
                window.FlaptapStudioReaderAi?.openWithSelection({
                  text: selText,
                  startMs: m.startMs,
                  endMs: m.endMs,
                  sentenceIndex: m.sentenceIndex,
                  speaker: m.speaker,
                  view: m.view,
                });
              },
            },
            {
              id: 'translate',
              label: 'Translate',
              title: 'Quick contextual definition & translation',
              icon: 'languages',
              emphasis: 'subtle',
              run: ({ text: selText, range: selRange, sourceEl }) => {
                const m = resolveMeta(selText, selRange, sourceEl);
                openWordLookup(selText, m.sentenceIndex, sourceEl || null);
              },
            },
          ];

          if (isReadSurface) {
            list.push({
              id: 'bookmark-selection',
              label: 'Bookmark',
              title: 'Mark reading position ("where I left off") here',
              icon: 'bookmark',
              variant: 'secondary',
              iconOnly: true,
              run: ({ text: selText, range: selRange }) => {
                const m = resolveMeta(selText, selRange, null);
                window.FlaptapStudioReaderFlow?.setBookmark(
                  {
                    sentenceIndex: m.sentenceIndex,
                    startMs: m.startMs || 0,
                    view: m.view === 'raw' ? 'raw' : 'reviewed',
                    excerpt: selText,
                  },
                  studioState.item,
                );
              },
            });
          }

          list.push({
            id: 'copy-selection',
            label: 'Copy',
            title: 'Copy selected text',
            icon: 'copy',
            variant: 'secondary',
            iconOnly: true,
            run: ({ text: selText }) => {
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(selText).then(() => showToast('Copied selection')).catch(() => {});
              }
            },
          });

          return list;
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
    bindStudioSelectionLookup(
      document.getElementById('subview-ideas-list'),
      '.studio-idea-sent-row[data-sentence-index]',
    );
    bindStudioSelectionLookup(
      document.getElementById('subview-speakers-list'),
      '.studio-turn-card[data-turn-index]',
    );
    bindStudioSelectionLookup(
      document.getElementById('subview-raw-list'),
      '.read-sentence[data-canon-index], .studio-raw-row[data-raw-index]',
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
          openWordLookup(text, sentenceIndex, meta?.sourceEl || null);
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
      const lessonId = studioState.item?.id;
      if (!lessonId || !window.FlaptapConfirm?.confirmAction) return;

      closeAllControlPopovers();
      const isAr = studioState.uiLang === 'ar';
      btn.disabled = true;
      await window.FlaptapConfirm.confirmAction({
        title: isAr ? 'إعادة ضبط تقدّم الدرس؟' : 'Reset lesson progress?',
        message: isAr
          ? 'سيتم مسح علامات إكمال الجمل والتمارين لهذا الدرس.'
          : 'Completed checkmarks and drill progress for this lesson will be reset.',
        detail: studioState.item?.title || '',
        confirmLabel: isAr ? 'إعادة الضبط' : 'Reset Progress',
        cancelLabel: isAr ? 'إلغاء' : 'Cancel',
        tone: 'primary',
        checkboxes: [
          {
            id: 'clearNotes',
            label: isAr ? 'حذف ملاحظات الدراسة أيضاً' : 'Also clear personal study notes',
            checked: false,
          },
        ],
        onConfirm: async (opts) => {
          const clearNotes = Boolean(opts?.clearNotes);
          await apiFetch(`/api/history/${encodeURIComponent(lessonId)}/reset-progress`, {
            method: 'POST',
            body: JSON.stringify({ clearNotes }),
          });
          studioState.item.completionProgress = {};
          studioState.item.isCompleted = false;
          studioState.item.completedDrills = 0;
          if (clearNotes) {
            studioState.item.studyNotes = '';
            try {
              localStorage.removeItem(`notes_${lessonId}`);
            } catch {}
            const notesArea = document.getElementById('study-notes-textarea');
            if (notesArea) notesArea.value = '';
          }
          renderSentencesAndParagraphs();
          renderDictationCard();
          if (studioState.item.aiAnalysis) {
            renderCoachAnalysis(studioState.item.aiAnalysis);
          }
          refreshAllStudioProgressBars();
          showToast(isAr ? 'تمت إعادة ضبط التقدّم' : 'Lesson progress reset');
        },
        onError: (err) => {
          showToast(err?.message || 'Could not reset progress.');
        },
      });
      btn.disabled = false;
    });

    document.getElementById('sp-clear-cache-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const lessonId = studioState.item?.id;
      if (!lessonId || !window.FlaptapConfirm?.confirmAction) return;

      closeAllControlPopovers();
      const isAr = studioState.uiLang === 'ar';
      btn.disabled = true;
      await window.FlaptapConfirm.confirmAction({
        title: isAr ? 'مسح ذاكرة الدرس المؤقتة؟' : 'Clear lesson caches?',
        message: isAr
          ? 'سيتم مسح تحليلات المدرب، الترجمات، المراجعة بالذكاء الاصطناعي، وكاش النص لإعادة التوليد من جديد.'
          : 'Clears AI Coach, cached translations, AI Verbatim Review, and disk transcript cache so you can regenerate fresh.',
        detail: studioState.item?.title || '',
        impactItems: [
          { label: isAr ? 'تحليل المدرب' : 'AI Coach' },
          { label: isAr ? 'الترجمات' : 'Translations' },
          { label: isAr ? 'كاش النص' : 'Transcript cache' },
        ],
        confirmLabel: isAr ? 'مسح الكاش' : 'Clear Caches',
        cancelLabel: isAr ? 'إلغاء' : 'Cancel',
        tone: 'warning',
        onConfirm: async () => {
          await apiFetch(`/api/history/${encodeURIComponent(lessonId)}/cache/clear`, {
            method: 'POST',
            body: JSON.stringify({ scope: 'all' }),
          });
          window.FlaptapWordLookup?.clearCache?.();
          studioState.translationsByLang = {};
          studioState.coachGlosses = {};
          showToast(isAr ? 'تم مسح كاش الدرس' : 'Lesson caches cleared');
          await loadStudioSession();
        },
        onError: (err) => {
          showToast(err?.message || 'Could not clear lesson caches.');
        },
      });
      btn.disabled = false;
    });

    document.getElementById('sp-delete-lesson-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const lessonId = studioState.item?.id;
      if (!lessonId || !window.FlaptapConfirm?.confirmAction) return;

      closeAllControlPopovers();
      const isAr = studioState.uiLang === 'ar';
      btn.disabled = true;
      await window.FlaptapConfirm.confirmAction({
        title: isAr ? 'حذف الدرس نهائياً؟' : 'Delete lesson permanently?',
        message: isAr
          ? 'سيتم حذف الدرس وجميع ملفات الكاش والتقدم والملاحظات بالكامل حتى يبدأ الرابط كأنه جديد تماماً.'
          : 'Removes this lesson, transcript & media caches, AI Coach, translations, study notes, and progress completely.',
        detail: studioState.item?.title || '',
        impactItems: [
          { label: isAr ? 'الدرس والتقدم' : 'Lesson & progress' },
          { label: isAr ? 'كاش النص والوسائط' : 'Transcript & media cache' },
          { label: isAr ? 'الملاحظات والترجمات' : 'Notes & translations' },
        ],
        confirmLabel: isAr ? 'حذف نهائي' : 'Delete Permanently',
        cancelLabel: isAr ? 'إلغاء' : 'Cancel',
        tone: 'danger',
        checkboxes: [
          {
            id: 'removeLinkedVocab',
            label: isAr ? 'حذف المفردات المرتبطة بهذا الدرس أيضاً' : 'Also delete Vocabulary words saved from this lesson',
            checked: false,
          },
          {
            id: 'cascadeLinkedNotes',
            label: isAr ? 'حذف أدلة استخراج العبارات المرتبطة أيضاً' : 'Also delete linked Phrase Miner study guides',
            checked: false,
          },
        ],
        onConfirm: async (opts) => {
          await apiFetch(`/api/lifecycle/purge/lesson/${encodeURIComponent(lessonId)}`, {
            method: 'POST',
            body: JSON.stringify({
              removeLinkedVocab: Boolean(opts?.removeLinkedVocab),
              cascadeLinkedNotes: Boolean(opts?.cascadeLinkedNotes),
            }),
          });
          try {
            localStorage.removeItem(`notes_${lessonId}`);
          } catch {}
          window.FlaptapWordLookup?.clearCache?.();
          window.location.href = '/';
        },
        onError: (err) => {
          showToast(err?.message || 'Could not delete lesson.');
        },
      });
      btn.disabled = false;
    });

    // Cross-Feature Sync: Jump to existing Anything to Phrases guide or pre-load this lesson on demand
    document.getElementById('studio-extract-phrases-btn')?.addEventListener('click', async () => {
      if (!studioState.item?.id) return;
      const btn = document.getElementById('studio-extract-phrases-btn');
      if (btn) btn.disabled = true;
      try {
        const res = await apiFetch(
          `/api/sources/resolve-links?lessonId=${encodeURIComponent(studioState.item.id)}${
            studioState.item.sourceUrl ? `&url=${encodeURIComponent(studioState.item.sourceUrl)}` : ''
          }`,
          { method: 'GET' },
        );
        const existingGuide = Array.isArray(res?.extractorNotes) ? res.extractorNotes[0] : null;
        if (existingGuide?.id) {
          window.location.href = `/extractor/library/${encodeURIComponent(existingGuide.id)}`;
          return;
        }
      } catch {
        // Fall through to on-demand Extract pre-selection
      } finally {
        if (btn) btn.disabled = false;
      }
      window.location.href = `/extractor?lessonId=${encodeURIComponent(studioState.item.id)}`;
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

    // Reclaim focus from YouTube iframe without ever stealing OS focus from another app/tab
    const videoStageEl = document.getElementById('video-stage-container');
    if (videoStageEl) {
      videoStageEl.addEventListener(
        'mousemove',
        (e) => {
          const rect = videoStageEl.getBoundingClientRect();
          pointerInYtControlStrip = e.clientY >= rect.bottom - 56;
        },
        { passive: true },
      );
      videoStageEl.addEventListener(
        'mouseleave',
        () => {
          pointerInYtControlStrip = false;
          reclaimFocusFromPlayerIframe();
        },
        { passive: true },
      );
    }

    window.addEventListener('blur', () => {
      window.clearTimeout(iframeFocusReclaimTimer);
      iframeFocusReclaimTimer = window.setTimeout(() => {
        if (!pointerInYtControlStrip && isPlayerIframeElement(document.activeElement)) {
          reclaimFocusFromPlayerIframe();
        }
      }, 180);
    });

    /* ========================================================================
       STUDIO KEYBOARD SHORTCUT ENGINE (Layout-Independent e.code · Zero-Mouse)
       ======================================================================== */

    const TEXT_INPUT_TYPES = new Set([
      '',
      'text',
      'search',
      'email',
      'password',
      'url',
      'tel',
      'number',
      'date',
      'datetime-local',
      'month',
      'time',
      'week',
    ]);

    function isTextEntryElement(el) {
      if (!el || el === document.body || el === document.documentElement) return false;
      if (el.isContentEditable) return true;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'select') return true;
      if (tag === 'input') {
        const type = String(el.type || 'text').toLowerCase();
        return TEXT_INPUT_TYPES.has(type);
      }
      return false;
    }

    function isConfirmDialogOpen() {
      return document.documentElement.classList.contains('ft-confirm-open');
    }

    function handleStudioKeydown(e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (isConfirmDialogOpen()) return;

      const code = e.code || '';
      const key = e.key || '';

      // 1. Escape: close AI drawer or popovers first, otherwise exit focused text input/select
      if (code === 'Escape' || key === 'Escape') {
        if (window.FlaptapStudioReaderAi?.isOpen?.()) {
          e.preventDefault();
          window.FlaptapStudioReaderAi.close();
          return;
        }
        const hasOpenCtrlPopover = SCB_POPOVER_PAIRS.some(({ popoverId }) => {
          const p = document.getElementById(popoverId);
          return p && !p.hidden;
        });
        if (hasOpenCtrlPopover) {
          e.preventDefault();
          closeAllControlPopovers();
          return;
        }
        const wordPop = document.getElementById('word-lookup-popover');
        if (wordPop && !wordPop.hidden) {
          e.preventDefault();
          closeWordLookupPopover();
          return;
        }
        if (isTextEntryElement(e.target)) {
          e.preventDefault();
          e.target.blur?.();
        }
        return;
      }

      // Never intercept typing inside text fields, textareas, contentEditable, or open <select>
      if (isTextEntryElement(e.target)) {
        return;
      }

      // Never intercept native OS / browser shortcuts (Cmd/Meta, Ctrl, Alt)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // 2. Help Sheet toggle (`?` = Shift + Slash) — works even before sentences load
      if ((code === 'Slash' && e.shiftKey) || key === '?') {
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const topbarBtn = document.getElementById('studio-shortcuts-btn');
        const hasVisibleTopbarBtn =
          topbarBtn && topbarBtn.getBoundingClientRect().width > 0;
        toggleControlPopover(
          hasVisibleTopbarBtn ? 'studio-shortcuts-btn' : 'shortcuts-trigger-btn',
          'shortcuts-popover',
        );
        return;
      }

      if (!studioState.item) return;
      const sentences = studioState.item.sentences || [];
      if (!sentences.length) return;

      const currIdx = getActiveShortcutSentenceIndex() || 1;
      const shift = Boolean(e.shiftKey);

      // 3. Zoomed Video Panning (Shift + Arrows or Shift + WASD when scale > 100%)
      if (videoZoom.scale > 1.001 && shift) {
        if (code === 'ArrowRight' || code === 'KeyD') {
          e.preventDefault();
          panBy(-40, 0);
          return;
        }
        if (code === 'ArrowLeft' || code === 'KeyA') {
          e.preventDefault();
          panBy(40, 0);
          return;
        }
        if (code === 'ArrowUp' || code === 'KeyW') {
          e.preventDefault();
          panBy(0, 40);
          return;
        }
        if (code === 'ArrowDown' || code === 'KeyS') {
          e.preventDefault();
          panBy(0, -40);
          return;
        }
      }

      // 4. Core Playback & Sentence Navigation (Physical e.code works on EN/AR/any layout)
      if (code === 'Space' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        const wasPlayingSame = studioState.isPlaying && studioState.activeSentence?.index === currIdx;
        handleSentencePlayButtonClick(currIdx);
        showActionFlash(wasPlayingSame ? 'pause' : 'play');
        return;
      }

      if ((code === 'KeyR' || code === 'Backspace') && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        replayActiveSentenceFromStart(currIdx, { showFlash: true });
        return;
      }

      if ((code === 'ArrowUp' || code === 'KeyW') && !shift) {
        e.preventDefault();
        navigateSentenceByDelta(-1);
        return;
      }

      if ((code === 'ArrowDown' || code === 'KeyS') && !shift) {
        e.preventDefault();
        navigateSentenceByDelta(1);
        return;
      }

      if (code === 'ArrowLeft' && shift) {
        e.preventDefault();
        navigateSentenceByDelta(-1);
        return;
      }

      if (code === 'ArrowRight' && shift) {
        e.preventDefault();
        navigateSentenceByDelta(1);
        return;
      }

      if ((code === 'ArrowLeft' || code === 'KeyA') && !shift) {
        e.preventDefault();
        nudgePlayback(-(studioState.seekStepSec || 2));
        return;
      }

      if ((code === 'ArrowRight' || code === 'KeyD') && !shift) {
        e.preventDefault();
        nudgePlayback(studioState.seekStepSec || 2);
        return;
      }

      if (code === 'KeyL') {
        e.preventDefault();
        if (e.repeat) return;
        if (shift) {
          cycleSentenceFlow();
        } else {
          handleSentenceLoopButtonClick(currIdx);
          const isLoopNow =
            studioState.loopSentenceIndex === currIdx || studioState.endAction === 'loop';
          showToast(isLoopNow ? `${t('playbackFlowLabel')}: ${t('flowLoop')}` : `${t('playbackFlowLabel')}: ${t('flowPause')}`);
        }
        return;
      }

      if (code === 'KeyM' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        toggleStudioMute();
        return;
      }

      // 5. Speed Controls (Left-hand Q/E/` + Right-hand [/]/\)
      if ((code === 'KeyQ' || code === 'BracketLeft') && !shift) {
        e.preventDefault();
        stepSpeed(-0.05);
        showToast(`${t('playbackSpeedLabel')}: ${studioState.speed.toFixed(2)}x`);
        return;
      }

      if ((code === 'KeyE' || code === 'BracketRight') && !shift) {
        e.preventDefault();
        stepSpeed(0.05);
        showToast(`${t('playbackSpeedLabel')}: ${studioState.speed.toFixed(2)}x`);
        return;
      }

      if ((code === 'Backquote' || code === 'IntlBackslash') && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        cycleQuickSpeed();
        return;
      }

      if (code === 'Backslash' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        setStudioSpeed(1.0);
        showToast(`${t('playbackSpeedLabel')}: 1.00x`);
        return;
      }

      // 6. Voice Shadowing (Record V · Play Recording Shift+V · A/B Compare B)
      if (code === 'KeyV') {
        e.preventDefault();
        if (e.repeat) return;
        if (shift) {
          if (!studioState.recordedAudioUrl) {
            showToast('Record your voice first (press V).');
          } else {
            playUserRecording();
            showToast('Playing your voice');
          }
        } else {
          toggleVoiceRecording();
        }
        return;
      }

      if (code === 'KeyB' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        startABComparison();
        return;
      }

      // 7. Study Progress, Translation & Navigation (C / Shift+C · T / Shift+T · F · G)
      if (code === 'KeyC') {
        e.preventDefault();
        if (e.repeat) return;
        toggleActiveItemCompletion({ advanceAfter: shift });
        return;
      }

      if (code === 'KeyT') {
        e.preventDefault();
        if (e.repeat) return;
        if (shift) {
          toggleAllTranslationsVisibility();
        } else if (studioState.mode === 'shadow') {
          handleSentenceTranslateButtonClick(currIdx);
        }
        return;
      }

      if (code === 'KeyF' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        toggleAutoFollow();
        showToast(`${t('autoFollowLabel')}: ${studioState.autoFollow ? 'ON' : 'OFF'}`);
        return;
      }

      if (code === 'KeyG' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        jumpToActiveItem({ resetFilter: true });
        return;
      }

      // 8. Video Framing & Zoom (Z Mouth · Shift+Z Face · +/- Zoom · 0 Reset)
      if (code === 'KeyZ') {
        e.preventDefault();
        if (e.repeat) return;
        setZoomPassthrough(false);
        if (shift) {
          focusFace(true);
        } else {
          focusMouth(true);
        }
        return;
      }

      if (code === 'Equal' || code === 'NumpadAdd' || key === '+') {
        e.preventDefault();
        setZoomPassthrough(false);
        zoomByStep(0.25, true);
        return;
      }

      if (code === 'Minus' || code === 'NumpadSubtract' || key === '-') {
        e.preventDefault();
        setZoomPassthrough(false);
        zoomByStep(-0.25, true);
        return;
      }

      if ((code === 'Digit0' || code === 'Numpad0') && !shift) {
        if (videoZoom.scale > 1.001) {
          e.preventDefault();
          if (e.repeat) return;
          resetZoom(true);
          showToast('Zoom: 100%');
        }
        return;
      }

      // 9. Layout Picker / Cycle (Y / Shift+Y)
      if (code === 'KeyY') {
        e.preventDefault();
        if (e.repeat) return;
        if (shift) {
          const meta = window.FlaptapStudioLayouts?.cycleLayout();
          if (meta?.name) {
            showToast(`${t('keyLayout')}: ${meta.name}`);
          }
        } else {
          toggleControlPopover('studio-layout-btn', 'studio-layout-popover');
        }
        return;
      }

      // 9.5 Audio-Only Focus Toggle (H) & Ask AI Companion (I)
      if (code === 'KeyH' && !shift) {
        const videoToggle = document.getElementById('studio-video-toggle-btn');
        if (videoToggle && !videoToggle.hidden) {
          e.preventDefault();
          if (e.repeat) return;
          toggleVideoVisibility();
        }
        return;
      }

      if (code === 'KeyI' && !shift) {
        e.preventDefault();
        if (e.repeat) return;
        window.FlaptapStudioReaderAi?.toggle();
        return;
      }

      // 10. Instant Learning Mode Switching (1–5)
      if (!shift) {
        const modeMap = {
          Digit1: 'shadow',
          Digit2: 'read',
          Digit3: 'listen',
          Digit4: 'coach',
          Digit5: 'notes',
        };
        if (modeMap[code]) {
          e.preventDefault();
          if (e.repeat) return;
          switchStudioMode(modeMap[code]);
        }
      }
    }

    document.addEventListener('keydown', handleStudioKeydown);

    window.FlaptapStudioShortcuts = {
      isTextEntryElement,
      reclaimFocusFromPlayerIframe,
      replayActiveSentenceFromStart,
      navigateSentenceByDelta,
      cycleSentenceFlow,
      cycleQuickSpeed,
      toggleStudioMute,
      toggleActiveItemCompletion,
      toggleAllTranslationsVisibility,
    };

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
    if (window.FlaptapStudioLayouts) {
      const activeMeta = window.FlaptapStudioLayouts.init({
        uiLang: studioState.uiLang,
        onChange: (meta) => {
          studioState.layout = meta?.id || studioState.layout;
          requestAnimationFrame(() => {
            syncStudioDeckStickyHeightVar();
            const layoutPop = document.getElementById('studio-layout-popover');
            const layoutBtn = document.getElementById('studio-layout-btn');
            if (layoutPop && !layoutPop.hidden && layoutBtn && (window.innerWidth || 1024) > 640) {
              positionControlPopover(layoutPop, layoutBtn);
            }
          });
        },
        onClosePopover: () => {
          closeAllControlPopovers();
        },
      });
      studioState.layout = activeMeta?.id || 'theater';
    } else {
      setStudioLayout('theater');
    }
    setStudioSpeed(studioState.speed);
    setStudioSeekStep(studioState.seekStepSec);
    syncFlowButtonDom();
    syncAutoFollowButtonDom();
    bindEvents();
    loadStudioSession();
  });
})();
