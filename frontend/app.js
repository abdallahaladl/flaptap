/**
 * Flaptap AI - Client Application Logic (Full Production)
 * Multi-Agent Integration | Full Transcript Chunks | Multi-Track Sparring | Audio Recording
 */

const API_BASE = '/api';

const I18N = {
  en: {
    brand: 'Flaptap AI',
    tagline: 'American Accent & Cadence Studio',
    themeToggle: 'Toggle Theme',
    langToggle: 'العربية',
    agentActive: 'Active Agent',
    tracks: {
      shadowing: '🎙️ YouTube Shadowing',
      streetTalk: '🔥 Street Talk & Slang',
      phonetics: '⚡ Flap-T & Phonetic Lab',
      history: '📜 Practice History',
    },
    hero: {
      shadowing: {
        title: 'Shadow Authentic American Cadence',
        subtitle: 'Paste any YouTube video link. The AI agent extracts verbatim speech, fixes transcription errors, and highlights slang, idioms, and connected speech.',
        inputPlaceholder: 'Enter YouTube video URL (e.g. https://www.youtube.com/watch?v=...)',
        actionBtn: 'Process Video with Agent',
        presetsLabel: 'Recommended Practice:',
      },
      street_talk: {
        title: '🔥 Street Talk & Slang Sparring',
        subtitle: 'Master rapid conversational English, authentic American urban slang, and real-world natural cadence.',
        inputPlaceholder: 'Type a conversational scenario (e.g. Ordering at a trendy coffee shop)...',
        actionBtn: 'Generate Street Talk Scenario',
        presetsLabel: 'Quick Scenarios:',
      },
      phonetics: {
        title: '⚡ Flap-T & Phonetic Mechanics Lab',
        subtitle: 'Train muscle memory for the American alveolar tap [ɾ], glottal stops [ʔ], and connected speech liaison.',
        inputPlaceholder: 'Choose or type a phonetic drill focus (e.g. Intervocalic Flap-T)...',
        actionBtn: 'Launch Phonetic Workout',
        presetsLabel: 'Focused Drills:',
      },
      all: {
        title: '📜 Complete Accent Training History',
        subtitle: 'Review and replay your past shadowing sessions, street dialogues, and phonetic workouts.',
        inputPlaceholder: 'Filter past sessions by keyword or creator...',
        actionBtn: 'Search Sessions',
        presetsLabel: 'Filter by Track:',
      }
    },
    history: {
      title: 'Your Practice History & Shadowing Sessions',
      empty: 'No practice sessions yet in this track.',
      emptySub: 'Start by entering any YouTube video link above or choosing a Street Talk or Phonetic drill!',
      drillsCompleted: 'drills completed',
      openDrill: 'Open Dedicated Studio',
      delete: 'Delete',
      resetBtn: 'Clear History',
      confirmReset: 'Are you sure you want to clear your practice history?',
      historyCleared: 'Practice history cleared.',
      itemDeleted: 'Session deleted successfully.',
    },
    legend: {
      slang: '🟡 Slang & Street Talk',
      idiom: '🟣 Native Idioms',
      reduction: '🔵 Connected Speech',
      filler: '🟢 Rhythm & Fillers',
      stress: '🟠 Pitch & Stress',
      correction: '🔴 ASR Error Fixes',
    },
    modal: {
      close: 'Close',
      recordYourself: 'Record your voice to compare:',
      startRecord: 'Start Recording Take',
      stopRecord: 'Stop & Review Recording',
      seekBtn: '▶ Play at',
    }
  },
  ar: {
    brand: 'فلاب تاب AI',
    tagline: 'منصة التدريب على اللكنة الأمريكية ولغة الشارع',
    themeToggle: 'تغيير المظهر',
    langToggle: 'English',
    agentActive: 'الإيجنت الفعال',
    tracks: {
      shadowing: '🎙️ محاكاة يوتيوب',
      streetTalk: '🔥 لغة الشارع والسلاينج',
      phonetics: '⚡ مختبر ميكانيكا النطق',
      history: '📜 سجل التدريبات',
    },
    hero: {
      shadowing: {
        title: 'تدرّب على النطق واللكنة الأمريكية الحقيقية',
        subtitle: 'ضع أي رابط فيديو من يوتيوب. يقوم الـ AI Agent تلقائيًا باستخراج النص الدقيق، تصحيح الأخطاء، وتلوين التعبيرات ولغة الشارع.',
        inputPlaceholder: 'أدخل رابط فيديو يوتيوب (مثال: https://www.youtube.com/watch?v=...)',
        actionBtn: 'معالجة الفيديو عبر الإيجنت',
        presetsLabel: 'خيارات سريعة:',
      },
      street_talk: {
        title: '🔥 تدريب لغة الشارع والسلاينج الأمريكي',
        subtitle: 'تدرّب على الحوارات اليومية السريعة، مصطلحات الشارع الحديثة، والإيقاع الأمريكي العفوي.',
        inputPlaceholder: 'اكتب سيناريو الحوار (مثال: طلب قهوة في نيويورك)...',
        actionBtn: 'إنشاء حوار لغة الشارع',
        presetsLabel: 'سيناريوهات جاهزة:',
      },
      phonetics: {
        title: '⚡ مختبر الفلاب-تي وميكانيكا مخارج الحروف',
        subtitle: 'درّب عضلات اللسان على نقرة الفلاب-تي الأمريكية [ɾ]، والهمزة الحنجرية [ʔ]، ودمج الكلمات.',
        inputPlaceholder: 'اختر محور التدريب الصوتي...',
        actionBtn: 'بدء تمرين ميكانيكا النطق',
        presetsLabel: 'تمارين مركزة:',
      },
      all: {
        title: '📜 سجل التدريبات والمحاكاة الكامل',
        subtitle: 'راجع وأعد تشغيل جلسات المحاكاة السابقة، حوارات لغة الشارع، وتمارين الصوتيات.',
        inputPlaceholder: 'ابحث في الجلسات السابقة...',
        actionBtn: 'بحث في السجل',
        presetsLabel: 'تصفية حسب المسار:',
      }
    },
    history: {
      title: 'سجل تدريباتك وجلسات المحاكاة',
      empty: 'لا توجد تدريبات في هذا المسار بعد.',
      emptySub: 'ابدأ بوضع رابط فيديو يوتيوب بالأعلى أو اختيار تمرين للغة الشارع أو الصوتيات!',
      drillsCompleted: 'مرات تدريب',
      openDrill: 'فتح استوديو المحاكاة',
      delete: 'حذف',
      resetBtn: 'مسح السجل',
      confirmReset: 'هل تريد مسح كل سجل تدريباتك والبدء من جديد؟',
      historyCleared: 'تم مسح السجل بنجاح.',
      itemDeleted: 'تم حذف الجلسة بنجاح.',
    },
    legend: {
      slang: '🟡 لغة الشارع والسلاينج',
      idiom: '🟣 تعبيرات أصلية ومصطلحات',
      reduction: '🔵 دمج الحروف واختصارات الكلام',
      filler: '🟢 كلمات الربط والإيقاع',
      stress: '🟠 نبرة الصوت والتشديد',
      correction: '🔴 أخطاء تفريغ مصححة',
    },
    modal: {
      close: 'إغلاق',
      recordYourself: 'سجّل صوتك وقارنه مع صانع المحتوى:',
      startRecord: 'بدء تسجيل صوتك',
      stopRecord: 'إيقاف ومراجعة التسجيل',
      seekBtn: '▶ تشغيل عند',
    }
  }
};

const state = {
  lang: 'ar',
  theme: 'dark',
  activeAgent: 'antigravity',
  activeTrack: 'shadowing',
  history: [],
  selectedItem: null,
  activeSubtab: 'transcript',
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initI18n();
  loadAgents();
  loadHistory(state.activeTrack);
  setupEventListeners();
});

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  setTheme(saved);
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initI18n() {
  const savedLang = localStorage.getItem('lang') || 'ar';
  setLanguage(savedLang);
}

function setLanguage(lang) {
  state.lang = lang;
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  localStorage.setItem('lang', lang);

  const t = I18N[lang];
  const brandTitle = document.getElementById('brand-title');
  if (brandTitle) brandTitle.textContent = t.brand;
  const brandSubtitle = document.getElementById('brand-subtitle');
  if (brandSubtitle) brandSubtitle.textContent = t.tagline;
  const langToggleBtn = document.getElementById('lang-toggle-btn');
  if (langToggleBtn) langToggleBtn.textContent = t.langToggle;
  const historySectionTitle = document.getElementById('history-section-title');
  if (historySectionTitle) historySectionTitle.textContent = t.history.title;
  const resetText = document.getElementById('reset-history-text');
  if (resetText) resetText.textContent = t.history.resetBtn;

  const tabShadowing = document.getElementById('tab-shadowing');
  if (tabShadowing) tabShadowing.innerHTML = t.tracks.shadowing;
  const tabStreetTalk = document.getElementById('tab-street-talk');
  if (tabStreetTalk) tabStreetTalk.innerHTML = t.tracks.streetTalk;
  const tabPhonetics = document.getElementById('tab-phonetics');
  if (tabPhonetics) tabPhonetics.innerHTML = t.tracks.phonetics;
  const tabHistory = document.getElementById('tab-history');
  if (tabHistory) tabHistory.innerHTML = t.tracks.history;

  updateHeroForTrack(state.activeTrack);
  renderHistory();
}

function updateHeroForTrack(track) {
  const t = I18N[state.lang];
  const heroInfo = t.hero[track] || t.hero.shadowing;

  const heroTitle = document.getElementById('hero-title');
  if (heroTitle) heroTitle.textContent = heroInfo.title;
  const heroSubtitle = document.getElementById('hero-subtitle');
  if (heroSubtitle) heroSubtitle.textContent = heroInfo.subtitle;
  const urlInput = document.getElementById('url-input');
  if (urlInput) urlInput.placeholder = heroInfo.inputPlaceholder;
  const processBtnText = document.getElementById('process-btn-text');
  if (processBtnText) processBtnText.textContent = heroInfo.actionBtn;
  const presetsLabel = document.getElementById('presets-label');
  if (presetsLabel) presetsLabel.textContent = heroInfo.presetsLabel;

  const presetsContainer = document.querySelector('.presets-container');
  if (!presetsContainer) return;

  // Render Track-Specific Quick Action Chips
  const isAr = state.lang === 'ar';
  if (track === 'street_talk') {
    presetsContainer.style.display = 'flex';
    presetsContainer.innerHTML = `
      <span class="presets-label" id="presets-label">${heroInfo.presetsLabel}</span>
      <button class="preset-chip" onclick="launchStreetTalkScenario('Coffee Shop & NYC Urban Banter')">${isAr ? '☕ طلب قهوة وحوار في نيويورك' : '☕ Coffee Shop Order & Banter'}</button>
      <button class="preset-chip" onclick="launchStreetTalkScenario('NYC Taxi & Fast Street Directions')">${isAr ? '🚕 تاكسي نيويورك وإشارات الشارع' : '🚕 NYC Taxi & Street Directions'}</button>
      <button class="preset-chip" onclick="launchStreetTalkScenario('Silicon Valley Tech Standup Sparring')">${isAr ? '💻 اجتماع ستاند-أب وشركات تقنية' : '💻 Tech Standup Banter'}</button>
      <button class="preset-chip" onclick="launchStreetTalkScenario('Casual Weekend Lunch with Friends')">${isAr ? '🍔 غداء عطلة نهاية الأسبوع مع الأصدقاء' : '🍔 Weekend Hanging Out'}</button>
    `;
  } else if (track === 'phonetics') {
    presetsContainer.style.display = 'flex';
    presetsContainer.innerHTML = `
      <span class="presets-label" id="presets-label">${heroInfo.presetsLabel}</span>
      <button class="preset-chip" onclick="launchPhoneticsDrill('Flap-T Masterclass (better, water, bottle)')">${isAr ? '🎯 نقرة الفلاب-تي Alveolar Tap [ɾ]' : '🎯 Flap-T Alveolar Tap [ɾ]'}</button>
      <button class="preset-chip" onclick="launchPhoneticsDrill('Glottal Stops in Spoken English (button, mountain)')">${isAr ? '🛑 الهمزة الحنجرية Glottal Stop [ʔ]' : '🛑 Glottal Stop [ʔ]'}</button>
      <button class="preset-chip" onclick="launchPhoneticsDrill('Double Flap Liaison Connections (get out of here)')">${isAr ? '🌊 دمج الكلمات المتتابعة Word Liaison' : '🌊 Word Liaison Connections'}</button>
      <button class="preset-chip" onclick="launchPhoneticsDrill('Schwa Reduction & Neutral Vowels')">${isAr ? '🗣️ الصوت المحايد الشوا Neutral Schwa /ə/' : '🗣️ Neutral Schwa /ə/'}</button>
    `;
  } else if (track === 'all') {
    presetsContainer.style.display = 'flex';
    presetsContainer.innerHTML = `
      <span class="presets-label" id="presets-label">${heroInfo.presetsLabel}</span>
      <button class="preset-chip" onclick="filterHistoryByTrack('all')">${isAr ? 'عرض الكل' : 'Show All'}</button>
      <button class="preset-chip" onclick="filterHistoryByTrack('shadowing')">${isAr ? '🎙️ محاكاة يوتيوب' : '🎙️ YouTube Shadowing'}</button>
      <button class="preset-chip" onclick="filterHistoryByTrack('street_talk')">${isAr ? '🔥 لغة الشارع' : '🔥 Street Talk'}</button>
      <button class="preset-chip" onclick="filterHistoryByTrack('phonetics')">${isAr ? '⚡ مختبر النطق' : '⚡ Phonetics Lab'}</button>
    `;
  } else {
    // Default: YouTube Shadowing (curated practice presets)
    presetsContainer.style.display = 'flex';
    presetsContainer.innerHTML = `
      <span class="presets-label" id="presets-label">${heroInfo.presetsLabel}</span>
      <button class="preset-chip" onclick="applyShadowingPreset('https://www.youtube.com/watch?v=0CmtDk-joT4')">${isAr ? '⏱️ قاعدة الدقيقتين (جيمس كلير)' : '⏱️ 2-Minute Rule (James Clear)'}</button>
      <button class="preset-chip" onclick="applyShadowingPreset('https://www.youtube.com/watch?v=kqtD5dpn9C8')">${isAr ? '🐍 بايثون للمبتدئين (موش)' : '🐍 Python in 1 Hour (Mosh)'}</button>
      <button class="preset-chip" onclick="applyShadowingPreset('https://www.youtube.com/watch?v=UF8uR6Z6KLc')">${isAr ? '🎓 خطاب ستانفورد (ستيف جوبز)' : '🎓 Stanford Speech (Steve Jobs)'}</button>
    `;
  }
}

async function loadAgents() {
  try {
    const res = await fetch(`${API_BASE}/agents`);
    const agents = await res.json();
    const select = document.getElementById('agent-select');
    if (select && agents.length > 0) {
      select.innerHTML = '';
      agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.type;
        opt.textContent = `${a.name}`;
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Could not connect to backend agents endpoint, using defaults');
  }
}

async function loadHistory(track) {
  try {
    const url = track && track !== 'all' ? `${API_BASE}/history?track=${track}` : `${API_BASE}/history`;
    const res = await fetch(url);
    state.history = await res.json();
    renderHistory();
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

function showAppToast(msg, type = 'info') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `app-toast visible toast-${type}`;
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3500);
}

function renderHistory() {
  const container = document.getElementById('history-container');
  const t = I18N[state.lang];
  if (!container) return;

  const resetBtn = document.getElementById('reset-history-btn');

  if (state.history.length === 0) {
    if (resetBtn) resetBtn.style.display = 'none';
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3.5rem 1.5rem; background: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: var(--radius-lg);">
        <div style="font-size: 2.2rem; margin-bottom: 0.75rem;">🎙️</div>
        <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">${t.history.empty}</div>
        <div style="font-size: 0.9rem; color: var(--text-muted);">${t.history.emptySub}</div>
      </div>
    `;
    return;
  }

  if (resetBtn) resetBtn.style.display = 'flex';

  container.innerHTML = state.history.map(item => `
    <div class="history-card" data-id="${item.id}" onclick="navigateToStudio('${item.id}')">
      <div class="card-media">
        <img class="card-img" src="${item.thumbnailUrl}" alt="${item.title}" onerror="this.src='https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=600&auto=format&fit=crop&q=80'" />
        <div class="card-badge">
          <span>${item.categoryIcon}</span>
          <span>${item.trackTitle}</span>
        </div>
        <div class="card-duration">${formatDuration(item.durationSeconds)} • ${item.pacingWpm} WPM</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${item.title}</h3>
        <div class="card-creator">${item.creator} • <span style="color: var(--primary); font-weight: 600;">${item.accentDialect}</span></div>
        
        <div class="card-stats">
          <span class="metric-pill pill-slang">🟡 ${item.stats.slangCount} Slang</span>
          <span class="metric-pill pill-idiom">🟣 ${item.stats.idiomsCount} Idioms</span>
          <span class="metric-pill pill-reduction">🔵 ${item.stats.reductionsCount} Reductions</span>
          <span class="metric-pill pill-correction">🔴 ${item.stats.correctionsCount} Fixes</span>
        </div>

        <div class="card-footer">
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">
            ${item.completedDrills} ${t.history.drillsCompleted}
          </span>
          <div class="card-footer-actions">
            <button class="card-delete-btn" onclick="event.stopPropagation(); deleteHistorySession('${item.id}')" title="Delete session">🗑️</button>
            <button class="btn-sm" onclick="event.stopPropagation(); navigateToStudio('${item.id}')">${t.history.openDrill}</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function navigateToStudio(id) {
  window.location.href = `studio.html?id=${encodeURIComponent(id)}`;
}
window.navigateToStudio = navigateToStudio;

function applyShadowingPreset(url) {
  const urlInput = document.getElementById('url-input');
  if (urlInput) {
    urlInput.value = url;
    processVideo(url);
  }
}
window.applyShadowingPreset = applyShadowingPreset;

async function launchStreetTalkScenario(scenario) {
  const agentType = document.getElementById('agent-select')?.value || state.activeAgent || 'antigravity';
  showAppToast(state.lang === 'ar' ? 'جارٍ توليد سيناريو لغة الشارع عبر الإيجنت...' : 'Generating Street Talk dialogue via AI Agent...', 'info');
  try {
    const res = await fetch(`${API_BASE}/tracks/street-talk/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, agentType }),
    });
    if (!res.ok) throw new Error('Failed to generate scenario');
    const item = await res.json();
    window.location.href = `studio.html?id=${encodeURIComponent(item.id)}&mode=sentences&agent=${encodeURIComponent(agentType)}`;
  } catch (err) {
    showAppToast(err.message, 'error');
  }
}
window.launchStreetTalkScenario = launchStreetTalkScenario;

async function launchPhoneticsDrill(topic) {
  const agentType = document.getElementById('agent-select')?.value || state.activeAgent || 'antigravity';
  showAppToast(state.lang === 'ar' ? 'جارٍ تحضير تمرين ميكانيكا النطق عبر الإيجنت...' : 'Preparing Phonetics drill via AI Agent...', 'info');
  try {
    const res = await fetch(`${API_BASE}/tracks/phonetics/drill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, agentType }),
    });
    if (!res.ok) throw new Error('Failed to create drill');
    const item = await res.json();
    window.location.href = `studio.html?id=${encodeURIComponent(item.id)}&mode=sentences&agent=${encodeURIComponent(agentType)}`;
  } catch (err) {
    showAppToast(err.message, 'error');
  }
}
window.launchPhoneticsDrill = launchPhoneticsDrill;

function filterHistoryByKeyword(keyword) {
  const lower = keyword.toLowerCase();
  const filtered = state.history.filter(item => {
    if (!lower) return true;
    return (item.title || '').toLowerCase().includes(lower) || (item.creator || '').toLowerCase().includes(lower);
  });
  const container = document.getElementById('history-container');
  if (container) {
    if (filtered.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2.5rem; color: var(--text-muted);">No sessions match "${keyword}".</div>`;
    } else {
      const orig = state.history;
      state.history = filtered;
      renderHistory();
      state.history = orig;
    }
  }
}
window.filterHistoryByKeyword = filterHistoryByKeyword;

async function deleteHistorySession(id) {
  try {
    const res = await fetch(`${API_BASE}/history/${id}`, { method: 'DELETE' });
    if (res.ok) {
      state.history = state.history.filter(i => i.id !== id);
      renderHistory();
      showAppToast(I18N[state.lang].history.itemDeleted, 'success');
    }
  } catch (e) {
    showAppToast('Failed to delete item', 'error');
  }
}
window.deleteHistorySession = deleteHistorySession;

function filterHistoryByTrack(track) {
  const t = track || 'all';
  state.activeTrack = t;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.track === t);
  });
  loadHistory(t);
}
window.filterHistoryByTrack = filterHistoryByTrack;

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function processVideo(url) {
  const agentType = document.getElementById('agent-select').value;
  // Inspect database memory first: if video exists, bypass loader completely!
  try {
    const checkRes = await fetch(`${API_BASE}/tracks/shadowing/check-existing?url=${encodeURIComponent(url)}`);
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.exists && checkData.item) {
        window.location.href = `studio.html?id=${encodeURIComponent(checkData.item.id)}`;
        return;
      }
    }
  } catch (e) {
    console.warn('Check existing check error, falling back:', e);
  }

  // Brand-new video: navigate to studio with new=1 to run agent engine
  window.location.href = `studio.html?url=${encodeURIComponent(url)}&agent=${encodeURIComponent(agentType)}&new=1`;
}

function handleHeroPrimaryAction() {
  const val = document.getElementById('url-input').value.trim();
  if (!val) {
    if (state.activeTrack === 'street_talk') {
      launchStreetTalkScenario('Coffee Shop & NYC Urban Banter');
    } else if (state.activeTrack === 'phonetics') {
      launchPhoneticsDrill('Flap-T Masterclass (better, water, bottle)');
    } else {
      showAppToast(state.lang === 'ar' ? 'يرجى إدخال رابط فيديو يوتيوب' : 'Please enter a YouTube video URL', 'error');
    }
    return;
  }

  if (state.activeTrack === 'street_talk') {
    launchStreetTalkScenario(val);
  } else if (state.activeTrack === 'phonetics') {
    launchPhoneticsDrill(val);
  } else if (state.activeTrack === 'all') {
    filterHistoryByKeyword(val);
  } else {
    processVideo(val);
  }
}

function setupEventListeners() {
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('lang-toggle-btn').addEventListener('click', () => {
    setLanguage(state.lang === 'en' ? 'ar' : 'en');
  });

  document.getElementById('process-btn').addEventListener('click', () => {
    handleHeroPrimaryAction();
  });

  const urlInput = document.getElementById('url-input');
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleHeroPrimaryAction();
    }
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      const track = target.dataset.track;
      state.activeTrack = track;
      updateHeroForTrack(track);
      loadHistory(track);
    });
  });

  const resetBtn = document.getElementById('reset-history-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const t = I18N[state.lang];
      await fetch(`${API_BASE}/history/clear`, { method: 'POST' });
      state.history = [];
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('notes_')) localStorage.removeItem(key);
      });
      renderHistory();
      showAppToast(t.history.historyCleared, 'info');
    });
  }
}
