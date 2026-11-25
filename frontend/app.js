/* ==========================================================================
   FLAPTAP WORKSPACE CONTROLLER (app.js)
   Paper-Editorial UI · Multi-language (EN/AR/ES/FR/DE/TR) · Light/Dark Mode
   Strict Sign-In Gate with Pending Action Resume · Email & Password Auth
   Full History, Caching & Usage Control Center · Vocabulary SRS Flashcards
   ========================================================================== */

(function () {
  'use strict';

  const PENDING_ACTION_KEY = 'flaptap_pending_action';

  const I18N = {
    en: {
      brandEdition: 'Spoken English Studio',
      navGroupStudio: 'Studio',
      navGroupLab: 'Lab',
      navGroupWorkspace: 'Workspace',
      navLessons: 'Shadowing',
      navDialogue: 'Dialogues',
      navPronunciation: 'Phonetics',
      navExtractor: 'Phrase Miner',
      navLearningLibrary: 'Phrase Builder',
      navVocabulary: 'Vocabulary',
      navHistory: 'Activity',
      navAiModels: 'AI Models',
      streakUnit: 'day streak',
      signIn: 'Sign in',
      createAccount: 'Create account',
      signInToContinue: 'Sign in to continue',
      createFreeAccount: 'Create account',
      signOut: 'Sign out',
      accountTitle: 'Account',
      authRequiredKicker: 'Account Required',
      authGateTitle: 'Sign in first to continue',
      authGateDesc: 'Your requested action is saved and will run automatically right after you sign in or create an account.',
      heroKicker: 'Spoken English Studio',
      heroHeadline: 'Turn any video into <span class="apple-hero-accent">your speaking studio.</span>',
      heroSubcopy: 'Paste any video, podcast, or audio link — or upload a file — to shadow real speakers with millisecond word playback, AI verbatim review, multi-speaker views, coaching, and 7-format export.',
      urlPlaceholder: 'Paste YouTube, TikTok, Instagram, X, Podcast RSS, Apple Podcasts, or MP3/MP4 link...',
      worksWithLabel: 'Works with',
      startLessonBtn: 'Start Lesson',
      cachedBadge: 'Ready in Library',
      openCachedBtn: 'Open Instantly',
      bypassCacheLabel: 'Re-extract fresh',
      manageHistoryCacheBtn: 'History & Cache',
      capFullSentences: 'Complete sentences',
      capModes: 'Four studio modes',
      capLanguages: '170+ languages',
      statLessons: 'Lessons in Library',
      statDrills: 'Lessons Completed',
      statVocab: 'Saved Vocabulary',
      statMinutes: 'Practice Minutes',
      libraryHeading: 'Lesson Library',
      filterAll: 'All',
      filterVideos: 'Videos',
      filterDialogues: 'Dialogues',
      filterPronunciation: 'Pronunciation',
      searchLessonsPlaceholder: 'Search lessons...',
      clearLibraryBtn: 'Clear Library',
      emptyLibraryTitle: 'No lessons yet',
      emptyLibraryDesc: 'Paste a video link above to build your first interactive speaking lesson.',
      gateLibraryTitle: 'Sign in to build and access your personal lesson library',
      gateLibraryDesc: 'Explore any tool above—when you start a video lesson, dialogue, or pronunciation workout, we will ask you to sign in or create an account so all progress, caches, and notes stay synced to you.',
      dialogueKicker: 'Real-World Spoken Dialogue',
      dialogueHeadline: 'Practice authentic <span class="vox-underline">conversational English</span> for any situation.',
      dialogueSubcopy: 'Describe a situation—such as defending a technical decision, negotiating a contract, or catching up over coffee—and open a complete spoken lesson with connected speech, idioms, and audio.',
      dialoguePlaceholder: 'Describe the conversation scenario you want to practice...',
      createDialogueBtn: 'Create Dialogue',
      pronKicker: 'Articulatory Mechanics & Prosody',
      pronHeadline: 'Train physical <span class="vox-underline">mouth mechanics, linking, and rhythm</span>.',
      pronSubcopy: 'Specify any phonetic target—such as alveolar Flap-T between vowels, rhotic R coloring, consonant-to-vowel linking, or schwa reduction—to generate a targeted spoken workout.',
      pronPlaceholder: 'Enter a sound, rhythm, or connected-speech target...',
      createWorkoutBtn: 'Build Workout',
      vocabKicker: 'Spaced Active Recall',
      vocabHeading: 'Vocabulary Vault',
      vocabFilterAll: 'All',
      vocabFilterDue: 'Due for Review',
      vocabFilterMastered: 'Mastered',
      vocabSearchPlaceholder: 'Search saved words...',
      practiceFlashcardsBtn: 'Practice Flashcards',
      hideFlashcardsBtn: 'Hide Flashcards',
      emptyVocabTitle: 'No saved words yet',
      emptyVocabDesc: 'Click any word in Shadowing, Phrase Miner, or Phrase Builder to save contextual definitions and unlock spaced flashcards.',
      gateVocabTitle: 'Sign in to unlock your Vocabulary Vault & Spaced Flashcards',
      gateVocabDesc: 'Save contextual definitions, connected-speech expressions, and IPA pronunciations while studying—then review them with active-recall flashcards.',
      clickToReveal: 'Click to reveal meaning',
      srsAgain: 'Review Soon',
      srsGood: 'Got It',
      srsEasy: 'Easy',
      closeBtn: 'Close',
      historyKicker: 'Usage, Storage & Cache Control',
      historyHeading: 'History, Caching & Usage',
      refreshBtn: 'Refresh',
      exportBackupBtn: 'Export Full Backup (.json)',
      gateHistoryTitle: 'Sign in to inspect and control your full usage, lesson caches, and activity history',
      gateHistoryDesc: 'Every transcript, AI Coach analysis, world-language translation cache, study note, and practice session is isolated strictly to your account with one-click cache and export controls.',
      dailyGoalCardTitle: 'Daily Practice Goal',
      todayPracticeLabel: "Today's Practice",
      totalPracticeLabel: 'Total Practice Time',
      currentStreakLabel: 'Current Streak',
      quickGoalLabel: 'Target:',
      libraryBreakdownTitle: 'Library & Recall Breakdown',
      vocabDueMasteredLabel: 'Vocabulary (Due / Done / All)',
      cacheStorageTitle: 'Cache & Storage Footprint',
      transcriptCachesLabel: 'Raw Video Transcript Caches',
      aiCoachCachesLabel: 'Cached AI Coach Analyses',
      translationCachesLabel: 'Translations',
      studyNotesSavedLabel: 'Lessons with Study Notes',
      cacheControlsHeading: 'Global Cache & Data Controls',
      cacheControlsDesc: 'Clear cached AI layers to force fresh generation without losing your lessons or notes, or wipe specific datasets.',
      clearTransCacheBtn: 'Clear Translation Caches',
      clearCoachCacheBtn: 'Clear AI Coach Caches',
      clearTranscriptCacheBtn: 'Clear Transcript Caches',
      clearAllCachesBtn: 'Clear All Caches',
      clearVocabVaultBtn: 'Clear Vocabulary',
      clearEntireHistoryBtn: 'Delete All Lessons',
      historyLedgerHeading: 'Lesson History & Per-Item Cache Manager',
      cacheFilterAll: 'All Cache States',
      cacheFilterCoach: 'AI Coach Cached',
      cacheFilterTrans: 'Translations Cached',
      cacheFilterTranscript: 'Transcript Cached',
      cacheFilterNotes: 'Has Study Notes',
      sortRecent: 'Newest First',
      sortMostPracticed: 'Most Practiced',
      sortLargestCache: 'Largest Cache',
      searchHistoryPlaceholder: 'Filter history...',
      selectAllLabel: 'Select all visible',
      bulkClearCacheBtn: 'Clear Selected Caches',
      bulkResetProgressBtn: 'Reset Selected Progress',
      bulkDeleteBtn: 'Delete Selected',
      emptyHistoryTitle: 'No matching lessons in history',
      emptyHistoryDesc: 'Lessons you study appear here with full cache inspection, progress reset, and re-extraction controls.',
      activityLogHeading: 'Practice Activity Timeline',
      clearActivityBtn: 'Clear Activity Log',
      emptyActivityTitle: 'No completed practice sessions logged yet',
      emptyActivityDesc: 'Click Complete inside any Studio lesson to record your session, practice mode, and daily streak.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      passwordMinLabel: 'Password (8+ characters)',
      nameLabel: 'Full name',
      nativeLangLabel: 'Translation language',
      dailyGoalLabel: 'Daily practice goal (minutes)',
      savePreferences: 'Save preferences',
      passwordSecurityHeading: 'Password & Security',
      currentPasswordLabel: 'Current password',
      newPasswordLabel: 'New password (8+ characters)',
      updatePasswordBtn: 'Update password',
      activeSessionsHeading: 'Active Sessions',
      revokeOtherSessionsBtn: 'Sign out others',
      deleteAccountBtn: 'Delete account & all data',
      guestSyncNote: 'Sign in or create an account to unlock video extraction, dynamic AI coaching, multilingual translations, vocabulary flashcards, and full history & cache control.',
      openLesson: 'Study',
      reextractBtn: 'Re-extract',
      clearCacheItemBtn: 'Clear Cache',
      resetProgressItemBtn: 'Reset Drills',
      deleteItemBtn: 'Delete',
      sentencesUnit: 'sentences',
      drillsDoneUnit: 'drills',
      openInContext: 'Open in lesson',
      generating: 'Generating...',
      trackVideo: 'Video',
      trackDialogue: 'Dialogue',
      trackPronunciation: 'Pronunciation',
      progressTotal: 'Total',
      progressCompleted: 'Completed',
      progressRemaining: 'Remaining',
      markComplete: 'Mark complete',
      completedLabel: 'Completed',
      confirmClear: 'Permanently delete all lessons from your library?',
      confirmClearVocab: 'Permanently clear all saved words from your Vocabulary Vault?',
      confirmDeleteAccount: 'Permanently delete your account, lesson history, caches, notes, and vocabulary? This cannot be undone.',
    },
    ar: {
      brandEdition: 'استوديو الإنجليزية المنطوقة',
      navGroupStudio: 'الاستوديو',
      navGroupLab: 'المختبر',
      navGroupWorkspace: 'مساحة العمل',
      navLessons: 'الترديد',
      navDialogue: 'الحوارات',
      navPronunciation: 'الصوتيات',
      navExtractor: 'استخراج العبارات',
      navLearningLibrary: 'بناء العبارات',
      navVocabulary: 'المفردات',
      navHistory: 'النشاط',
      navAiModels: 'نماذج الذكاء',
      streakUnit: 'أيام متتالية',
      signIn: 'تسجيل الدخول',
      createAccount: 'إنشاء حساب',
      signInToContinue: 'سجّل الدخول للمتابعة',
      createFreeAccount: 'إنشاء حساب جديد',
      signOut: 'تسجيل الخروج',
      accountTitle: 'الحساب الشخصي',
      authRequiredKicker: 'يتطلب تسجيل الدخول',
      authGateTitle: 'سجّل الدخول أولاً للمتابعة',
      authGateDesc: 'تم حفظ الإجراء المطلوب وسيتم تنفيذه تلقائياً فور تسجيل الدخول أو إنشاء حساب.',
      heroKicker: 'استوديو الإنجليزية المنطوقة',
      heroHeadline: 'حوّل أي فيديو إنجليزي إلى <span class="vox-underline">درس تحدث احترافي متكامل</span>.',
      heroSubcopy: 'الصق رابط يوتيوب للتدرب على الجمل الكاملة، الفقرات المترابطة، الإملاء السمعي، وتدريب الكلام المتصل بتوقيت دقيق لكل كلمة.',
      urlPlaceholder: 'الصق رابط فيديو يوتيوب هنا...',
      startLessonBtn: 'ابدأ الدرس',
      cachedBadge: 'محفوظ مؤقتاً',
      openCachedBtn: 'فتح فوري (0ms)',
      bypassCacheLabel: 'تجاوز الذاكرة وإعادة الاستخراج',
      manageHistoryCacheBtn: 'السجل والذاكرة',
      capFullSentences: 'نهايات جمل كاملة ودقيقة',
      capModes: 'أوضاع الترديد والقراءة والاستماع والمدرب',
      capLanguages: 'ترجمة لأكثر من 170 لغة',
      statLessons: 'الدروس في المكتبة',
      statDrills: 'الدروس المكتملة',
      statVocab: 'المفردات المحفوظة',
      statMinutes: 'دقائق التدريب',
      libraryHeading: 'مكتبة الدروس',
      filterAll: 'الكل',
      filterVideos: 'فيديوهات',
      filterDialogues: 'محادثات',
      filterPronunciation: 'نطق',
      searchLessonsPlaceholder: 'ابحث في الدروس...',
      clearLibraryBtn: 'مسح المكتبة',
      emptyLibraryTitle: 'مكتبتك جاهزة للبدء',
      emptyLibraryDesc: 'الصق رابط فيديو يوتيوب في الأعلى أو أنشئ محادثة مخصصة أو تمرين نطق للبدء فوراً.',
      gateLibraryTitle: 'سجّل الدخول لبناء مكتبة دروسك الشخصية والوصول إليها',
      gateLibraryDesc: 'يمكنك تصفح جميع الأدوات بالأعلى — وعند بدء أي درس أو محادثة أو تمرين سيُطلب منك تسجيل الدخول لحفظ تقدمك.',
      dialogueKicker: 'محادثات واقعية حية',
      dialogueHeadline: 'تدرّب على <span class="vox-underline">المحادثة الإنجليزية الطبيعية</span> لأي موقف.',
      dialogueSubcopy: 'صف أي موقف واقعي لإنشاء درس حواري متكامل مع الكلام المتصل والتعبيرات والصوت.',
      dialoguePlaceholder: 'صف موقف المحادثة الذي تريد التدرب عليه...',
      createDialogueBtn: 'إنشاء المحادثة',
      pronKicker: 'ميكانيكا النطق والإيقاع الصوتي',
      pronHeadline: 'درّب <span class="vox-underline">مخارج الحروف والربط الصوتي والإيقاع</span>.',
      pronSubcopy: 'اكتب أي مهارة صوتية تريد إتقانها لبناء تمرين نطق عملي بالرموز الصوتية.',
      pronPlaceholder: 'اكتب الصوت أو مهارة الربط الصوتي المطلوبة...',
      createWorkoutBtn: 'بناء التمرين',
      vocabKicker: 'المراجعة المتباعدة الذكية',
      vocabHeading: 'خزنة المفردات',
      vocabFilterAll: 'الكل',
      vocabFilterDue: 'مستحقة للمراجعة',
      vocabFilterMastered: 'متقنة',
      vocabSearchPlaceholder: 'ابحث في مفرداتك...',
      practiceFlashcardsBtn: 'مراجعة البطاقات',
      hideFlashcardsBtn: 'إخفاء البطاقات',
      emptyVocabTitle: 'لا توجد مفردات محفوظة بعد',
      emptyVocabDesc: 'اضغط على أي كلمة أثناء دراسة الدرس أو احفظ التعبيرات من تبويب المدرب.',
      gateVocabTitle: 'سجّل الدخول لفتح خزنة المفردات والبطاقات الذكية',
      gateVocabDesc: 'احفظ المفردات والتعبيرات والنطق الصوتي أثناء الدراسة وراجعها بنظام التكرار المتباعد.',
      clickToReveal: 'اضغط لإظهار المعنى',
      srsAgain: 'قريباً',
      srsGood: 'جيد',
      srsEasy: 'سهل',
      closeBtn: 'إغلاق',
      historyKicker: 'التحكم الكامل في السجل والذاكرة المؤقتة',
      historyHeading: 'السجل والذاكرة والاستخدام',
      refreshBtn: 'تحديث',
      exportBackupBtn: 'تصدير نسخة كاملة (.json)',
      gateHistoryTitle: 'سجّل الدخول للتحكم الكامل في سجل الدروس والذاكرة المؤقتة والاستخدام',
      gateHistoryDesc: 'تحكم في ملفات النصوص وتحليلات المدرب والترجمات المحفوظة وسجل النشاط وتصدير بياناتك.',
      openLesson: 'ادرس',
      reextractBtn: 'إعادة استخراج',
      progressTotal: 'الإجمالي',
      progressCompleted: 'مكتمل',
      progressRemaining: 'المتبقي',
      markComplete: 'تحديد كمكتمل',
      completedLabel: 'مكتمل',
      clearCacheItemBtn: 'مسح الكاش',
      resetProgressItemBtn: 'تصفير التقدم',
      deleteItemBtn: 'حذف',
      sentencesUnit: 'جملة',
      drillsDoneUnit: 'تدريب',
      openInContext: 'افتح في الدرس',
      generating: 'جارٍ الإنشاء...',
      trackVideo: 'فيديو',
      trackDialogue: 'محادثة',
      trackPronunciation: 'نطق',
      confirmClear: 'هل تريد حذف جميع الدروس نهائياً من مكتبتك؟',
      confirmClearVocab: 'هل تريد مسح جميع المفردات المحفوظة؟',
      confirmDeleteAccount: 'هل أنت متأكد من حذف حسابك وجميع بياناتك وسجل دروسك نهائياً؟',
    },
    es: {
      brandEdition: 'Estudio de Inglés Hablado',
      navGroupStudio: 'Estudio',
      navGroupLab: 'Laboratorio',
      navGroupWorkspace: 'Espacio',
      navLessons: 'Shadowing',
      navDialogue: 'Diálogos',
      navPronunciation: 'Fonética',
      navExtractor: 'Extractor',
      navLearningLibrary: 'Creador',
      navVocabulary: 'Vocabulario',
      navHistory: 'Actividad',
      navAiModels: 'Modelos IA',
      streakUnit: 'días seguidos',
      signIn: 'Iniciar sesión',
      createAccount: 'Crear cuenta',
      signOut: 'Cerrar sesión',
      accountTitle: 'Cuenta',
      heroKicker: 'Estudio de Inglés Hablado',
      heroHeadline: 'Convierte cualquier video en inglés en una <span class="vox-underline">lección de habla precisa</span>.',
      heroSubcopy: 'Pega un enlace de YouTube para practicar oraciones completas, párrafos editoriales, dictado activo y habla conectada.',
      urlPlaceholder: 'Pega un enlace de YouTube...',
      startLessonBtn: 'Iniciar lección',
      libraryHeading: 'Biblioteca de lecciones',
      openLesson: 'Estudiar',
      sentencesUnit: 'oraciones',
    },
    fr: {
      brandEdition: 'Studio d’Anglais Parlé',
      navGroupStudio: 'Studio',
      navGroupLab: 'Labo',
      navGroupWorkspace: 'Espace',
      navLessons: 'Shadowing',
      navDialogue: 'Dialogues',
      navPronunciation: 'Phonétique',
      navExtractor: 'Extracteur',
      navLearningLibrary: 'Générateur',
      navVocabulary: 'Vocabulaire',
      navHistory: 'Activité',
      navAiModels: 'Modèles IA',
      streakUnit: 'jours de suite',
      signIn: 'Connexion',
      createAccount: 'Créer un compte',
      signOut: 'Déconnexion',
      accountTitle: 'Compte',
      heroKicker: 'Studio d’Anglais Parlé',
      heroHeadline: 'Transformez toute vidéo anglaise en <span class="vox-underline">leçon orale de précision</span>.',
      heroSubcopy: 'Collez un lien YouTube pour travailler phrases complètes, paragraphes cohérents, dictée active et discours connecté.',
      urlPlaceholder: 'Collez un lien vidéo YouTube...',
      startLessonBtn: 'Commencer',
      libraryHeading: 'Bibliothèque',
      openLesson: 'Étudier',
      sentencesUnit: 'phrases',
    },
    de: {
      brandEdition: 'Studio für Gesprochenes Englisch',
      navGroupStudio: 'Studio',
      navGroupLab: 'Labor',
      navGroupWorkspace: 'Arbeitsbereich',
      navLessons: 'Shadowing',
      navDialogue: 'Dialoge',
      navPronunciation: 'Phonetik',
      navExtractor: 'Phrase Miner',
      navLearningLibrary: 'Phrase Builder',
      navVocabulary: 'Vokabeln',
      navHistory: 'Aktivität',
      navAiModels: 'KI-Modelle',
      streakUnit: 'Tage Serie',
      signIn: 'Anmelden',
      createAccount: 'Konto erstellen',
      signOut: 'Abmelden',
      accountTitle: 'Konto',
      heroKicker: 'Gesprochenes Englisch',
      heroHeadline: 'Verwandle jedes englische Video in eine <span class="vox-underline">präzise Sprechlektion</span>.',
      heroSubcopy: 'Füge einen YouTube-Link ein, um vollständige Sätze, Absätze, aktives Diktat und Connected Speech zu trainieren.',
      urlPlaceholder: 'YouTube-Link einfügen...',
      startLessonBtn: 'Lektion starten',
      libraryHeading: 'Bibliothek',
      openLesson: 'Lernen',
      sentencesUnit: 'Sätze',
    },
    tr: {
      brandEdition: 'Konuşma İngilizcesi Stüdyosu',
      navGroupStudio: 'Stüdyo',
      navGroupLab: 'Laboratuvar',
      navGroupWorkspace: 'Çalışma Alanı',
      navLessons: 'Gölgeleme',
      navDialogue: 'Diyaloglar',
      navPronunciation: 'Fonetik',
      navExtractor: 'İfade Çıkarıcı',
      navLearningLibrary: 'İfade Üretici',
      navVocabulary: 'Kelimeler',
      navHistory: 'Etkinlik',
      navAiModels: 'YZ Modelleri',
      streakUnit: 'gün seri',
      signIn: 'Giriş yap',
      createAccount: 'Hesap oluştur',
      signOut: 'Çıkış yap',
      accountTitle: 'Hesap',
      heroKicker: 'Konuşma İngilizcesi Stüdyosu',
      heroHeadline: 'Herhangi bir İngilizce videoyu <span class="vox-underline">hassas bir konuşma dersine</span> dönüştürün.',
      heroSubcopy: 'Tam cümleler, paragraflar, aktif dikte ve bağlı konuşma pratiği için bir YouTube bağlantısı yapıştırın.',
      urlPlaceholder: 'Bir YouTube bağlantısı yapıştırın...',
      startLessonBtn: 'Dersi Başlat',
      libraryHeading: 'Ders Kitaplığı',
      openLesson: 'Çalış',
      sentencesUnit: 'cümle',
    },
  };

  const state = {
    uiLang: localStorage.getItem('flaptap_ui_lang') || 'en',
    theme: localStorage.getItem('flaptap_theme') || 'light',
    guestToken: localStorage.getItem('flaptap_guest_token') || '',
    authToken: localStorage.getItem('flaptap_auth_token') || '',
    user: null,
    sessionLoaded: false,
    pendingAction: null,
    stats: null,
    usageOverview: null,
    activeSessions: [],
    section: 'lessons',
    libraryFilter: 'all',
    libraryPlatformFilter: 'all',
    libraryStatusFilter: 'all',
    librarySearch: '',
    libraryPage: 1,
    libraryPageSize: 12,
    lessonsInputTab: 'link',
    lessonsSelectedFile: null,
    lessonsUploading: false,
    lessonsAiSelector: null,
    lessons: [],
    urlCacheMatch: null,
    ledgerTrackFilter: 'all',
    ledgerCacheFilter: 'all',
    ledgerSort: 'recent',
    ledgerSearch: '',
    selectedLedgerIds: new Set(),
    vocabFilter: 'all',
    vocabSearch: '',
    vocabItems: [],
    languages: [],
    flashcardsOpen: false,
    flashcardIndex: 0,
    flashcardRevealed: false,
  };

  window.flaptapState = state;

  function t(key) {
    const dict = I18N[state.uiLang] || I18N.en;
    return dict[key] !== undefined ? dict[key] : (I18N.en[key] || key);
  }

  const U = window.FlaptapUtils;
  const escapeHtml = U.escapeHtml;
  const formatDuration = U.formatDuration;
  const formatBytes = U.formatBytes;
  const formatShortDate = U.formatShortDate;

  /** Sprite icon markup (frontend/icons.svg) — icon-only controls always get a label. */
  function icon(name, options) {
    return window.FlaptapIcon ? window.FlaptapIcon(name, options) : '';
  }

  function apiHeaders(extra) {
    return U.buildAuthHeaders({
      guestToken: state.guestToken,
      authToken: state.authToken,
      extra,
    });
  }

  async function apiFetch(url, options) {
    return U.apiFetch(url, options, {
      direct: true,
      getHeaders: apiHeaders,
    });
  }

  async function withButtonLoading(btn, loadingLabel, fn) {
    if (!btn) return fn();
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = loadingLabel;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  function showToast(message) {
    U.showToast(message, 'workspace-toast', 3400);
  }

  /* ========================================================================
     STRICT AUTH GATE & PENDING ACTION CONTINUATION
     ======================================================================== */

  function savePendingAction(action) {
    state.pendingAction = action || null;
    try {
      if (action) {
        sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
      } else {
        sessionStorage.removeItem(PENDING_ACTION_KEY);
      }
    } catch {}
  }

  function popPendingAction() {
    let act = state.pendingAction;
    if (!act) {
      try {
        const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
        if (raw) act = JSON.parse(raw);
      } catch {}
    }
    savePendingAction(null);
    return act;
  }

  /**
   * Returns `true` if user is authenticated and action may proceed immediately.
   * Returns `false` if signed out: stores `pendingAction`, displays contextual
   * gate banner, and opens Sign-In drawer BEFORE executing the action.
   */
  function requireAuthBeforeAction(pendingAction, customMessage) {
    if (state.user) return true;
    savePendingAction(pendingAction || null);
    openAccountDrawer({
      fromGate: true,
      tab: 'login',
      gateMessage: customMessage || t('authGateDesc'),
    });
    return false;
  }

  async function resumePendingAction() {
    const act = popPendingAction();
    if (!act || !state.user) return;

    if (act.type === 'video_lesson' && act.url) {
      const qs = new URLSearchParams({ url: act.url });
      if (act.force) qs.set('force', '1');
      if (act.autoreview) qs.set('autoreview', '1');
      window.location.href = `/studio?${qs.toString()}`;
      return;
    }

    if (act.type === 'navigate' && act.href) {
      window.location.href = act.href;
      return;
    }

    if (act.type === 'dialogue' && act.scenario) {
      switchSection('dialogue');
      const input = document.getElementById('dialogue-scenario-input');
      if (input) input.value = act.scenario;
      await executeDialogueGeneration(act.scenario);
      return;
    }

    if (act.type === 'pronunciation' && act.topic) {
      switchSection('pronunciation');
      const input = document.getElementById('pronunciation-topic-input');
      if (input) input.value = act.topic;
      await executePronunciationGeneration(act.topic);
      return;
    }

    if (act.type === 'flashcards') {
      switchSection('vocabulary');
      await loadVocabulary();
      if (state.vocabItems.length > 0) {
        setFlashcardsOpen(true);
      } else {
        showToast(t('emptyVocabTitle'));
      }
      return;
    }

    if (act.type === 'export_backup') {
      switchSection('history');
      await exportFullAccountJson();
      return;
    }

    if (act.type === 'learning_library_generate' && act.payload) {
      switchSection('learning-library');
      if (window.FlaptapLearningLibrary?.resumeGeneration) {
        await window.FlaptapLearningLibrary.resumeGeneration(act.payload);
      }
      return;
    }

    if (act.type === 'aex_extract' && act.payload) {
      switchSection('american-extractor');
      if (window.FlaptapAmericanExtractor?.resumePending) {
        await window.FlaptapAmericanExtractor.resumePending(act.payload);
      }
      return;
    }

    if (act.type === 'upload_lesson') {
      switchSection('lessons');
      setLessonsInputTab('upload');
      if (state.lessonsSelectedFile) {
        await handleLessonFileUpload();
      } else {
        showToast('Signed in — choose your audio/video file to transcribe.');
      }
      return;
    }

    if (act.type === 'section' && act.section) {
      switchSection(act.section);
    }
  }

  /* ========================================================================
     THEME & LOCALIZATION
     ======================================================================== */

  function applyTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('flaptap_theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
    const sun = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
      sun.toggleAttribute('hidden', state.theme !== 'dark');
      moon.toggleAttribute('hidden', state.theme === 'dark');
    }
  }

  function applyUiLanguage(lang) {
    state.uiLang = I18N[lang] ? lang : 'en';
    localStorage.setItem('flaptap_ui_lang', state.uiLang);
    document.documentElement.setAttribute('lang', state.uiLang);
    document.documentElement.setAttribute('dir', state.uiLang === 'ar' ? 'rtl' : 'ltr');

    const select = document.getElementById('ui-lang-select');
    if (select) select.value = state.uiLang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (
        key === 'heroHeadline' ||
        key === 'dialogueHeadline' ||
        key === 'pronHeadline' ||
        key === 'techLinguistHeadline' ||
        key.endsWith('Headline')
      ) {
        el.innerHTML = t(key);
      } else {
        el.textContent = t(key);
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });

    syncFlashcardButtonDom();
    updateAccountHeader();
    renderLibrary();
    renderVocabulary();
    renderFlashcard();
    renderHistoryLedger();
    renderActivityTimeline();
    window.dispatchEvent(new CustomEvent('flaptap:ui-lang-changed', { detail: { lang: state.uiLang } }));
    window.FlaptapRouter?.refreshChrome?.();
  }

  /* ========================================================================
     SECTION NAVIGATION & MODULAR ROUTE SYNCHRONIZATION
     ======================================================================== */

  function activateSectionPanel(section, opts = {}) {
    if (section === 'library') section = 'learning-library';
    const validSections = [
      'lessons',
      'dialogue',
      'pronunciation',
      'vocabulary',
      'history',
      'american-extractor',
      'learning-library',
    ];
    if (!validSections.includes(section)) {
      section = 'lessons';
    }
    const changed = state.section !== section;
    state.section = section;
    document.body.dataset.activeSection = section;
    document.body.classList.toggle('is-lessons-view', section === 'lessons');
    document.body.classList.toggle('is-extractor-view', section === 'american-extractor');
    document.body.classList.toggle('is-library-view', section === 'learning-library');
    validSections.forEach((name) => {
      const panel = document.getElementById(`section-${name}`);
      if (panel) panel.hidden = name !== section;
    });
    if (changed && !opts.preserveScroll) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (section !== 'lessons') lessonsStickyDock?.disconnect?.();
    if (section !== 'vocabulary') vocabStickyDock?.disconnect?.();
    return section;
  }

  async function applyRoute(routeState) {
    const resolved = activateSectionPanel(routeState?.section || 'lessons');

    if (resolved === 'lessons' || resolved === 'dialogue' || resolved === 'pronunciation') {
      renderLibrary();
    } else if (resolved === 'vocabulary') {
      const qsFilter = routeState?.searchParams?.get('filter');
      if (qsFilter && ['all', 'due', 'mastered'].includes(qsFilter)) {
        state.vocabFilter = qsFilter;
        document.querySelectorAll('.filter-pill[data-vocab-filter]').forEach((p) => {
          const act = p.dataset.vocabFilter === qsFilter;
          p.classList.toggle('active', act);
          p.setAttribute('aria-selected', act ? 'true' : 'false');
        });
      }
      const wantsFlashcards =
        routeState?.subview === 'flashcards' ||
        routeState?.searchParams?.get('view') === 'flashcards';
      if (state.user) {
        await loadVocabulary();
        if (wantsFlashcards && state.vocabItems.length > 0 && !state.flashcardsOpen) {
          setFlashcardsOpen(true, { skipUrlSync: true });
        } else if (!wantsFlashcards && state.flashcardsOpen) {
          setFlashcardsOpen(false, { skipUrlSync: true });
        }
      } else {
        renderVocabulary();
      }
    } else if (resolved === 'history') {
      const qsTrack = routeState?.searchParams?.get('track');
      const qsCache = routeState?.searchParams?.get('cache');
      if (qsTrack && ['all', 'shadowing', 'street_talk', 'phonetics'].includes(qsTrack)) {
        state.ledgerTrackFilter = qsTrack;
        document.querySelectorAll('[data-ledger-track]').forEach((p) => {
          const act = p.dataset.ledgerTrack === qsTrack;
          p.classList.toggle('active', act);
          p.setAttribute('aria-selected', act ? 'true' : 'false');
        });
      }
      if (qsCache && ['all', 'coach', 'translations', 'transcript', 'notes'].includes(qsCache)) {
        state.ledgerCacheFilter = qsCache;
        const cSel = document.getElementById('ledger-cache-filter');
        if (cSel) cSel.value = qsCache;
      }
      if (state.user) {
        await loadUsageAndHistory();
      } else {
        renderHistorySectionAuthState();
      }
    } else if (resolved === 'american-extractor') {
      await window.FlaptapAmericanExtractor?.init?.(routeState);
    } else if (resolved === 'learning-library') {
      await window.FlaptapLearningLibrary?.init?.(routeState);
    }
  }

  function switchSection(section, opts = {}) {
    if (window.FlaptapRouter && !opts.skipRouteUpdate) {
      window.FlaptapRouter.navigate(section, opts);
      return;
    }
    const resolved = activateSectionPanel(section);
    applyRoute({ section: resolved, searchParams: new URLSearchParams(window.location.search) });
  }

  /* ========================================================================
     ACCOUNT, SESSIONS & SECURITY (EMAIL & PASSWORD)
     ======================================================================== */

  function updateAccountHeader() {
    const btn = document.getElementById('open-account-btn');
    const label = document.getElementById('account-btn-label');
    const avatar = document.getElementById('account-avatar');
    const avatarImg = document.getElementById('account-avatar-img');
    const guestIcon = document.getElementById('account-guest-icon');

    if (state.user) {
      btn?.classList.add('authenticated');
      if (label) label.textContent = state.user.name.split(' ')[0];
      if (avatarImg) avatarImg.hidden = true;
      if (avatar) {
        avatar.textContent = (state.user.name[0] || 'U').toUpperCase();
        avatar.hidden = false;
      }
      if (guestIcon) guestIcon.style.display = 'none';
    } else {
      btn?.classList.remove('authenticated');
      if (label) label.textContent = t('signIn');
      if (avatar) avatar.hidden = true;
      if (avatarImg) avatarImg.hidden = true;
      if (guestIcon) guestIcon.style.display = '';
    }
  }

  function updateStatsDisplay(stats) {
    const safeStats = state.user && stats
      ? stats
      : {
          lessonsCount: 0,
          completedDrills: 0,
          vocabularyCount: 0,
          dueVocabularyCount: 0,
          practiceMinutes: 0,
          streakDays: 0,
          dailyGoalMinutes: 15,
        };
    state.stats = safeStats;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val ?? 0);
    };
    set('stat-lessons-count', safeStats.lessonsCount);
    set('stat-drills-count', safeStats.completedDrills);
    set('stat-vocab-count', safeStats.vocabularyCount);
    set('stat-minutes-count', safeStats.practiceMinutes);
    set('header-streak-count', safeStats.streakDays);
  }

  async function handleAuthSuccess(res, toastMsg) {
    state.user = res.user;
    state.authToken = res.token || state.authToken || '';
    if (state.authToken) {
      localStorage.setItem('flaptap_auth_token', state.authToken);
    }
    if (res.user?.nativeLanguage) {
      localStorage.setItem('flaptap_trans_lang', res.user.nativeLanguage);
    }

    updateAccountHeader();
    updateStatsDisplay(res.stats);
    closeAccountDrawer();
    if (toastMsg) showToast(toastMsg);

    await loadLibrary();
    if (state.section === 'vocabulary') await loadVocabulary();
    if (state.section === 'history') await loadUsageAndHistory();
    checkUrlCache((document.getElementById('youtube-url-input')?.value || '').trim());
    window.dispatchEvent(new CustomEvent('flaptap:auth-changed', { detail: { user: state.user } }));

    await resumePendingAction();
  }

  async function loadSessionAndStats(options = {}) {
    const tokenAtStart = state.authToken || '';
    const previousUserId = state.user?.id || null;
    try {
      const data = await apiFetch('/api/auth/me', { method: 'GET' });
      state.user = data.authenticated ? data.user : null;
      state.sessionLoaded = true;
      if (!state.user) {
        const currentStored = localStorage.getItem('flaptap_auth_token') || '';
        if (!currentStored || currentStored === tokenAtStart) {
          state.authToken = '';
          localStorage.removeItem('flaptap_auth_token');
        } else {
          state.authToken = currentStored;
        }
        state.lessons = [];
        state.vocabItems = [];
        state.usageOverview = null;
      } else if (state.user.nativeLanguage) {
        localStorage.setItem('flaptap_trans_lang', state.user.nativeLanguage);
      }
      updateAccountHeader();
      updateStatsDisplay(data.stats);
      const nextUserId = state.user?.id || null;
      if (!options.silent || nextUserId !== previousUserId) {
        window.dispatchEvent(new CustomEvent('flaptap:auth-changed', { detail: { user: state.user } }));
      }
    } catch {
      state.sessionLoaded = true;
      updateAccountHeader();
      updateStatsDisplay(null);
      if (!options.silent || previousUserId !== null) {
        window.dispatchEvent(new CustomEvent('flaptap:auth-changed', { detail: { user: null } }));
      }
    }
  }

  function applyLanguagesList(langs) {
    state.languages = Array.isArray(langs) ? langs : [];
    const optionsHtml = state.languages
      .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(l.native)})</option>`)
      .join('');

    const regSelect = document.getElementById('reg-native-lang');
    const prefSelect = document.getElementById('pref-native-lang');
    if (regSelect && optionsHtml) {
      regSelect.innerHTML = optionsHtml;
      regSelect.value = localStorage.getItem('flaptap_trans_lang') || 'ar';
    }
    if (prefSelect && optionsHtml) {
      prefSelect.innerHTML = optionsHtml;
      prefSelect.value = state.user?.nativeLanguage || localStorage.getItem('flaptap_trans_lang') || 'ar';
    }
    if (optionsHtml) {
      window.dispatchEvent(new CustomEvent('flaptap:languages-loaded'));
    }
  }

  async function loadLanguagesCatalog() {
    const CACHE_KEY = 'flaptap_languages_v1';
    let hasFreshCache = false;
    try {
      const cachedRaw = localStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached?.languages) && cached.languages.length > 0) {
          applyLanguagesList(cached.languages);
          if (Date.now() - Number(cached.ts || 0) < 24 * 60 * 60 * 1000) {
            hasFreshCache = true;
          }
        }
      }
    } catch {}

    if (hasFreshCache) return;

    try {
      const data = await apiFetch('/api/languages', { method: 'GET' });
      if (Array.isArray(data.languages) && data.languages.length > 0) {
        applyLanguagesList(data.languages);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), languages: data.languages }));
        } catch {}
      }
    } catch {}
  }

  function setAuthDrawerTab(mode) {
    const target = mode === 'register' ? 'register' : 'login';
    document.querySelectorAll('.auth-tab[data-auth-tab]').forEach((tEl) => {
      const isAct = tEl.dataset.authTab === target;
      tEl.classList.toggle('active', isAct);
      tEl.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const errBox = document.getElementById('auth-error-box');
    if (loginForm) loginForm.hidden = target !== 'login';
    if (regForm) regForm.hidden = target !== 'register';
    if (errBox) errBox.hidden = true;
  }

  async function loadActiveSessions() {
    const listEl = document.getElementById('active-sessions-list');
    const revokeOthersBtn = document.getElementById('revoke-other-sessions-btn');
    if (!listEl || !state.user) return;
    try {
      const res = await apiFetch('/api/auth/sessions', { method: 'GET' });
      state.activeSessions = Array.isArray(res.sessions) ? res.sessions : [];
      const otherCount = state.activeSessions.filter((s) => !s.isCurrent).length;
      if (revokeOthersBtn) revokeOthersBtn.hidden = otherCount === 0;

      listEl.innerHTML = state.activeSessions
        .map((s) => {
          const ua = U.parseUserAgent(s.userAgent);
          return `
            <div class="session-item">
              <div class="session-item-meta">
                <span class="session-item-title">${escapeHtml(ua)}</span>
                <span class="session-item-sub">${escapeHtml(formatShortDate(s.lastActiveAt))} ${s.isCurrent ? '· Current device' : ''}</span>
              </div>
              ${
                s.isCurrent
                  ? `<span class="status-chip is-done">${icon('circle-check')}Active</span>`
                  : `<button type="button" class="icon-action icon-action--xs is-danger" data-revoke-session="${escapeHtml(s.sessionId)}" aria-label="Revoke session" title="Revoke session">${icon('log-out')}</button>`
              }
            </div>
          `;
        })
        .join('');
    } catch {
      listEl.innerHTML = '';
    }
  }

  function openAccountDrawer(opts) {
    const options = opts || {};
    const backdrop = document.getElementById('account-drawer-backdrop');
    const guestView = document.getElementById('drawer-guest-view');
    const profileView = document.getElementById('drawer-profile-view');
    const errBox = document.getElementById('auth-error-box');
    const gateBanner = document.getElementById('auth-gate-banner');
    const gateDesc = document.getElementById('auth-gate-desc');

    if (errBox) errBox.hidden = true;

    if (state.user) {
      if (guestView) guestView.hidden = true;
      if (profileView) profileView.hidden = false;
      document.getElementById('profile-name').textContent = state.user.name;
      document.getElementById('profile-email').textContent = state.user.email;
      document.getElementById('pref-name').value = state.user.name;
      document.getElementById('pref-goal').value = String(state.user.dailyGoalMinutes || 15);
      const prefLang = document.getElementById('pref-native-lang');
      if (prefLang && state.user.nativeLanguage) prefLang.value = state.user.nativeLanguage;

      const avatarFallback = document.getElementById('profile-avatar-fallback');
      if (avatarFallback) {
        avatarFallback.textContent = (state.user.name[0] || 'U').toUpperCase();
        avatarFallback.hidden = false;
      }

      const providerBadge = document.getElementById('profile-provider-badge');
      if (providerBadge) {
        providerBadge.textContent = 'Email Account';
      }

      const currPwGroup = document.getElementById('current-password-group');
      const currPwInput = document.getElementById('current-password-input');
      if (currPwGroup && currPwInput) {
        const hasPw = state.user.hasPassword !== false;
        currPwGroup.hidden = !hasPw;
        currPwInput.required = hasPw;
        currPwInput.value = '';
      }
      const newPwInput = document.getElementById('new-password-input');
      if (newPwInput) newPwInput.value = '';

      loadActiveSessions();
    } else {
      if (guestView) guestView.hidden = false;
      if (profileView) profileView.hidden = true;
      if (gateBanner) {
        gateBanner.hidden = !options.fromGate;
        if (options.gateMessage && gateDesc) {
          gateDesc.textContent = options.gateMessage;
        }
      }
      setAuthDrawerTab(options.tab || 'login');
    }

    if (backdrop) backdrop.hidden = false;
  }

  function closeAccountDrawer() {
    const backdrop = document.getElementById('account-drawer-backdrop');
    if (backdrop) backdrop.hidden = true;
  }

  /* ========================================================================
     INSTANT URL CACHE DETECTION
     ======================================================================== */

  let urlCheckTimer = null;
  function checkUrlCache(rawUrl) {
    clearTimeout(urlCheckTimer);
    const banner = document.getElementById('url-cache-banner');
    if (!state.user || !rawUrl || rawUrl.length < 10) {
      state.urlCacheMatch = null;
      if (banner) banner.hidden = true;
      return;
    }

    urlCheckTimer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/tracks/shadowing/check-existing?url=${encodeURIComponent(rawUrl)}`, {
          method: 'GET',
        });
        if (!res.exists) {
          state.urlCacheMatch = null;
          if (banner) banner.hidden = true;
          return;
        }
        state.urlCacheMatch = res;
        const titleEl = document.getElementById('url-cache-title');
        const pillsEl = document.getElementById('url-cache-pills');
        const openBtn = document.getElementById('open-cached-lesson-btn');
        if (titleEl) titleEl.textContent = res.title || 'Raw YouTube transcript cached on disk';
        if (openBtn) openBtn.hidden = !res.id;

        const pills = [];
        if (res.cacheInfo?.transcriptCached) pills.push(`<span class="cache-pill active">Transcript</span>`);
        if (res.cacheInfo?.aiCoachCached) pills.push(`<span class="cache-pill active">AI Coach</span>`);
        if (res.cacheInfo?.translationLanguages?.length) {
          pills.push(`<span class="cache-pill active">${escapeHtml(res.cacheInfo.translationLanguages.join(', ').toUpperCase())}</span>`);
        }
        if (pillsEl) pillsEl.innerHTML = pills.join('');
        if (banner) banner.hidden = false;
      } catch {
        state.urlCacheMatch = null;
        if (banner) banner.hidden = true;
      }
    }, 280);
  }

  /* ========================================================================
     LESSON LIBRARY
     ======================================================================== */

  async function loadLibrary(opts) {
    if (!state.user && !opts?.force) {
      state.lessons = [];
      renderLibrary();
      return;
    }
    try {
      const items = await apiFetch('/api/history', { method: 'GET' });
      state.lessons = Array.isArray(items) ? items : [];
      renderLibrary();
      if (state.section === 'history') {
        renderHistoryLedger();
      }
    } catch (error) {
      if (error.status !== 401) showToast(error.message);
      renderLibrary();
    }
  }

  function trackLabel(track) {
    if (track === 'street_talk') return t('trackDialogue');
    if (track === 'phonetics') return t('trackPronunciation');
    return t('trackVideo');
  }

  function detectClientPlatform(rawUrl) {
    const u = String(rawUrl || '').trim().toLowerCase();
    if (!u || !/^https?:\/\//.test(u)) return null;
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { id: 'youtube', label: 'YouTube Video', note: 'Instant captions + word timestamps' };
    if (u.includes('tiktok.com')) return { id: 'tiktok', label: 'TikTok Video', note: 'Audio extraction + word timestamps' };
    if (u.includes('instagram.com')) return { id: 'instagram', label: 'Instagram Reel / Video', note: 'Audio extraction + word timestamps' };
    if (u.includes('twitter.com') || u.includes('x.com')) return { id: 'twitter', label: 'X / Twitter Video', note: 'Audio extraction + word timestamps' };
    if (u.includes('podcasts.apple.com')) return { id: 'apple_podcasts', label: 'Apple Podcasts', note: 'Episode audio + word timestamps' };
    if (u.includes('vimeo.com')) return { id: 'vimeo', label: 'Vimeo Video', note: 'Audio extraction + word timestamps' };
    if (u.includes('soundcloud.com')) return { id: 'soundcloud', label: 'SoundCloud Audio', note: 'Audio extraction + word timestamps' };
    if (u.includes('ted.com')) return { id: 'ted', label: 'TED Talk', note: 'Audio extraction + word timestamps' };
    if (u.includes('loom.com')) return { id: 'loom', label: 'Loom Video', note: 'Audio extraction + word timestamps' };
    if (/\.(mp3|m4a|wav|ogg|opus|flac|aac)(\?|$)/i.test(u)) return { id: 'direct_audio', label: 'Direct Audio URL', note: 'Streams natively in Studio' };
    if (/\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(u)) return { id: 'direct_video', label: 'Direct Video URL', note: 'Streams natively in Studio' };
    if (u.includes('rss') || u.includes('feed') || u.endsWith('.xml')) return { id: 'podcast_rss', label: 'Podcast RSS Feed', note: 'Latest episode audio + word timestamps' };
    return { id: 'other', label: 'Web Media Link', note: 'Auto-extract audio & word timestamps' };
  }

  function platformDisplayLabel(platform) {
    const map = {
      youtube: 'YouTube',
      tiktok: 'TikTok',
      instagram: 'Instagram',
      twitter: 'X / Twitter',
      apple_podcasts: 'Apple Podcasts',
      podcast_rss: 'Podcast RSS',
      vimeo: 'Vimeo',
      soundcloud: 'SoundCloud',
      ted: 'TED',
      loom: 'Loom',
      direct_audio: 'Audio URL',
      direct_video: 'Video URL',
      uploaded_audio: 'Uploaded Audio',
      uploaded_video: 'Uploaded Video',
      other: 'Web Media',
    };
    return map[platform] || '';
  }

  function matchesPlatformFilter(item, filter) {
    if (!filter || filter === 'all') return true;
    const p = String(item.platform || (item.videoId ? 'youtube' : '')).toLowerCase();
    if (filter === 'youtube') return p === 'youtube';
    if (filter === 'podcast') return ['apple_podcasts', 'podcast_rss', 'soundcloud', 'direct_audio'].includes(p);
    if (filter === 'social') return ['tiktok', 'instagram', 'twitter', 'vimeo', 'ted', 'loom', 'direct_video', 'other'].includes(p);
    if (filter === 'uploaded') return p === 'uploaded_audio' || p === 'uploaded_video';
    return true;
  }

  function persistShadowingReviewPrefs() {
    try {
      const sel = state.lessonsAiSelector?.getSelection?.();
      if (sel && (sel.keyId || sel.model || sel.variant)) {
        sessionStorage.setItem(
          'flaptap_shadowing_review_opts',
          JSON.stringify({
            keyId: sel.keyId || undefined,
            model: sel.model || undefined,
            variant: sel.variant || undefined,
          }),
        );
      }
    } catch {}
  }

  function setLessonsInputTab(tab) {
    const next = tab === 'upload' ? 'upload' : 'link';
    state.lessonsInputTab = next;
    document.querySelectorAll('[data-lessons-input]').forEach((btn) => {
      const active = btn.getAttribute('data-lessons-input') === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-lessons-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-lessons-panel') !== next;
    });
  }

  function initLessonsAiSelector() {
    if (state.lessonsAiSelector || !window.FlaptapAiSelector) return;
    const mount = document.getElementById('lessons-ai-selector-mount');
    if (!mount) return;
    state.lessonsAiSelector = window.FlaptapAiSelector.create({
      container: mount,
      idPrefix: 'lessons-aisel',
      persistenceKey: 'shadowing_review',
      title: 'AI Verbatim Review Model',
      compact: true,
      showRunButton: false,
      hideMetaChips: true,
      fetcher: apiFetch,
      onChange: () => {
        persistShadowingReviewPrefs();
      },
    });
    state.lessonsAiSelector.init();
  }

  function setLessonsSelectedFile(file) {
    state.lessonsSelectedFile = file || null;
    const el = document.getElementById('lessons-file-selected');
    const statusEl = document.getElementById('lessons-upload-status');
    if (statusEl) statusEl.hidden = true;
    if (!el) return;
    if (!file) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    el.hidden = false;
    el.textContent = `${file.name} (${sizeMb} MB)`;
  }

  async function handleLessonFileUpload() {
    if (state.lessonsUploading) return;
    const file = state.lessonsSelectedFile;
    if (!file) {
      showToast('Select an audio or video file first.');
      document.getElementById('lessons-file-input')?.click();
      return;
    }
    if (!requireAuthBeforeAction({ type: 'upload_lesson' }, 'Sign in to upload and transcribe audio or video files.')) {
      return;
    }

    const uploadBtn = document.getElementById('upload-lesson-btn');
    const statusEl = document.getElementById('lessons-upload-status');
    const autoReview = Boolean(document.getElementById('lessons-auto-review')?.checked);
    persistShadowingReviewPrefs();

    state.lessonsUploading = true;
    if (uploadBtn) uploadBtn.disabled = true;
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.classList.remove('is-error');
      statusEl.textContent = `Uploading & transcribing "${file.name}" with word-level timestamps...`;
    }

    try {
      const form = new FormData();
      form.append('file', file);
      const headers = apiHeaders();
      delete headers['Content-Type'];
      const res = await fetch('/api/tracks/shadowing/upload', {
        method: 'POST',
        headers,
        body: form,
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || `Upload failed (${res.status})`);
      }
      if (!data.id) {
        throw new Error('Upload succeeded but returned no lesson ID.');
      }
      const qs = new URLSearchParams({ id: data.id });
      if (autoReview && data.reviewStatus !== 'ready') {
        qs.set('autoreview', '1');
      }
      window.location.href = `/studio?${qs.toString()}`;
    } catch (err) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.classList.add('is-error');
        statusEl.textContent = err?.message || 'Upload failed.';
      }
      showToast(err?.message || 'Upload failed.');
    } finally {
      state.lessonsUploading = false;
      if (uploadBtn) uploadBtn.disabled = false;
    }
  }

  function buildCachePillsHtml(item) {
    const ci = item.cacheInfo;
    const pills = [];
    if (item.reviewStatus === 'ready') {
      pills.push(`<span class="cache-pill active">${icon('circle-check')}AI Reviewed</span>`);
    }
    if (Number(item.speakerCount) > 1) {
      pills.push(`<span class="cache-pill ltr-num">${Number(item.speakerCount)} speakers</span>`);
    }
    if (ci?.transcriptCached) pills.push(`<span class="cache-pill">${icon('file-text')}Transcript</span>`);
    if (ci?.aiCoachCached) {
      pills.push(
        `<span class="cache-pill active">${icon('sparkles')}Coach${ci.aiInsightsCount ? ` · ${ci.aiInsightsCount}` : ''}</span>`,
      );
    }
    if (Array.isArray(ci?.translationLanguages) && ci.translationLanguages.length > 0) {
      pills.push(
        `<span class="cache-pill active">${icon('globe')}${escapeHtml(ci.translationLanguages.map((c) => c.toUpperCase()).join('+'))}</span>`,
      );
    }
    if (ci?.hasNotes) pills.push(`<span class="cache-pill notes">${icon('pencil')}Notes</span>`);
    if (item.payloadBytes) {
      pills.push(`<span class="cache-pill ltr-num">${icon('database')}${escapeHtml(formatBytes(item.payloadBytes))}</span>`);
    }
    return pills.join('');
  }

  const CHECK_ICON_SVG =
    window.FlaptapCheck?.ICON_SVG ||
    '<svg class="ft-check-svg chk-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path class="ft-check-tick chk-tick" d="M5.2 12.75 L9.55 17.1 Q10.1 17.65 10.65 17.05 L18.9 7.35" pathLength="1" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  function renderCheckButtonHtml({
    checked = false,
    attrs = '',
    label = '',
    pill = false,
    text = '',
    pillLabel = '',
    className = '',
    size = '',
    id = '',
  } = {}) {
    const titleText = label || text || pillLabel || (checked ? t('completedLabel') : t('markComplete'));
    if (window.FlaptapCheck?.buttonHtml) {
      return window.FlaptapCheck.buttonHtml({
        checked,
        attrs,
        label: titleText,
        pill,
        text,
        pillLabel,
        className,
        size,
        id,
      });
    }
    const effectiveText = text || pillLabel || '';
    const isPill = Boolean(pill || pillLabel);
    const pillClass = isPill ? ' item-check-btn--pill' : '';
    const innerText = isPill && effectiveText ? `<span>${escapeHtml(effectiveText)}</span>` : '';
    return `<button type="button" class="item-check-btn${pillClass}${checked ? ' is-checked' : ''}" ${attrs} aria-pressed="${checked ? 'true' : 'false'}" aria-label="${escapeHtml(titleText)}" title="${escapeHtml(titleText)}">${CHECK_ICON_SVG}${innerText}</button>`;
  }

  /** Patch an existing check button in place with Apple tick animation. */
  function setCheckButtonState(btn, checked, options = {}) {
    if (!btn) return;
    const label = options.label || (checked ? t('completedLabel') : t('markComplete'));
    if (window.FlaptapCheck?.setState) {
      window.FlaptapCheck.setState(btn, checked, { ...options, label });
      return;
    }
    btn.classList.toggle('is-checked', checked);
    btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const pillLabel = btn.querySelector('span');
    if (pillLabel) pillLabel.textContent = label;
  }

  function renderSubjectProgressBar(
    targetElOrId,
    {
      total = 0,
      completed = 0,
      state: stateChip = null,
      singular = 'item',
      plural = 'items',
      doneHeadline = 'Completed',
      readyHeadline = 'Ready to study',
      pips = [],
      pipAttr = 'data-ft-jump-id',
    } = {},
  ) {
    const el = typeof targetElOrId === 'string' ? document.getElementById(targetElOrId) : targetElOrId;
    if (!el) return;

    const safeTotal = Math.max(0, Number(total) || 0);
    if (safeTotal === 0) {
      el.hidden = true;
      el.classList.remove('is-all-done');
      el.removeAttribute('data-guide-state');
      el.innerHTML = '';
      return;
    }

    const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
    const remaining = Math.max(0, safeTotal - safeCompleted);
    const chipTone = ['new', 'progress', 'done'].includes(stateChip?.tone) ? stateChip.tone : '';
    const isAllDone = remaining === 0 || chipTone === 'done';

    el.hidden = false;
    el.classList.toggle('is-all-done', isAllDone);
    el.setAttribute('data-guide-state', isAllDone ? 'done' : safeCompleted > 0 ? 'progress' : 'new');

    if (window.FlaptapStudyDock?.renderProgressDeckHtml) {
      el.innerHTML = window.FlaptapStudyDock.renderProgressDeckHtml({
        total: safeTotal,
        done: safeCompleted,
        singular,
        plural,
        doneHeadline,
        readyHeadline,
        pips,
        pipAttr,
      });
      return;
    }

    const pct = Math.round((safeCompleted / safeTotal) * 100);
    const isAr = (state?.uiLang || document.documentElement.lang) === 'ar';
    const totalLabel = isAr ? 'الإجمالي' : 'Total';
    const doneLabel = isAr ? 'مكتمل' : 'Completed';
    const remLabel = isAr ? 'المتبقي' : 'Remaining';
    const chipHtml =
      stateChip?.label && chipTone
        ? `<span class="sp-state sp-state--${chipTone}">${escapeHtml(stateChip.label)}</span><span class="sp-sep" aria-hidden="true"></span>`
        : '';

    el.innerHTML = `
      <div class="subject-progress-stats">
        ${chipHtml}
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

  async function toggleVocabCompletion(id) {
    const item = state.vocabItems.find((v) => v.id === id);
    if (!item) return;
    const prev = Boolean(item.isCompleted);
    const next = !prev;
    const totalVocab = state.vocabItems.length;
    const wasAllDone = totalVocab > 0 && state.vocabItems.every((v) => Boolean(v.isCompleted));
    item.isCompleted = next;

    const cardBtn = document.querySelector(`[data-vocab-complete="${CSS.escape(String(id))}"]`);
    const cardEl = cardBtn?.closest('.vocab-card');
    if (cardBtn) {
      setCheckButtonState(cardBtn, next, { animate: true });
      cardEl?.classList.toggle('is-item-completed', next);
      renderSubjectProgressBar('vocab-progress-bar', {
        total: state.vocabItems.length,
        completed: state.vocabItems.filter((v) => v.isCompleted).length,
      });
    } else {
      renderVocabulary();
    }

    const fcToggleBtn = document.getElementById('fc-complete-toggle-btn');
    if (fcToggleBtn && fcToggleBtn.dataset.vocabId === String(id)) {
      setCheckButtonState(fcToggleBtn, next, { animate: true });
    } else {
      renderFlashcard();
    }

    try {
      await apiFetch(`/api/vocabulary/${encodeURIComponent(id)}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: next }),
      });

      if (next && !wasAllDone && totalVocab > 0 && state.vocabItems.every((v) => Boolean(v.isCompleted))) {
        const originEl =
          fcToggleBtn && fcToggleBtn.dataset.vocabId === String(id) && fcToggleBtn.offsetParent
            ? fcToggleBtn
            : cardBtn;
        window.FlaptapCelebrate?.trigger?.({
          title: 'Vocabulary Mastered!',
          subtitle: `All ${totalVocab} word${totalVocab === 1 ? '' : 's'} completed`,
          originEl,
        });
      }
    } catch (err) {
      item.isCompleted = prev;
      renderVocabulary();
      renderFlashcard();
      showToast(err?.message || 'Could not update completion.');
    }
  }

  function buildLessonCardHtml(item, opts = {}) {
    const hasVideoThumb = item.track === 'shadowing' && (item.thumbnailUrl || item.videoId);
    const thumbSrc =
      item.thumbnailUrl ||
      (item.videoId ? `https://img.youtube.com/vi/${encodeURIComponent(item.videoId)}/hqdefault.jpg` : '');

    const platformStamp =
      item.track === 'shadowing'
        ? platformDisplayLabel(item.platform) || (item.videoId ? 'YouTube' : trackLabel(item.track))
        : trackLabel(item.track);

    const coverLabel =
      item.track === 'shadowing'
        ? platformStamp || 'Spoken Media'
        : item.accentDialect || 'General American English';

    const mediaHtml = hasVideoThumb
      ? `<img src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(item.title)}" loading="lazy" />`
      : `<div class="card-editorial-cover">
           <p class="cover-style-quote">${escapeHtml(coverLabel)}</p>
         </div>`;

    const playOverlayHtml = opts.applePlayOverlay
      ? `<span class="apple-card-play-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg></span>`
      : '';

    const sentencesCount = Number(item.sentencesCount || item.stats?.sentencesCount || 0);
    const wordCount = Number(item.wordCount || 0);
    const isDone = Boolean(item.isCompleted);
    const doneItems = Number(item.itemProgress?.doneItems ?? 0);
    const totalItems = Number(item.itemProgress?.totalItems ?? 0);
    const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
    const cefrHtml = item.cefrLevel
      ? `<span class="card-cefr ltr-num">${escapeHtml(item.cefrLevel)}</span>`
      : '';
    const statusBadgeHtml = isDone
      ? `<span class="cache-pill active" aria-label="${escapeHtml(t('completedLabel'))}">${escapeHtml(t('completedLabel'))}</span>`
      : '';
    const cachePillsHtml = buildCachePillsHtml(item);

    const progressMetaHtml = isDone
      ? `<span>· <strong class="ltr-num">100%</strong> ${escapeHtml(t('completedLabel'))}</span>`
      : doneItems > 0 && totalItems > 0
      ? `<span>· <strong class="ltr-num">${doneItems}/${totalItems}</strong> (${progressPct}%)</span>`
      : '';

    return `
      <article class="history-card${isDone ? ' is-item-completed' : ''}" data-lesson-id="${escapeHtml(item.id)}" tabindex="0" role="link" aria-label="${escapeHtml(item.title)}">
        <div class="card-media">
          ${mediaHtml}
          ${playOverlayHtml}
          <span class="card-track-stamp">${escapeHtml(platformStamp)}</span>
          <span class="card-duration-stamp">${formatDuration(item.durationSeconds)}</span>
          <button type="button" class="card-delete-btn" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete lesson" title="Delete lesson">
            ${icon('x')}
          </button>
        </div>
        <div class="card-body">
          <div class="card-creator-row">
            <span class="card-creator">${escapeHtml(item.creator || 'Speaker')}</span>
            <div style="display: inline-flex; align-items: center; gap: 6px;">
              ${cefrHtml}
              ${statusBadgeHtml}
            </div>
          </div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          ${cachePillsHtml ? `<div class="card-cache-strip">${cachePillsHtml}</div>` : ''}
          <div class="card-footer-meta">
            <div class="card-metrics">
              <span class="ltr-num">${Number(item.pacingWpm || 145)} WPM</span>
              ${sentencesCount > 0 ? `<span>· <strong class="ltr-num">${sentencesCount}</strong> ${escapeHtml(t('sentencesUnit'))}</span>` : ''}
              ${wordCount > 0 ? `<span>· <strong class="ltr-num">${wordCount.toLocaleString()}</strong> words</span>` : ''}
              ${progressMetaHtml}
            </div>
            <span class="card-open-cue">
              <span>${escapeHtml(t('openLesson'))}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </span>
          </div>
        </div>
      </article>
    `;
  }

  function renderTrackShelf(gridId, emptyId, countId, progressId, trackName) {
    const grid = document.getElementById(gridId);
    const empty = document.getElementById(emptyId);
    const countEl = document.getElementById(countId);
    if (!grid) return;

    if (!state.user) {
      grid.innerHTML = '';
      if (empty) empty.hidden = true;
      if (countEl) countEl.textContent = '0';
      renderSubjectProgressBar(progressId, { total: 0, completed: 0 });
      return;
    }

    const filtered = state.lessons.filter((item) => item.track === trackName);
    if (countEl) countEl.textContent = String(filtered.length);
    const isDialogue = trackName === 'street_talk';
    renderSubjectProgressBar(progressId, {
      total: filtered.length,
      completed: filtered.filter((i) => i.isCompleted).length,
      singular: isDialogue ? 'dialogue' : 'workout',
      plural: isDialogue ? 'dialogues' : 'workouts',
      doneHeadline: isDialogue ? 'Dialogues completed' : 'Workouts completed',
      readyHeadline: isDialogue ? 'Ready to practice' : 'Ready to drill',
      pipAttr: 'data-ft-jump-lesson',
      pips: filtered.map((item, idx) => ({
        id: item.id,
        displayNumber: idx + 1,
        label: item.title || (isDialogue ? 'Dialogue' : 'Workout'),
        done: Boolean(item.isCompleted),
      })),
    });
    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = filtered.map(buildLessonCardHtml).join('');
  }

  const lessonsStickyDock = window.FlaptapStudyDock?.createController
    ? window.FlaptapStudyDock.createController({
        sentinelId: 'lessons-sticky-sentinel',
        dockId: 'lessons-sticky-dock',
        rootId: 'lessons-items-root',
        isActive: () => state.section === 'lessons',
      })
    : null;

  const vocabStickyDock = window.FlaptapStudyDock?.createController
    ? window.FlaptapStudyDock.createController({
        sentinelId: 'vocab-sticky-sentinel',
        dockId: 'vocab-sticky-dock',
        rootId: 'vocab-items-root',
        isActive: () => state.section === 'vocabulary',
      })
    : null;

  const libraryPaginationBar = window.FlaptapPagination?.createBar
    ? window.FlaptapPagination.createBar({
        barId: 'library-pagination',
        onPageChange: (nextPage) => {
          state.libraryPage = nextPage;
          renderLibrary();
          window.FlaptapPagination?.scrollToTop?.('#lessons-items-root');
        },
      })
    : null;

  function renderLibrary() {
    renderTrackShelf(
      'dialogue-history-grid',
      'dialogue-empty-state',
      'dialogue-count-label',
      'dialogue-progress-bar',
      'street_talk',
    );
    renderTrackShelf(
      'pronunciation-history-grid',
      'pronunciation-empty-state',
      'pronunciation-count-label',
      'pronunciation-progress-bar',
      'phonetics',
    );

    const grid = document.getElementById('history-grid');
    const empty = document.getElementById('library-empty-state');
    const gateCard = document.getElementById('library-auth-gate-card');
    const clearBtn = document.getElementById('clear-library-btn');
    const countLabel = document.getElementById('library-count-label');
    const lessonsDock = document.getElementById('lessons-sticky-dock');
    if (!grid) return;

    if (!state.user) {
      grid.innerHTML = '';
      if (empty) empty.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      if (countLabel) countLabel.textContent = '0';
      if (gateCard) gateCard.hidden = false;
      if (lessonsDock) lessonsDock.hidden = true;
      libraryPaginationBar?.hide?.();
      renderSubjectProgressBar('lessons-progress-bar', { total: 0, completed: 0 });
      lessonsStickyDock?.disconnect?.();
      return;
    }

    if (gateCard) gateCard.hidden = true;

    const query = state.librarySearch.trim().toLowerCase();
    const filtered = state.lessons.filter((item) => {
      if (state.libraryFilter !== 'all' && item.track !== state.libraryFilter) return false;
      if (!matchesPlatformFilter(item, state.libraryPlatformFilter)) return false;
      if (state.libraryStatusFilter === 'reviewed' && item.reviewStatus !== 'ready') return false;
      if (state.libraryStatusFilter === 'pending' && item.reviewStatus === 'ready') return false;
      if (state.libraryStatusFilter === 'done' && !item.isCompleted) return false;
      if (state.libraryStatusFilter === 'progress') {
        const done = Number(item.itemProgress?.doneItems ?? 0);
        if (item.isCompleted || done <= 0) return false;
      }
      if (query) {
        const hay = `${item.title || ''} ${item.creator || ''} ${item.platform || ''} ${item.sourceUrl || ''} ${item.accentDialect || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    if (countLabel) countLabel.textContent = String(filtered.length);
    if (clearBtn) clearBtn.hidden = state.lessons.length === 0;
    const hasFilterOrLessons =
      state.lessons.length > 0 ||
      state.libraryFilter !== 'all' ||
      state.libraryPlatformFilter !== 'all' ||
      state.libraryStatusFilter !== 'all' ||
      Boolean(query);
    if (lessonsDock) lessonsDock.hidden = !hasFilterOrLessons;

    renderSubjectProgressBar('lessons-progress-bar', {
      total: filtered.length,
      completed: filtered.filter((i) => i.isCompleted).length,
      singular: 'lesson',
      plural: 'lessons',
      doneHeadline: 'Library completed',
      readyHeadline: 'Ready to practice',
      pipAttr: 'data-ft-jump-lesson',
      pips: filtered.map((item, idx) => ({
        id: item.id,
        displayNumber: idx + 1,
        label: item.title || 'Lesson',
        done: Boolean(item.isCompleted),
      })),
    });

    if (state.section === 'lessons' && hasFilterOrLessons) {
      lessonsStickyDock?.setup?.();
    } else {
      lessonsStickyDock?.disconnect?.();
    }

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      libraryPaginationBar?.hide?.();
      return;
    }

    if (empty) empty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(filtered.length / state.libraryPageSize));
    state.libraryPage = Math.max(1, Math.min(totalPages, state.libraryPage));
    const startIdx = (state.libraryPage - 1) * state.libraryPageSize;
    const pageItems = filtered.slice(startIdx, startIdx + state.libraryPageSize);

    grid.innerHTML = pageItems.map((item) => buildLessonCardHtml(item, { applePlayOverlay: true })).join('');
    libraryPaginationBar?.render?.({
      page: state.libraryPage,
      pageSize: state.libraryPageSize,
      total: filtered.length,
      totalPages,
      itemsCount: pageItems.length,
      visible: filtered.length > state.libraryPageSize,
    });
  }

  /* ========================================================================
     SECTION 5: FULL HISTORY, CACHING & USAGE CONTROL CENTER
     ======================================================================== */

  function renderHistorySectionAuthState() {
    const gateCard = document.getElementById('history-auth-gate-card');
    const authContent = document.getElementById('history-authenticated-content');
    if (!state.user) {
      if (gateCard) gateCard.hidden = false;
      if (authContent) authContent.hidden = true;
    } else {
      if (gateCard) gateCard.hidden = true;
      if (authContent) authContent.hidden = false;
    }
  }

  async function loadUsageAndHistory() {
    renderHistorySectionAuthState();
    if (!state.user) return;
    try {
      const [usage, items] = await Promise.all([
        apiFetch('/api/history/usage', { method: 'GET' }),
        apiFetch('/api/history', { method: 'GET' }),
      ]);
      state.usageOverview = usage;
      state.lessons = Array.isArray(items) ? items : [];
      if (usage?.stats) updateStatsDisplay(usage.stats);
      renderUsageOverview();
      renderHistoryLedger();
      renderActivityTimeline();
      renderLibrary();
    } catch (err) {
      if (err.status !== 401) showToast(err.message);
    }
  }

  function renderUsageOverview() {
    const u = state.usageOverview;
    if (!u) return;

    const stats = u.stats || {};
    const cache = u.cacheOverview || {};
    const goal = Math.max(5, Number(stats.dailyGoalMinutes) || 15);
    const today = Math.max(0, Number(stats.todayMinutes) || 0);
    const pct = Math.min(100, Math.round((today / goal) * 100));

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    set('usage-goal-badge', `${today} / ${goal} min`);
    const bar = document.getElementById('usage-goal-bar');
    if (bar) bar.style.width = `${pct}%`;

    set('usage-today-min', `${today} min`);
    set('usage-total-min', `${Number(stats.practiceMinutes) || 0} min`);
    set('usage-streak-days', `${Number(stats.streakDays) || 0} days`);

    document.querySelectorAll('#quick-goal-pills [data-goal-min]').forEach((btn) => {
      const isMatch = Number(btn.dataset.goalMin) === goal;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    set('usage-total-lessons-pill', `${Number(stats.lessonsCount) || 0} lessons`);
    set('usage-track-videos', String(stats.byTrack?.shadowing ?? 0));
    set('usage-track-dialogues', String(stats.byTrack?.street_talk ?? 0));
    set('usage-track-pron', String(stats.byTrack?.phonetics ?? 0));
    set(
      'usage-vocab-breakdown',
      `${Number(stats.dueVocabularyCount) || 0} / ${Number(stats.masteredVocabularyCount) || 0} / ${Number(stats.vocabularyCount) || 0}`,
    );

    set('usage-total-storage', formatBytes(cache.totalStorageBytes || 0));
    set(
      'usage-transcript-caches',
      `${Number(cache.transcriptCacheCount) || 0} (${formatBytes(cache.transcriptCacheBytes || 0)})`,
    );
    set('usage-coach-caches', `${Number(cache.aiCoachCachedCount) || 0} lessons`);
    set(
      'usage-translation-caches',
      `${Number(cache.totalCachedLanguagesCount) || 0} langs (${Number(cache.translationCachedLessonsCount) || 0} lessons)`,
    );
    set('usage-notes-count', String(Number(cache.notesCount) || 0));
  }

  function getFilteredSortedLedgerLessons() {
    const q = state.ledgerSearch.trim().toLowerCase();
    const filtered = state.lessons.filter((item) => {
      if (state.ledgerTrackFilter !== 'all' && item.track !== state.ledgerTrackFilter) return false;
      const ci = item.cacheInfo || {};
      if (state.ledgerCacheFilter === 'coach' && !ci.aiCoachCached) return false;
      if (state.ledgerCacheFilter === 'translations' && !(ci.translationLanguages?.length > 0)) return false;
      if (state.ledgerCacheFilter === 'transcript' && !ci.transcriptCached) return false;
      if (state.ledgerCacheFilter === 'notes' && !ci.hasNotes) return false;
      if (q) {
        const hay = `${item.title || ''} ${item.creator || ''} ${item.videoId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (state.ledgerSort === 'drills') {
        return (Number(b.completedDrills) || 0) - (Number(a.completedDrills) || 0);
      }
      if (state.ledgerSort === 'size') {
        const sizeA = (Number(a.payloadBytes) || 0) + (Number(a.cacheInfo?.transcriptBytes) || 0);
        const sizeB = (Number(b.payloadBytes) || 0) + (Number(b.cacheInfo?.transcriptBytes) || 0);
        return sizeB - sizeA;
      }
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });

    return filtered;
  }

  function syncBulkSelectionToolbar(visibleItems) {
    const validIds = new Set(state.lessons.map((l) => l.id));
    for (const id of Array.from(state.selectedLedgerIds)) {
      if (!validIds.has(id)) state.selectedLedgerIds.delete(id);
    }

    const count = state.selectedLedgerIds.size;
    const countEl = document.getElementById('ledger-selected-count');
    if (countEl) countEl.textContent = `(${count} selected)`;

    const selectAllCb = document.getElementById('ledger-select-all');
    if (selectAllCb) {
      selectAllCb.checked =
        visibleItems.length > 0 && visibleItems.every((item) => state.selectedLedgerIds.has(item.id));
    }

    ['bulk-clear-cache-btn', 'bulk-reset-progress-btn', 'bulk-delete-btn'].forEach((btnId) => {
      const b = document.getElementById(btnId);
      if (b) b.disabled = count === 0;
    });
  }

  function renderHistoryLedger() {
    const listEl = document.getElementById('history-ledger-list');
    const emptyEl = document.getElementById('history-ledger-empty');
    const countLabel = document.getElementById('ledger-count-label');
    if (!listEl) return;

    const visible = getFilteredSortedLedgerLessons();
    if (countLabel) countLabel.textContent = String(visible.length);
    syncBulkSelectionToolbar(visible);
    renderSubjectProgressBar('history-ledger-progress-bar', {
      total: visible.length,
      completed: visible.filter((i) => i.isCompleted).length,
      singular: 'lesson',
      plural: 'lessons',
      doneHeadline: 'All lessons completed',
      readyHeadline: 'Lesson ledger',
      pipAttr: 'data-ft-jump-ledger',
      pips: visible.map((item, idx) => ({
        id: item.id,
        displayNumber: idx + 1,
        label: item.title || 'Lesson',
        done: Boolean(item.isCompleted),
      })),
    });

    if (visible.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = visible
      .map((item) => {
        const checked = state.selectedLedgerIds.has(item.id) ? 'checked' : '';
        const isDone = Boolean(item.isCompleted);
        const totalBytes = (Number(item.payloadBytes) || 0) + (Number(item.cacheInfo?.transcriptBytes) || 0);
        const canReextract = item.track === 'shadowing' && (item.sourceUrl || item.videoId);
        const videoUrl = item.sourceUrl || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : '');

        return `
          <div class="history-ledger-row${isDone ? ' is-item-completed' : ''}" data-ledger-row="${escapeHtml(item.id)}">
            <div class="ledger-row-left">
              <input type="checkbox" data-ledger-check="${escapeHtml(item.id)}" ${checked} aria-label="Select ${escapeHtml(item.title)}" />
              <div class="ledger-row-main">
                <div class="ledger-title-check-row">
                  <a href="/studio?id=${encodeURIComponent(item.id)}" class="ledger-row-title">${escapeHtml(item.title)}</a>
                  ${
                    isDone
                      ? `<span class="cache-pill active">${escapeHtml(t('completedLabel'))}</span>`
                      : Number(item.itemProgress?.doneItems || 0) > 0 && Number(item.itemProgress?.totalItems || 0) > 0
                      ? `<span class="cache-pill ltr-num">${Number(item.itemProgress.doneItems)}/${Number(item.itemProgress.totalItems)}</span>`
                      : ''
                  }
                </div>
                <div class="ledger-row-meta">
                  <span>${escapeHtml(trackLabel(item.track))}</span>
                  <span>·</span>
                  <span>${escapeHtml(item.creator || 'Speaker')}</span>
                  <span>·</span>
                  <span class="ltr-num">${Number(item.sentencesCount || 0)} ${escapeHtml(t('sentencesUnit'))}</span>
                  <span>·</span>
                  <span class="ltr-num">${Number(item.completedDrills || 0)} ${escapeHtml(t('drillsDoneUnit'))}</span>
                  <span>·</span>
                  <span class="ltr-num">${escapeHtml(formatBytes(totalBytes))}</span>
                  <span>·</span>
                  <span>${escapeHtml(formatShortDate(item.updatedAt || item.createdAt))}</span>
                </div>
                <div class="ledger-cache-pills">${buildCachePillsHtml(item)}</div>
              </div>
            </div>
            <div class="ledger-row-actions">
              <a href="/studio?id=${encodeURIComponent(item.id)}" class="icon-action icon-action--sm" title="${escapeHtml(t('openLesson'))}" aria-label="${escapeHtml(t('openLesson'))}">${icon('play')}</a>
              ${
                canReextract
                  ? `<button type="button" class="icon-action icon-action--sm" data-reextract-url="${escapeHtml(videoUrl)}" title="Bypass transcript cache and re-extract fresh" aria-label="Bypass transcript cache and re-extract fresh">${icon('refresh')}</button>`
                  : ''
              }
              <button type="button" class="icon-action icon-action--sm" data-clear-item-cache="${escapeHtml(item.id)}" title="${escapeHtml(t('clearCacheItemBtn'))}" aria-label="${escapeHtml(t('clearCacheItemBtn'))}">${icon('database')}</button>
              <button type="button" class="icon-action icon-action--sm" data-reset-item-progress="${escapeHtml(item.id)}" title="${escapeHtml(t('resetProgressItemBtn'))}" aria-label="${escapeHtml(t('resetProgressItemBtn'))}">${icon('rotate-ccw')}</button>
              <button type="button" class="icon-action icon-action--sm is-danger" data-delete-item-ledger="${escapeHtml(item.id)}" title="${escapeHtml(t('deleteItemBtn'))}" aria-label="${escapeHtml(t('deleteItemBtn'))}">${icon('trash')}</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderActivityTimeline() {
    const listEl = document.getElementById('activity-timeline-list');
    const emptyEl = document.getElementById('activity-empty-state');
    const countLabel = document.getElementById('activity-count-label');
    const clearBtn = document.getElementById('clear-activity-log-btn');
    if (!listEl) return;

    const logs = Array.isArray(state.usageOverview?.recentActivity)
      ? state.usageOverview.recentActivity
      : [];

    if (countLabel) countLabel.textContent = String(logs.length);
    if (clearBtn) clearBtn.hidden = logs.length === 0;

    if (logs.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = logs
      .map((log) => {
        const modeTag = String(log.mode || 'shadow').toUpperCase();
        const mins = Math.max(1, Math.round((Number(log.durationSec) || 60) / 60));
        return `
          <div class="activity-row" data-activity-id="${escapeHtml(log.id)}">
            <div class="activity-row-left">
              <span class="cache-pill active ltr-num">${escapeHtml(modeTag)}</span>
              <strong>${escapeHtml(log.lessonTitle || 'Lesson')}</strong>
              <span style="color: var(--ink-muted); font-size: 0.78rem;">(${escapeHtml(trackLabel(log.track))})</span>
            </div>
            <div class="activity-row-right">
              <span class="ltr-num">+${mins} min</span>
              <span>·</span>
              <span>${escapeHtml(formatShortDate(log.createdAt))}</span>
              <button type="button" class="icon-action icon-action--xs is-danger" data-delete-activity="${escapeHtml(log.id)}" aria-label="Delete log entry" title="Delete log entry">${icon('trash')}</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function exportFullAccountJson() {
    if (!requireAuthBeforeAction({ type: 'export_backup' })) return;
    try {
      const payload = await apiFetch('/api/history/export', { method: 'GET' });
      const stamp = new Date().toISOString().slice(0, 10);
      U.downloadBlob(
        JSON.stringify(payload, null, 2),
        `flaptap-account-backup-${stamp}.json`,
        'application/json;charset=utf-8',
      );
      showToast('Full account backup downloaded (.json)');
    } catch (err) {
      showToast(err.message);
    }
  }

  /* ========================================================================
     VOCABULARY VAULT & FLASHCARDS
     ======================================================================== */

  function syncFlashcardButtonDom() {
    const fcBtn = document.getElementById('toggle-flashcards-btn');
    if (!fcBtn) return;
    const isOpen = Boolean(state.user && state.flashcardsOpen && state.vocabItems.length > 0);
    fcBtn.classList.toggle('active', isOpen);
    fcBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    const span = fcBtn.querySelector('span') || fcBtn;
    span.textContent = isOpen ? t('hideFlashcardsBtn') : t('practiceFlashcardsBtn');
    // Keep clickable when signed out so visitor gets Sign-In prompt; disable only when signed in with 0 words
    fcBtn.disabled = Boolean(state.user && state.vocabItems.length === 0);
  }

  function setFlashcardsOpen(open, opts = {}) {
    state.flashcardsOpen = Boolean(open && state.vocabItems.length > 0);
    state.flashcardIndex = 0;
    state.flashcardRevealed = false;
    syncFlashcardButtonDom();
    renderFlashcard();
    if (!opts.skipUrlSync) {
      window.FlaptapRouter?.updateSubroute?.('vocabulary', {
        subview: state.flashcardsOpen ? 'flashcards' : '',
        filter: state.vocabFilter,
        replace: Boolean(opts.replace),
      });
    }
  }

  async function loadVocabulary() {
    if (!state.user) {
      state.vocabItems = [];
      renderVocabulary();
      return;
    }
    try {
      const params = new URLSearchParams();
      if (state.vocabFilter !== 'all') params.set('filter', state.vocabFilter);
      if (state.vocabSearch.trim()) params.set('q', state.vocabSearch.trim());
      const items = await apiFetch(`/api/vocabulary?${params.toString()}`, { method: 'GET' });
      state.vocabItems = Array.isArray(items) ? items : [];
      if (state.vocabItems.length === 0) state.flashcardsOpen = false;
      renderVocabulary();
      renderFlashcard();
    } catch (error) {
      if (error.status !== 401) showToast(error.message);
      renderVocabulary();
    }
  }

  function renderVocabulary() {
    const grid = document.getElementById('vocab-grid');
    const empty = document.getElementById('vocab-empty-state');
    const gateCard = document.getElementById('vocab-auth-gate-card');
    const stage = document.getElementById('flashcard-stage');
    const vocabDock = document.getElementById('vocab-sticky-dock');
    if (!grid) return;

    syncFlashcardButtonDom();

    if (!state.user) {
      grid.innerHTML = '';
      if (empty) empty.hidden = true;
      if (stage) stage.hidden = true;
      if (gateCard) gateCard.hidden = false;
      if (vocabDock) vocabDock.hidden = true;
      renderSubjectProgressBar('vocab-progress-bar', { total: 0, completed: 0 });
      vocabStickyDock?.disconnect?.();
      return;
    }

    if (gateCard) gateCard.hidden = true;

    const hasVocabOrFilter =
      state.vocabItems.length > 0 || state.vocabFilter !== 'all' || Boolean(state.vocabSearch.trim());
    if (vocabDock) vocabDock.hidden = !hasVocabOrFilter;

    renderSubjectProgressBar('vocab-progress-bar', {
      total: state.vocabItems.length,
      completed: state.vocabItems.filter((v) => v.isCompleted).length,
      singular: 'word',
      plural: 'words',
      doneHeadline: 'Deck mastered',
      readyHeadline: 'Ready to review',
      pipAttr: 'data-ft-jump-vocab',
      pips: state.vocabItems.map((v, idx) => ({
        id: v.id,
        displayNumber: idx + 1,
        label: v.term || 'Word',
        done: Boolean(v.isCompleted),
      })),
    });

    if (state.section === 'vocabulary' && hasVocabOrFilter) {
      vocabStickyDock?.setup?.();
    } else {
      vocabStickyDock?.disconnect?.();
    }

    if (state.vocabItems.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      if (stage) stage.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;

    grid.innerHTML = state.vocabItems
      .map((v) => {
        const level = Math.max(0, Math.min(4, Number(v.masteryLevel) || 0));
        const isDone = Boolean(v.isCompleted);
        const dots = [0, 1, 2, 3]
          .map((i) => `<span class="mastery-dot ${i < level ? 'filled' : ''}"></span>`)
          .join('');

        const lessonLink = v.lessonId
          ? `<a href="/studio?id=${encodeURIComponent(v.lessonId)}&t=${encodeURIComponent(v.timestampSec || 0)}" style="font-weight: 600; color: var(--ink);">${escapeHtml(t('openInContext'))} →</a>`
          : `<span></span>`;

        return `
          <article class="vocab-card${isDone ? ' is-item-completed' : ''}" data-vocab-id="${escapeHtml(v.id)}">
            <div class="vocab-card-head">
              <h3 class="vocab-term">${escapeHtml(v.term)}</h3>
              <div class="vocab-card-top-actions">
                ${window.FlaptapCopy ? window.FlaptapCopy.buttonHtml(v.term, { className: 'icon-action icon-action--xs' }) : ''}
                ${v.partOfSpeech ? `<span class="vocab-pos">${escapeHtml(v.partOfSpeech)}</span>` : ''}
                ${renderCheckButtonHtml({
                  checked: isDone,
                  attrs: `data-vocab-complete="${escapeHtml(v.id)}"`,
                })}
                <button type="button" class="icon-action icon-action--xs is-danger" data-delete-vocab="${escapeHtml(v.id)}" aria-label="Remove word" title="Remove word">
                  ${icon('x')}
                </button>
              </div>
            </div>
            ${v.ipa ? `<div class="vocab-ipa ltr-num">${escapeHtml(v.ipa)}</div>` : ''}
            <p class="vocab-def">${escapeHtml(v.definition)}</p>
            ${
              v.generalTranslation
                ? `<div class="vocab-sense-row is-general"><span class="sense-badge">General</span><p class="vocab-general-trans" dir="auto">${escapeHtml(v.generalTranslation)}</p></div>`
                : ''
            }
            ${
              v.translation
                ? `<div class="vocab-sense-row is-context">${v.generalTranslation ? '<span class="sense-badge is-context">In context</span>' : ''}<p class="vocab-def vocab-context-trans" dir="auto" style="font-weight: 600; color: var(--ink);">${escapeHtml(v.translation)}</p></div>`
                : ''
            }
            ${v.contextSentence ? `<blockquote class="vocab-context">“${escapeHtml(v.contextSentence)}”</blockquote>` : ''}
            <div class="vocab-card-foot">
              <div class="mastery-dots" data-level="${level}" title="Mastery level ${level}/4">${dots}</div>
              ${lessonLink}
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderFlashcard() {
    const stage = document.getElementById('flashcard-stage');
    syncFlashcardButtonDom();
    if (!stage || !state.user || !state.flashcardsOpen || state.vocabItems.length === 0) {
      if (stage) stage.hidden = true;
      return;
    }

    stage.hidden = false;
    const idx = Math.max(0, Math.min(state.vocabItems.length - 1, state.flashcardIndex));
    state.flashcardIndex = idx;
    const item = state.vocabItems[idx];

    document.getElementById('flashcard-progress-text').textContent = `${idx + 1} / ${state.vocabItems.length}`;
    const fcToggleBtn = document.getElementById('fc-complete-toggle-btn');
    const fcCompleteLabel = document.getElementById('fc-complete-label');
    if (fcToggleBtn) {
      const done = Boolean(item.isCompleted);
      fcToggleBtn.dataset.vocabId = item.id;
      setCheckButtonState(fcToggleBtn, done, { animate: false });
      if (fcCompleteLabel) {
        fcCompleteLabel.textContent = done ? t('completedLabel') : t('markComplete');
      }
    }
    document.getElementById('fc-term').textContent = item.term;
    document.getElementById('fc-ipa').textContent = item.ipa || '';
    document.getElementById('fc-context').textContent = item.contextSentence ? `“${item.contextSentence}”` : '';
    document.getElementById('fc-def').textContent = item.definition;

    const genWrap = document.getElementById('fc-general-trans-wrap');
    const genEl = document.getElementById('fc-general-trans');
    const hasGeneral = Boolean(item.generalTranslation && item.generalTranslation.trim());
    if (genWrap && genEl) {
      genEl.textContent = item.generalTranslation || '';
      genWrap.hidden = !hasGeneral;
    }
    const ctxSenseLabel = document.getElementById('fc-context-sense-label');
    if (ctxSenseLabel) {
      ctxSenseLabel.hidden = !hasGeneral || !Boolean(item.translation && item.translation.trim());
    }
    document.getElementById('fc-trans').textContent = item.translation || '';

    document.getElementById('fc-answer').hidden = !state.flashcardRevealed;
    document.getElementById('fc-rating-actions').hidden = !state.flashcardRevealed;
    document.getElementById('fc-flip-hint').hidden = state.flashcardRevealed;
  }

  /* ========================================================================
     DIALOGUE & PRONUNCIATION GENERATION EXECUTORS
     ======================================================================== */

  async function executeDialogueGeneration(scenario) {
    const btn = document.getElementById('generate-dialogue-btn');
    await withButtonLoading(btn, t('generating'), async () => {
      try {
        const created = await apiFetch('/api/tracks/street-talk/start', {
          method: 'POST',
          body: JSON.stringify({ scenario }),
        });
        window.location.href = `/studio?id=${encodeURIComponent(created.id)}`;
      } catch (error) {
        if (error.status === 401) {
          state.user = null;
          updateAccountHeader();
          requireAuthBeforeAction({ type: 'dialogue', scenario });
          return;
        }
        showToast(error.message);
      }
    });
  }

  async function executePronunciationGeneration(topic) {
    const btn = document.getElementById('generate-pronunciation-btn');
    await withButtonLoading(btn, t('generating'), async () => {
      try {
        const created = await apiFetch('/api/tracks/phonetics/drill', {
          method: 'POST',
          body: JSON.stringify({ topic }),
        });
        window.location.href = `/studio?id=${encodeURIComponent(created.id)}`;
      } catch (error) {
        if (error.status === 401) {
          state.user = null;
          updateAccountHeader();
          requireAuthBeforeAction({ type: 'pronunciation', topic });
          return;
        }
        showToast(error.message);
      }
    });
  }

  /* ========================================================================
     EVENT BINDINGS
     ======================================================================== */

  function bindEvents() {
    // Theme & UI Language
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('ui-lang-select')?.addEventListener('change', (e) => {
      applyUiLanguage(e.target.value);
    });

    // Global AI Provider Keys button in Sidebar Footer
    document.getElementById('sidebar-ai-keys-btn')?.addEventListener('click', () => {
      window.FlaptapAiSelector?.openKeysManager?.(apiFetch);
    });

    // Bind sticky dock scroll/resize observers + clickable progress pips
    lessonsStickyDock?.bind?.();
    vocabStickyDock?.bind?.();

    document.addEventListener('click', (e) => {
      const lessonPip = e.target.closest('[data-ft-jump-lesson]');
      if (lessonPip) {
        const id = lessonPip.getAttribute('data-ft-jump-lesson');
        const card = id ? document.querySelector(`.history-card[data-lesson-id="${CSS.escape(id)}"]`) : null;
        if (card) {
          if (state.section === 'lessons' && lessonsStickyDock?.scrollCardIntoView) {
            lessonsStickyDock.scrollCardIntoView(card);
          } else {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }

      const vocabPip = e.target.closest('[data-ft-jump-vocab]');
      if (vocabPip) {
        const id = vocabPip.getAttribute('data-ft-jump-vocab');
        const card = id
          ? document.querySelector(`#vocab-grid [data-vocab-complete="${CSS.escape(id)}"]`)?.closest('.vocab-card')
          : null;
        if (card) {
          if (vocabStickyDock?.scrollCardIntoView) vocabStickyDock.scrollCardIntoView(card);
          else card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const ledgerPip = e.target.closest('[data-ft-jump-ledger]');
      if (ledgerPip) {
        const id = ledgerPip.getAttribute('data-ft-jump-ledger');
        const row = id ? document.querySelector(`[data-ledger-row="${CSS.escape(id)}"]`) : null;
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // Gate Card Sign-In / Create Account CTA Buttons
    document.addEventListener('click', (e) => {
      const authTrigger = e.target.closest('[data-open-auth]');
      if (authTrigger) {
        openAccountDrawer({
          fromGate: false,
          tab: authTrigger.getAttribute('data-open-auth') || 'login',
        });
      }
    });

    // URL Input Instant Cache Check + Live Platform Detection + Media Upload + AI Review Model Toggle
    const lessonsUrlInput = document.getElementById('youtube-url-input');
    const lessonsPasteBtn = document.getElementById('lessons-paste-btn');
    const lessonsClearBtn = document.getElementById('lessons-clear-url-btn');
    const lessonsUrlDetect = document.getElementById('lessons-url-detect');
    const syncLessonsUrlButtons = () => {
      const val = (lessonsUrlInput?.value || '').trim();
      const hasVal = Boolean(val);
      if (lessonsPasteBtn) lessonsPasteBtn.hidden = hasVal;
      if (lessonsClearBtn) lessonsClearBtn.hidden = !hasVal;
      if (lessonsUrlDetect) {
        const det = detectClientPlatform(val);
        if (det) {
          lessonsUrlDetect.hidden = false;
          lessonsUrlDetect.innerHTML = `<span class="lessons-detect-pill">${escapeHtml(det.label)}</span><span class="lessons-detect-note">${escapeHtml(det.note)}</span>`;
        } else {
          lessonsUrlDetect.hidden = true;
          lessonsUrlDetect.innerHTML = '';
        }
      }
    };
    syncLessonsUrlButtons();

    lessonsUrlInput?.addEventListener('input', (e) => {
      syncLessonsUrlButtons();
      checkUrlCache((e.target.value || '').trim());
    });

    document.querySelectorAll('[data-lessons-input]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        setLessonsInputTab(tabBtn.getAttribute('data-lessons-input') || 'link');
      });
    });

    const lessonsDropzone = document.getElementById('lessons-dropzone');
    const lessonsFileInput = document.getElementById('lessons-file-input');
    lessonsDropzone?.addEventListener('click', () => lessonsFileInput?.click());
    lessonsDropzone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        lessonsFileInput?.click();
      }
    });
    lessonsDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      lessonsDropzone.classList.add('is-dragover');
    });
    lessonsDropzone?.addEventListener('dragleave', () => {
      lessonsDropzone.classList.remove('is-dragover');
    });
    lessonsDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      lessonsDropzone.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) setLessonsSelectedFile(file);
    });
    lessonsFileInput?.addEventListener('change', (e) => {
      const file = e.target?.files?.[0];
      if (file) setLessonsSelectedFile(file);
    });
    document.getElementById('upload-lesson-btn')?.addEventListener('click', () => {
      handleLessonFileUpload();
    });

    const aiModelToggleBtn = document.getElementById('lessons-ai-model-toggle');
    const aiSelectorWrap = document.getElementById('lessons-ai-selector-wrap');
    aiModelToggleBtn?.addEventListener('click', () => {
      if (!aiSelectorWrap) return;
      const open = aiSelectorWrap.hidden;
      aiSelectorWrap.hidden = !open;
      aiModelToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      aiModelToggleBtn.classList.toggle('active', open);
      if (open) initLessonsAiSelector();
    });

    lessonsPasteBtn?.addEventListener('click', async () => {
      if (!lessonsUrlInput) return;
      try {
        if (navigator.clipboard?.readText) {
          const text = (await navigator.clipboard.readText()).trim();
          if (text) {
            lessonsUrlInput.value = text;
            lessonsUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
            lessonsUrlInput.focus();
            return;
          }
        }
      } catch {}
      lessonsUrlInput.focus();
      showToast('Paste a video or audio link into the field');
    });

    lessonsClearBtn?.addEventListener('click', () => {
      if (!lessonsUrlInput) return;
      lessonsUrlInput.value = '';
      lessonsUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
      lessonsUrlInput.focus();
    });

    document.getElementById('open-cached-lesson-btn')?.addEventListener('click', () => {
      if (state.urlCacheMatch?.id) {
        window.location.href = `/studio?id=${encodeURIComponent(state.urlCacheMatch.id)}`;
      }
    });

    document.getElementById('video-lesson-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('youtube-url-input');
      const url = (input?.value || '').trim();
      if (!url) {
        input?.focus();
        return;
      }
      const force = Boolean(document.getElementById('force-reextract-checkbox')?.checked);
      const autoreview = Boolean(document.getElementById('lessons-auto-review')?.checked);
      persistShadowingReviewPrefs();
      if (!requireAuthBeforeAction({ type: 'video_lesson', url, force, autoreview })) {
        return;
      }
      const qs = new URLSearchParams({ url });
      if (force) qs.set('force', '1');
      if (autoreview) qs.set('autoreview', '1');
      window.location.href = `/studio?${qs.toString()}`;
    });

    // Generate Custom Dialogue (Auth-Gated Before Execution!)
    document.getElementById('dialogue-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('dialogue-scenario-input');
      const scenario = (input?.value || '').trim();
      if (!scenario) {
        input?.focus();
        return;
      }
      if (!requireAuthBeforeAction({ type: 'dialogue', scenario })) {
        return;
      }
      await executeDialogueGeneration(scenario);
    });

    // Generate Custom Pronunciation Workout (Auth-Gated Before Execution!)
    document.getElementById('pronunciation-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('pronunciation-topic-input');
      const topic = (input?.value || '').trim();
      if (!topic) {
        input?.focus();
        return;
      }
      if (!requireAuthBeforeAction({ type: 'pronunciation', topic })) {
        return;
      }
      await executePronunciationGeneration(topic);
    });

    // Library Filter, Platform/Status Selects & Search
    document.querySelectorAll('.filter-pill[data-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.libraryFilter = pill.dataset.filter;
        state.libraryPage = 1;
        document.querySelectorAll('.filter-pill[data-filter]').forEach((p) => {
          const isAct = p === pill;
          p.classList.toggle('active', isAct);
          p.setAttribute('aria-selected', isAct ? 'true' : 'false');
        });
        renderLibrary();
      });
    });

    document.getElementById('library-platform-filter')?.addEventListener('change', (e) => {
      state.libraryPlatformFilter = e.target.value || 'all';
      state.libraryPage = 1;
      renderLibrary();
    });

    document.getElementById('library-status-filter')?.addEventListener('change', (e) => {
      state.libraryStatusFilter = e.target.value || 'all';
      state.libraryPage = 1;
      renderLibrary();
    });

    document.getElementById('library-search-input')?.addEventListener('input', (e) => {
      state.librarySearch = e.target.value || '';
      state.libraryPage = 1;
      renderLibrary();
    });

    // Library Card Open / Delete (Shared across Lessons, Dialogue, and Pronunciation grids)
    function refreshLessonsAndLedgerViews() {
      renderLibrary();
      renderHistoryLedger();
      loadSessionAndStats();
    }

    async function confirmDeleteLesson(id) {
      if (!window.FlaptapConfirm?.confirmAndUndo) return;
      const target =
        state.lessons.find((l) => l.id === id) ||
        (state.usageOverview?.lessons || []).find((l) => l.id === id);
      const lessonTitle = String(target?.title || 'Lesson').trim();
      const snapshot = {
        lessons: [...state.lessons],
        selectedIds: new Set(state.selectedLedgerIds),
        overviewLessons: Array.isArray(state.usageOverview?.lessons)
          ? [...state.usageOverview.lessons]
          : null,
      };

      await window.FlaptapConfirm.confirmAndUndo({
        title: 'Delete lesson?',
        message: 'This lesson and its saved study history will be removed.',
        detail: lessonTitle,
        confirmLabel: 'Delete',
        undoMessage: `Deleted "${lessonTitle}"`,
        restoredMessage: `Restored "${lessonTitle}"`,
        onApply: () => {
          state.lessons = state.lessons.filter((l) => l.id !== id);
          state.selectedLedgerIds.delete(id);
          if (state.usageOverview?.lessons) {
            state.usageOverview.lessons = state.usageOverview.lessons.filter((l) => l.id !== id);
          }
          refreshLessonsAndLedgerViews();
        },
        onUndo: () => {
          state.lessons = snapshot.lessons;
          state.selectedLedgerIds = snapshot.selectedIds;
          if (state.usageOverview && snapshot.overviewLessons) {
            state.usageOverview.lessons = snapshot.overviewLessons;
          }
          refreshLessonsAndLedgerViews();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await apiFetch(`/api/history/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            keepalive,
          });
          if (!keepalive) {
            await loadUsageAndHistory();
            loadSessionAndStats();
          }
        },
        onError: (err) => {
          showToast(err?.message || 'Could not delete lesson.');
        },
      });
    }

    async function confirmClearAllLessons(authTarget) {
      if (!requireAuthBeforeAction(authTarget)) return;
      if (!window.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = {
        lessons: [...state.lessons],
        selectedIds: new Set(state.selectedLedgerIds),
        overviewLessons: Array.isArray(state.usageOverview?.lessons)
          ? [...state.usageOverview.lessons]
          : null,
      };
      const count = snapshot.lessons.length || snapshot.overviewLessons?.length || 0;

      await window.FlaptapConfirm.confirmAndUndo({
        title: 'Clear all lessons?',
        message: t('confirmClear'),
        detail: count > 0 ? `${count} saved lesson(s)` : '',
        confirmLabel: 'Clear All',
        undoMessage: 'Cleared all saved lessons',
        restoredMessage: 'Restored saved lessons',
        onApply: () => {
          state.lessons = [];
          state.selectedLedgerIds.clear();
          if (state.usageOverview?.lessons) {
            state.usageOverview.lessons = [];
          }
          refreshLessonsAndLedgerViews();
        },
        onUndo: () => {
          state.lessons = snapshot.lessons;
          state.selectedLedgerIds = snapshot.selectedIds;
          if (state.usageOverview && snapshot.overviewLessons) {
            state.usageOverview.lessons = snapshot.overviewLessons;
          }
          refreshLessonsAndLedgerViews();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await apiFetch('/api/history/clear', { method: 'POST', keepalive });
          if (!keepalive) {
            await loadUsageAndHistory();
            loadSessionAndStats();
          }
        },
        onError: (err) => {
          showToast(err?.message || 'Could not clear lessons.');
        },
      });
    }

    function bindLessonGridInteractions(gridId) {
      const grid = document.getElementById(gridId);
      if (!grid) return;

      grid.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-delete-id]');
        if (delBtn) {
          e.stopPropagation();
          const id = delBtn.getAttribute('data-delete-id');
          if (id) await confirmDeleteLesson(id);
          return;
        }

        const card = e.target.closest('.history-card[data-lesson-id]');
        if (card) {
          const id = card.getAttribute('data-lesson-id');
          window.location.href = `/studio?id=${encodeURIComponent(id)}`;
        }
      });

      grid.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const card = e.target.closest('.history-card[data-lesson-id]');
          if (card) {
            window.location.href = `/studio?id=${encodeURIComponent(card.getAttribute('data-lesson-id'))}`;
          }
        }
      });
    }

    ['history-grid', 'dialogue-history-grid', 'pronunciation-history-grid'].forEach(
      bindLessonGridInteractions,
    );

    document.getElementById('clear-library-btn')?.addEventListener('click', async () => {
      await confirmClearAllLessons({ type: 'section', section: 'lessons' });
    });

    // Vocabulary Vault Filters, Search, Delete, Flashcards
    document.querySelectorAll('.filter-pill[data-vocab-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.vocabFilter = pill.dataset.vocabFilter;
        document.querySelectorAll('.filter-pill[data-vocab-filter]').forEach((p) => {
          const isAct = p === pill;
          p.classList.toggle('active', isAct);
          p.setAttribute('aria-selected', isAct ? 'true' : 'false');
        });
        window.FlaptapRouter?.updateSubroute?.('vocabulary', {
          subview: state.flashcardsOpen ? 'flashcards' : '',
          filter: state.vocabFilter,
        });
        if (state.user) loadVocabulary();
      });
    });

    document.getElementById('vocab-search-input')?.addEventListener('input', (e) => {
      state.vocabSearch = e.target.value || '';
      if (state.user) loadVocabulary();
    });

    document.getElementById('vocab-grid')?.addEventListener('click', async (e) => {
      const checkBtn = e.target.closest('[data-vocab-complete]');
      if (checkBtn) {
        e.stopPropagation();
        const id = checkBtn.getAttribute('data-vocab-complete');
        await toggleVocabCompletion(id);
        return;
      }

      const delBtn = e.target.closest('[data-delete-vocab]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-delete-vocab');
        const target = state.vocabItems.find((v) => v.id === id);
        const termLabel = String(target?.term || 'Vocabulary word').trim();
        if (!window.FlaptapConfirm?.confirmAndUndo) return;

        const snapshot = {
          vocabItems: [...state.vocabItems],
          flashcardIndex: state.flashcardIndex,
        };
        await window.FlaptapConfirm.confirmAndUndo({
          title: 'Remove word from vault?',
          message: 'This card will be removed from your Vocabulary Vault & Flashcards.',
          detail: termLabel,
          confirmLabel: 'Remove',
          undoMessage: `Removed "${termLabel}"`,
          restoredMessage: `Restored "${termLabel}"`,
          onApply: () => {
            state.vocabItems = state.vocabItems.filter((v) => v.id !== id);
            state.flashcardIndex = Math.max(
              0,
              Math.min(state.flashcardIndex, Math.max(0, state.vocabItems.length - 1)),
            );
            renderVocabulary();
            renderFlashcard();
          },
          onUndo: () => {
            state.vocabItems = snapshot.vocabItems;
            state.flashcardIndex = snapshot.flashcardIndex;
            renderVocabulary();
            renderFlashcard();
          },
          onCommit: async ({ keepalive = false } = {}) => {
            await apiFetch(`/api/vocabulary/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              keepalive,
            });
            if (!keepalive) {
              await loadVocabulary();
              loadSessionAndStats();
            }
          },
          onError: (err) => {
            showToast(err?.message || 'Could not remove word.');
          },
        });
      }
    });

    document.getElementById('fc-complete-toggle-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = state.vocabItems[state.flashcardIndex];
      if (!item) return;
      await toggleVocabCompletion(item.id);
    });

    document.getElementById('toggle-flashcards-btn')?.addEventListener('click', () => {
      if (!requireAuthBeforeAction({ type: 'flashcards' })) return;
      setFlashcardsOpen(!state.flashcardsOpen);
    });

    document.getElementById('close-flashcards-btn')?.addEventListener('click', () => {
      setFlashcardsOpen(false);
    });

    document.getElementById('flashcard-card')?.addEventListener('click', () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).trim().length >= 2) return;
      state.flashcardRevealed = !state.flashcardRevealed;
      renderFlashcard();
    });

    function bindWorkspaceSelectionLookup(container) {
      if (!container || !window.FlaptapWordLookup?.bindSelectionLookup) return;
      window.FlaptapWordLookup.bindSelectionLookup(container, {
        maxLength: 320,
        onSelect: (text, meta) => {
          if (!requireAuthBeforeAction({ type: 'section', section: state.activeSection || 'vocabulary' })) {
            return;
          }
          const node = meta?.range?.startContainer;
          const el = node?.nodeType === 1 ? node : node?.parentElement;
          const card = el?.closest('.vocab-card, .flashcard-card, .lesson-card');
          const contextSentence =
            card?.querySelector('.vocab-context, .fc-context, .card-title')?.textContent?.trim() || text;
          const lang =
            state.user?.nativeLanguage || localStorage.getItem('flaptap_trans_lang') || 'ar';

          window.FlaptapWordLookup.open({
            word: text,
            sourceEl: meta?.sourceEl || null,
            contextSentence,
            endpoint: '/api/learning-library/define-word',
            payload: {
              word: text,
              contextSentence,
              language: lang,
            },
            fetcher: apiFetch,
            canPlay: false,
            canSpeak: true,
            canSave: true,
            isSaved: (term) =>
              state.vocabItems.some(
                (v) =>
                  String(v.term || '').trim().toLowerCase() ===
                  String(term || '').trim().toLowerCase(),
              ),
            onSave: async (lookup) => {
              if (!requireAuthBeforeAction({ type: 'section', section: 'vocabulary' })) return;
              try {
                const saved = await apiFetch('/api/vocabulary', {
                  method: 'POST',
                  body: JSON.stringify({
                    term: lookup.term,
                    ipa: lookup.ipa,
                    partOfSpeech: lookup.partOfSpeech,
                    definition: lookup.contextualDefinition,
                    generalTranslation: lookup.generalTranslation || '',
                    translation: lookup.nativeTranslation,
                    contextSentence: lookup.contextSentence,
                    lessonTitle: 'Vocabulary Vault',
                  }),
                });
                if (saved?.id) {
                  await loadVocabulary();
                  window.FlaptapWordLookup.syncSavedButtonDom();
                }
                showToast(`Saved "${lookup.term}" to Vocabulary Flashcards`);
              } catch (err) {
                showToast(err?.message || 'Could not save word.');
              }
            },
          });
        },
      });
    }

    bindWorkspaceSelectionLookup(document.getElementById('vocab-grid'));
    bindWorkspaceSelectionLookup(document.getElementById('flashcard-card'));
    bindWorkspaceSelectionLookup(document.getElementById('history-grid'));
    bindWorkspaceSelectionLookup(document.getElementById('dialogue-history-grid'));
    bindWorkspaceSelectionLookup(document.getElementById('pronunciation-history-grid'));

    document.querySelectorAll('[data-srs]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = state.vocabItems[state.flashcardIndex];
        if (!item) return;
        try {
          const updated = await apiFetch(`/api/vocabulary/${encodeURIComponent(item.id)}/review`, {
            method: 'PATCH',
            body: JSON.stringify({ rating: btn.dataset.srs }),
          });
          state.vocabItems[state.flashcardIndex] = updated;
          state.flashcardRevealed = false;
          state.flashcardIndex = (state.flashcardIndex + 1) % state.vocabItems.length;
          renderVocabulary();
          renderFlashcard();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    // History, Caching & Usage Control Center Events
    document.getElementById('refresh-usage-btn')?.addEventListener('click', () => {
      if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
      loadUsageAndHistory();
    });

    document.getElementById('export-account-json-btn')?.addEventListener('click', () => {
      exportFullAccountJson();
    });

    document.getElementById('quick-goal-pills')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-goal-min]');
      if (!btn) return;
      if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
      const mins = Number(btn.dataset.goalMin) || 15;
      try {
        const res = await apiFetch('/api/auth/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ dailyGoalMinutes: mins }),
        });
        state.user = res.user;
        await loadUsageAndHistory();
        showToast(`Daily goal updated to ${mins} minutes`);
      } catch (err) {
        showToast(err.message);
      }
    });

    document.querySelectorAll('[data-clear-global-cache]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
        const scope = btn.getAttribute('data-clear-global-cache') || 'all';
        try {
          const res = await apiFetch('/api/history/cache/clear', {
            method: 'POST',
            body: JSON.stringify({ scope }),
          });
          await loadUsageAndHistory();
          showToast(`Cleared ${scope} cache (${res.clearedLessonsCount || 0} lessons updated)`);
        } catch (err) {
          showToast(err.message);
        }
      });
    });

    document.getElementById('clear-all-vocab-btn')?.addEventListener('click', async () => {
      if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
      if (!window.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = {
        vocabItems: [...state.vocabItems],
        flashcardIndex: state.flashcardIndex,
        flashcardsOpen: state.flashcardsOpen,
      };
      const total = snapshot.vocabItems.length;
      await window.FlaptapConfirm.confirmAndUndo({
        title: 'Clear all vocabulary?',
        message: t('confirmClearVocab'),
        detail: total > 0 ? `${total} saved word(s)` : '',
        confirmLabel: 'Clear All',
        undoMessage: 'Cleared Vocabulary Vault',
        restoredMessage: 'Restored Vocabulary Vault',
        onApply: () => {
          state.vocabItems = [];
          setFlashcardsOpen(false);
          renderVocabulary();
        },
        onUndo: () => {
          state.vocabItems = snapshot.vocabItems;
          state.flashcardIndex = snapshot.flashcardIndex;
          renderVocabulary();
          if (snapshot.flashcardsOpen) setFlashcardsOpen(true);
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await apiFetch('/api/vocabulary/clear', { method: 'POST', keepalive });
          if (!keepalive) {
            await loadUsageAndHistory();
            loadSessionAndStats();
          }
        },
        onError: (err) => {
          showToast(err?.message || 'Could not clear vocabulary.');
        },
      });
    });

    document.getElementById('clear-entire-history-btn')?.addEventListener('click', async () => {
      await confirmClearAllLessons({ type: 'section', section: 'history' });
    });

    // History Ledger Filters, Sort, Search & Bulk Selection
    document.querySelectorAll('[data-ledger-track]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.ledgerTrackFilter = pill.dataset.ledgerTrack;
        document.querySelectorAll('[data-ledger-track]').forEach((p) => {
          const isAct = p === pill;
          p.classList.toggle('active', isAct);
          p.setAttribute('aria-selected', isAct ? 'true' : 'false');
        });
        window.FlaptapRouter?.updateSubroute?.('history', {
          track: state.ledgerTrackFilter,
          cache: state.ledgerCacheFilter,
        });
        renderHistoryLedger();
      });
    });

    document.getElementById('ledger-cache-filter')?.addEventListener('change', (e) => {
      state.ledgerCacheFilter = e.target.value || 'all';
      window.FlaptapRouter?.updateSubroute?.('history', {
        track: state.ledgerTrackFilter,
        cache: state.ledgerCacheFilter,
      });
      renderHistoryLedger();
    });

    document.getElementById('ledger-sort-select')?.addEventListener('change', (e) => {
      state.ledgerSort = e.target.value || 'recent';
      renderHistoryLedger();
    });

    document.getElementById('ledger-search-input')?.addEventListener('input', (e) => {
      state.ledgerSearch = e.target.value || '';
      renderHistoryLedger();
    });

    document.getElementById('ledger-select-all')?.addEventListener('change', (e) => {
      const visible = getFilteredSortedLedgerLessons();
      if (e.target.checked) {
        visible.forEach((item) => state.selectedLedgerIds.add(item.id));
      } else {
        visible.forEach((item) => state.selectedLedgerIds.delete(item.id));
      }
      renderHistoryLedger();
    });

    async function runBulkLedgerAction(action) {
      const ids = Array.from(state.selectedLedgerIds);
      if (ids.length === 0) return;

      if (action === 'delete' && window.FlaptapConfirm?.confirmAndUndo) {
        const idSet = new Set(ids);
        const snapshot = {
          lessons: [...state.lessons],
          selectedIds: new Set(state.selectedLedgerIds),
          overviewLessons: Array.isArray(state.usageOverview?.lessons)
            ? [...state.usageOverview.lessons]
            : null,
        };
        await window.FlaptapConfirm.confirmAndUndo({
          title: 'Delete selected lessons?',
          message: `Remove ${ids.length} selected lesson(s) and their history?`,
          detail: `${ids.length} lesson(s) selected`,
          confirmLabel: 'Delete Selected',
          undoMessage: `Deleted ${ids.length} lesson(s)`,
          restoredMessage: `Restored ${ids.length} lesson(s)`,
          onApply: () => {
            state.lessons = state.lessons.filter((l) => !idSet.has(l.id));
            state.selectedLedgerIds.clear();
            if (state.usageOverview?.lessons) {
              state.usageOverview.lessons = state.usageOverview.lessons.filter((l) => !idSet.has(l.id));
            }
            refreshLessonsAndLedgerViews();
          },
          onUndo: () => {
            state.lessons = snapshot.lessons;
            state.selectedLedgerIds = snapshot.selectedIds;
            if (state.usageOverview && snapshot.overviewLessons) {
              state.usageOverview.lessons = snapshot.overviewLessons;
            }
            refreshLessonsAndLedgerViews();
          },
          onCommit: async ({ keepalive = false } = {}) => {
            await apiFetch('/api/history/bulk', {
              method: 'POST',
              keepalive,
              body: JSON.stringify({ ids, action: 'delete' }),
            });
            if (!keepalive) {
              await loadUsageAndHistory();
              loadSessionAndStats();
            }
          },
          onError: (err) => {
            showToast(err?.message || 'Bulk delete failed.');
          },
        });
        return;
      }

      try {
        const res = await apiFetch('/api/history/bulk', {
          method: 'POST',
          body: JSON.stringify({ ids, action }),
        });
        await loadUsageAndHistory();
        showToast(`Updated ${res.affectedCount || 0} lesson(s)`);
      } catch (err) {
        showToast(err.message);
      }
    }

    document.getElementById('bulk-clear-cache-btn')?.addEventListener('click', () => runBulkLedgerAction('clear_cache'));
    document.getElementById('bulk-reset-progress-btn')?.addEventListener('click', () => runBulkLedgerAction('reset_progress'));
    document.getElementById('bulk-delete-btn')?.addEventListener('click', () => runBulkLedgerAction('delete'));

    document.getElementById('history-ledger-list')?.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-ledger-check]');
      if (!cb) return;
      const id = cb.getAttribute('data-ledger-check');
      if (cb.checked) state.selectedLedgerIds.add(id);
      else state.selectedLedgerIds.delete(id);
      syncBulkSelectionToolbar(getFilteredSortedLedgerLessons());
    });

    document.getElementById('history-ledger-list')?.addEventListener('click', async (e) => {
      const reextractBtn = e.target.closest('[data-reextract-url]');
      if (reextractBtn) {
        const videoUrl = reextractBtn.getAttribute('data-reextract-url');
        if (videoUrl) {
          window.location.href = `/studio?url=${encodeURIComponent(videoUrl)}&force=1`;
        }
        return;
      }

      const clearCacheBtn = e.target.closest('[data-clear-item-cache]');
      if (clearCacheBtn) {
        const id = clearCacheBtn.getAttribute('data-clear-item-cache');
        try {
          await apiFetch(`/api/history/${encodeURIComponent(id)}/cache/clear`, {
            method: 'POST',
            body: JSON.stringify({ scope: 'all' }),
          });
          await loadUsageAndHistory();
          showToast('Lesson caches cleared');
        } catch (err) {
          showToast(err.message);
        }
        return;
      }

      const resetBtn = e.target.closest('[data-reset-item-progress]');
      if (resetBtn) {
        const id = resetBtn.getAttribute('data-reset-item-progress');
        try {
          await apiFetch(`/api/history/${encodeURIComponent(id)}/reset-progress`, {
            method: 'POST',
            body: JSON.stringify({ clearNotes: false }),
          });
          await loadUsageAndHistory();
          showToast('Drill counter & session logs reset for lesson');
        } catch (err) {
          showToast(err.message);
        }
        return;
      }

      const delBtn = e.target.closest('[data-delete-item-ledger]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-delete-item-ledger');
        if (id) await confirmDeleteLesson(id);
      }
    });

    // Activity Log Timeline Delete & Clear
    document.getElementById('activity-timeline-list')?.addEventListener('click', async (e) => {
      const delLog = e.target.closest('[data-delete-activity]');
      if (!delLog) return;
      const logId = delLog.getAttribute('data-delete-activity');
      if (!window.FlaptapConfirm?.confirmAndUndo) return;

      const list = Array.isArray(state.usageOverview?.recentActivity)
        ? state.usageOverview.recentActivity
        : [];
      const target = list.find((row) => row.id === logId);
      const snapshot = [...list];

      await window.FlaptapConfirm.confirmAndUndo({
        title: 'Remove activity entry?',
        message: 'This practice session record will be removed from your timeline.',
        detail: target?.lessonTitle || '',
        confirmLabel: 'Remove',
        undoMessage: 'Removed activity entry',
        restoredMessage: 'Restored activity entry',
        onApply: () => {
          if (state.usageOverview) {
            state.usageOverview.recentActivity = snapshot.filter((row) => row.id !== logId);
          }
          renderActivityTimeline();
        },
        onUndo: () => {
          if (state.usageOverview) {
            state.usageOverview.recentActivity = snapshot;
          }
          renderActivityTimeline();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await apiFetch(`/api/history/activity/${encodeURIComponent(logId)}`, {
            method: 'DELETE',
            keepalive,
          });
          if (!keepalive) await loadUsageAndHistory();
        },
        onError: (err) => {
          showToast(err?.message || 'Could not delete activity entry.');
        },
      });
    });

    document.getElementById('clear-activity-log-btn')?.addEventListener('click', async () => {
      if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
      if (!window.FlaptapConfirm?.confirmAndUndo) return;

      const snapshot = Array.isArray(state.usageOverview?.recentActivity)
        ? [...state.usageOverview.recentActivity]
        : [];

      await window.FlaptapConfirm.confirmAndUndo({
        title: 'Clear activity timeline?',
        message: 'All recent practice timeline entries will be cleared.',
        detail: snapshot.length > 0 ? `${snapshot.length} log entry(s)` : '',
        confirmLabel: 'Clear All',
        undoMessage: 'Cleared activity timeline',
        restoredMessage: 'Restored activity timeline',
        onApply: () => {
          if (state.usageOverview) state.usageOverview.recentActivity = [];
          renderActivityTimeline();
        },
        onUndo: () => {
          if (state.usageOverview) state.usageOverview.recentActivity = snapshot;
          renderActivityTimeline();
        },
        onCommit: async ({ keepalive = false } = {}) => {
          await apiFetch('/api/history/activity/clear', { method: 'POST', keepalive });
          if (!keepalive) await loadUsageAndHistory();
        },
        onError: (err) => {
          showToast(err?.message || 'Could not clear activity log.');
        },
      });
    });

    // Account Drawer Controls & Email Authentication
    document.getElementById('open-account-btn')?.addEventListener('click', () => openAccountDrawer({ fromGate: false }));
    document.getElementById('close-account-btn')?.addEventListener('click', closeAccountDrawer);
    document.getElementById('account-drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'account-drawer-backdrop') closeAccountDrawer();
    });

    document.querySelectorAll('.auth-tab[data-auth-tab]').forEach((tab) => {
      tab.addEventListener('click', () => setAuthDrawerTab(tab.dataset.authTab));
    });

    // Authenticated Account Drawer Tabs (Profile | Security | Workspace)
    document.querySelectorAll('.drawer-tab[data-drawer-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.drawerTab || 'profile';
        document.querySelectorAll('.drawer-tab[data-drawer-tab]').forEach((btn) => {
          const isAct = btn.dataset.drawerTab === target;
          btn.classList.toggle('active', isAct);
          btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
        });
        document.querySelectorAll('[data-drawer-panel]').forEach((panel) => {
          panel.hidden = panel.getAttribute('data-drawer-panel') !== target;
        });
      });
    });

    document.getElementById('drawer-open-ai-keys-btn')?.addEventListener('click', () => {
      closeAccountDrawer();
      window.FlaptapAiSelector?.openKeysManager?.(apiFetch);
    });
    document.getElementById('drawer-open-history-btn')?.addEventListener('click', () => {
      closeAccountDrawer();
      switchSection('history');
    });
    document.getElementById('drawer-export-json-btn')?.addEventListener('click', () => {
      exportFullAccountJson();
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('auth-error-box');
      const submitBtn = document.getElementById('login-submit-btn');
      if (errBox) errBox.hidden = true;
      await withButtonLoading(submitBtn, '...', async () => {
        try {
          const res = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              email: document.getElementById('login-email').value,
              password: document.getElementById('login-password').value,
              guestToken: state.guestToken,
            }),
          });
          await handleAuthSuccess(res, `Welcome back, ${res.user.name}`);
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message;
            errBox.hidden = false;
          }
        }
      });
    });

    document.getElementById('register-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('auth-error-box');
      const submitBtn = document.getElementById('register-submit-btn');
      if (errBox) errBox.hidden = true;
      await withButtonLoading(submitBtn, '...', async () => {
        try {
          const res = await apiFetch('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              name: document.getElementById('reg-name').value,
              email: document.getElementById('reg-email').value,
              password: document.getElementById('reg-password').value,
              nativeLanguage: document.getElementById('reg-native-lang').value || 'ar',
              uiLanguage: state.uiLang,
              guestToken: state.guestToken,
            }),
          });
          await handleAuthSuccess(res, `Account created for ${res.user.name}`);
        } catch (err) {
          if (errBox) {
            errBox.textContent = err.message;
            errBox.hidden = false;
          }
        }
      });
    });

    document.getElementById('preferences-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiFetch('/api/auth/preferences', {
          method: 'PATCH',
          body: JSON.stringify({
            name: document.getElementById('pref-name').value,
            nativeLanguage: document.getElementById('pref-native-lang').value,
            dailyGoalMinutes: Number(document.getElementById('pref-goal').value) || 15,
            uiLanguage: state.uiLang,
          }),
        });
        state.user = res.user;
        if (res.user?.nativeLanguage) localStorage.setItem('flaptap_trans_lang', res.user.nativeLanguage);
        updateAccountHeader();
        updateStatsDisplay(res.stats);
        if (state.section === 'history') loadUsageAndHistory();
        closeAccountDrawer();
        showToast('Preferences saved');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('password-change-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await apiFetch('/api/auth/password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: document.getElementById('current-password-input')?.value || '',
            newPassword: document.getElementById('new-password-input')?.value || '',
          }),
        });
        state.user = res.user;
        document.getElementById('current-password-input').value = '';
        document.getElementById('new-password-input').value = '';
        openAccountDrawer();
        showToast(res.message || 'Password updated');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('active-sessions-list')?.addEventListener('click', async (e) => {
      const revokeBtn = e.target.closest('[data-revoke-session]');
      if (!revokeBtn) return;
      const sessionId = revokeBtn.getAttribute('data-revoke-session');
      const sessionTitle =
        revokeBtn.closest('.session-item')?.querySelector('.session-item-title')?.textContent?.trim() ||
        'Device session';
      const ok = await window.FlaptapConfirm?.ask({
        title: 'Revoke device session?',
        message: 'That device will be signed out immediately.',
        detail: sessionTitle,
        confirmLabel: 'Revoke',
      });
      if (!ok) return;
      try {
        await apiFetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        await loadActiveSessions();
        showToast('Session revoked');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('revoke-other-sessions-btn')?.addEventListener('click', async () => {
      const ok = await window.FlaptapConfirm?.ask({
        title: 'Sign out other devices?',
        message: 'Every other active session will be revoked. Your current device stays signed in.',
        confirmLabel: 'Sign Out Others',
      });
      if (!ok) return;
      try {
        const res = await apiFetch('/api/auth/sessions/others', { method: 'DELETE' });
        await loadActiveSessions();
        showToast(`Signed out ${res.revokedCount || 0} other session(s)`);
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {}
      state.user = null;
      state.authToken = '';
      state.lessons = [];
      state.vocabItems = [];
      state.usageOverview = null;
      state.selectedLedgerIds.clear();
      state.urlCacheMatch = null;
      localStorage.removeItem('flaptap_auth_token');
      savePendingAction(null);
      const banner = document.getElementById('url-cache-banner');
      if (banner) banner.hidden = true;
      updateAccountHeader();
      updateStatsDisplay(null);
      closeAccountDrawer();
      renderLibrary();
      renderVocabulary();
      renderHistorySectionAuthState();
      window.dispatchEvent(new CustomEvent('flaptap:auth-changed', { detail: { user: null } }));
      showToast('Signed out');
    });

    document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
      const ok = await window.FlaptapConfirm?.ask({
        title: 'Delete account & all data?',
        message: t('confirmDeleteAccount'),
        detail: state.user?.email || '',
        confirmLabel: 'Delete Permanently',
      });
      if (!ok) return;
      try {
        await apiFetch('/api/auth/account', { method: 'DELETE' });
        state.user = null;
        state.authToken = '';
        state.lessons = [];
        state.vocabItems = [];
        state.usageOverview = null;
        state.selectedLedgerIds.clear();
        localStorage.removeItem('flaptap_auth_token');
        savePendingAction(null);
        updateAccountHeader();
        updateStatsDisplay(null);
        closeAccountDrawer();
        renderLibrary();
        renderVocabulary();
        renderHistorySectionAuthState();
        window.dispatchEvent(new CustomEvent('flaptap:auth-changed', { detail: { user: null } }));
        showToast('Account and all personal data permanently deleted');
      } catch (err) {
        showToast(err.message);
      }
    });

    // Escape closes drawer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const backdrop = document.getElementById('account-drawer-backdrop');
        if (backdrop && !backdrop.hidden) closeAccountDrawer();
      }
    });
  }

  /* ========================================================================
     BOOTSTRAP
     ======================================================================== */

  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const initialRoute = window.FlaptapRouter
      ? window.FlaptapRouter.initShell({ translator: t })
      : { section: 'lessons', searchParams: params };

    // Immediately ensure the active route's panel & chrome match before async tasks
    activateSectionPanel(initialRoute.section, { preserveScroll: true });
    applyTheme(state.theme);
    applyUiLanguage(state.uiLang);
    bindEvents();

    const authRequired = params.get('auth') === 'required';
    const nextHref = params.get('next');
    const authError = params.get('auth_error');

    if (window.FlaptapRouter) {
      window.FlaptapRouter.onRouteChange((route) => {
        applyRoute(route);
      });
    }

    const bootTasks = [loadSessionAndStats()];
    if (state.authToken) {
      bootTasks.push(loadLibrary({ force: true }));
    }
    void loadLanguagesCatalog();

    await Promise.all(bootTasks);
    if (!state.authToken && state.user) {
      await loadLibrary();
    } else if (!state.user) {
      renderLibrary();
    }

    await applyRoute(window.FlaptapRouter?.getCurrentRoute?.() || initialRoute);

    const openAccountParam = params.get('account') === 'open';
    if (authError) {
      openAccountDrawer({ fromGate: false, tab: 'login' });
      const errBox = document.getElementById('auth-error-box');
      if (errBox) {
        errBox.textContent = authError;
        errBox.hidden = false;
      }
    } else if (openAccountParam) {
      openAccountDrawer({ fromGate: false, tab: 'login' });
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('account');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);
    } else if (authRequired) {
      const safeNext =
        nextHref && nextHref.startsWith('/') && !nextHref.startsWith('//')
          ? nextHref
          : null;
      if (state.user && safeNext) {
        window.location.replace(safeNext);
        return;
      }
      if (!state.user) {
        if (safeNext) savePendingAction({ type: 'navigate', href: safeNext });
        openAccountDrawer({ fromGate: true, tab: 'login' });
      }
      // Clean URL query params smoothly
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('auth');
      cleanUrl.searchParams.delete('next');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);
    } else if (state.user) {
      await resumePendingAction();
    }
  });

  function isVocabularySaved(term) {
    if (!term || !window.FlaptapWordLookup) return false;
    const norm = window.FlaptapWordLookup.normalizeTermKey(term);
    return state.vocabItems.some(
      (v) => window.FlaptapWordLookup.normalizeTermKey(v.term) === norm,
    );
  }

  // Expose clean workspace bridge for independent modular features
  window.FlaptapWorkspace = {
    apiFetch,
    getAuthHeaders: () => apiHeaders(),
    showToast,
    withButtonLoading,
    getUser: () => state.user,
    getUiLang: () => state.uiLang,
    getLanguages: () => state.languages || [],
    requireAuthBeforeAction,
    navigateToSection: (section, opts) => switchSection(section, opts),
    checkUrlCache,
    refreshVocabulary: async () => {
      await loadVocabulary();
      await loadSessionAndStats({ silent: true });
    },
    renderSubjectProgressBar,
    renderCheckButtonHtml,
    setCheckButtonState,
    isVocabularySaved,
  };
})();
