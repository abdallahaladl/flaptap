/* ==========================================================================
   FLAPTAP STUDIO — INSIGHTS PARAGRAPH, HIGHLIGHT & NATIVE FLOW ENGINE
   Pure, deterministic module (browser UMD + Node CommonJS for unit tests).
   - Groups extracted insights into shortest meaningful complete-thought units
   - Preserves verbatim source text across all inline highlight spans
   - Computes per-paragraph statistics & strictly child-derived mastery
   - Analyzes natural American English idea flow & sentence construction
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FlaptapStudioInsightsEngine = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CEFR_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

  const MACRO_GROUPS = [
    {
      id: 'words',
      label: 'Words & Verbs',
      categories: new Set(['vocabulary', 'phrasal_verb', 'collocation']),
    },
    {
      id: 'idioms',
      label: 'Phrases & Idioms',
      categories: new Set([
        'idiom',
        'slang',
        'conversational_expression',
        'native_response',
        'filler',
        'interjection',
        'metaphor_figurative',
      ]),
    },
    {
      id: 'structures',
      label: 'Structures & Flow',
      categories: new Set(['pattern', 'grammar_structure', 'discourse_marker', 'key_sentence']),
    },
    {
      id: 'spoken',
      label: 'Spoken & Phonetics',
      categories: new Set([
        'connected_speech',
        'contraction_reduction',
        'pronunciation_phonetics',
        'word_sentence_stress',
        'linking_sound_changes',
      ]),
    },
    {
      id: 'culture',
      label: 'Pragmatics & Culture',
      categories: new Set(['cultural_reference', 'pragmatics_context']),
    },
  ];

  const CATEGORY_LABELS = {
    pattern: 'Sentence Pattern',
    vocabulary: 'Vocabulary',
    idiom: 'Idiom',
    phrasal_verb: 'Phrasal Verb',
    collocation: 'Collocation',
    slang: 'Slang',
    conversational_expression: 'Conversational',
    grammar_structure: 'Grammar Structure',
    discourse_marker: 'Discourse Marker',
    filler: 'Filler',
    interjection: 'Interjection',
    contraction_reduction: 'Reduction',
    metaphor_figurative: 'Figurative',
    cultural_reference: 'Cultural Ref',
    pragmatics_context: 'Pragmatics',
    native_response: 'Native Reaction',
    connected_speech: 'Connected Speech',
    pronunciation_phonetics: 'Phonetics',
    word_sentence_stress: 'Stress & Rhythm',
    linking_sound_changes: 'Linking',
    key_sentence: 'Key Sentence',
  };

  const NATIVE_ROLE_LABELS = {
    discourse_marker: 'Idea Connector',
    pattern: 'Sentence Frame',
    grammar_structure: 'Grammar Frame',
    key_sentence: 'Anchor Thought',
    phrasal_verb: 'Action Phrasal Verb',
    collocation: 'Natural Pairing',
    vocabulary: 'Core Vocabulary',
    idiom: 'Everyday Idiom',
    metaphor_figurative: 'Figurative Image',
    slang: 'Casual Slang',
    conversational_expression: 'Conversational Opener',
    native_response: 'Native Reaction',
    filler: 'Thinking Pause',
    interjection: 'Spoken Exclamation',
    contraction_reduction: 'Spoken Shortcut',
    connected_speech: 'Linked Flow',
    linking_sound_changes: 'Sound Blending',
    pronunciation_phonetics: 'Pronunciation Cue',
    word_sentence_stress: 'Rhythm & Stress',
    cultural_reference: 'Cultural Context',
    pragmatics_context: 'Social Tone',
  };

  const FLOW_PRIORITY_CATEGORIES = new Set([
    'discourse_marker',
    'grammar_structure',
    'pattern',
    'conversational_expression',
    'native_response',
    'phrasal_verb',
    'connected_speech',
    'contraction_reduction',
    'linking_sound_changes',
    'filler',
    'key_sentence',
  ]);

  const CONTRACTION_RE =
    /\b(?:I'm|I've|I'll|I'd|you're|you've|you'll|you'd|we're|we've|we'll|we'd|they're|they've|they'll|they'd|he's|she's|it's|that's|there's|here's|what's|who's|let's|don't|doesn't|didn't|won't|wouldn't|can't|couldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|ain't|gonna|wanna|gotta|kinda|sorta|outta|lotta|dunno|lemme|gimme)\b/gi;

  function getMacroGroupId(category) {
    const cat = String(category || '').trim();
    for (const g of MACRO_GROUPS) {
      if (g.categories.has(cat)) return g.id;
    }
    return 'words';
  }

  function getMacroGroupLabel(groupId) {
    const found = MACRO_GROUPS.find((g) => g.id === groupId);
    return found ? found.label : 'Words & Verbs';
  }

  function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || String(category || 'Phrase').replace(/_/g, ' ');
  }

  function getNativeRoleLabel(item) {
    if (!item) return 'Key Insight';
    const cat = String(item.category || '').trim();
    if (NATIVE_ROLE_LABELS[cat]) return NATIVE_ROLE_LABELS[cat];
    const pos = String(item.partOfSpeech || '').trim();
    if (pos) return pos.charAt(0).toUpperCase() + pos.slice(1);
    return 'Key Insight';
  }

  function normalizeForMatch(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[^a-z0-9'\s]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function countWords(text) {
    const clean = String(text || '').trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
  }

  function splitLongParagraphIntoThoughts(sentencesList, fallbackSpeaker, fallbackSpeakerId) {
    const units = [];
    if (!Array.isArray(sentencesList) || sentencesList.length === 0) return units;

    let bucket = [];
    let bucketWords = 0;

    const flushBucket = () => {
      if (bucket.length === 0) return;
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      const text = bucket.map((s) => String(s.text || '').trim()).filter(Boolean).join(' ');
      if (text) {
        units.push({
          text,
          sentences: bucket.slice(),
          sentenceIndices: bucket.map((s) => Number(s.index)).filter((n) => Number.isFinite(n)),
          speaker: first.speaker || fallbackSpeaker || '',
          speakerId: first.speakerId || fallbackSpeakerId || '',
          startSec: typeof first.startSec === 'number' ? first.startSec : null,
          endSec: typeof last.endSec === 'number' ? last.endSec : null,
        });
      }
      bucket = [];
      bucketWords = 0;
    };

    for (let i = 0; i < sentencesList.length; i++) {
      const sent = sentencesList[i];
      const sWords = countWords(sent.text);
      const prevSpeaker = bucket.length > 0 ? bucket[bucket.length - 1].speakerId || bucket[bucket.length - 1].speaker : null;
      const curSpeaker = sent.speakerId || sent.speaker || null;

      if (bucket.length > 0 && prevSpeaker && curSpeaker && prevSpeaker !== curSpeaker) {
        flushBucket();
      }

      bucket.push(sent);
      bucketWords += sWords;

      const remaining = sentencesList.length - 1 - i;
      const nextWords = remaining > 0 ? countWords(sentencesList[i + 1].text) : 0;

      // Keep the shortest meaningful complete thought (1-3 sentences, ~22-50 words)
      // without creating tiny < 6-word trailing orphans.
      const reachedIdealLength = bucket.length >= 3 || bucketWords >= 38;
      const wouldLeaveTinyOrphan = remaining === 1 && nextWords > 0 && nextWords < 6 && bucketWords + nextWords <= 62;
      if (reachedIdealLength && !wouldLeaveTinyOrphan) {
        flushBucket();
      }
    }
    flushBucket();

    // Merge a tiny trailing 1-sentence orphan (< 6 words) into the previous thought if reasonable
    if (units.length > 1) {
      const last = units[units.length - 1];
      if (last.sentences.length === 1 && countWords(last.text) < 6) {
        const prev = units[units.length - 2];
        const prevSameSpeaker = !prev.speakerId || !last.speakerId || prev.speakerId === last.speakerId;
        if (prevSameSpeaker && countWords(prev.text) + countWords(last.text) <= 68) {
          prev.sentences = prev.sentences.concat(last.sentences);
          prev.sentenceIndices = prev.sentenceIndices.concat(last.sentenceIndices);
          prev.text = `${prev.text} ${last.text}`.trim();
          if (typeof last.endSec === 'number') prev.endSec = last.endSec;
          units.pop();
        }
      }
    }

    return units;
  }

  function findSentenceOffsetInText(text, sentenceText, searchFrom) {
    if (!text || !sentenceText) return -1;
    const cleanSent = String(sentenceText).trim();
    if (!cleanSent) return -1;
    const exact = text.indexOf(cleanSent, Math.max(0, searchFrom || 0));
    if (exact >= 0) return exact;
    const lowerText = text.toLowerCase();
    const lowerSent = cleanSent.toLowerCase();
    const ci = lowerText.indexOf(lowerSent, Math.max(0, searchFrom || 0));
    if (ci >= 0) return ci;
    const snippet = lowerSent.slice(0, Math.min(24, lowerSent.length));
    return snippet.length >= 6 ? lowerText.indexOf(snippet, Math.max(0, searchFrom || 0)) : -1;
  }

  function findTermSpanInText(text, item, sentenceOffsets) {
    if (!text || !item) return null;
    const candidates = [item.surface, item.term]
      .map((v) => String(v || '').trim())
      .filter((v, idx, arr) => v.length >= 2 && arr.indexOf(v) === idx);

    let preferredStart = 0;
    let preferredEnd = text.length;
    const sentIdx = Number(item.sentenceIndex);
    if (Number.isFinite(sentIdx) && sentenceOffsets && sentenceOffsets.has(sentIdx)) {
      const span = sentenceOffsets.get(sentIdx);
      preferredStart = span.start;
      preferredEnd = span.end;
    }

    for (const target of candidates) {
      const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startsAlpha = /^[a-z0-9]/i.test(target);
      const endsAlpha = /[a-z0-9]$/i.test(target);
      const boundaryPattern = `${startsAlpha ? '\\b' : ''}${escaped}${endsAlpha ? '\\b' : ''}`;

      const regexes = [new RegExp(boundaryPattern, 'gi'), new RegExp(escaped, 'gi')];
      for (const re of regexes) {
        const matches = [];
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m[0].length === 0) break;
          matches.push({ start: m.index, end: m.index + m[0].length });
          if (matches.length > 40) break;
        }
        if (matches.length > 0) {
          // Prefer match inside the item's sentence span when available
          const inSentence = matches.find(
            (pos) => pos.start >= Math.max(0, preferredStart - 2) && pos.end <= preferredEnd + 2,
          );
          if (inSentence) return inSentence;
          // Otherwise pick closest to preferredStart
          let best = matches[0];
          let bestDist = Math.abs(best.start - preferredStart);
          for (let i = 1; i < matches.length; i++) {
            const dist = Math.abs(matches[i].start - preferredStart);
            if (dist < bestDist) {
              bestDist = dist;
              best = matches[i];
            }
          }
          return best;
        }
      }
    }

    return null;
  }

  function buildSentenceOffsetsMap(text, sentences) {
    const map = new Map();
    if (!text || !Array.isArray(sentences) || sentences.length === 0) return map;
    let cursor = 0;
    for (const s of sentences) {
      const idx = Number(s.index);
      if (!Number.isFinite(idx)) continue;
      const pos = findSentenceOffsetInText(text, s.text, cursor);
      if (pos >= 0) {
        const len = String(s.text || '').trim().length;
        map.set(idx, { start: pos, end: Math.min(text.length, pos + len) });
        cursor = pos + Math.max(1, Math.floor(len * 0.7));
      }
    }
    return map;
  }

  /**
   * Computes non-overlapping verbatim highlight segments for a paragraph.
   * Guarantees `segments.map(s => s.text).join('') === text`.
   */
  function computeParagraphHighlights(text, items, sentences) {
    const source = String(text || '');
    const list = Array.isArray(items) ? items : [];
    if (!source) {
      return { segments: [], inlineItemIndices: new Set(), extraItems: list.slice() };
    }

    const sentenceOffsets = buildSentenceOffsetsMap(source, sentences);
    const candidates = [];

    for (const item of list) {
      const span = findTermSpanInText(source, item, sentenceOffsets);
      if (span && span.end > span.start) {
        candidates.push({
          item,
          start: span.start,
          end: span.end,
          len: span.end - span.start,
        });
      }
    }

    // Prefer longer spans first so multi-word expressions/structures win over nested single words
    candidates.sort((a, b) => b.len - a.len || a.start - b.start || Number(a.item.index) - Number(b.item.index));

    const accepted = [];
    const inlineItemIndices = new Set();

    for (const cand of candidates) {
      const overlaps = accepted.some((acc) => !(cand.end <= acc.start || cand.start >= acc.end));
      if (!overlaps) {
        accepted.push(cand);
        inlineItemIndices.add(Number(cand.item.index));
      }
    }

    accepted.sort((a, b) => a.start - b.start);

    const segments = [];
    let cursor = 0;
    for (const acc of accepted) {
      if (acc.start > cursor) {
        segments.push({
          type: 'text',
          text: source.slice(cursor, acc.start),
          start: cursor,
          end: acc.start,
        });
      }
      segments.push({
        type: 'highlight',
        text: source.slice(acc.start, acc.end),
        start: acc.start,
        end: acc.end,
        item: acc.item,
        groupId: getMacroGroupId(acc.item.category),
      });
      cursor = acc.end;
    }

    if (cursor < source.length) {
      segments.push({
        type: 'text',
        text: source.slice(cursor),
        start: cursor,
        end: source.length,
      });
    }

    const extraItems = list.filter((it) => !inlineItemIndices.has(Number(it.index)));
    return { segments, inlineItemIndices, extraItems };
  }

  /**
   * Builds shortest meaningful complete-thought paragraphs and anchors extracted
   * insights to each paragraph without repeating paragraphs per item.
   */
  function buildThoughtParagraphs(lesson, filteredItems, allItems) {
    const items = Array.isArray(filteredItems) ? filteredItems : [];
    const totalPool = Array.isArray(allItems) ? allItems : items;
    if (items.length === 0) return [];

    const sentences = Array.isArray(lesson?.sentences) ? lesson.sentences : [];
    const sentenceByIndex = new Map();
    for (const s of sentences) {
      const idx = Number(s?.index);
      if (Number.isFinite(idx)) sentenceByIndex.set(idx, s);
    }

    const rawParagraphs =
      (Array.isArray(lesson?.transcriptData?.reviewed?.paragraphs) &&
        lesson.transcriptData.reviewed.paragraphs.length > 0 &&
        lesson.transcriptData.reviewed.paragraphs) ||
      (Array.isArray(lesson?.transcriptData?.raw?.paragraphs) &&
        lesson.transcriptData.raw.paragraphs.length > 0 &&
        lesson.transcriptData.raw.paragraphs) ||
      (Array.isArray(lesson?.chunks) && lesson.chunks.length > 0 && lesson.chunks) ||
      [];

    let baseUnits = [];

    if (rawParagraphs.length > 0) {
      for (const para of rawParagraphs) {
        const sIndices = Array.isArray(para.sentenceIndices)
          ? para.sentenceIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n))
          : [];
        const paraSentences = sIndices.map((idx) => sentenceByIndex.get(idx)).filter(Boolean);

        if (paraSentences.length > 0) {
          const joined = paraSentences.map((s) => String(s.text || '').trim()).filter(Boolean).join(' ');
          if (paraSentences.length <= 3 && countWords(joined) <= 55) {
            baseUnits.push({
              text: joined || String(para.text || '').trim(),
              sentences: paraSentences,
              sentenceIndices: paraSentences.map((s) => Number(s.index)),
              speaker: para.speaker || paraSentences[0].speaker || '',
              speakerId: para.speakerId || paraSentences[0].speakerId || '',
              startSec: typeof para.startSec === 'number' ? para.startSec : paraSentences[0].startSec ?? null,
              endSec:
                typeof para.endSec === 'number'
                  ? para.endSec
                  : paraSentences[paraSentences.length - 1].endSec ?? null,
            });
          } else {
            baseUnits.push(
              ...splitLongParagraphIntoThoughts(paraSentences, para.speaker || '', para.speakerId || ''),
            );
          }
        } else if (String(para.text || '').trim()) {
          baseUnits.push({
            text: String(para.text).trim(),
            sentences: [],
            sentenceIndices: sIndices,
            speaker: para.speaker || '',
            speakerId: para.speakerId || '',
            startSec: typeof para.startSec === 'number' ? para.startSec : null,
            endSec: typeof para.endSec === 'number' ? para.endSec : null,
          });
        }
      }
    } else if (sentences.length > 0) {
      baseUnits = splitLongParagraphIntoThoughts(sentences, '', '');
    }

    const preparedUnits = baseUnits.map((u, idx) => ({
      ...u,
      _baseIdx: idx,
      _sentenceSet: new Set(u.sentenceIndices || []),
      _normText: normalizeForMatch(u.text),
      items: [],
      allPoolCount: 0,
    }));

    const findBestUnitForItem = (item) => {
      if (preparedUnits.length === 0) return null;

      // 1. Direct sentenceIndex match
      const sentIdx = Number(item.sentenceIndex);
      if (Number.isFinite(sentIdx) && sentIdx > 0) {
        const direct = preparedUnits.find((u) => u._sentenceSet.has(sentIdx));
        if (direct) return direct;
      }

      // 2. Timestamp overlap match
      const itemStart =
        typeof item.phraseStartSec === 'number'
          ? item.phraseStartSec
          : typeof item.startSec === 'number'
            ? item.startSec
            : null;
      if (itemStart !== null) {
        const timeMatch = preparedUnits.find(
          (u) =>
            typeof u.startSec === 'number' &&
            typeof u.endSec === 'number' &&
            itemStart >= u.startSec - 0.5 &&
            itemStart <= u.endSec + 0.5,
        );
        if (timeMatch) return timeMatch;
      }

      // 3. Normalized substring match
      const surfaceNorm = normalizeForMatch(item.surface || '');
      const termNorm = normalizeForMatch(item.term || '');
      const needle = surfaceNorm.length >= 3 ? surfaceNorm : termNorm;
      if (needle.length >= 3) {
        const textMatch = preparedUnits.find((u) => u._normText.includes(needle));
        if (textMatch) return textMatch;
      }

      return null;
    };

    for (const poolItem of totalPool) {
      const target = findBestUnitForItem(poolItem);
      if (target) target.allPoolCount += 1;
    }

    const unanchored = [];
    for (const item of items) {
      const target = findBestUnitForItem(item);
      if (target) {
        target.items.push(item);
      } else {
        unanchored.push(item);
      }
    }

    // Group any unanchored items (or lessons without transcript paragraphs) by normalized contextSentence
    if (unanchored.length > 0) {
      const fallbackMap = new Map();
      for (const item of unanchored) {
        const quote = String(item.contextSentence || '').trim();
        const key = normalizeForMatch(quote) || `standalone_${item.index}`;
        let group = fallbackMap.get(key);
        if (!group) {
          group = {
            text: quote || String(item.surface || item.term || ''),
            sentences: [],
            sentenceIndices: Number.isFinite(Number(item.sentenceIndex)) ? [Number(item.sentenceIndex)] : [],
            speaker: '',
            speakerId: '',
            startSec: typeof item.startSec === 'number' ? item.startSec : null,
            endSec: typeof item.endSec === 'number' ? item.endSec : null,
            items: [],
            allPoolCount: 0,
          };
          fallbackMap.set(key, group);
        } else {
          if (
            Number.isFinite(Number(item.sentenceIndex)) &&
            !group.sentenceIndices.includes(Number(item.sentenceIndex))
          ) {
            group.sentenceIndices.push(Number(item.sentenceIndex));
          }
          if (typeof item.startSec === 'number') {
            group.startSec = group.startSec === null ? item.startSec : Math.min(group.startSec, item.startSec);
          }
          if (typeof item.endSec === 'number') {
            group.endSec = group.endSec === null ? item.endSec : Math.max(group.endSec, item.endSec);
          }
        }
        group.items.push(item);
        group.allPoolCount += 1;
      }
      preparedUnits.push(...fallbackMap.values());
    }

    // Keep only non-empty units and enrich with highlight & reading-order item sorting
    const activeUnits = preparedUnits.filter((u) => u.items.length > 0);
    return activeUnits.map((unit, idx) => {
      const sentenceOffsets = buildSentenceOffsetsMap(unit.text, unit.sentences);
      const itemOrderMap = new Map();
      for (const it of unit.items) {
        const span = findTermSpanInText(unit.text, it, sentenceOffsets);
        itemOrderMap.set(Number(it.index), span ? span.start : 1e9 + Number(it.index));
      }

      const orderedItems = unit.items
        .slice()
        .sort((a, b) => (itemOrderMap.get(Number(a.index)) || 0) - (itemOrderMap.get(Number(b.index)) || 0));

      const highlights = computeParagraphHighlights(unit.text, orderedItems, unit.sentences);

      return {
        id: `thought-${idx + 1}`,
        index: idx + 1,
        text: unit.text,
        sentences: unit.sentences,
        sentenceIndices: unit.sentenceIndices,
        speaker: unit.speaker,
        speakerId: unit.speakerId,
        startSec: unit.startSec,
        endSec: unit.endSec,
        items: orderedItems,
        allPoolCount: Math.max(orderedItems.length, unit.allPoolCount || 0),
        highlights,
      };
    });
  }

  /**
   * Computes per-paragraph statistics and strictly child-derived mastery.
   */
  function computeParagraphStats(unit, doneSet) {
    const text = String(unit?.text || '');
    const items = Array.isArray(unit?.items) ? unit.items : [];
    const completedSet = doneSet instanceof Set ? doneSet : new Set();

    const wordCount = countWords(text);
    const sentenceCount =
      Array.isArray(unit?.sentences) && unit.sentences.length > 0
        ? unit.sentences.length
        : Array.isArray(unit?.sentenceIndices) && unit.sentenceIndices.length > 0
          ? unit.sentenceIndices.length
          : 1;

    const hasTiming =
      typeof unit?.startSec === 'number' &&
      typeof unit?.endSec === 'number' &&
      unit.endSec > unit.startSec;
    const durationSec = hasTiming ? Math.round((unit.endSec - unit.startSec) * 10) / 10 : null;
    const wpm = durationSec !== null && durationSec >= 1.5 ? Math.round((wordCount / durationSec) * 60) : null;
    const paceLabel =
      wpm === null ? null : wpm >= 175 ? 'Fast' : wpm >= 135 ? 'Conversational' : 'Measured';

    const cefrSet = new Set();
    for (const it of items) {
      const lv = String(it.cefr || '').trim().toUpperCase();
      if (CEFR_ORDER[lv]) cefrSet.add(lv);
    }
    const cefrLevels = Array.from(cefrSet).sort((a, b) => CEFR_ORDER[a] - CEFR_ORDER[b]);
    const cefrRange =
      cefrLevels.length === 0
        ? ''
        : cefrLevels.length === 1
          ? cefrLevels[0]
          : `${cefrLevels[0]}–${cefrLevels[cefrLevels.length - 1]}`;

    const totalInsights = items.length;
    const studiedInsights = items.filter((it) => completedSet.has(Number(it.index))).length;
    const progressPct = totalInsights > 0 ? Math.round((studiedInsights / totalInsights) * 100) : 0;
    const isComplete = totalInsights > 0 && studiedInsights === totalInsights;

    const groupCounts = new Map();
    for (const it of items) {
      const gid = getMacroGroupId(it.category);
      groupCounts.set(gid, (groupCounts.get(gid) || 0) + 1);
    }
    const groupBreakdown = MACRO_GROUPS.map((g) => ({
      groupId: g.id,
      label: g.label,
      count: groupCounts.get(g.id) || 0,
    })).filter((g) => g.count > 0);

    return {
      wordCount,
      sentenceCount,
      durationSec,
      wpm,
      paceLabel,
      cefrLevels,
      cefrRange,
      totalInsights,
      studiedInsights,
      progressPct,
      isComplete,
      groupBreakdown,
    };
  }

  /**
   * Extracts deterministic Native American idea-flow & sentence-construction cues.
   */
  function analyzeNativeFlow(unit) {
    const text = String(unit?.text || '');
    const items = Array.isArray(unit?.items) ? unit.items : [];

    const prioritized = items.filter((it) => FLOW_PRIORITY_CATEGORIES.has(String(it.category || '')));
    const chipSource = (prioritized.length >= 2 ? prioritized : items).slice(0, 5);

    const flowChips = chipSource.map((it) => ({
      itemIndex: Number(it.index),
      label: String(it.surface || it.term || '').trim(),
      role: getNativeRoleLabel(it),
      groupId: getMacroGroupId(it.category),
    }));

    const seenContractions = new Set();
    const contractions = [];
    const matches = text.match(CONTRACTION_RE) || [];
    for (const m of matches) {
      const norm = m.toLowerCase();
      if (!seenContractions.has(norm)) {
        seenContractions.add(norm);
        contractions.push(m);
        if (contractions.length >= 5) break;
      }
    }

    const stats = computeParagraphStats(unit);
    const hasConnector = items.some((it) =>
      ['discourse_marker', 'grammar_structure', 'pattern'].includes(String(it.category || '')),
    );
    const hasSpoken =
      contractions.length > 0 ||
      items.some((it) =>
        ['connected_speech', 'contraction_reduction', 'linking_sound_changes'].includes(
          String(it.category || ''),
        ),
      );
    const hasIdiomOrPhrasal = items.some((it) =>
      ['idiom', 'phrasal_verb', 'conversational_expression', 'slang'].includes(String(it.category || '')),
    );

    const parts = [];
    if (stats.sentenceCount > 1) {
      parts.push(`Links ${stats.sentenceCount} connected clauses into one fluid thought`);
    } else {
      parts.push('Packages a complete spoken thought in one compact clause');
    }

    if (hasConnector && hasIdiomOrPhrasal) {
      parts.push('bridging ideas with natural connectors and everyday expressions');
    } else if (hasConnector) {
      parts.push('using conversational framing to guide the listener smoothly');
    } else if (hasIdiomOrPhrasal) {
      parts.push('relying on high-frequency phrasal verbs and native phrasing');
    }

    if (hasSpoken) {
      parts.push(
        contractions.length > 0
          ? `with natural spoken compression (${contractions.slice(0, 2).join(', ')})`
          : 'with natural spoken linking and reductions',
      );
    }

    let constructionNote = parts.join(', ') + '.';
    constructionNote = constructionNote.charAt(0).toUpperCase() + constructionNote.slice(1);

    return {
      flowChips,
      contractions,
      constructionNote,
    };
  }

  return {
    MACRO_GROUPS,
    CATEGORY_LABELS,
    getMacroGroupId,
    getMacroGroupLabel,
    getCategoryLabel,
    getNativeRoleLabel,
    buildThoughtParagraphs,
    computeParagraphHighlights,
    computeParagraphStats,
    analyzeNativeFlow,
  };
});
