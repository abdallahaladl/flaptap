/* ==========================================================================
   FLAPTAP TECH LEXICON MODES & SHARED RENDER HELPERS (tech-lexicon-modes.js)
   Modular strategy descriptors and shared pure helpers for:
   - Mode 1: comprehensive (Full Studio 4-Tab Lexicon)
   - Mode 2: advanced_native (Native Elite 2-Tab Zero-Duplicate Fluency)
   ========================================================================== */

(function (global) {
  'use strict';

  const MODES = {
    comprehensive: {
      id: 'comprehensive',
      label: 'Full Studio Lexicon',
      shortLabel: 'Full Studio (4-Tab)',
      badgeLabel: '4-Tab Studio',
      runButtonLabel: 'Extract Tech Lexicon',
      step3Label: 'Executing AI cognitive extraction (Tech Vocab & Idioms)',
      interactionHintHtml:
        '<strong>Interactive Studio:</strong> Click any English word in vocabulary tables, idioms, thought patterns, or transcript for instant contextual definition, IPA pronunciation, and translation.',
      countUnitLabel: 'High-Yield Items Extracted',
      clipboardVocabHeading: 'Tech Vocabulary',
      clipboardIdiomsHeading: 'Idioms & Slang',
      tabs: {
        vocab: {
          visible: true,
          label: 'Tech Vocab',
          colHeader: 'Word / Phrase (Click any word for context)',
          emptyFilterText: 'No vocabulary terms match your current filter.',
        },
        idioms: {
          visible: true,
          label: 'Idioms & Slang',
          colHeader: 'Idiom / Expression (Click any word for context)',
          emptyFilterText: 'No idioms match your current filter.',
        },
        patterns: {
          visible: true,
          label: 'Thought Patterns',
        },
        transcript: {
          visible: true,
          label: 'Interactive Transcript',
        },
      },
    },
    advanced_native: {
      id: 'advanced_native',
      label: 'Native Elite',
      shortLabel: 'Native Elite (2-Tab)',
      badgeLabel: '2-Tab Strict',
      runButtonLabel: 'Extract Native Elite',
      step3Label: 'Executing Native Elite filter (Hard Words/Verbs & Street Idioms)',
      interactionHintHtml:
        '<strong>Native Elite Mode:</strong> Hard &amp; advanced words/verbs only (Tab 1) and native American idioms, abbreviations &amp; street slang (Tab 2) across all fields — zero duplicates, zero basic filler.',
      countUnitLabel: 'Elite Items Extracted',
      clipboardVocabHeading: 'Advanced Words & Verbs',
      clipboardIdiomsHeading: 'Idioms, Expressions & Street Slang',
      tabs: {
        vocab: {
          visible: true,
          label: 'Words & Verbs',
          colHeader: 'Hard / Advanced Word or Verb (Click any word for context)',
          emptyFilterText: 'No advanced words or verbs match your current filter.',
        },
        idioms: {
          visible: true,
          label: 'Idioms, Expressions & Slang',
          colHeader: 'Idiom, Combination, Abbrev. or Street Slang (Click any word for context)',
          emptyFilterText: 'No idioms, expressions, or slang match your current filter.',
        },
        patterns: {
          visible: false,
          label: 'Thought Patterns',
        },
        transcript: {
          visible: false,
          label: 'Interactive Transcript',
        },
      },
    },
  };

  function normalizeModeId(modeId) {
    const clean = String(modeId || '').trim().toLowerCase();
    if (clean === 'advanced_native' || clean === 'native_elite' || clean === 'advanced-native') {
      return 'advanced_native';
    }
    return 'comprehensive';
  }

  function getModeConfig(modeId) {
    return MODES[normalizeModeId(modeId)] || MODES.comprehensive;
  }

  function isTabVisible(modeId, tabName) {
    const cfg = getModeConfig(modeId);
    return Boolean(cfg.tabs[tabName]?.visible);
  }

  function highlightTermInSentence(sentence, term, escapeHtml, allowPartial = false) {
    if (!sentence) return '';
    const cleanTerm = String(term || '').trim();
    if (!cleanTerm) return escapeHtml(sentence);

    const escapedRegex = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundaryRe = new RegExp(
      `(?<![\\p{L}\\p{N}_])(${escapedRegex}(?:['’]?s|es|ed|d|ing|er|ers)?)(?![\\p{L}\\p{N}_])`,
      'giu',
    );

    const matches = Array.from(String(sentence).matchAll(boundaryRe));
    if (matches.length > 0) {
      let lastIdx = 0;
      let out = '';
      for (const m of matches) {
        const idx = m.index ?? 0;
        out += escapeHtml(sentence.slice(lastIdx, idx));
        out += `<mark class="lexicon-highlight">${escapeHtml(m[1])}</mark>`;
        lastIdx = idx + m[0].length;
      }
      out += escapeHtml(sentence.slice(lastIdx));
      return out;
    }

    if (allowPartial) {
      const partialRe = new RegExp(`(${escapedRegex})`, 'gi');
      let lastIdx = 0;
      let out = '';
      for (const m of String(sentence).matchAll(partialRe)) {
        const idx = m.index ?? 0;
        out += escapeHtml(sentence.slice(lastIdx, idx));
        out += `<mark class="lexicon-highlight">${escapeHtml(m[1])}</mark>`;
        lastIdx = idx + m[0].length;
      }
      if (lastIdx > 0) {
        out += escapeHtml(sentence.slice(lastIdx));
        return out;
      }
    }

    return escapeHtml(sentence);
  }

  function renderDualArabicCellHtml(generalArabic, contextualArabic, escapeHtml) {
    const gen = String(generalArabic || '').trim();
    const ctx = String(contextualArabic || '').trim();
    if (!gen) {
      return `
        <div class="arabic-val">
          <span class="arabic-bold" dir="rtl">${escapeHtml(ctx)}</span>
        </div>
      `;
    }
    return `
      <div class="arabic-val">
        <div class="arabic-sense-block is-general">
          <span class="sense-badge">General</span>
          <span class="arabic-general-text" dir="rtl">${escapeHtml(gen)}</span>
        </div>
        <div class="arabic-sense-block is-context">
          <span class="sense-badge is-context">In context</span>
          <span class="arabic-bold" dir="rtl">${escapeHtml(ctx)}</span>
        </div>
      </div>
    `;
  }

  function renderFilterPillsHtml(items, fieldName, activeCategory, escapeHtml) {
    const list = Array.isArray(items) ? items : [];
    const cats = Array.from(
      new Set(list.map((item) => String(item?.[fieldName] || '').trim()).filter(Boolean)),
    );
    if (cats.length <= 1) {
      return { visible: false, html: '' };
    }

    const allBtn = `<button type="button" class="lex-cat-pill ${activeCategory === 'all' ? 'active' : ''}" data-category="all">All (${list.length})</button>`;
    const catBtns = cats
      .map((cat) => {
        const count = list.filter((it) => String(it?.[fieldName] || '').trim() === cat).length;
        const isActive = activeCategory === cat;
        return `<button type="button" class="lex-cat-pill ${isActive ? 'active' : ''}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)} (${count})</button>`;
      })
      .join('');

    return { visible: true, html: allBtn + catBtns };
  }

  function filterVocabItems(items, query, activeCategory) {
    const cat = activeCategory || 'all';
    const q = (query || '').trim().toLowerCase();
    return (items || []).filter((v) => {
      if (cat !== 'all' && String(v.techCategory || '').trim() !== cat) return false;
      if (!q) return true;
      return (
        String(v.term || '').toLowerCase().includes(q) ||
        String(v.generalArabic || '').toLowerCase().includes(q) ||
        String(v.meaningArabic || '').toLowerCase().includes(q) ||
        String(v.contextSentence || '').toLowerCase().includes(q) ||
        String(v.techCategory || '').toLowerCase().includes(q)
      );
    });
  }

  function filterIdiomItems(items, query, activeCategory) {
    const cat = activeCategory || 'all';
    const q = (query || '').trim().toLowerCase();
    return (items || []).filter((i) => {
      if (cat !== 'all' && String(i.category || '').trim() !== cat) return false;
      if (!q) return true;
      return (
        String(i.phrase || '').toLowerCase().includes(q) ||
        String(i.category || '').toLowerCase().includes(q) ||
        String(i.generalArabic || '').toLowerCase().includes(q) ||
        String(i.meaningArabic || '').toLowerCase().includes(q) ||
        String(i.contextSentence || '').toLowerCase().includes(q) ||
        String(i.usageNote || '').toLowerCase().includes(q)
      );
    });
  }

  function buildStudyNotesClipboardText(result) {
    if (!result) return '';
    const modeCfg = getModeConfig(result.extractionMode || result.extraction_mode);

    const lines = [
      `${result.title} [${modeCfg.shortLabel}]`,
      result.sourceUrl ? `Source: ${result.sourceUrl}` : '',
      result.summary ? `\nSummary:\n${result.summary}` : '',
      `\n${modeCfg.clipboardVocabHeading} (${result.vocabItems?.length || 0}):`,
      ...(result.vocabItems || []).map(
        (v) =>
          `${v.index}. ${v.term}${v.partOfSpeech ? ` (${v.partOfSpeech})` : ''} — ${
            v.generalArabic ? `General: ${v.generalArabic} | ` : ''
          }In context: ${v.meaningArabic}${v.contextSentence ? `\n   "${v.contextSentence}"` : ''}`,
      ),
      `\n${modeCfg.clipboardIdiomsHeading} (${result.idiomItems?.length || 0}):`,
      ...(result.idiomItems || []).map(
        (i) =>
          `${i.index}. ${i.phrase}${i.category ? ` [${i.category}]` : ''} — ${
            i.generalArabic ? `General: ${i.generalArabic} | ` : ''
          }In context: ${i.meaningArabic}${i.contextSentence ? `\n   "${i.contextSentence}"` : ''}`,
      ),
    ];

    if (modeCfg.tabs.patterns.visible && result.thoughtPatterns?.length) {
      lines.push(`\nThought Patterns (${result.thoughtPatterns.length}):`);
      result.thoughtPatterns.forEach((p, idx) => {
        lines.push(`${idx + 1}. ${p.title}\n   Native: "${p.americanStyle}"\n   Mindset: ${p.mindsetNote}`);
      });
    }

    return lines.filter(Boolean).join('\n');
  }

  global.FlaptapTechLexiconModes = {
    MODES,
    normalizeModeId,
    getModeConfig,
    isTabVisible,
    highlightTermInSentence,
    renderDualArabicCellHtml,
    renderFilterPillsHtml,
    filterVocabItems,
    filterIdiomItems,
    buildStudyNotesClipboardText,
  };
})(window);
