/* ==========================================================================
   FLAPTAP AI CHAT — LIVE CONTEXT BRIDGE (frontend/ai-chat/context-bridge.js)
   Collects active workspace context from registered feature providers
   (Shadowing Studio, Phrase Miner, Phrase Builder, Think Aloud, Vocabulary,
   Word Lookup) and generates context-tailored starter prompts.
   ========================================================================== */

(function (global) {
  'use strict';

  const providers = new Map();
  const listeners = new Set();

  function registerProvider(id, fn) {
    if (!id || typeof fn !== 'function') return () => {};
    providers.set(id, fn);
    notifyChange();
    return () => {
      if (providers.get(id) === fn) {
        providers.delete(id);
        notifyChange();
      }
    };
  }

  function detectFallbackContext() {
    const path = String(global.location?.pathname || '/').toLowerCase();
    if (path.startsWith('/studio')) {
      return {
        type: 'media_hub',
        id: '',
        label: 'Media Hub Studio',
        subtitle: 'Active transcript, deep extract & audio playback',
      };
    }

    const sec =
      global.FlaptapRouter?.parseLocation?.(global.location)?.section ||
      document.documentElement.getAttribute('data-active-section') ||
      'media-hub';

    const map = {
      'media-hub': {
        type: 'media_hub',
        label: 'Media Hub',
        subtitle: 'Video, podcast & audio study studio',
      },
      lessons: {
        type: 'media_hub',
        label: 'Media Hub',
        subtitle: 'Video, podcast & audio study studio',
      },
      dialogue: {
        type: 'dialogue',
        label: 'Dialogues',
        subtitle: 'Conversational American roleplay',
      },
      pronunciation: {
        type: 'phonetics',
        label: 'Phonetics',
        subtitle: 'Articulatory mouth mechanics & rhythm',
      },
      'think-aloud': {
        type: 'think_aloud',
        label: 'Think Aloud',
        subtitle: 'Spontaneous English thinking & speaking',
      },
      'american-extractor': {
        type: 'phrase_miner',
        label: 'Phrase Miner',
        subtitle: 'Real-world phrase extraction',
      },
      'learning-library': {
        type: 'phrase_builder',
        label: 'Phrase Builder',
        subtitle: 'Natural American expressions & patterns',
      },
      vocabulary: {
        type: 'vocabulary',
        label: 'Vocabulary Vault',
        subtitle: 'Saved words & active recall flashcards',
      },
      history: {
        type: 'general',
        label: 'Activity & Cache',
        subtitle: 'Study progress & history',
      },
      'ai-chat': {
        type: 'general',
        label: 'Flaptap AI',
        subtitle: 'Full-workspace AI mentor',
      },
    };

    return map[sec] || { type: 'general', label: 'Flaptap AI', subtitle: 'Spoken English Studio' };
  }

  function getActiveContext() {
    // Evaluate most recently registered active provider first
    const entries = Array.from(providers.entries()).reverse();
    for (const [, fn] of entries) {
      try {
        const res = fn();
        if (res && res.active !== false && res.type) {
          return res;
        }
      } catch {}
    }
    return detectFallbackContext();
  }

  function getStarterChips(ctx, quote) {
    if (quote?.text) {
      return [
        {
          label: 'Why say it like this?',
          prompt:
            'Why did the speaker phrase this exact part this way? Break down the natural American thought flow and nuance.',
        },
        {
          label: 'Natural alternatives',
          prompt:
            'Give me 3-4 natural spoken American alternatives for this idea with subtle differences in tone.',
        },
        {
          label: 'Explain meaning & idioms',
          prompt:
            'Explain the exact meaning in context, any idioms or reductions, and how natives actually use it.',
        },
        {
          label: 'Pronunciation & reductions',
          prompt:
            'Show me how a native American speaker blends, links, and reduces these words at full speed (with IPA).',
        },
      ];
    }

    const t = ctx?.type || 'general';
    if (t === 'media_hub' || t === 'shadowing' || t === 'dialogue' || t === 'phonetics') {
      if (ctx?.id) {
        return [
          {
            label: 'How they structure thoughts',
            prompt:
              'How does the speaker sequence and connect their thoughts naturally in this lesson?',
          },
          {
            label: 'Key spoken expressions',
            prompt:
              'What are the top high-value spoken American phrases and connectors to steal from this lesson?',
          },
          {
            label: 'Connected speech breakdown',
            prompt:
              'Point out the trickiest reductions, linking, or fast-speech patterns in this lesson.',
          },
          {
            label: 'Quiz me on this lesson',
            prompt:
              'Give me a quick 3-question active-recall challenge based on the phrases in this lesson.',
          },
        ];
      }
      return [
        {
          label: 'How to shadow effectively',
          prompt:
            'Give me a sharp 5-minute shadowing protocol to fix my American rhythm, linking, and flap-T.',
        },
        {
          label: 'Natural daily openers',
          prompt:
            'Teach me 5 ultra-natural American conversation starters and connectors that replace textbook phrasing.',
        },
        {
          label: 'Master connected speech',
          prompt:
            'Break down the 5 most important American reductions, linking rules, and flap-T habits with fast spoken examples.',
        },
        {
          label: 'Start a 2-minute roleplay',
          prompt:
            'Start a realistic 1-on-1 everyday American conversation with me and coach my phrasing gently after each turn.',
        },
      ];
    }

    if (t === 'phrase_miner') {
      return [
        {
          label: 'Top must-keep phrases',
          prompt:
            'Which expressions in this study guide are highest-leverage for everyday spoken American English, and why?',
        },
        {
          label: 'Compare casual vs sharp',
          prompt:
            'Pick 3 phrases from this guide and show me how to use each one naturally in both casual and work settings.',
        },
        {
          label: 'Mini roleplay drill',
          prompt:
            'Start a short realistic conversation with me where I have to use 3 phrases from this study guide.',
        },
      ];
    }

    if (t === 'phrase_builder') {
      return [
        {
          label: 'When natives actually use it',
          prompt:
            'When do native Americans actually say this expression, and when would it sound awkward?',
        },
        {
          label: 'Spoken speed & reductions',
          prompt:
            'Break down how this phrase sounds in fast spoken English (linking, dropped sounds, stress).',
        },
        {
          label: 'Give me 3 real scenarios',
          prompt:
            'Write 3 short, realistic mini-dialogues showing this expression in different vibes.',
        },
      ];
    }

    if (t === 'think_aloud') {
      return [
        {
          label: 'Upgrade my phrasing',
          prompt:
            'Review what I said in this Think Aloud session and show me 3 tighter, more native ways to express the same idea.',
        },
        {
          label: 'Cut fillers & hesitation',
          prompt:
            'What specific hedging or bridge phrases should I practice to replace pauses and fillers here?',
        },
        {
          label: 'Re-answer challenge',
          prompt:
            'Give me a 30-second speaking spine outline so I can re-deliver this prompt sharper and faster.',
        },
      ];
    }

    if (t === 'vocabulary') {
      return [
        {
          label: 'Test me with sentences',
          prompt:
            'Give me a quick fill-in-the-blank or natural-rewrite drill using my saved vocabulary.',
        },
        {
          label: 'Nuance & common traps',
          prompt:
            'Explain subtle traps, prepositions, or tone mistakes learners make with this word.',
        },
      ];
    }

    if (t === 'word_lookup') {
      return [
        {
          label: 'Nuance & real examples',
          prompt:
            'Explain the exact vibe of this term in native American speech with 3 natural everyday sentences.',
        },
        {
          label: 'Synonyms & register',
          prompt:
            'Compare this word with 3 close alternatives from casual slang to sharp professional speech.',
        },
      ];
    }

    return [
      {
        label: 'Think in English faster',
        prompt:
          'Give me a practical mental framework to stop translating from Arabic in my head and speak smoothly.',
      },
      {
        label: 'Fix textbook phrasing',
        prompt:
          'Show me 6 common textbook English sentences and how native Americans actually say them.',
      },
      {
        label: 'Master American rhythm',
        prompt:
          'Explain the core rules of American English stress-timing, schwa reductions, and flap-T with examples.',
      },
      {
        label: 'Start a live roleplay',
        prompt:
          'Start a realistic 1-on-1 coffee-shop or tech-standup roleplay with me and coach my phrasing gently.',
      },
    ];
  }

  function getEmptyStateCopy(ctx, isAr = false) {
    const t = ctx?.type || 'general';
    const hasId = Boolean(ctx?.id);

    if (isAr) {
      const arMap = {
        media_hub: hasId
          ? {
              title: 'اسأل عن هذا الدرس',
              subtitle: 'أقرأ النص الكامل والتوقيت الحالي — اسأل عن النطق أو المعنى أو التعبيرات الطبيعية.',
            }
          : {
              title: 'مركز الوسائط والتعلّم التفاعلي',
              subtitle: 'تدرّب على الإيقاع الأمريكي والربط الصوتي واستخراج التعبيرات والمفردات خطوة بخطوة.',
            },
        shadowing: hasId
          ? {
              title: 'اسأل عن هذا الدرس',
              subtitle: 'أقرأ النص الكامل والتوقيت الحالي — اسأل عن النطق أو المعنى أو التعبيرات الطبيعية.',
            }
          : {
              title: 'مدرب الترديد والتحدث',
              subtitle: 'تدرّب على الإيقاع الأمريكي والربط الصوتي وتفكيك الجمل الطبيعية خطوة بخطوة.',
            },
        dialogue: {
          title: 'اسأل عن هذا الحوار',
          subtitle: 'اكتشف نبرة المتحدثين والتعبيرات اليومية والبدائل الأمريكية الأكثر طبيعية.',
        },
        phonetics: {
          title: 'مدرب الصوتيات والنطق',
          subtitle: 'اسأل عن مخارج الحروف والرموز الصوتية (IPA) وتدريبات اللسان والفك.',
        },
        phrase_miner: {
          title: 'تحليل العبارات المستخرجة',
          subtitle: 'قارن بين الأساليب الرسمية واليومية وتدرّب على استخدام العبارات في سياقات حقيقية.',
        },
        phrase_builder: {
          title: 'بناء التعبيرات الأمريكية',
          subtitle: 'افهم متى يستخدم الأمريكيون هذا التعبير وكيف يُنطق بسرعة المحادثة الطبيعية.',
        },
        think_aloud: {
          title: 'طوّر طلاقتك التلقائية',
          subtitle: 'احصل على صياغات أكثر طبيعية وتخلّص من التردد وحشوات الكلام.',
        },
        vocabulary: {
          title: 'مراجعة المفردات بذكاء',
          subtitle: 'تدرّب على كلماتك المحفوظة داخل جمل واقعية واكتشف الفروق الدقيقة بينها.',
        },
        word_lookup: {
          title: 'فهم الكلمة في سياقها',
          subtitle: 'اكتشف المعنى الدقيق والنبرة والأمثلة اليومية والنطق الأمريكي الأصيل.',
        },
      };
      return (
        arMap[t] || {
          title: 'اسأل أي شيء بسياق كامل',
          subtitle: 'أعرف الشاشة والنص الذي تدرسه الآن — اسأل بالعربية أو الإنجليزية نصياً أو صوتياً أو بصورة.',
        }
      );
    }

    const enMap = {
      media_hub: hasId
        ? {
            title: 'Ask about this media session',
            subtitle: 'I have the full transcript and timing in view — ask about nuance, linking, or phrasing.',
          }
        : {
            title: 'Your Media Hub & Spoken Studio',
            subtitle: 'Ask about American rhythm, connected speech, extracted phrases, or start a live speaking drill.',
          },
      shadowing: hasId
        ? {
            title: 'Ask about this lesson',
            subtitle: 'I have the full transcript and timing in view — ask about nuance, linking, or phrasing.',
          }
        : {
            title: 'Your Shadowing & Speaking Coach',
            subtitle: 'Ask about American rhythm, connected speech, phrasing, or start a live speaking drill.',
          },
      dialogue: {
        title: 'Break down this dialogue',
        subtitle: 'Explore speaker tone, casual contractions, and natural American alternatives.',
      },
      phonetics: {
        title: 'Articulation & Accent Coach',
        subtitle: 'Ask about tongue placement, IPA breakdowns, flap-T, or natural stress timing.',
      },
      phrase_miner: {
        title: 'Explore extracted phrases',
        subtitle: 'Compare casual vs. sharp phrasing and drill these expressions in realistic dialogues.',
      },
      phrase_builder: {
        title: 'Master this expression',
        subtitle: 'See when natives actually say it, how it reduces at speed, and practice in context.',
      },
      think_aloud: {
        title: 'Sharpen your spontaneous flow',
        subtitle: 'Upgrade phrasing, trim fillers, and build a crisp spoken structure.',
      },
      vocabulary: {
        title: 'Drill your saved vocabulary',
        subtitle: 'Test recall in context, compare close synonyms, and spot common preposition traps.',
      },
      word_lookup: {
        title: 'Explore word nuance',
        subtitle: 'Get natural American examples, register differences, and pronunciation tips.',
      },
    };

    return (
      enMap[t] || {
        title: 'Ask anything with full context',
        subtitle: 'I know the active screen, transcript, or phrase you are studying — ask by text, voice, or screenshot.',
      }
    );
  }

  function notifyChange() {
    const ctx = getActiveContext();
    listeners.forEach((fn) => {
      try {
        fn(ctx);
      } catch {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  global.FlaptapAiContext = {
    registerProvider,
    getActiveContext,
    getStarterChips,
    getEmptyStateCopy,
    notifyChange,
    subscribe,
  };
})(window);
