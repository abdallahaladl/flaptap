/* ==========================================================================
   FLAPTAP SHARED MILLISECOND MEDIA ENGINE (shared-media-engine.js)
   Single reusable playback engine for YouTube IFrame & HTML5 <audio>/<video>
   HTTP 206 Range streams with:
   - True millisecond word-click playback (`playWord`) with configurable pad
   - High-precision 60fps requestAnimationFrame + dead-reckoning clock sync
     (prevents YouTube postMessage flooding while staying millisecond-accurate)
   - Range playback, Word/Sentence looping, and Shadow Pause speaking gaps
   - Instant Audio-only <-> Original Video mode switching without reload
   ========================================================================== */

(function (global) {
  'use strict';

  const SPEED_OPTIONS = [0.5, 0.75, 0.85, 1, 1.25, 1.5];

  let ytApiPromise = null;
  function ensureYouTubeApi() {
    if (global.YT && global.YT.Player) return Promise.resolve(global.YT);
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
      const prevReady = global.onYouTubeIframeAPIReady;
      const timer = setTimeout(() => {
        ytApiPromise = null;
        reject(new Error('YouTube player failed to load.'));
      }, 12000);
      global.onYouTubeIframeAPIReady = function () {
        clearTimeout(timer);
        if (typeof prevReady === 'function') {
          try { prevReady(); } catch {}
        }
        resolve(global.YT);
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => {
          clearTimeout(timer);
          ytApiPromise = null;
          reject(new Error('YouTube player could not be loaded.'));
        };
        document.head.appendChild(script);
      }
    });
    return ytApiPromise;
  }

  function formatMs(ms) {
    const safe = Math.max(0, Math.round(Number(ms) || 0));
    const h = Math.floor(safe / 3600000);
    const m = Math.floor((safe % 3600000) / 60000);
    const s = Math.floor((safe % 60000) / 1000);
    const rem = safe % 1000;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
  }

  function formatShort(ms) {
    const safe = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function create(options = {}) {
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {};
    const onTimeUpdate = typeof options.onTimeUpdate === 'function' ? options.onTimeUpdate : () => {};
    const onShadowPause = typeof options.onShadowPause === 'function' ? options.onShadowPause : () => {};
    const onRangeEnd = typeof options.onRangeEnd === 'function' ? options.onRangeEnd : () => {};

    const state = {
      slotEl: null,
      media: null, // { hasAudio, hasVideo, mediaKind, mediaId, streamUrl, durationSeconds }
      speed: 1,
      loopMode: 'off', // 'off' | 'word' | 'sentence' | 'shadow'
      wordPadMode: 'natural', // 'natural' (-25ms/+55ms) | 'exact' (0ms)
      playing: false,
      loading: false,
      error: '',
      currentTimeMs: 0,
      durationMs: 0,
      activeRange: null, // { kind: 'word'|'sentence'|'range'|'continuous', startMs, endMs, rawStartMs, rawEndMs, label, meta }
      ytPlayer: null,
      ytReady: false,
      ytInitPromise: null,
      htmlMediaEl: null,
      rafId: null,
      lastYtPollPerf: 0,
      lastSyncedTimeMs: 0,
      lastSyncedPerf: 0,
      seekGraceUntilPerf: 0,
      shadowPauseTimer: null,
      shadowPauseRaf: null,
      shadowPauseEndPerf: 0,
      shadowPauseTotalMs: 0,
      loopCount: 0,
      destroyed: false,
    };

    function hasPlayableMedia() {
      const m = state.media;
      if (!m || !m.hasAudio) return false;
      if (m.mediaKind === 'youtube' && m.mediaId) return true;
      if ((m.mediaKind === 'audio' || m.mediaKind === 'video') && m.streamUrl) return true;
      return false;
    }

    function cancelShadowPause() {
      if (state.shadowPauseTimer) {
        clearTimeout(state.shadowPauseTimer);
        state.shadowPauseTimer = null;
      }
      if (state.shadowPauseRaf) {
        cancelAnimationFrame(state.shadowPauseRaf);
        state.shadowPauseRaf = null;
      }
      if (state.shadowPauseTotalMs > 0) {
        state.shadowPauseTotalMs = 0;
        state.shadowPauseEndPerf = 0;
        onShadowPause({ active: false, remainingMs: 0, totalMs: 0 });
      }
    }

    function stopClock() {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    }

    function notifyState() {
      onStateChange({
        playing: state.playing,
        loading: state.loading,
        error: state.error,
        speed: state.speed,
        loopMode: state.loopMode,
        wordPadMode: state.wordPadMode,
        currentTimeMs: state.currentTimeMs,
        durationMs: state.durationMs,
        activeRange: state.activeRange,
        loopCount: state.loopCount,
        hasPlayableMedia: hasPlayableMedia(),
        hasVideo: Boolean(state.media?.hasVideo),
      });
    }

    function readRawMediaTimeMs(forceYtPoll = false) {
      const nowPerf = performance.now();
      if (state.htmlMediaEl) {
        const ms = Math.round((Number(state.htmlMediaEl.currentTime) || 0) * 1000);
        state.lastSyncedTimeMs = ms;
        state.lastSyncedPerf = nowPerf;
        return ms;
      }
      if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.getCurrentTime === 'function') {
        // Throttle YT iframe postMessage reads to ~75ms and interpolate smoothly in between
        if (forceYtPoll || nowPerf - state.lastYtPollPerf >= 75) {
          try {
            const polledMs = Math.round((Number(state.ytPlayer.getCurrentTime()) || 0) * 1000);
            state.lastYtPollPerf = nowPerf;
            state.lastSyncedTimeMs = polledMs;
            state.lastSyncedPerf = nowPerf;
            return polledMs;
          } catch {}
        }
        const elapsed = Math.max(0, nowPerf - state.lastSyncedPerf);
        return Math.round(state.lastSyncedTimeMs + elapsed * state.speed);
      }
      return state.currentTimeMs;
    }

    function startClock() {
      stopClock();
      const tick = () => {
        if (!state.playing || state.destroyed) return;
        const nowPerf = performance.now();
        const nowMs = readRawMediaTimeMs(false);
        state.currentTimeMs = nowMs;
        onTimeUpdate(nowMs, state.activeRange);

        const range = state.activeRange;
        if (range && range.kind !== 'continuous' && Number.isFinite(range.endMs)) {
          // Guard against stale pre-seek timestamps right after seekTo()
          const inSeekGrace = nowPerf < state.seekGraceUntilPerf;
          const withinWindow = nowMs >= range.startMs - 450;
          if (!inSeekGrace && withinWindow && nowMs >= range.endMs - 14) {
            handleRangeBoundaryReached(range);
            return;
          }
        }

        state.rafId = requestAnimationFrame(tick);
      };
      state.rafId = requestAnimationFrame(tick);
    }

    function handleRangeBoundaryReached(range) {
      const shouldLoopWord = range.kind === 'word' && (state.loopMode === 'word' || range.forceLoop);
      const shouldLoopRange =
        (range.kind === 'sentence' || range.kind === 'range') &&
        (state.loopMode === 'sentence' || range.forceLoop);
      const shouldShadowPause =
        (range.kind === 'sentence' || range.kind === 'range') && state.loopMode === 'shadow';

      if (shouldLoopWord || shouldLoopRange) {
        state.loopCount += 1;
        seekEngine(range.startMs, true);
        notifyState();
        return;
      }

      if (shouldShadowPause) {
        pauseEngineOnly();
        state.playing = false;
        const spanMs = Math.max(900, range.endMs - range.startMs);
        const waitMs = Math.min(7500, Math.max(1300, Math.round(spanMs * 1.25)));
        state.shadowPauseTotalMs = waitMs;
        state.shadowPauseEndPerf = performance.now() + waitMs;
        notifyState();

        const tickCountdown = () => {
          const rem = Math.max(0, Math.round(state.shadowPauseEndPerf - performance.now()));
          onShadowPause({ active: rem > 0, remainingMs: rem, totalMs: waitMs, range });
          if (rem > 0 && state.shadowPauseTimer) {
            state.shadowPauseRaf = requestAnimationFrame(tickCountdown);
          }
        };
        state.shadowPauseRaf = requestAnimationFrame(tickCountdown);

        state.shadowPauseTimer = setTimeout(() => {
          cancelShadowPause();
          state.loopCount += 1;
          onRangeEnd(range, { shadowPauseComplete: true });
          // Replay or let caller advance via onRangeEnd
        }, waitMs);
        return;
      }

      pause();
      state.currentTimeMs = range.endMs;
      onTimeUpdate(range.endMs, range);
      onRangeEnd(range, { shadowPauseComplete: false });
    }

    function pauseEngineOnly() {
      stopClock();
      try {
        if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.pauseVideo === 'function') {
          state.ytPlayer.pauseVideo();
        }
        if (state.htmlMediaEl) {
          state.htmlMediaEl.pause();
        }
      } catch {}
    }

    function seekEngine(targetMs, autoPlay) {
      const sec = Math.max(0, (Number(targetMs) || 0) / 1000);
      const nowPerf = performance.now();
      state.currentTimeMs = Math.round(sec * 1000);
      state.lastSyncedTimeMs = state.currentTimeMs;
      state.lastSyncedPerf = nowPerf;
      state.lastYtPollPerf = nowPerf;
      state.seekGraceUntilPerf = nowPerf + (state.media?.mediaKind === 'youtube' ? 240 : 90);

      if (state.ytPlayer && state.ytReady) {
        try { state.ytPlayer.setPlaybackRate(state.speed); } catch {}
        state.ytPlayer.seekTo(sec, true);
        if (autoPlay) {
          state.ytPlayer.playVideo();
          state.playing = true;
          startClock();
        }
      } else if (state.htmlMediaEl) {
        state.htmlMediaEl.playbackRate = state.speed;
        state.htmlMediaEl.currentTime = sec;
        if (autoPlay) {
          const p = state.htmlMediaEl.play();
          state.playing = true;
          startClock();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              state.playing = false;
              state.error = 'Playback was blocked by the browser. Click again to play.';
              stopClock();
              notifyState();
            });
          }
        }
      }
    }

    async function ensureReady() {
      if (!hasPlayableMedia()) {
        throw new Error('Original media playback is unavailable for this transcript.');
      }
      if (!state.slotEl) {
        throw new Error('Media player mount slot is unavailable.');
      }

      if (state.media.mediaKind === 'youtube') {
        if (state.ytPlayer && state.ytReady) return;
        if (state.ytInitPromise) return state.ytInitPromise;

        state.loading = true;
        state.error = '';
        notifyState();

        state.ytInitPromise = ensureYouTubeApi()
          .then((YT) => new Promise((resolve, reject) => {
            if (state.destroyed || !state.slotEl) {
              reject(new Error('Media engine destroyed.'));
              return;
            }
            const hostId = `tlab-yt-host-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            state.slotEl.innerHTML = `<div id="${hostId}"></div>`;
            const hostEl = state.slotEl.querySelector(`#${hostId}`);
            const readyTimer = setTimeout(() => reject(new Error('YouTube player timed out.')), 14000);

            state.ytPlayer = new YT.Player(hostEl, {
              width: '100%',
              height: '100%',
              videoId: state.media.mediaId,
              playerVars: {
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                enablejsapi: 1,
                origin: global.location.origin,
              },
              events: {
                onReady: () => {
                  clearTimeout(readyTimer);
                  state.ytReady = true;
                  state.loading = false;
                  try {
                    state.ytPlayer.setPlaybackRate(state.speed);
                    const dur = Number(state.ytPlayer.getDuration?.() || 0);
                    if (dur > 0) state.durationMs = Math.round(dur * 1000);
                  } catch {}
                  notifyState();
                  resolve();
                },
                onStateChange: (ev) => {
                  const YTState = global.YT?.PlayerState || {};
                  if (ev.data === YTState.PLAYING) {
                    state.playing = true;
                    state.loading = false;
                    readRawMediaTimeMs(true);
                    startClock();
                    notifyState();
                  } else if (ev.data === YTState.PAUSED || ev.data === YTState.ENDED) {
                    state.playing = false;
                    stopClock();
                    notifyState();
                  }
                },
                onError: () => {
                  clearTimeout(readyTimer);
                  state.loading = false;
                  state.playing = false;
                  state.error = 'This YouTube video cannot be embedded here.';
                  stopClock();
                  notifyState();
                  reject(new Error(state.error));
                },
              },
            });
          }))
          .catch((err) => {
            state.ytInitPromise = null;
            state.loading = false;
            state.error = err?.message || 'Could not load YouTube player.';
            notifyState();
            throw err;
          });

        return state.ytInitPromise;
      }

      // Native HTML5 <video> or <audio> with HTTP 206 Range seeking
      if (state.htmlMediaEl) return;

      const tag = state.media.hasVideo ? 'video' : 'audio';
      const el = document.createElement(tag);
      el.className = tag === 'video' ? 'tlab-html5-video' : 'tlab-html5-audio';
      el.setAttribute('playsinline', '');
      el.setAttribute('preload', 'auto');
      if (tag === 'video') el.setAttribute('controls', '');
      el.src = state.media.streamUrl;
      el.playbackRate = state.speed;
      state.slotEl.innerHTML = '';
      state.slotEl.appendChild(el);
      state.htmlMediaEl = el;

      el.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(el.duration) && el.duration > 0) {
          state.durationMs = Math.round(el.duration * 1000);
          notifyState();
        }
      });
      el.addEventListener('play', () => {
        state.playing = true;
        state.loading = false;
        startClock();
        notifyState();
      });
      el.addEventListener('pause', () => {
        state.playing = false;
        stopClock();
        notifyState();
      });
      el.addEventListener('ended', () => {
        state.playing = false;
        stopClock();
        notifyState();
      });
      el.addEventListener('error', () => {
        state.playing = false;
        state.loading = false;
        state.error = 'Original audio/video stream could not be loaded.';
        stopClock();
        notifyState();
      });

      await new Promise((resolve) => {
        if (el.readyState >= 1) {
          resolve();
          return;
        }
        const done = () => {
          el.removeEventListener('loadedmetadata', done);
          el.removeEventListener('canplay', done);
          resolve();
        };
        el.addEventListener('loadedmetadata', done, { once: true });
        el.addEventListener('canplay', done, { once: true });
        setTimeout(done, 3500);
      });
    }

    function mount(slotEl, mediaInfo) {
      destroy();
      state.destroyed = false;
      state.slotEl = slotEl;
      state.media = mediaInfo || null;
      state.durationMs = Math.round((Number(mediaInfo?.durationSeconds) || 0) * 1000);
      state.error = '';
      state.currentTimeMs = 0;
      state.activeRange = null;
      notifyState();
    }

    /**
     * Plays an individual word at exact millisecond precision from the original media.
     */
    async function playWord(wordObj, opts = {}) {
      if (!wordObj || !Number.isFinite(Number(wordObj.startMs))) return;
      cancelShadowPause();
      try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch {}

      const rawStart = Math.max(0, Math.round(Number(wordObj.startMs)));
      const rawEnd = Math.max(rawStart + 80, Math.round(Number(wordObj.endMs) || rawStart + 240));
      const usePad = (opts.padMode || state.wordPadMode) === 'natural';
      const leadPad = usePad ? 25 : 0;
      const tailPad = usePad ? 55 : 0;
      const startMs = Math.max(0, rawStart - leadPad);
      const endMs = Math.max(startMs + 110, rawEnd + tailPad);

      state.loopCount = 0;
      state.activeRange = {
        kind: 'word',
        startMs,
        endMs,
        rawStartMs: rawStart,
        rawEndMs: rawEnd,
        label: wordObj.word || 'Word',
        meta: { word: wordObj, sentenceIndex: opts.sentenceIndex },
        forceLoop: Boolean(opts.loop),
      };
      state.error = '';
      notifyState();

      try {
        await ensureReady();
        seekEngine(startMs, true);
        notifyState();
      } catch {
        state.playing = false;
        notifyState();
      }
    }

    async function playRange(startMs, endMs, opts = {}) {
      cancelShadowPause();
      try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch {}

      const s = Math.max(0, Math.round(Number(startMs) || 0));
      const e = Math.max(s + 150, Math.round(Number(endMs) || s + 1000));
      state.loopCount = 0;
      state.activeRange = {
        kind: opts.kind || 'sentence',
        startMs: s,
        endMs: e,
        rawStartMs: s,
        rawEndMs: e,
        label: opts.label || 'Clip',
        meta: opts.meta || {},
        forceLoop: Boolean(opts.loop),
      };
      state.error = '';
      notifyState();

      try {
        await ensureReady();
        seekEngine(s, true);
        notifyState();
      } catch {
        state.playing = false;
        notifyState();
      }
    }

    async function playContinuousFrom(startMs, label = 'Playing') {
      cancelShadowPause();
      try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch {}

      const s = Math.max(0, Math.round(Number(startMs) || 0));
      state.loopCount = 0;
      state.activeRange = {
        kind: 'continuous',
        startMs: s,
        endMs: Infinity,
        rawStartMs: s,
        rawEndMs: Infinity,
        label,
        meta: {},
      };
      state.error = '';
      notifyState();

      try {
        await ensureReady();
        seekEngine(s, true);
        notifyState();
      } catch {
        state.playing = false;
        notifyState();
      }
    }

    function pause() {
      cancelShadowPause();
      pauseEngineOnly();
      state.playing = false;
      notifyState();
    }

    async function togglePlay() {
      if (state.playing) {
        pause();
        return;
      }
      if (state.activeRange && state.activeRange.kind !== 'continuous') {
        if (state.activeRange.kind === 'word' && state.activeRange.meta?.word) {
          await playWord(state.activeRange.meta.word, { sentenceIndex: state.activeRange.meta.sentenceIndex });
        } else {
          await playRange(state.activeRange.startMs, state.activeRange.endMs, {
            kind: state.activeRange.kind,
            label: state.activeRange.label,
            meta: state.activeRange.meta,
          });
        }
        return;
      }
      await playContinuousFrom(state.currentTimeMs || 0, 'Transcript');
    }

    async function replayActive() {
      if (!state.activeRange) {
        await playContinuousFrom(0, 'Transcript');
        return;
      }
      if (state.activeRange.kind === 'word' && state.activeRange.meta?.word) {
        await playWord(state.activeRange.meta.word, { sentenceIndex: state.activeRange.meta.sentenceIndex });
      } else if (state.activeRange.kind === 'continuous') {
        await playContinuousFrom(Math.max(0, state.currentTimeMs - 3000), state.activeRange.label);
      } else {
        await playRange(state.activeRange.startMs, state.activeRange.endMs, {
          kind: state.activeRange.kind,
          label: state.activeRange.label,
          meta: state.activeRange.meta,
        });
      }
    }

    function setSpeed(rate) {
      const next = SPEED_OPTIONS.includes(Number(rate)) ? Number(rate) : 1;
      state.speed = next;
      try {
        if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.setPlaybackRate === 'function') {
          state.ytPlayer.setPlaybackRate(next);
        }
        if (state.htmlMediaEl) {
          state.htmlMediaEl.playbackRate = next;
        }
      } catch {}
      notifyState();
    }

    function setLoopMode(mode) {
      const valid = ['off', 'word', 'sentence', 'shadow'];
      state.loopMode = valid.includes(mode) ? mode : 'off';
      cancelShadowPause();
      notifyState();
    }

    function setWordPadMode(mode) {
      state.wordPadMode = mode === 'exact' ? 'exact' : 'natural';
      notifyState();
    }

    function seek(targetMs) {
      const clamped = Math.max(0, Math.round(Number(targetMs) || 0));
      cancelShadowPause();
      seekEngine(clamped, state.playing);
      onTimeUpdate(clamped, state.activeRange);
      notifyState();
    }

    function destroy() {
      state.destroyed = true;
      cancelShadowPause();
      stopClock();
      try {
        if (state.ytPlayer && typeof state.ytPlayer.destroy === 'function') {
          state.ytPlayer.destroy();
        }
      } catch {}
      try {
        if (state.htmlMediaEl) {
          state.htmlMediaEl.pause();
          state.htmlMediaEl.removeAttribute('src');
          state.htmlMediaEl.load();
        }
      } catch {}
      state.ytPlayer = null;
      state.ytReady = false;
      state.ytInitPromise = null;
      state.htmlMediaEl = null;
      state.playing = false;
      state.loading = false;
      state.error = '';
      state.activeRange = null;
    }

    return {
      mount,
      ensureReady,
      playWord,
      playRange,
      playContinuousFrom,
      pause,
      togglePlay,
      replayActive,
      setSpeed,
      setLoopMode,
      setWordPadMode,
      seek,
      destroy,
      getState: () => ({ ...state }),
      hasPlayableMedia,
    };
  }

  global.FlaptapMediaEngine = {
    create,
    ensureYouTubeApi,
    formatMs,
    formatShort,
    SPEED_OPTIONS,
  };
})(window);
