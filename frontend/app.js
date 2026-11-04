/* ==========================================================================
   FLAPTAP WORKSPACE CONTROLLER (app.js)
   Paper-Editorial UI · Multi-language (EN/AR/ES/FR/DE/TR) · Light/Dark Mode
   Strict Sign-In Gate with Pending Action Resume · Real Google OAuth 2.0 + OIDC
   Full History, Caching & Usage Control Center · Vocabulary SRS Flashcards
   ========================================================================== */

(function () {
  'use strict';

  const PENDING_ACTION_KEY = 'flaptap_pending_action';

  const I18N = {
    en: {
      brandEdition: 'Spoken English Studio',
      navLessons: 'Lessons',
      navDialogue: 'Dialogue',
      navPronunciation: 'Pronunciation',
      navVocabulary: 'Vocabulary',
      navHistory: 'History & Usage',
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
      continueWithGoogle: 'Continue with Google',
      orContinueWithEmail: 'or continue with email',
      heroKicker: 'Spoken English Studio',
      heroHeadline: 'Turn any English video into a <span class="vox-underline">precision speaking lesson</span>.',
      heroSubcopy: 'Paste a YouTube link to train complete sentences, editorial paragraphs, active dictation, and connected-speech coaching at exact word timestamps.',
      urlPlaceholder: 'Paste a YouTube video link...',
      startLessonBtn: 'Start Lesson',
      cachedBadge: 'Cached',
      openCachedBtn: 'Open Cached (0ms)',
      bypassCacheLabel: 'Bypass cache & re-extract',
      manageHistoryCacheBtn: 'History & Cache',
      capFullSentences: 'Complete sentence boundaries',
      capModes: 'Shadow, Read, Listen & Coach modes',
      capLanguages: '170+ translation languages',
      statLessons: 'Lessons in Library',
      statDrills: 'Sessions Completed',
      statVocab: 'Saved Vocabulary',
      statMinutes: 'Practice Minutes',
      libraryHeading: 'Lesson Library',
      filterAll: 'All',
      filterVideos: 'Videos',
      filterDialogues: 'Dialogues',
      filterPronunciation: 'Pronunciation',
      searchLessonsPlaceholder: 'Search lessons...',
      clearLibraryBtn: 'Clear Library',
      emptyLibraryTitle: 'Your library is ready',
      emptyLibraryDesc: 'Paste any YouTube video link above, or generate a custom dialogue or pronunciation workout to begin.',
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
      emptyVocabDesc: 'Click any word while studying a lesson or save expressions from the Coach tab to build your personal vocabulary deck.',
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
      vocabDueMasteredLabel: 'Vocabulary (Due / Mastered / Total)',
      cacheStorageTitle: 'Cache & Storage Footprint',
      transcriptCachesLabel: 'Raw Video Transcript Caches',
      aiCoachCachesLabel: 'Cached AI Coach Analyses',
      translationCachesLabel: 'Cached World Translations',
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
      guestSyncNote: 'Sign in with Google or email to unlock video extraction, dynamic AI coaching, world translations, vocabulary flashcards, and full history & cache control.',
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
      confirmClear: 'Permanently delete all lessons from your library?',
      confirmClearVocab: 'Permanently clear all saved words from your Vocabulary Vault?',
      confirmDeleteAccount: 'Permanently delete your account, lesson history, caches, notes, and vocabulary? This cannot be undone.',
    },
    ar: {
      brandEdition: 'استوديو الإنجليزية المنطوقة',
      navLessons: 'الدروس',
      navDialogue: 'المحادثات',
      navPronunciation: 'النطق',
      navVocabulary: 'المفردات',
      navHistory: 'السجل والاستخدام',
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
      continueWithGoogle: 'المتابعة باستخدام Google',
      orContinueWithEmail: 'أو بالبريد الإلكتروني',
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
      statDrills: 'الجلسات المكتملة',
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
      navLessons: 'Lecciones',
      navDialogue: 'Diálogo',
      navPronunciation: 'Pronunciación',
      navVocabulary: 'Vocabulario',
      navHistory: 'Historial y Uso',
      streakUnit: 'días seguidos',
      signIn: 'Iniciar sesión',
      createAccount: 'Crear cuenta',
      signOut: 'Cerrar sesión',
      accountTitle: 'Cuenta',
      continueWithGoogle: 'Continuar con Google',
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
      navLessons: 'Leçons',
      navDialogue: 'Dialogue',
      navPronunciation: 'Prononciation',
      navVocabulary: 'Vocabulaire',
      navHistory: 'Historique',
      streakUnit: 'jours de suite',
      signIn: 'Connexion',
      createAccount: 'Créer un compte',
      signOut: 'Déconnexion',
      accountTitle: 'Compte',
      continueWithGoogle: 'Continuer avec Google',
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
      navLessons: 'Lektionen',
      navDialogue: 'Dialog',
      navPronunciation: 'Aussprache',
      navVocabulary: 'Vokabeln',
      navHistory: 'Verlauf & Cache',
      streakUnit: 'Tage Serie',
      signIn: 'Anmelden',
      createAccount: 'Konto erstellen',
      signOut: 'Abmelden',
      accountTitle: 'Konto',
      continueWithGoogle: 'Weiter mit Google',
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
      navLessons: 'Dersler',
      navDialogue: 'Diyalog',
      navPronunciation: 'Telaffuz',
      navVocabulary: 'Kelimeler',
      navHistory: 'Geçmiş ve Önbellek',
      streakUnit: 'gün seri',
      signIn: 'Giriş yap',
      createAccount: 'Hesap oluştur',
      signOut: 'Çıkış yap',
      accountTitle: 'Hesap',
      continueWithGoogle: 'Google ile devam et',
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
    googleAuth: {
      enabled: false,
      gisOnly: false,
      clientId: null,
      redirectUri: `${window.location.origin}/api/auth/google/callback`,
    },
    pendingAction: null,
    stats: null,
    usageOverview: null,
    activeSessions: [],
    section: 'lessons',
    libraryFilter: 'all',
    librarySearch: '',
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

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDuration(sec) {
    const total = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    const num = Math.max(0, Number(bytes) || 0);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatShortDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(iso).slice(0, 16);
    }
  }

  function apiHeaders(extra) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (state.guestToken) headers['x-guest-token'] = state.guestToken;
    if (state.authToken) headers['Authorization'] = `Bearer ${state.authToken}`;
    return headers;
  }

  async function apiFetch(url, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    opts.headers = apiHeaders(opts.headers);
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = body?.code;
      throw err;
    }
    return body;
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

  let toastTimer = null;
  function showToast(message) {
    const el = document.getElementById('workspace-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
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
      window.location.href = `studio.html?${qs.toString()}`;
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
      sun.hidden = state.theme !== 'dark';
      moon.hidden = state.theme === 'dark';
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
      if (key === 'heroHeadline' || key === 'dialogueHeadline' || key === 'pronHeadline') {
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
    renderHistoryLedger();
    renderActivityTimeline();
  }

  /* ========================================================================
     SECTION NAVIGATION
     ======================================================================== */

  function switchSection(section) {
    if (!['lessons', 'dialogue', 'pronunciation', 'vocabulary', 'history'].includes(section)) {
      section = 'lessons';
    }
    state.section = section;

    document.querySelectorAll('.nav-tab[data-section]').forEach((btn) => {
      const isActive = btn.dataset.section === section;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    ['lessons', 'dialogue', 'pronunciation', 'vocabulary', 'history'].forEach((name) => {
      const panel = document.getElementById(`section-${name}`);
      if (panel) panel.hidden = name !== section;
    });

    if (section === 'vocabulary') {
      if (state.user) {
        loadVocabulary();
      } else {
        renderVocabulary();
      }
    } else if (section === 'history') {
      if (state.user) {
        loadUsageAndHistory();
      } else {
        renderHistorySectionAuthState();
      }
    }
  }

  /* ========================================================================
     ACCOUNT, REAL GOOGLE OAUTH 2.0 + OIDC, SESSIONS & SECURITY
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
      if (state.user.avatarUrl && avatarImg) {
        avatarImg.src = state.user.avatarUrl;
        avatarImg.hidden = false;
        if (avatar) avatar.hidden = true;
      } else {
        if (avatarImg) avatarImg.hidden = true;
        if (avatar) {
          avatar.textContent = (state.user.name[0] || 'U').toUpperCase();
          avatar.hidden = false;
        }
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

    const vocabBadge = document.getElementById('nav-vocab-badge');
    if (vocabBadge) {
      if (state.user && safeStats.vocabularyCount > 0) {
        vocabBadge.textContent = String(safeStats.vocabularyCount);
        vocabBadge.hidden = false;
      } else {
        vocabBadge.hidden = true;
      }
    }
  }

  async function loadGoogleOAuthConfig() {
    try {
      const cfg = await apiFetch('/api/auth/google/config', { method: 'GET' });
      state.googleAuth = Object.assign(state.googleAuth, cfg || {});
      const redirectCode = document.getElementById('google-redirect-uri-code');
      if (redirectCode && state.googleAuth.redirectUri) {
        redirectCode.textContent = state.googleAuth.redirectUri;
      }
      if (state.googleAuth.clientId) {
        mountGoogleIdentityServices(state.googleAuth.clientId);
      }
    } catch {}
  }

  function mountGoogleIdentityServices(clientId) {
    if (!clientId || document.getElementById('google-gis-sdk')) return;
    const script = document.createElement('script');
    script.id = 'google-gis-sdk';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      try {
        if (!window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => {
            if (resp?.credential) {
              handleGoogleGisCredential(resp.credential);
            }
          },
          ux_mode: 'popup',
        });
        if (state.googleAuth.gisOnly) {
          const slot = document.getElementById('google-gis-button-slot');
          if (slot) {
            slot.hidden = false;
            window.google.accounts.id.renderButton(slot, {
              theme: state.theme === 'dark' ? 'filled_black' : 'outline',
              size: 'large',
              width: 340,
              text: 'continue_with',
            });
          }
        }
      } catch {}
    };
    document.head.appendChild(script);
  }

  async function handleGoogleGisCredential(credentialJwt) {
    const errBox = document.getElementById('auth-error-box');
    if (errBox) errBox.hidden = true;
    try {
      const res = await apiFetch('/api/auth/google/credential', {
        method: 'POST',
        body: JSON.stringify({
          credential: credentialJwt,
          uiLanguage: state.uiLang,
          nativeLanguage: localStorage.getItem('flaptap_trans_lang') || 'ar',
          guestToken: state.guestToken,
        }),
      });
      await handleAuthSuccess(
        res,
        res.isNewUser
          ? `Google account created for ${res.user.name}`
          : `Signed in with Google as ${res.user.name}`,
      );
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      } else {
        showToast(err.message);
      }
    }
  }

  window.flaptapCompleteGoogleCredential = handleGoogleGisCredential;

  function startGoogleOAuthFlow() {
    const errBox = document.getElementById('auth-error-box');
    const setupCard = document.getElementById('google-setup-card');
    if (errBox) errBox.hidden = true;

    if (state.googleAuth.enabled) {
      if (setupCard) setupCard.hidden = true;
      const params = new URLSearchParams({
        mode: 'popup',
        uiLang: state.uiLang,
        nativeLang: localStorage.getItem('flaptap_trans_lang') || 'ar',
        returnTo: window.location.pathname + window.location.search,
      });
      const startUrl = `/api/auth/google/start?${params.toString()}`;
      const width = 520;
      const height = 650;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
      const popup = window.open(
        startUrl,
        'flaptap_google_oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );
      if (!popup) {
        params.set('mode', 'redirect');
        window.location.href = `/api/auth/google/start?${params.toString()}`;
      }
      return;
    }

    if (state.googleAuth.gisOnly && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }

    // Show clean Google Cloud Console setup instructions if credentials are not in .env yet
    if (setupCard) {
      setupCard.hidden = !setupCard.hidden;
    }
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
    if (res.googleAuth) {
      state.googleAuth = Object.assign(state.googleAuth, res.googleAuth);
    }

    updateAccountHeader();
    updateStatsDisplay(res.stats);
    closeAccountDrawer();
    if (toastMsg) showToast(toastMsg);

    await loadLibrary();
    if (state.section === 'vocabulary') await loadVocabulary();
    if (state.section === 'history') await loadUsageAndHistory();
    checkUrlCache((document.getElementById('youtube-url-input')?.value || '').trim());

    await resumePendingAction();
  }

  async function loadSessionAndStats() {
    try {
      const data = await apiFetch('/api/auth/me', { method: 'GET' });
      state.user = data.authenticated ? data.user : null;
      state.sessionLoaded = true;
      if (data.googleAuth) {
        state.googleAuth = Object.assign(state.googleAuth, data.googleAuth);
      }
      if (!state.user) {
        state.authToken = '';
        localStorage.removeItem('flaptap_auth_token');
        state.lessons = [];
        state.vocabItems = [];
        state.usageOverview = null;
      } else if (state.user.nativeLanguage) {
        localStorage.setItem('flaptap_trans_lang', state.user.nativeLanguage);
      }
      updateAccountHeader();
      updateStatsDisplay(data.stats);
    } catch {
      state.sessionLoaded = true;
      updateAccountHeader();
      updateStatsDisplay(null);
    }
  }

  async function loadLanguagesCatalog() {
    try {
      const data = await apiFetch('/api/languages', { method: 'GET' });
      state.languages = Array.isArray(data.languages) ? data.languages : [];
      const optionsHtml = state.languages
        .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.name)} (${escapeHtml(l.native)})</option>`)
        .join('');

      const regSelect = document.getElementById('reg-native-lang');
      const prefSelect = document.getElementById('pref-native-lang');
      if (regSelect) {
        regSelect.innerHTML = optionsHtml;
        regSelect.value = localStorage.getItem('flaptap_trans_lang') || 'ar';
      }
      if (prefSelect) {
        prefSelect.innerHTML = optionsHtml;
        prefSelect.value = state.user?.nativeLanguage || localStorage.getItem('flaptap_trans_lang') || 'ar';
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
          const ua = (s.userAgent || 'Browser session').slice(0, 48);
          const methodBadge = s.authMethod === 'google' ? 'Google' : 'Email';
          return `
            <div class="session-item">
              <div class="session-item-meta">
                <span class="session-item-title">${escapeHtml(ua)}</span>
                <span class="session-item-sub">${escapeHtml(methodBadge)} · ${escapeHtml(formatShortDate(s.lastActiveAt))} ${s.isCurrent ? '· Current device' : ''}</span>
              </div>
              ${
                s.isCurrent
                  ? `<span class="cache-pill forest">Active</span>`
                  : `<button type="button" class="btn-danger-ghost btn-xs" data-revoke-session="${escapeHtml(s.sessionId)}">Revoke</button>`
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
    const setupCard = document.getElementById('google-setup-card');

    if (errBox) errBox.hidden = true;
    if (setupCard) setupCard.hidden = true;

    if (state.user) {
      if (guestView) guestView.hidden = true;
      if (profileView) profileView.hidden = false;
      document.getElementById('profile-name').textContent = state.user.name;
      document.getElementById('profile-email').textContent = state.user.email;
      document.getElementById('pref-name').value = state.user.name;
      document.getElementById('pref-goal').value = String(state.user.dailyGoalMinutes || 15);
      const prefLang = document.getElementById('pref-native-lang');
      if (prefLang && state.user.nativeLanguage) prefLang.value = state.user.nativeLanguage;

      const avatarImg = document.getElementById('profile-avatar-img');
      const avatarFallback = document.getElementById('profile-avatar-fallback');
      if (state.user.avatarUrl && avatarImg) {
        avatarImg.src = state.user.avatarUrl;
        avatarImg.hidden = false;
        if (avatarFallback) avatarFallback.hidden = true;
      } else {
        if (avatarImg) avatarImg.hidden = true;
        if (avatarFallback) {
          avatarFallback.textContent = (state.user.name[0] || 'U').toUpperCase();
          avatarFallback.hidden = false;
        }
      }

      const providerBadge = document.getElementById('profile-provider-badge');
      if (providerBadge) {
        const p = state.user.authProvider || 'email';
        providerBadge.textContent =
          p === 'email+google' ? 'Email + Google' : p === 'google' ? 'Google Account' : 'Email Account';
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

  async function loadLibrary() {
    if (!state.user) {
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

  function buildCachePillsHtml(item) {
    const ci = item.cacheInfo;
    if (!ci) return '';
    const pills = [];
    if (ci.transcriptCached) pills.push(`<span class="cache-pill">Transcript</span>`);
    if (ci.aiCoachCached) {
      pills.push(
        `<span class="cache-pill active">Coach${ci.aiInsightsCount ? ` · ${ci.aiInsightsCount}` : ''}</span>`,
      );
    }
    if (Array.isArray(ci.translationLanguages) && ci.translationLanguages.length > 0) {
      pills.push(
        `<span class="cache-pill active">${escapeHtml(ci.translationLanguages.map((c) => c.toUpperCase()).join('+'))}</span>`,
      );
    }
    if (ci.hasNotes) pills.push(`<span class="cache-pill forest">Notes</span>`);
    if (item.payloadBytes) {
      pills.push(`<span class="cache-pill ltr-num">${escapeHtml(formatBytes(item.payloadBytes))}</span>`);
    }
    return pills.join('');
  }

  function renderLibrary() {
    const grid = document.getElementById('history-grid');
    const empty = document.getElementById('library-empty-state');
    const gateCard = document.getElementById('library-auth-gate-card');
    const clearBtn = document.getElementById('clear-library-btn');
    const countLabel = document.getElementById('library-count-label');
    if (!grid) return;

    if (!state.user) {
      grid.innerHTML = '';
      if (empty) empty.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      if (countLabel) countLabel.textContent = '0';
      if (gateCard) gateCard.hidden = false;
      return;
    }

    if (gateCard) gateCard.hidden = true;

    const query = state.librarySearch.trim().toLowerCase();
    const filtered = state.lessons.filter((item) => {
      if (state.libraryFilter !== 'all' && item.track !== state.libraryFilter) return false;
      if (query) {
        const hay = `${item.title || ''} ${item.creator || ''} ${item.accentDialect || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    if (countLabel) countLabel.textContent = String(filtered.length);
    if (clearBtn) clearBtn.hidden = state.lessons.length === 0;

    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    grid.innerHTML = filtered
      .map((item) => {
        const hasVideoThumb = item.track === 'shadowing' && (item.thumbnailUrl || item.videoId);
        const thumbSrc =
          item.thumbnailUrl ||
          (item.videoId ? `https://img.youtube.com/vi/${encodeURIComponent(item.videoId)}/hqdefault.jpg` : '');

        const mediaHtml = hasVideoThumb
          ? `<img src="${escapeHtml(thumbSrc)}" alt="${escapeHtml(item.title)}" loading="lazy" />`
          : `<div class="card-editorial-cover">
               <p class="cover-style-quote">${escapeHtml(item.accentDialect || 'General American English')}</p>
             </div>`;

        const sentencesCount = Number(item.sentencesCount || item.stats?.sentencesCount || 0);
        const drillsCount = Number(item.completedDrills || 0);
        const cefrHtml = item.cefrLevel
          ? `<span class="card-cefr ltr-num">${escapeHtml(item.cefrLevel)}</span>`
          : '';
        const cachePillsHtml = buildCachePillsHtml(item);

        return `
          <article class="history-card" data-lesson-id="${escapeHtml(item.id)}" tabindex="0" role="link" aria-label="${escapeHtml(item.title)}">
            <div class="card-media">
              ${mediaHtml}
              <span class="card-track-stamp">${escapeHtml(trackLabel(item.track))}</span>
              <span class="card-duration-stamp">${formatDuration(item.durationSeconds)}</span>
              <button type="button" class="card-delete-btn" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete lesson" title="Delete lesson">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div class="card-body">
              <div class="card-creator-row">
                <span class="card-creator">${escapeHtml(item.creator || 'Speaker')}</span>
                ${cefrHtml}
              </div>
              <h3 class="card-title">${escapeHtml(item.title)}</h3>
              ${cachePillsHtml ? `<div class="card-cache-strip">${cachePillsHtml}</div>` : ''}
              <div class="card-footer-meta">
                <div class="card-metrics">
                  <span class="ltr-num">${Number(item.pacingWpm || 145)} WPM</span>
                  ${sentencesCount > 0 ? `<span>· <strong class="ltr-num">${sentencesCount}</strong> ${escapeHtml(t('sentencesUnit'))}</span>` : ''}
                  ${drillsCount > 0 ? `<span>· <strong class="ltr-num">${drillsCount}</strong> ${escapeHtml(t('drillsDoneUnit'))}</span>` : ''}
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
      })
      .join('');
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

    if (visible.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = visible
      .map((item) => {
        const checked = state.selectedLedgerIds.has(item.id) ? 'checked' : '';
        const totalBytes = (Number(item.payloadBytes) || 0) + (Number(item.cacheInfo?.transcriptBytes) || 0);
        const canReextract = item.track === 'shadowing' && (item.sourceUrl || item.videoId);
        const videoUrl = item.sourceUrl || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : '');

        return `
          <div class="history-ledger-row" data-ledger-row="${escapeHtml(item.id)}">
            <div class="ledger-row-left">
              <input type="checkbox" data-ledger-check="${escapeHtml(item.id)}" ${checked} aria-label="Select ${escapeHtml(item.title)}" />
              <div class="ledger-row-main">
                <a href="studio.html?id=${encodeURIComponent(item.id)}" class="ledger-row-title">${escapeHtml(item.title)}</a>
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
              <a href="studio.html?id=${encodeURIComponent(item.id)}" class="btn-secondary btn-xs">${escapeHtml(t('openLesson'))}</a>
              ${
                canReextract
                  ? `<button type="button" class="btn-secondary btn-xs" data-reextract-url="${escapeHtml(videoUrl)}" title="Bypass transcript cache and re-extract fresh">${escapeHtml(t('reextractBtn'))}</button>`
                  : ''
              }
              <button type="button" class="btn-secondary btn-xs" data-clear-item-cache="${escapeHtml(item.id)}">${escapeHtml(t('clearCacheItemBtn'))}</button>
              <button type="button" class="btn-secondary btn-xs" data-reset-item-progress="${escapeHtml(item.id)}">${escapeHtml(t('resetProgressItemBtn'))}</button>
              <button type="button" class="btn-danger-ghost btn-xs" data-delete-item-ledger="${escapeHtml(item.id)}">${escapeHtml(t('deleteItemBtn'))}</button>
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
              <button type="button" class="btn-danger-ghost btn-xs" data-delete-activity="${escapeHtml(log.id)}" aria-label="Delete log entry">×</button>
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
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `flaptap-account-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
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

  function setFlashcardsOpen(open) {
    state.flashcardsOpen = Boolean(open && state.vocabItems.length > 0);
    state.flashcardIndex = 0;
    state.flashcardRevealed = false;
    syncFlashcardButtonDom();
    renderFlashcard();
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
    if (!grid) return;

    syncFlashcardButtonDom();

    if (!state.user) {
      grid.innerHTML = '';
      if (empty) empty.hidden = true;
      if (stage) stage.hidden = true;
      if (gateCard) gateCard.hidden = false;
      return;
    }

    if (gateCard) gateCard.hidden = true;

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
        const dots = [0, 1, 2, 3]
          .map((i) => `<span class="mastery-dot ${i < level ? 'filled' : ''}"></span>`)
          .join('');

        const lessonLink = v.lessonId
          ? `<a href="studio.html?id=${encodeURIComponent(v.lessonId)}&t=${encodeURIComponent(v.timestampSec || 0)}" style="font-weight: 600; color: var(--ink);">${escapeHtml(t('openInContext'))} →</a>`
          : `<span></span>`;

        return `
          <article class="vocab-card" data-vocab-id="${escapeHtml(v.id)}">
            <div class="vocab-card-head">
              <h3 class="vocab-term">${escapeHtml(v.term)}</h3>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${v.partOfSpeech ? `<span class="vocab-pos">${escapeHtml(v.partOfSpeech)}</span>` : ''}
                <button type="button" class="icon-btn" style="width: 26px; height: 26px;" data-delete-vocab="${escapeHtml(v.id)}" aria-label="Remove word">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>
            ${v.ipa ? `<div class="vocab-ipa ltr-num">${escapeHtml(v.ipa)}</div>` : ''}
            <p class="vocab-def">${escapeHtml(v.definition)}</p>
            ${v.translation ? `<p class="vocab-def" style="font-weight: 600; color: var(--ink);">${escapeHtml(v.translation)}</p>` : ''}
            ${v.contextSentence ? `<blockquote class="vocab-context">“${escapeHtml(v.contextSentence)}”</blockquote>` : ''}
            <div class="vocab-card-foot">
              <div class="mastery-dots" title="Mastery level ${level}/4">${dots}</div>
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
    document.getElementById('fc-term').textContent = item.term;
    document.getElementById('fc-ipa').textContent = item.ipa || '';
    document.getElementById('fc-context').textContent = item.contextSentence ? `“${item.contextSentence}”` : '';
    document.getElementById('fc-def').textContent = item.definition;
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
        window.location.href = `studio.html?id=${encodeURIComponent(created.id)}`;
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
        window.location.href = `studio.html?id=${encodeURIComponent(created.id)}`;
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
    // Popup postMessage listener for real Google OAuth 2.0 callback
    window.addEventListener('message', async (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'flaptap:google-auth-success') {
        await handleAuthSuccess(
          data,
          data.isNewUser
            ? `Google account created for ${data.user?.name || 'you'}`
            : `Signed in with Google as ${data.user?.name || 'you'}`,
        );
      } else if (data.type === 'flaptap:google-auth-error') {
        const errBox = document.getElementById('auth-error-box');
        if (errBox) {
          errBox.textContent = data.error || 'Google sign-in failed.';
          errBox.hidden = false;
        } else {
          showToast(data.error || 'Google sign-in failed.');
        }
      }
    });

    // Theme & UI Language
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    document.getElementById('ui-lang-select')?.addEventListener('change', (e) => {
      applyUiLanguage(e.target.value);
    });

    // Primary Navigation Tabs
    document.querySelectorAll('.nav-tab[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });

    document.getElementById('manage-history-jump-btn')?.addEventListener('click', () => {
      switchSection('history');
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

    // URL Input Instant Cache Check + Start Video Lesson (Auth-Gated Before Execution!)
    document.getElementById('youtube-url-input')?.addEventListener('input', (e) => {
      checkUrlCache((e.target.value || '').trim());
    });

    document.getElementById('open-cached-lesson-btn')?.addEventListener('click', () => {
      if (state.urlCacheMatch?.id) {
        window.location.href = `studio.html?id=${encodeURIComponent(state.urlCacheMatch.id)}`;
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
      if (!requireAuthBeforeAction({ type: 'video_lesson', url, force })) {
        return;
      }
      const qs = new URLSearchParams({ url });
      if (force) qs.set('force', '1');
      window.location.href = `studio.html?${qs.toString()}`;
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

    // Library Filter & Search
    document.querySelectorAll('.filter-pill[data-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        state.libraryFilter = pill.dataset.filter;
        document.querySelectorAll('.filter-pill[data-filter]').forEach((p) => {
          const isAct = p === pill;
          p.classList.toggle('active', isAct);
          p.setAttribute('aria-selected', isAct ? 'true' : 'false');
        });
        renderLibrary();
      });
    });

    document.getElementById('library-search-input')?.addEventListener('input', (e) => {
      state.librarySearch = e.target.value || '';
      renderLibrary();
    });

    // Library Card Open / Delete
    document.getElementById('history-grid')?.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.getAttribute('data-delete-id');
        try {
          await apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
          state.lessons = state.lessons.filter((l) => l.id !== id);
          state.selectedLedgerIds.delete(id);
          renderLibrary();
          loadSessionAndStats();
        } catch (err) {
          showToast(err.message);
        }
        return;
      }

      const card = e.target.closest('.history-card[data-lesson-id]');
      if (card) {
        const id = card.getAttribute('data-lesson-id');
        window.location.href = `studio.html?id=${encodeURIComponent(id)}`;
      }
    });

    document.getElementById('history-grid')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const card = e.target.closest('.history-card[data-lesson-id]');
        if (card) {
          window.location.href = `studio.html?id=${encodeURIComponent(card.getAttribute('data-lesson-id'))}`;
        }
      }
    });

    document.getElementById('clear-library-btn')?.addEventListener('click', async () => {
      if (!requireAuthBeforeAction({ type: 'section', section: 'lessons' })) return;
      if (!window.confirm(t('confirmClear'))) return;
      try {
        await apiFetch('/api/history/clear', { method: 'POST' });
        state.lessons = [];
        state.selectedLedgerIds.clear();
        renderLibrary();
        loadSessionAndStats();
      } catch (err) {
        showToast(err.message);
      }
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
        if (state.user) loadVocabulary();
      });
    });

    document.getElementById('vocab-search-input')?.addEventListener('input', (e) => {
      state.vocabSearch = e.target.value || '';
      if (state.user) loadVocabulary();
    });

    document.getElementById('vocab-grid')?.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-delete-vocab]');
      if (delBtn) {
        const id = delBtn.getAttribute('data-delete-vocab');
        try {
          await apiFetch(`/api/vocabulary/${encodeURIComponent(id)}`, { method: 'DELETE' });
          await loadVocabulary();
          loadSessionAndStats();
        } catch (err) {
          showToast(err.message);
        }
      }
    });

    document.getElementById('toggle-flashcards-btn')?.addEventListener('click', () => {
      if (!requireAuthBeforeAction({ type: 'flashcards' })) return;
      setFlashcardsOpen(!state.flashcardsOpen);
    });

    document.getElementById('close-flashcards-btn')?.addEventListener('click', () => {
      setFlashcardsOpen(false);
    });

    document.getElementById('flashcard-card')?.addEventListener('click', () => {
      state.flashcardRevealed = !state.flashcardRevealed;
      renderFlashcard();
    });

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
      if (!window.confirm(t('confirmClearVocab'))) return;
      try {
        const res = await apiFetch('/api/vocabulary/clear', { method: 'POST' });
        state.vocabItems = [];
        await loadUsageAndHistory();
        showToast(`Cleared ${res.removedCount || 0} vocabulary items`);
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('clear-entire-history-btn')?.addEventListener('click', async () => {
      if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
      if (!window.confirm(t('confirmClear'))) return;
      try {
        await apiFetch('/api/history/clear', { method: 'POST' });
        state.lessons = [];
        state.selectedLedgerIds.clear();
        await loadUsageAndHistory();
        showToast('All lessons deleted from history');
      } catch (err) {
        showToast(err.message);
      }
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
        renderHistoryLedger();
      });
    });

    document.getElementById('ledger-cache-filter')?.addEventListener('change', (e) => {
      state.ledgerCacheFilter = e.target.value || 'all';
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
      if (action === 'delete' && !window.confirm(`Delete ${ids.length} selected lesson(s)?`)) return;
      try {
        const res = await apiFetch('/api/history/bulk', {
          method: 'POST',
          body: JSON.stringify({ ids, action }),
        });
        if (action === 'delete') state.selectedLedgerIds.clear();
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
          window.location.href = `studio.html?url=${encodeURIComponent(videoUrl)}&force=1`;
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
        try {
          await apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
          state.selectedLedgerIds.delete(id);
          await loadUsageAndHistory();
          showToast('Lesson deleted');
        } catch (err) {
          showToast(err.message);
        }
      }
    });

    // Activity Log Timeline Delete & Clear
    document.getElementById('activity-timeline-list')?.addEventListener('click', async (e) => {
      const delLog = e.target.closest('[data-delete-activity]');
      if (!delLog) return;
      const logId = delLog.getAttribute('data-delete-activity');
      try {
        await apiFetch(`/api/history/activity/${encodeURIComponent(logId)}`, { method: 'DELETE' });
        await loadUsageAndHistory();
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('clear-activity-log-btn')?.addEventListener('click', async () => {
      if (!requireAuthBeforeAction({ type: 'section', section: 'history' })) return;
      try {
        await apiFetch('/api/history/activity/clear', { method: 'POST' });
        await loadUsageAndHistory();
        showToast('Activity timeline cleared');
      } catch (err) {
        showToast(err.message);
      }
    });

    // Account Drawer Controls & Google / Email Authentication
    document.getElementById('open-account-btn')?.addEventListener('click', () => openAccountDrawer({ fromGate: false }));
    document.getElementById('close-account-btn')?.addEventListener('click', closeAccountDrawer);
    document.getElementById('account-drawer-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'account-drawer-backdrop') closeAccountDrawer();
    });

    document.getElementById('google-signin-btn')?.addEventListener('click', startGoogleOAuthFlow);

    document.querySelectorAll('.auth-tab[data-auth-tab]').forEach((tab) => {
      tab.addEventListener('click', () => setAuthDrawerTab(tab.dataset.authTab));
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
      try {
        await apiFetch(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        await loadActiveSessions();
        showToast('Session revoked');
      } catch (err) {
        showToast(err.message);
      }
    });

    document.getElementById('revoke-other-sessions-btn')?.addEventListener('click', async () => {
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
      showToast('Signed out');
    });

    document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
      if (!window.confirm(t('confirmDeleteAccount'))) return;
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
    applyTheme(state.theme);
    applyUiLanguage(state.uiLang);
    bindEvents();

    const params = new URLSearchParams(window.location.search);
    const urlSection = params.get('section');
    const authRequired = params.get('auth') === 'required';
    const nextHref = params.get('next');
    const authError = params.get('auth_error');

    await Promise.all([loadSessionAndStats(), loadLanguagesCatalog(), loadGoogleOAuthConfig()]);
    await loadLibrary();

    if (urlSection && ['lessons', 'dialogue', 'pronunciation', 'vocabulary', 'history'].includes(urlSection)) {
      switchSection(urlSection);
    }

    if (authError) {
      openAccountDrawer({ fromGate: false, tab: 'login' });
      const errBox = document.getElementById('auth-error-box');
      if (errBox) {
        errBox.textContent = authError;
        errBox.hidden = false;
      }
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
})();
