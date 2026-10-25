/**
 * AccentForge AI - Dedicated Studio Controller
 * Live Agent Progress Engine (0% - 100%) | Multi-Stage Visual Handshake | Obsidian Notetaker
 * Interactive Sentence Driller Mode | Millisecond Seeking | Dual Speed Sliders | Deduplication Memory
 */

const API_BASE = '/api';

const VERNACULAR_DIALECTS = {
  ar: [
    { code: 'ar-EG', flag: '🇪🇬', nameEn: 'Egypt (Egyptian Arabic)', nameAr: 'مصر (اللهجة المصرية العامية)' },
    { code: 'ar-SA', flag: '🇸🇦', nameEn: 'Saudi Arabia', nameAr: 'المملكة العربية السعودية (اللهجة السعودية)' },
    { code: 'ar-AE', flag: '🇦🇪', nameEn: 'UAE', nameAr: 'الإمارات العربية المتحدة' },
    { code: 'ar-KW', flag: '🇰🇼', nameEn: 'Kuwait', nameAr: 'الكويت' },
    { code: 'ar-QA', flag: '🇶🇦', nameEn: 'Qatar', nameAr: 'قطر' },
    { code: 'ar-BH', flag: '🇧🇭', nameEn: 'Bahrain', nameAr: 'البحرين' },
    { code: 'ar-OM', flag: '🇴🇲', nameEn: 'Oman', nameAr: 'عُمان' },
    { code: 'ar-JO', flag: '🇯🇴', nameEn: 'Jordan', nameAr: 'الأردن' },
    { code: 'ar-PS', flag: '🇵🇸', nameEn: 'Palestine', nameAr: 'فلسطين' },
    { code: 'ar-LB', flag: '🇱🇧', nameEn: 'Lebanon', nameAr: 'لبنان' },
    { code: 'ar-SY', flag: '🇸🇾', nameEn: 'Syria', nameAr: 'سوريا' },
    { code: 'ar-IQ', flag: '🇮🇶', nameEn: 'Iraq', nameAr: 'العراق' },
    { code: 'ar-MA', flag: '🇲🇦', nameEn: 'Morocco', nameAr: 'المغرب (الدارجة)' },
    { code: 'ar-DZ', flag: '🇩🇿', nameEn: 'Algeria', nameAr: 'الجزائر (الدارجة)' },
    { code: 'ar-TN', flag: '🇹🇳', nameEn: 'Tunisia', nameAr: 'تونس (الدارجة)' },
    { code: 'ar-LY', flag: '🇱🇾', nameEn: 'Libya', nameAr: 'ليبيا' },
    { code: 'ar-SD', flag: '🇸🇩', nameEn: 'Sudan', nameAr: 'السودان' },
    { code: 'ar-YE', flag: '🇾🇪', nameEn: 'Yemen', nameAr: 'اليمن' },
    { code: 'ar-MR', flag: '🇲🇷', nameEn: 'Mauritania', nameAr: 'موريتانيا (الحسانية)' },
    { code: 'ar-SO', flag: '🇸🇴', nameEn: 'Somalia', nameAr: 'الصومال' },
    { code: 'ar-DJ', flag: '🇩🇯', nameEn: 'Djibouti', nameAr: 'جيبوتي' },
    { code: 'ar-KM', flag: '🇰🇲', nameEn: 'Comoros', nameAr: 'جزر القمر' }
  ],
  en: [
    { code: 'en-US', flag: '🇺🇸', nameEn: 'American English (US)', nameAr: 'الإنجليزية الأمريكية (General American)' },
    { code: 'en-GB', flag: '🇬🇧', nameEn: 'British English (UK)', nameAr: 'الإنجليزية البريطانية (UK Colloquial)' },
    { code: 'en-AU', flag: '🇦🇺', nameEn: 'Australian English', nameAr: 'الإنجليزية الأسترالية (Aussie Casual)' },
    { code: 'en-CA', flag: '🇨🇦', nameEn: 'Canadian English', nameAr: 'الإنجليزية الكندية' },
    { code: 'en-IE', flag: '🇮🇪', nameEn: 'Irish English', nameAr: 'الإنجليزية الأيرلندية' },
    { code: 'en-NZ', flag: '🇳🇿', nameEn: 'New Zealand English', nameAr: 'إنجليزية نيوزيلندا' },
    { code: 'en-ZA', flag: '🇿🇦', nameEn: 'South African English', nameAr: 'إنجليزية جنوب إفريقيا' }
  ]
};

const STUDIO_I18N = {
  en: {
    back: 'Dashboard',
    exportBtn: 'Export Obsidian Note (.md)',
    tempoLabel: 'Practice Tempo:',
    recLabTitle: 'Voice Shadowing Lab',
    startRecord: 'Start Shadowing Take',
    stopRecord: 'Stop & Compare Audio',
    recInstructions: 'Speak out loud simultaneously with the creator to match cadence and flap-T tapping.',
    yourTake: 'Your Recorded Take:',
    discardTake: '✕ Discard Take',
    recStatusReady: 'Ready',
    recStatusRecording: 'Recording...',
    recStatusSaved: 'Take Saved',
    completeDrill: 'Mark Drill Completed',
    drillCompletedToast: '🎉 Drill completed! Practice count updated.',
    drillsCompleted: 'drills completed',
    legendTitle: 'Shadowing Color Legend',
    speedTitle: 'Playback Speed',
    speedSliderLabel: 'Playback Speed (0.25x):',
    modeChunks: 'Paragraph Mode',
    modeSentences: 'Sentence Driller Mode',
    endActionTitle: 'Sentence Completion Action:',
    actionLoop: 'Auto-Repeat Loop',
    actionPause: 'Stop & Shadow',
    actionContinuous: 'Continuous Play',
    transToggle: 'Real-World Meaning',
    transLangLabel: 'Language:',
    transDialectLabel: 'Dialect / Country:',
    transStatusReady: 'AI Vernacular',
    transStatusLoading: 'Synthesizing dialect...',
    playDrill: 'Play & Drill',
    nowPlaying: 'Now Playing (Drill Mode Active)',
    tabs: {
      transcript: 'Verbatim Transcript',
      slang: 'Slang Glossary',
      idioms: 'Native Idioms',
      reductions: 'Connected Speech & Flap-T',
      asr: 'ASR Fixes Log',
      notes: 'My Study Notetaker',
    },
    emptySlang: 'No slang terms detected in this session.',
    emptyIdioms: 'No idioms detected in this session.',
    emptyReductions: 'No phonetic reductions logged for this session.',
    emptyAsr: 'No ASR transcription errors detected (100% audio fidelity).',
    notesTitle: 'Personal Shadowing Notes & Phonetics Log',
    notesPlaceholder: 'Type your personal observations, phonetic reminders, flap-T notes, and vocabulary lists here...',
    autosave: 'Auto-saved to your browser',
    seekBtn: '▶ Play at',
    copiedAlert: 'Obsidian markdown note downloaded successfully!',
  },
  ar: {
    back: 'الرئيسية',
    exportBtn: 'تصدير ملاحظة أوبسيديان (.md)',
    tempoLabel: 'سرعة التمرين:',
    recLabTitle: 'مختبر تسجيل ومحاكاة الصوت',
    startRecord: 'بدء تسجيل صوتك',
    stopRecord: 'إيقاف ومقارنة الصوت',
    recInstructions: 'تحدث بصوت مسموع بالتزامن مع صانع المحتوى لتقليد النبرة وتقليل الحروف وسرعة النطق.',
    yourTake: 'تسجيلك الصوتي للمقارنة:',
    discardTake: '✕ حذف التسجيل',
    recStatusReady: 'جاهز',
    recStatusRecording: 'جاري التسجيل...',
    recStatusSaved: 'تم الحفظ',
    completeDrill: 'تسجيل إكمال التمرين',
    drillCompletedToast: '🎉 تم تسجيل إكمال التمرين بنجاح!',
    drillsCompleted: 'مرات تدريب مكتملة',
    legendTitle: 'دليل ألوان المحاكاة',
    speedTitle: 'سرعة التشغيل',
    speedSliderLabel: 'سرعة التشغيل (0.25x):',
    modeChunks: 'نمط المقاطع',
    modeSentences: 'نمط تدريب الجمل المستقلة',
    endActionTitle: 'خيارات انتهاء الجملة:',
    actionLoop: 'تكرار تلقائي',
    actionPause: 'إيقاف للتمرين الصوتي',
    actionContinuous: 'المتابعة التلقائية',
    transToggle: 'الترجمة الواقعية الحية',
    transLangLabel: 'اللغة:',
    transDialectLabel: 'اللهجة / الدولة:',
    transStatusReady: 'لهجة حية بالذكاء الاصطناعي',
    transStatusLoading: 'جاري توليد اللهجة...',
    playDrill: 'تشغيل وتدريب',
    nowPlaying: 'جاري التشغيل والتدريب الصوتي',
    tabs: {
      transcript: 'النص المفرغ بالكامل',
      slang: 'معجم لغة الشارع والسلاينج',
      idioms: 'تعبيرات أصلية ومصطلحات',
      reductions: 'دمج الحروف والـ Flap-T',
      asr: 'أخطاء التفريغ المصححة',
      notes: 'ملاحظاتي الدراسية',
    },
    emptySlang: 'لا توجد مصطلحات سلاينج في هذه الجلسة.',
    emptyIdioms: 'لا توجد تعبيرات اصطلاحية في هذه الجلسة.',
    emptyReductions: 'لا توجد اختصارات صوتية مسجلة.',
    emptyAsr: 'لا توجد أخطاء تفريغ صوتي (دقة التفريغ 100%).',
    notesTitle: 'ملاحظات النطق والتمرين الشخصية',
    notesPlaceholder: 'اكتب هنا ملاحظاتك الشخصية، تذكيرات الـ Flap-T، وقوائم الكلمات الجديدة...',
    autosave: 'يتم الحفظ التلقائي في متصفحك',
    seekBtn: '▶ تشغيل عند',
    copiedAlert: 'تم تحميل ملف أوبسيديان (.md) بنجاح!',
  }
};

const studioState = {
  lang: 'ar',
  theme: 'dark',
  item: null,
  activeTab: 'transcript',
  transcriptMode: 'sentences', // 'chunks' | 'sentences'
  endAction: 'loop',        // 'loop' | 'pause' | 'continuous'
  speed: 1.0,
  activeSentence: null,
  ytPlayer: null,
  ytReady: false,
  pendingVideoId: null,
  playbackTicker: null,
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  translationEnabled: false,
  translationLang: 'ar',
  translationDialect: 'ar-EG',
  activeTranslations: {},
};
window.studioState = studioState;

// Global YouTube IFrame API Callback
window.onYouTubeIframeAPIReady = function() {
  studioState.ytReady = true;
  if (studioState.pendingVideoId) {
    initYouTubePlayer(studioState.pendingVideoId);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initStudioTheme();
  initStudioI18n();
  initStudioSession();
  setupStudioEvents();
});

function initStudioTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  setStudioTheme(saved);
}

function setStudioTheme(theme) {
  studioState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('studio-theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initStudioI18n() {
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  const saved = urlLang || localStorage.getItem('lang') || 'ar';
  setStudioLanguage(saved);
}

function setStudioLanguage(lang) {
  studioState.lang = lang;
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  localStorage.setItem('lang', lang);

  const t = STUDIO_I18N[lang];
  document.getElementById('nav-back-text').textContent = t.back;
  document.getElementById('download-btn-text').textContent = t.exportBtn;
  document.getElementById('studio-lang-btn').textContent = lang === 'en' ? 'العربية' : 'English';
  
  const speedTitleElem = document.getElementById('speed-title-label');
  if (speedTitleElem) speedTitleElem.textContent = t.speedTitle;
  const speedSliderElem = document.getElementById('speed-slider-label');
  if (speedSliderElem) speedSliderElem.textContent = t.speedSliderLabel;

  const modeChunksElem = document.getElementById('label-mode-chunks');
  if (modeChunksElem) modeChunksElem.textContent = t.modeChunks;
  const modeSentElem = document.getElementById('label-mode-sentences');
  if (modeSentElem) modeSentElem.textContent = t.modeSentences;

  const endActionTitle = document.getElementById('end-action-title');
  if (endActionTitle) endActionTitle.textContent = t.endActionTitle;
  const actionLoopElem = document.getElementById('label-action-loop');
  if (actionLoopElem) actionLoopElem.textContent = t.actionLoop;
  const actionPauseElem = document.getElementById('label-action-pause');
  if (actionPauseElem) actionPauseElem.textContent = t.actionPause;
  const actionContElem = document.getElementById('label-action-continuous');
  if (actionContElem) actionContElem.textContent = t.actionContinuous;

  const transToggleLabel = document.getElementById('label-trans-toggle');
  if (transToggleLabel) transToggleLabel.textContent = t.transToggle;
  const transLangLabel = document.getElementById('label-trans-lang');
  if (transLangLabel) transLangLabel.textContent = t.transLangLabel;
  const transDialectLabel = document.getElementById('label-trans-dialect');
  if (transDialectLabel) transDialectLabel.textContent = t.transDialectLabel;
  populateDialectDropdown(studioState.translationLang, studioState.translationDialect);

  document.getElementById('rec-lab-title').textContent = t.recLabTitle;
  document.getElementById('record-btn-text').textContent = studioState.isRecording ? t.stopRecord : t.startRecord;
  document.getElementById('record-instructions').textContent = t.recInstructions;
  document.getElementById('your-take-label').textContent = t.yourTake;
  document.getElementById('legend-card-title').textContent = t.legendTitle;

  const discardBtn = document.getElementById('discard-take-btn');
  if (discardBtn) discardBtn.textContent = t.discardTake;
  const completeText = document.getElementById('complete-drill-text');
  if (completeText) completeText.textContent = t.completeDrill;
  const drillsBadge = document.getElementById('studio-drills-badge');
  if (drillsBadge && studioState.item) drillsBadge.textContent = `${studioState.item.completedDrills || 0} ${t.drillsCompleted}`;

  document.getElementById('tab-label-transcript').textContent = t.tabs.transcript;
  document.getElementById('tab-label-slang').textContent = t.tabs.slang;
  document.getElementById('tab-label-idioms').textContent = t.tabs.idioms;
  document.getElementById('tab-label-reductions').textContent = t.tabs.reductions;
  document.getElementById('tab-label-asr').textContent = t.tabs.asr;
  document.getElementById('tab-label-notes').textContent = t.tabs.notes;

  document.getElementById('notes-title').textContent = t.notesTitle;
  document.getElementById('study-notes-textarea').placeholder = t.notesPlaceholder;
  document.getElementById('notes-autosave').textContent = t.autosave;
}

// Session Router & Deduplication Memory Handshake
async function initStudioSession() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const url = params.get('url');
  const agent = params.get('agent') || 'antigravity';
  const isNew = params.get('new') === 'true' || params.get('new') === '1';

  // Preserve initial mode & preferences from URL
  studioState.initialMode = params.get('mode') || 'chunks';
  studioState.initialSpeed = params.get('speed');
  studioState.initialAction = params.get('action');
  studioState.initialDrill = params.get('drill');

  // 1. Direct ID load: load existing session instantly from database
  if (id) {
    await loadExistingSession(id);
    return;
  }

  // 2. URL provided: ALWAYS check database memory first!
  if (url) {
    try {
      const checkRes = await fetch(`${API_BASE}/tracks/shadowing/check-existing?url=${encodeURIComponent(url)}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.exists && checkData.item) {
          // Video was processed previously: update address bar to ?id=xxx and bypass loader completely!
          window.history.replaceState({}, '', `studio.html?id=${encodeURIComponent(checkData.item.id)}`);
          studioState.item = checkData.item;
          revealStudio(checkData.item);
          return;
        }
      }
    } catch (e) {
      console.warn('Memory inspection failed, proceeding with standard job lifecycle:', e);
    }

    // 3. Brand-new video that is NOT in database: launch the 0-100% Agent Progress Engine
    if (isNew) {
      await runLiveAgentJob(url, agent);
      return;
    }
  }

  // 4. Fallback: try opening latest practice session or return to dashboard
  try {
    const res = await fetch(`${API_BASE}/history`);
    if (res.ok) {
      const items = await res.json();
      if (items.length > 0) {
        window.history.replaceState({}, '', `studio.html?id=${encodeURIComponent(items[0].id)}`);
        await loadExistingSession(items[0].id);
        return;
      }
    }
  } catch (e) {
    // ignore
  }
  window.location.href = 'index.html';
}

// Live Multi-Stage Agent Execution Loop (0% -> 100%)
async function runLiveAgentJob(url, agent) {
  let visualPercent = 12;
  updateProgress(visualPercent, 1, 'Initializing Agent Engine...', 'Bootstrapping agent environment for skill: american-accent-shadowing');

  // Ambient ticker ensuring the loader immediately moves and NEVER hangs at 0%
  const ambientTimer = setInterval(() => {
    if (visualPercent < 85) {
      visualPercent += 2;
      const stage = Math.min(Math.floor(visualPercent / 18) + 1, 5);
      updateProgress(visualPercent, stage, null, null);
    }
  }, 250);

  try {
    const startRes = await fetch(`${API_BASE}/tracks/shadowing/start-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, agentType: agent }),
    });

    if (!startRes.ok) throw new Error('Failed to initiate agent job');
    const startData = await startRes.json();

    // If backend reports video already existed in database memory:
    if (startData.alreadyExists && startData.result) {
      clearInterval(ambientTimer);
      window.history.replaceState({}, '', `studio.html?id=${encodeURIComponent(startData.result.id)}`);
      studioState.item = startData.result;
      revealStudio(startData.result);
      return;
    }

    const { jobId } = startData;
    let completed = false;

    while (!completed) {
      await new Promise(r => setTimeout(r, 350));
      const statusRes = await fetch(`${API_BASE}/tracks/shadowing/job-status/${jobId}`);
      if (!statusRes.ok) continue;

      const job = await statusRes.json();
      
      const percent = Math.max(visualPercent, job.progressPercent || 20);
      visualPercent = percent;
      const stage = job.currentStage || 1;
      const headline = job.stageName || 'Processing...';
      const latestMsg = job.logs.length ? job.logs[job.logs.length - 1].message : 'Agent active...';

      updateProgress(percent, stage, headline, latestMsg);

      if (job.status === 'completed' && job.result) {
        clearInterval(ambientTimer);
        completed = true;
        updateProgress(100, 6, 'Studio Ready!', 'Shadowing Studio compilation complete.');
        studioState.item = job.result;

        // CRUCIAL: Replace address bar with ?id=xxx so page reloads bypass loader forever!
        window.history.replaceState({}, '', `studio.html?id=${encodeURIComponent(job.result.id)}`);

        await new Promise(r => setTimeout(r, 500));
        revealStudio(job.result);
        break;
      }

      if (job.status === 'failed') {
        clearInterval(ambientTimer);
        throw new Error(job.error || 'Agent execution failed');
      }
    }
  } catch (err) {
    clearInterval(ambientTimer);
    document.getElementById('loader-headline').textContent = 'Agent Error';
    document.getElementById('loader-subheadline').textContent = err.message;
    const errorActions = document.getElementById('loader-error-actions');
    if (errorActions) errorActions.style.display = 'flex';
    showStudioToast(`Agent Error: ${err.message}`, 'error');
  }
}

async function loadExistingSession(id) {
  try {
    const res = await fetch(`${API_BASE}/history/${id}`);
    if (!res.ok) throw new Error('Session not found');
    const item = await res.json();
    if (!item.sentences || item.sentences.length === 0) {
      if (item.chunks && item.chunks.length > 0) {
        item.sentences = synthesizeClientSentences(item.chunks);
      }
    }
    studioState.item = item;
    revealStudio(item);
  } catch (err) {
    showStudioToast('Session load error: ' + err.message, 'error');
    window.location.href = 'index.html';
  }
}

function applyStudioHighlights(text) {
  let html = text;
  // Connected speech reductions
  html = html.replace(/\bgoing to\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">going to [gonna]</mark>');
  html = html.replace(/\bwant to\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">want to [wanna]</mark>');
  html = html.replace(/\bgot to\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">got to [gotta]</mark>');
  html = html.replace(/\blet me\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">let me [lemme]</mark>');
  html = html.replace(/\bkind of\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">kind of [kinda]</mark>');
  html = html.replace(/\bout of\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">out of [outta]</mark>');
  html = html.replace(/\bgive me\b/gi, '<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">give me [gimme]</mark>');
  // Street slang & idioms
  html = html.replace(/\b(deadass|no cap|my guy|totally down|hit it up|big time|chill out)\b/gi, '<mark class="shadow-slang" style="background-color: #FEF08A; color: #713F12; padding: 2px 5px; border-radius: 4px; font-weight: 600;">$1</mark>');
  html = html.replace(/\b(under the weather|bite the bullet|on the go|whirlwind|off the charts|just around the corner)\b/gi, '<mark class="shadow-idiom" style="background-color: #E9D5FF; color: #581C87; padding: 2px 5px; border-radius: 4px; font-weight: 600;">$1</mark>');
  return html;
}

function synthesizeClientSentences(chunks) {
  const parseTime = (ts) => {
    if (typeof ts === 'number') return ts;
    if (!ts) return 0;
    const parts = ts.replace(/[\[\]]/g, '').trim().split(':');
    if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    const f = parseFloat(ts);
    return isNaN(f) ? 0 : f;
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

  const sentences = [];
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
    const chunkSubUnits = [];

    for (const section of initialSections) {
      const words = section.trim().split(/\s+/).filter(Boolean);
      if (words.length <= 16) {
        chunkSubUnits.push(words.join(' '));
        continue;
      }

      let currentUnit = [];
      let i = 0;

      while (i < words.length) {
        currentUnit.push(words[i]);
        const currentCount = currentUnit.length;
        const remainingWords = words.length - (i + 1);

        if (currentCount >= 10) {
          const nextWord = (words[i + 1] || '').toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');
          const nextTwoWords = ((words[i + 1] || '') + ' ' + (words[i + 2] || '')).toLowerCase();
          const currWordClean = words[i].toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');
          const endsWithPunct = /[,\u2014\u2013:;-]$/.test(words[i]);

          let isBreakPoint = false;

          if (endsWithPunct && currentCount >= 12 && !DANGLING_END_WORDS.has(currWordClean) && remainingWords >= 4) {
            isBreakPoint = true;
          } else if (BREAK_BEFORE_WORDS.has(nextWord) && currentCount >= 12 && !DANGLING_END_WORDS.has(currWordClean) && remainingWords >= 4) {
            isBreakPoint = true;
          } else if (currentCount >= 16) {
            if (!DANGLING_END_WORDS.has(currWordClean) && remainingWords > 2) {
              isBreakPoint = true;
            } else if (currentCount >= 20) {
              isBreakPoint = true;
            }
          }

          if (isBreakPoint && remainingWords > 0) {
            chunkSubUnits.push(currentUnit.join(' '));
            currentUnit = [];
          }
        }
        i++;
      }

      if (currentUnit.length > 0) {
        if (currentUnit.length < 5 && chunkSubUnits.length > 0) {
          const prev = chunkSubUnits.pop();
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
        timeRange: `[${formatStudioDuration(startSec)} - ${formatStudioDuration(endSec)}]`,
        startSec,
        endSec,
        durationSec,
        text: unitText,
        highlightedHtml: applyStudioHighlights(unitText),
      });
      count++;
    }
  }

  // Crumb merging pass: ensure no micro-fragment (< 4 words like "Nice.") stands alone
  const merged = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const wordCount = s.text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 4 && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.text = `${prev.text} ${s.text}`;
      prev.highlightedHtml = `${prev.highlightedHtml} ${s.highlightedHtml}`;
      prev.endSec = s.endSec;
      prev.durationSec = Math.max(Math.round((prev.endSec - prev.startSec) * 100) / 100, 0.8);
      prev.timeRange = `[${formatStudioDuration(prev.startSec)} - ${formatStudioDuration(prev.endSec)}]`;
    } else if (wordCount < 4 && i + 1 < sentences.length) {
      const next = sentences[i + 1];
      next.text = `${s.text} ${next.text}`;
      next.highlightedHtml = `${s.highlightedHtml} ${next.highlightedHtml}`;
      next.startSec = s.startSec;
      next.durationSec = Math.max(Math.round((next.endSec - next.startSec) * 100) / 100, 0.8);
      next.timeRange = `[${formatStudioDuration(next.startSec)} - ${formatStudioDuration(next.endSec)}]`;
    } else {
      merged.push(s);
    }
  }

  // Pass 2: Merge non-terminal fragments (e.g. clauses cut mid-sentence where combined length <= 16 words)
  const finalMerged = [];
  for (const s of merged) {
    if (finalMerged.length > 0) {
      const prev = finalMerged[finalMerged.length - 1];
      const prevHasTerminal = /[.?!]["']?$/.test(prev.text.trim());
      const combWords = prev.text.trim().split(/\s+/).length + s.text.trim().split(/\s+/).length;
      if (!prevHasTerminal && combWords <= 16) {
        prev.text = `${prev.text} ${s.text}`;
        prev.highlightedHtml = `${prev.highlightedHtml} ${s.highlightedHtml}`;
        prev.endSec = Math.max(prev.endSec, s.endSec);
        prev.durationSec = Math.max(Math.round((prev.endSec - prev.startSec) * 100) / 100, 0.8);
        prev.timeRange = `[${formatStudioDuration(prev.startSec)} - ${formatStudioDuration(prev.endSec)}]`;
        continue;
      }
    }
    finalMerged.push(s);
  }

  return finalMerged.map((s, idx) => ({
    ...s,
    id: `sent-${idx + 1}`,
    index: idx + 1,
  }));
}

function updateProgress(percent, stageNum, headline, terminalMsg) {
  const numElem = document.getElementById('loader-percentage-num');
  if (numElem) numElem.textContent = `${percent}%`;

  const circle = document.getElementById('circle-progress-bar');
  if (circle) {
    const circumference = 377;
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }

  if (headline) document.getElementById('loader-headline').textContent = headline;

  for (let s = 1; s <= 6; s++) {
    const stageElem = document.getElementById(`stage-${s}`);
    if (!stageElem) continue;
    if (s < stageNum) {
      stageElem.className = 'stage-item completed';
      stageElem.querySelector('.stage-icon-badge').textContent = '✓';
    } else if (s === stageNum) {
      stageElem.className = 'stage-item active';
      stageElem.querySelector('.stage-icon-badge').textContent = s;
    } else {
      stageElem.className = 'stage-item';
      stageElem.querySelector('.stage-icon-badge').textContent = s;
    }
  }

  if (terminalMsg) {
    const stream = document.getElementById('terminal-stream');
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.textContent = `> ${terminalMsg}`;
    stream.appendChild(line);
    stream.scrollTop = stream.scrollHeight;
  }
}

function revealStudio(item) {
  const loader = document.getElementById('loader-overlay');
  if (loader) {
    loader.classList.add('fade-out');
  }

  // Populate Header
  document.getElementById('studio-title').textContent = item.title;
  document.getElementById('studio-creator').textContent = item.creator;
  document.getElementById('studio-dialect').textContent = item.accentDialect || 'General American';
  document.getElementById('studio-pacing').textContent = `${item.pacingWpm || 155} WPM`;

  // Initialize YouTube Player if videoId exists
  const videoId = item.videoId;
  if (videoId) {
    initYouTubePlayer(videoId);
  } else {
    const iframe = document.getElementById('studio-video-frame');
    if (iframe) iframe.style.display = 'none';
  }

  // Render All Sub-Views
  renderStudioViews(item);

  // Initialize Vernacular Dialect Translation Controls
  initTranslationControls();

  // Restore Personal Study Notes
  const savedNotes = localStorage.getItem(`notes_${item.id}`);
  const textarea = document.getElementById('study-notes-textarea');
  if (savedNotes && textarea) textarea.value = savedNotes;

  // Deep-linking / URL Parameter initializations
  const initialMode = studioState.initialMode;
  if (initialMode === 'sentences') {
    switchTranscriptMode('sentences');
  }
  const initialSpeed = studioState.initialSpeed;
  if (initialSpeed) {
    setStudioSpeed(parseFloat(initialSpeed));
  }
  const initialAction = studioState.initialAction;
  if (initialAction) {
    const btn = document.querySelector(`.action-pill-btn[data-action="${initialAction}"]`);
    if (btn) btn.click();
  }
  const initialDrill = parseInt(studioState.initialDrill, 10);
  if (initialDrill) {
    setTimeout(() => playSentence(initialDrill), 300);
  }
}

// Official YouTube IFrame Player API Handler
function initYouTubePlayer(videoId) {
  if (!studioState.ytReady || typeof YT === 'undefined' || !YT.Player) {
    studioState.pendingVideoId = videoId;
    if (!document.getElementById('yt-api-script')) {
      const script = document.createElement('script');
      script.id = 'yt-api-script';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }
    // Fallback iframe while API loads
    const iframe = document.getElementById('studio-video-frame');
    if (iframe) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`;
      iframe.style.display = 'block';
    }
    return;
  }

  const iframe = document.getElementById('studio-video-frame');
  if (iframe) iframe.style.display = 'none';

  if (studioState.ytPlayer && studioState.ytPlayer.loadVideoById) {
    studioState.ytPlayer.loadVideoById(videoId);
    applySpeedToPlayer(studioState.speed);
    return;
  }

  try {
    studioState.ytPlayer = new YT.Player('studio-youtube-player', {
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          applySpeedToPlayer(studioState.speed);
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            startPlaybackTicker();
          } else {
            stopPlaybackTicker();
          }
        }
      }
    });
  } catch (err) {
    console.warn('YT Player init fallback:', err);
    if (iframe) {
      iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`;
      iframe.style.display = 'block';
    }
  }
}

function renderStudioViews(item) {
  const t = STUDIO_I18N[studioState.lang];
  const chunks = item.chunks || [];
  const sentences = item.sentences || [];

  document.getElementById('studio-chunk-count').textContent = chunks.length;
  const chunksBadge = document.getElementById('count-chunks-badge');
  if (chunksBadge) chunksBadge.textContent = chunks.length;
  const sentBadge = document.getElementById('count-sentences-badge');
  if (sentBadge) sentBadge.textContent = sentences.length;

  const slangList = item.slangTable || [];
  const idiomsList = item.idiomsTable || [];
  const redList = item.reductionsTable || [];
  const asrList = item.asrFixes || [];

  const slangBadge = document.getElementById('studio-slang-count');
  if (slangBadge) slangBadge.textContent = slangList.length;
  const idiomsBadge = document.getElementById('studio-idioms-count');
  if (idiomsBadge) idiomsBadge.textContent = idiomsList.length;
  const redBadge = document.getElementById('studio-reductions-count');
  if (redBadge) redBadge.textContent = redList.length;
  const asrBadge = document.getElementById('studio-asr-count');
  if (asrBadge) asrBadge.textContent = asrList.length;

  // 1. Verbatim Transcript Chunks
  const chunksContainer = document.getElementById('subview-chunks-list');
  if (chunksContainer) {
    if (chunks.length > 0) {
      chunksContainer.innerHTML = chunks.map((c, idx) => {
        const startSeconds = c.startSec ?? c.start_sec ?? parseStudioSeconds(c.start);
        const endSeconds = c.endSec ?? c.end_sec ?? parseStudioSeconds(c.end);
        const timeStr = c.timeRange || c.time_range || (c.start ? `[${c.start} - ${c.end}]` : `[${formatStudioDuration(startSeconds)} - ${formatStudioDuration(endSeconds)}]`);
        return `
          <div class="studio-chunk" id="schunk-${idx}">
            <div class="chunk-top-row">
              <span class="chunk-badge-time">${timeStr} — Segment ${idx + 1}</span>
              <button class="chunk-jump-btn" onclick="seekStudioVideo(${startSeconds})">
                ${t.seekBtn} ${formatStudioDuration(startSeconds)}
              </button>
            </div>
            <div class="chunk-content-text">
              ${c.highlightedHtml || c.text}
            </div>
          </div>
        `;
      }).join('');
    } else {
      chunksContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No transcript segments found.</div>`;
    }
  }

  // 2. Interactive Sentence Driller List
  renderSentenceList(sentences);

  // 3. Slang Glossary
  const slangView = document.getElementById('view-slang');
  if (slangList.length > 0) {
    slangView.innerHTML = `
      <table class="linguistic-table">
        <thead>
          <tr>
            <th>Slang & Street Expression</th>
            <th>Spoken Meaning in Real-World Context</th>
            <th>Delivery Vibe</th>
          </tr>
        </thead>
        <tbody>
          ${slangList.map(s => `
            <tr>
              <td><mark class="shadow-slang" style="background-color: var(--badge-slang-bg); color: var(--badge-slang-text); padding: 2px 7px; border-radius: 4px; font-weight: 700;">🟡 ${s.term}</mark></td>
              <td>${s.meaning}</td>
              <td style="color: var(--text-secondary); font-style: italic;">${s.delivery}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    slangView.innerHTML = `<div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">${t.emptySlang}</div>`;
  }

  // 4. Native Idioms
  const idiomsView = document.getElementById('view-idioms');
  if (idiomsList.length > 0) {
    idiomsView.innerHTML = `
      <table class="linguistic-table">
        <thead>
          <tr>
            <th>Native Phrase / Idiom</th>
            <th>Textbook Literal Equivalent</th>
            <th>Why Native Speakers Use It</th>
          </tr>
        </thead>
        <tbody>
          ${idiomsList.map(i => `
            <tr>
              <td><mark class="shadow-idiom" style="background-color: var(--badge-idiom-bg); color: var(--badge-idiom-text); padding: 2px 7px; border-radius: 4px; font-weight: 700;">🟣 ${i.phrase}</mark></td>
              <td>${i.equivalent}</td>
              <td>${i.usage}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    idiomsView.innerHTML = `<div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">${t.emptyIdioms}</div>`;
  }

  // 5. Connected Speech & Phonetics
  const redView = document.getElementById('view-reductions');
  if (redList.length > 0) {
    redView.innerHTML = `
      <table class="linguistic-table">
        <thead>
          <tr>
            <th>Written Form</th>
            <th>Spoken Sound / IPA</th>
            <th>Phonetic Phenomenon</th>
            <th>Mouth & Tongue Mechanics</th>
          </tr>
        </thead>
        <tbody>
          ${redList.map(r => `
            <tr>
              <td><code>${r.written}</code></td>
              <td><mark class="shadow-reduction" style="background-color: var(--badge-reduction-bg); color: var(--badge-reduction-text); padding: 2px 7px; border-radius: 4px; font-weight: 700;">🔵 ${r.spoken}</mark></td>
              <td>${r.phenomenon}</td>
              <td style="font-size: 0.85rem;">${r.mechanics}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    redView.innerHTML = `<div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">${t.emptyReductions}</div>`;
  }

  // 6. ASR Error Fixes Log
  const asrView = document.getElementById('view-asr');
  if (asrList.length > 0) {
    asrView.innerHTML = `
      <table class="linguistic-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>YouTube Caption (Wrong)</th>
            <th>Creator Spoken Word (Corrected)</th>
            <th>Contextual Reason</th>
          </tr>
        </thead>
        <tbody>
          ${asrList.map(a => `
            <tr>
              <td style="font-family: var(--font-mono); font-weight: 700;">${a.timestamp}</td>
              <td style="color: #EF4444; text-decoration: line-through;">${a.wrong}</td>
              <td><mark class="shadow-correction" style="background-color: var(--badge-correction-bg); color: var(--badge-correction-text); padding: 2px 7px; border-radius: 4px; font-weight: 700;">🔴 ${a.corrected}</mark></td>
              <td>${a.reason}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    asrView.innerHTML = `<div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); background: var(--bg-secondary); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">${t.emptyAsr}</div>`;
  }
}

// Render Vertically Stacked Sentence Driller Cards
function renderSentenceList(sentences) {
  const container = document.getElementById('subview-sentences-list');
  if (!container) return;
  const t = STUDIO_I18N[studioState.lang];

  if (!sentences || sentences.length === 0) {
    container.innerHTML = `<div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No parsed sentences available for this video.</div>`;
    return;
  }

  const activeDialect = studioState.translationDialect || 'ar-SA';
  const isRtl = activeDialect.startsWith('ar');
  const showTrans = studioState.translationEnabled;

  container.innerHTML = sentences.map((sent) => {
    const dur = typeof sent.durationSec === 'number' ? sent.durationSec.toFixed(2) : '2.00';
    const transText = (studioState.activeTranslations && studioState.activeTranslations[sent.index]) ||
                      (sent.translations && sent.translations[activeDialect]) ||
                      (studioState.item && studioState.item.translationsCache && studioState.item.translationsCache[activeDialect] && studioState.item.translationsCache[activeDialect][sent.index]) || '';
    const transHtml = transText ? `<bdi>${transText}</bdi>` : '<span class="translation-shimmer">...</span>';

    return `
      <div class="sentence-driller-card" id="sent-card-${sent.index}" onclick="playSentence(${sent.index})">
        <div class="sentence-card-meta">
          <div class="sent-meta-left">
            <span class="sent-num-pill">#${sent.index}</span>
            <span class="sent-time-badge">⏱️ ${sent.timeRange}</span>
            <span class="sent-duration-pill">${dur}s</span>
          </div>
          <div class="sent-meta-right">
            <button class="sent-play-btn" onclick="event.stopPropagation(); playSentence(${sent.index});" title="Play and drill this sentence">
              <span class="play-icon">▶</span>
              <span class="play-text">${t.playDrill}</span>
            </button>
          </div>
        </div>
        <div class="sentence-text-body">
          ${sent.highlightedHtml || sent.text}
        </div>
        <div class="sentence-translation-wrapper" id="sent-trans-wrap-${sent.index}" style="display: ${showTrans ? 'block' : 'none'};">
          <div class="sentence-translation-text" dir="${isRtl ? 'rtl' : 'ltr'}" id="sent-trans-text-${sent.index}">
            ${transHtml}
          </div>
        </div>
        <div class="sentence-active-indicator">
          <div class="equalizer-bars">
            <div class="equalizer-bar"></div>
            <div class="equalizer-bar"></div>
            <div class="equalizer-bar"></div>
          </div>
          <span>${t.nowPlaying}</span>
        </div>
      </div>
    `;
  }).join('');
}

// In-Memory Mode Switching (Zero Network Latency)
function switchTranscriptMode(mode) {
  studioState.transcriptMode = mode;
  const chunksBtn = document.getElementById('mode-btn-chunks');
  const sentBtn = document.getElementById('mode-btn-sentences');
  const chunksList = document.getElementById('subview-chunks-list');
  const sentList = document.getElementById('subview-sentences-list');
  const actionDeck = document.getElementById('driller-action-deck');
  const transDeck = document.getElementById('translation-control-deck');

  if (mode === 'chunks') {
    if (chunksBtn) chunksBtn.classList.add('active');
    if (sentBtn) sentBtn.classList.remove('active');
    if (chunksList) {
      chunksList.style.setProperty('display', 'flex', 'important');
      chunksList.style.flexDirection = 'column';
    }
    if (sentList) sentList.style.setProperty('display', 'none', 'important');
    if (actionDeck) actionDeck.style.setProperty('display', 'none', 'important');
    if (transDeck) transDeck.style.setProperty('display', 'none', 'important');
  } else {
    if (sentBtn) sentBtn.classList.add('active');
    if (chunksBtn) chunksBtn.classList.remove('active');
    if (chunksList) chunksList.style.setProperty('display', 'none', 'important');
    if (sentList) {
      sentList.style.setProperty('display', 'flex', 'important');
      sentList.style.flexDirection = 'column';
    }
    if (actionDeck) actionDeck.style.setProperty('display', 'flex', 'important');
    if (transDeck) transDeck.style.setProperty('display', 'flex', 'important');
  }
}
window.switchTranscriptMode = switchTranscriptMode;

// Interactive Sentence Drill Player with Tuned Acoustic Tolerance Buffer (-0.05s lead-in, +0.02s tail)
function playSentence(index) {
  if (!studioState.item || !studioState.item.sentences) return;
  const sent = studioState.item.sentences.find(s => s.index === index);
  if (!sent) return;

  if (studioState.transcriptMode !== 'sentences') {
    switchTranscriptMode('sentences');
  }

  const leadIn = Math.max(0, Math.round((sent.startSec - 0.05) * 100) / 100);
  studioState.activeSentence = sent;
  studioState.seekTargetStart = leadIn;
  studioState.seekTargetEnd = sent.endSec;
  studioState.isSeeking = true;
  studioState.hasPlayedFromStart = false;
  studioState.seekRetried = false;
  studioState.lastSeekTime = Date.now();

  // Visual Card Glow & Auto-Scroll
  document.querySelectorAll('.sentence-driller-card').forEach(c => c.classList.remove('active-drilling'));
  const activeCard = document.getElementById(`sent-card-${index}`);
  if (activeCard) {
    activeCard.classList.add('active-drilling');
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Millisecond-accurate seek & play with acoustic tolerance buffer
  if (studioState.ytPlayer && studioState.ytPlayer.seekTo) {
    studioState.ytPlayer.seekTo(leadIn, true);
    applySpeedToPlayer(studioState.speed);
    studioState.ytPlayer.playVideo();
    startPlaybackTicker();
  } else {
    seekStudioVideo(leadIn);
  }
}
window.playSentence = playSentence;

// High-Frequency Sentence Playback Monitor (every 30ms)
function startPlaybackTicker() {
  stopPlaybackTicker();
  studioState.playbackTicker = setInterval(checkSentenceDrillProgress, 30);
}

function stopPlaybackTicker() {
  if (studioState.playbackTicker) {
    clearInterval(studioState.playbackTicker);
    studioState.playbackTicker = null;
  }
}

function checkSentenceDrillProgress() {
  if (studioState.transcriptMode !== 'sentences' || !studioState.activeSentence) return;
  if (!studioState.ytPlayer || !studioState.ytPlayer.getCurrentTime) return;

  const current = studioState.ytPlayer.getCurrentTime();
  const active = studioState.activeSentence;
  const targetStart = studioState.seekTargetStart ?? active.startSec;

  // 1. Asynchronous seek gate: ensure video has genuinely arrived near targetStart before evaluating boundaries
  if (studioState.isSeeking || !studioState.hasPlayedFromStart) {
    const isAtStart = Math.abs(current - targetStart) <= 0.35;
    const isPlayingFirstHalf = current >= targetStart && current < (targetStart + Math.max(0.6, (active.endSec - targetStart) * 0.45));

    if (isAtStart || isPlayingFirstHalf) {
      studioState.isSeeking = false;
      studioState.hasPlayedFromStart = true;
    } else {
      // YouTube player has not arrived at targetStart yet. Never evaluate boundary completion!
      if (Date.now() - (studioState.lastSeekTime || 0) > 1500 && !studioState.seekRetried) {
        studioState.seekRetried = true;
        studioState.ytPlayer.seekTo(targetStart, true);
        studioState.ytPlayer.playVideo();
      }
      return;
    }
  }

  // Cooldown right after seek lock release (250ms) to prevent boundary collision
  if (Date.now() - (studioState.lastSeekTime || 0) < 250) return;

  // 2. Safeguard: if hasPlayedFromStart is not true, never evaluate completion
  if (!studioState.hasPlayedFromStart) return;

  // 3. Audio boundary detection:
  // Crisp +0.02s tail tolerance: gives full natural decay without ANY bleed into the next sentence
  const stopThreshold = active.endSec + 0.02;
  if (current < stopThreshold) {
    return;
  }

  // 4. Sentence completion point reached: execute selected completion action
  if (studioState.endAction === 'loop') {
    // 🔁 Auto-Repeat Loop: rewind and replay THIS exact sentence with seek lock and lead-in tolerance
    const leadIn = Math.max(0, Math.round((active.startSec - 0.05) * 100) / 100);
    studioState.isSeeking = true;
    studioState.hasPlayedFromStart = false;
    studioState.seekRetried = false;
    studioState.lastSeekTime = Date.now();
    studioState.seekTargetStart = leadIn;
    studioState.ytPlayer.seekTo(leadIn, true);
    applySpeedToPlayer(studioState.speed);
    studioState.ytPlayer.playVideo();
  } else if (studioState.endAction === 'pause') {
    // ⏸️ Stop & Shadow: pause cleanly at sentence end!
    stopPlaybackTicker();
    studioState.ytPlayer.pauseVideo();
    studioState.isSeeking = false;
    studioState.hasPlayedFromStart = false;
  } else if (studioState.endAction === 'continuous') {
    // ⏩ Continuous Play: advance to next sentence in sequential order
    const nextIndex = active.index + 1;
    const nextSent = (studioState.item.sentences || []).find(s => s.index === nextIndex);
    if (nextSent) {
      playSentence(nextIndex);
    } else {
      studioState.ytPlayer.pauseVideo();
      stopPlaybackTicker();
    }
  }
}
window.checkSentenceDrillProgress = checkSentenceDrillProgress;

// Playback Speed Engine (Single Slider: 0.25x to 2.0x, Step: 0.25x)
function setStudioSpeed(val) {
  const rawSpeed = Math.max(0.25, Math.min(2.0, parseFloat(val) || 1.0));
  const steppedSpeed = Math.round(rawSpeed * 4) / 4;
  studioState.speed = steppedSpeed;

  const badge = document.getElementById('current-speed-badge');
  if (badge) badge.textContent = `${steppedSpeed.toFixed(2)}x`;

  const slider = document.getElementById('speed-slider');
  if (slider) {
    if (Math.abs(parseFloat(slider.value) - steppedSpeed) > 0.01) {
      slider.value = steppedSpeed.toFixed(2);
    }
    const pct = ((steppedSpeed - 0.25) / (2.0 - 0.25)) * 100;
    slider.style.background = `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--border-color) ${pct}%, var(--border-color) 100%)`;
  }

  // Update Ticks Active State
  document.querySelectorAll('#speed-ticks-row .speed-tick').forEach(tick => {
    const tSpeed = parseFloat(tick.dataset.speed);
    tick.classList.toggle('active', Math.abs(tSpeed - steppedSpeed) < 0.02);
  });

  applySpeedToPlayer(steppedSpeed);
}
window.setStudioSpeed = setStudioSpeed;

function applySpeedToPlayer(speed) {
  if (studioState.ytPlayer && studioState.ytPlayer.setPlaybackRate) {
    try {
      studioState.ytPlayer.setPlaybackRate(speed);
    } catch (e) {
      console.warn('Playback rate adjustment notice:', e);
    }
  }
}

function seekStudioVideo(seconds) {
  if (studioState.ytPlayer && studioState.ytPlayer.seekTo) {
    studioState.ytPlayer.seekTo(seconds, true);
    applySpeedToPlayer(studioState.speed);
    studioState.ytPlayer.playVideo();
  } else {
    const iframe = document.getElementById('studio-video-frame');
    const videoId = studioState.item && studioState.item.videoId;
    if (iframe && videoId) {
      if (iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }), '*');
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
        } catch (e) {}
      }
      if (!iframe.src || !iframe.src.includes(videoId)) {
        iframe.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(seconds)}&autoplay=1&enablejsapi=1&rel=0`;
      }
      iframe.style.display = 'block';
    }
  }
}
window.seekStudioVideo = seekStudioVideo;

function parseStudioSeconds(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  if (typeof val === 'string') {
    const parts = val.trim().split(':');
    if (parts.length === 3) {
      return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
    }
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function showStudioToast(msg, type = 'info') {
  let toast = document.getElementById('studio-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'studio-toast';
    toast.className = 'studio-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `studio-toast visible toast-${type}`;
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3500);
}

function formatStudioDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function goToDashboard() {
  window.location.href = 'index.html';
}
window.goToDashboard = goToDashboard;

function setupStudioEvents() {
  // Theme Toggle
  document.getElementById('studio-theme-btn').addEventListener('click', () => {
    setStudioTheme(studioState.theme === 'dark' ? 'light' : 'dark');
  });

  // Lang Toggle
  document.getElementById('studio-lang-btn').addEventListener('click', () => {
    setStudioLanguage(studioState.lang === 'en' ? 'ar' : 'en');
  });

  // Tab Navigation
  document.querySelectorAll('.canvas-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.canvas-tab-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      const tab = target.dataset.tab;
      studioState.activeTab = tab;

      document.querySelectorAll('.canvas-view-panel').forEach(p => p.style.display = 'none');
      const activePanel = document.getElementById(`view-${tab}`);
      if (activePanel) activePanel.style.display = 'block';
    });
  });

  // Speed Ticks Click Handlers
  document.querySelectorAll('#speed-ticks-row .speed-tick').forEach(tick => {
    tick.addEventListener('click', (e) => {
      const speed = parseFloat(e.currentTarget.dataset.speed);
      setStudioSpeed(speed);
    });
  });

  // Single Speed Slider (0.25x step, 0.25x to 2.0x)
  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      setStudioSpeed(speed);
    });
  }
  setStudioSpeed(1.0);

  // Sentence Driller Completion Action Selector
  document.querySelectorAll('.action-pill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.action-pill-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      studioState.endAction = target.dataset.action;
    });
  });

  // Auto-Save Study Notes
  const notesTextarea = document.getElementById('study-notes-textarea');
  if (notesTextarea) {
    notesTextarea.addEventListener('input', (e) => {
      if (studioState.item) {
        localStorage.setItem(`notes_${studioState.item.id}`, e.target.value);
      }
    });
  }

  // Export Obsidian Note (.md)
  document.getElementById('download-obsidian-btn').addEventListener('click', () => {
    if (!studioState.item) return;
    const content = studioState.item.noteMarkdown || `# ${studioState.item.title}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${studioState.item.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_Shadowing.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStudioToast(STUDIO_I18N[studioState.lang].copiedAlert, 'success');
  });

  // Mark Drill Completed Button
  const completeBtn = document.getElementById('complete-drill-btn');
  if (completeBtn) {
    completeBtn.addEventListener('click', async () => {
      if (!studioState.item) return;
      const t = STUDIO_I18N[studioState.lang];
      try {
        const res = await fetch(`${API_BASE}/history/${studioState.item.id}/drill`, { method: 'POST' });
        if (res.ok) {
          const updated = await res.json();
          studioState.item.completedDrills = updated.completedDrills;
          const drillsBadge = document.getElementById('studio-drills-badge');
          if (drillsBadge) drillsBadge.textContent = `${updated.completedDrills} ${t.drillsCompleted}`;
          showStudioToast(t.drillCompletedToast, 'success');
        }
      } catch (e) {
        showStudioToast('Could not record drill completion', 'error');
      }
    });
  }

  // Discard Take Button
  const discardBtn = document.getElementById('discard-take-btn');
  if (discardBtn) {
    discardBtn.addEventListener('click', () => {
      const previewBox = document.getElementById('studio-audio-preview');
      const player = document.getElementById('studio-audio-player');
      if (player) {
        player.pause();
        player.src = '';
      }
      if (previewBox) previewBox.style.display = 'none';
      studioState.audioChunks = [];
      const statusIndicator = document.getElementById('rec-status-indicator');
      const t = STUDIO_I18N[studioState.lang];
      if (statusIndicator) statusIndicator.textContent = t.recStatusReady;
    });
  }

  // Microphone Audio Shadowing Recorder
  const micBtn = document.getElementById('studio-mic-btn');
  const previewBox = document.getElementById('studio-audio-preview');
  const player = document.getElementById('studio-audio-player');
  const statusIndicator = document.getElementById('rec-status-indicator');

  micBtn.addEventListener('click', async () => {
    const t = STUDIO_I18N[studioState.lang];
    if (!studioState.isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        studioState.mediaStream = stream;
        studioState.mediaRecorder = new MediaRecorder(stream);
        studioState.audioChunks = [];

        studioState.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) studioState.audioChunks.push(e.data);
        };

        studioState.mediaRecorder.onstop = () => {
          if (studioState.mediaStream) {
            studioState.mediaStream.getTracks().forEach(track => track.stop());
            studioState.mediaStream = null;
          }
          const blob = new Blob(studioState.audioChunks, { type: 'audio/webm' });
          player.src = URL.createObjectURL(blob);
          previewBox.style.display = 'flex';
          studioState.isRecording = false;
          micBtn.classList.remove('recording');
          document.getElementById('record-btn-text').textContent = t.startRecord;
          if (statusIndicator) statusIndicator.textContent = t.recStatusSaved;
        };

        studioState.mediaRecorder.start();
        studioState.isRecording = true;
        micBtn.classList.add('recording');
        document.getElementById('record-btn-text').textContent = t.stopRecord;
        if (statusIndicator) statusIndicator.textContent = t.recStatusRecording;
      } catch (err) {
        showStudioToast('Microphone access is needed for recording: ' + err.message, 'error');
      }
    } else {
      if (studioState.mediaRecorder && studioState.mediaRecorder.state !== 'inactive') {
        studioState.mediaRecorder.stop();
      }
    }
  });

  // Translation Master Switch & Selectors
  initTranslationControls();
}

// =========================================================================
// Real-World Vernacular Dialect Translation Controller
// =========================================================================

function initTranslationControls() {
  const toggle = document.getElementById('translation-toggle-checkbox');
  const selectorsGroup = document.getElementById('translation-selectors-group');
  const langSelect = document.getElementById('trans-lang-select');
  const dialectSelect = document.getElementById('trans-dialect-select');

  // Load saved state or defaults: default Arabic is ar-EG, default English is en-US
  const savedEnabled = localStorage.getItem('translation_enabled') === 'true';
  const savedLang = localStorage.getItem('translation_lang') || 'ar';
  const savedDialect = localStorage.getItem('translation_dialect') || (savedLang === 'ar' ? 'ar-EG' : 'en-US');

  studioState.translationEnabled = savedEnabled;
  studioState.translationLang = savedLang;
  studioState.translationDialect = savedDialect;

  if (toggle) {
    toggle.checked = savedEnabled;
    toggle.onchange = (e) => {
      const enabled = e.target.checked;
      studioState.translationEnabled = enabled;
      localStorage.setItem('translation_enabled', enabled ? 'true' : 'false');

      if (selectorsGroup) {
        selectorsGroup.style.display = enabled ? 'flex' : 'none';
      }

      // Show/hide all translation wrappers on cards
      document.querySelectorAll('.sentence-translation-wrapper').forEach(w => {
        w.style.display = enabled ? 'block' : 'none';
      });

      if (enabled) {
        fetchOrApplyTranslations(studioState.translationDialect);
      }
    };
  }

  if (selectorsGroup) {
    selectorsGroup.style.display = savedEnabled ? 'flex' : 'none';
  }

  if (langSelect) {
    langSelect.value = savedLang;
    langSelect.onchange = (e) => {
      const newLang = e.target.value;
      studioState.translationLang = newLang;
      localStorage.setItem('translation_lang', newLang);

      // Default for Arabic is ar-EG (Egyptian); default for English is en-US (American)
      const defaultDialect = newLang === 'ar' ? 'ar-EG' : 'en-US';
      studioState.translationDialect = defaultDialect;
      localStorage.setItem('translation_dialect', defaultDialect);

      populateDialectDropdown(newLang, defaultDialect);
      if (studioState.translationEnabled) {
        fetchOrApplyTranslations(defaultDialect);
      }
    };
  }

  if (dialectSelect) {
    populateDialectDropdown(savedLang, savedDialect);
    dialectSelect.onchange = (e) => {
      const newDialect = e.target.value;
      studioState.translationDialect = newDialect;
      localStorage.setItem('translation_dialect', newDialect);

      if (studioState.translationEnabled) {
        fetchOrApplyTranslations(newDialect);
      }
    };
  }

  if (savedEnabled) {
    fetchOrApplyTranslations(savedDialect);
  }
}

function populateDialectDropdown(lang, activeDialect) {
  const dialectSelect = document.getElementById('trans-dialect-select');
  if (!dialectSelect) return;

  const dialects = VERNACULAR_DIALECTS[lang] || VERNACULAR_DIALECTS['ar'];
  dialectSelect.innerHTML = dialects.map(d => {
    const isAr = studioState.lang === 'ar';
    const label = isAr ? `${d.flag} ${d.nameAr}` : `${d.flag} ${d.nameEn}`;
    const selected = d.code === activeDialect ? 'selected' : '';
    return `<option value="${d.code}" ${selected}>${label}</option>`;
  }).join('');
}

async function fetchOrApplyTranslations(dialect, forceRefresh = false) {
  if (!studioState.item) return;

  studioState.translationReqId = (studioState.translationReqId || 0) + 1;
  const thisReqId = studioState.translationReqId;

  const statusText = document.getElementById('translation-status-text');
  const t = STUDIO_I18N[studioState.lang];

  const langKey = dialect.startsWith('ar') ? 'ar' : 'en';
  const dialectObj = (VERNACULAR_DIALECTS[langKey] || []).find(d => d.code === dialect);
  const dialectName = dialectObj ? (studioState.lang === 'ar' ? dialectObj.nameAr.split('(')[0].trim() : dialectObj.nameEn) : dialect;
  const flag = dialectObj ? dialectObj.flag : '🌐';

  // 1. Instant cache hit from session data
  const itemCache = studioState.item.translationsCache && studioState.item.translationsCache[dialect];
  if (itemCache && !forceRefresh) {
    studioState.activeTranslations = itemCache;
    applyTranslationsToDOM(itemCache, dialect);
    if (statusText) {
      statusText.innerHTML = `${t.transStatusReady} (${dialectName} ${flag})`;
    }
    return;
  }

  // 2. Fetch from AI Agent backend
  if (statusText) {
    statusText.innerHTML = `${t.transStatusLoading} (${flag})`;
  }

  // Show unobtrusive shimmers in cards while loading
  document.querySelectorAll('.sentence-translation-text').forEach(elem => {
    elem.innerHTML = `<span class="translation-shimmer">...</span>`;
  });

  try {
    const res = await fetch(`${API_BASE}/tracks/shadowing/translate-sentences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        historyId: studioState.item.id,
        language: langKey,
        dialect: dialect
      })
    });

    const data = await res.json();

    // Guard against race conditions from rapid dialect switching
    if (thisReqId !== studioState.translationReqId) {
      return;
    }

    if (data.success && data.translations) {
      if (!studioState.item.translationsCache) {
        studioState.item.translationsCache = {};
      }
      studioState.item.translationsCache[dialect] = data.translations;
      studioState.activeTranslations = data.translations;
      applyTranslationsToDOM(data.translations, dialect);

      if (statusText) {
        statusText.innerHTML = `${t.transStatusReady} (${dialectName} ${flag})`;
      }
    }
  } catch (err) {
    if (thisReqId !== studioState.translationReqId) return;
    console.warn('Failed to fetch vernacular dialect translations:', err);
    if (statusText) statusText.textContent = 'Translation unavailable';
  }
}

function applyTranslationsToDOM(translations, dialect) {
  const isRtl = dialect.startsWith('ar');
  (studioState.item.sentences || []).forEach(sent => {
    const textElem = document.getElementById(`sent-trans-text-${sent.index}`);
    if (textElem) {
      textElem.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
      const text = translations[sent.index] || translations[`sent-${sent.index}`] || translations[String(sent.index)] || '';
      textElem.innerHTML = text.includes('<bdi') ? text : `<bdi>${text}</bdi>`;
    }
  });
}
