/* ==========================================================================
   ANYTHING TO PHRASES — ORIGINAL SOURCE AUDIO & VIDEO SEGMENT PLAYER
   Single responsibility:
   - Plays exact millisecond [startSec, endSec] clips from the original source
     (YouTube IFrame player or persisted HTML5 <audio>/<video> Range stream).
   - Supports instant Audio-only <-> Original Video switching without losing
     playback position or reloading media.
   - Completely independent from browser TTS (FlaptapUtils.speak).
   - Handles unavailable/blocked media gracefully without breaking study cards.
   ========================================================================== */

(function (global) {
  'use strict';

  function formatTs(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }
    return `${mins}:${String(rem).padStart(2, '0')}`;
  }

  let ytApiPromise = null;
  function ensureYouTubeApi() {
    if (global.YT && global.YT.Player) return Promise.resolve(global.YT);
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
      const prevReady = global.onYouTubeIframeAPIReady;
      const timer = setTimeout(() => reject(new Error('YouTube player failed to load.')), 12000);
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

  function create(options = {}) {
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {};
    const escapeHtml = global.FlaptapUtils?.escapeHtml || ((s) => String(s || ''));

    const state = {
      mountEl: null,
      media: null, // { hasAudio, hasVideo, mediaKind, mediaId, durationSeconds, streamUrl }
      mode: 'audio', // 'audio' | 'video'
      speed: 1,
      playing: false,
      loading: false,
      error: '',
      activeItemIndex: null,
      activeClip: null, // { index, term, startSec, endSec }
      currentTime: 0,
      ytPlayer: null,
      ytReady: false,
      ytInitPromise: null,
      htmlMediaEl: null,
      watchTimer: null,
      pendingClip: null,
    };

    function hasPlayableMedia() {
      const m = state.media;
      if (!m || !m.hasAudio) return false;
      if (m.mediaKind === 'youtube' && m.mediaId) return true;
      if ((m.mediaKind === 'audio' || m.mediaKind === 'video') && m.streamUrl) return true;
      return false;
    }

    function stopWatcher() {
      if (state.watchTimer) {
        clearInterval(state.watchTimer);
        state.watchTimer = null;
      }
    }

    function notify() {
      syncDockUi();
      onStateChange({
        playing: state.playing,
        loading: state.loading,
        activeItemIndex: state.activeItemIndex,
        mode: state.mode,
        error: state.error,
      });
    }

    function mount(mountEl, mediaInfo) {
      destroy();
      state.mountEl = mountEl;
      state.media = mediaInfo || null;
      state.mode = 'audio';
      state.error = '';
      state.activeItemIndex = null;
      state.activeClip = null;
      state.playing = false;
      state.loading = false;

      if (!mountEl) return;
      if (!hasPlayableMedia()) {
        mountEl.hidden = true;
        mountEl.innerHTML = '';
        return;
      }

      mountEl.hidden = false;
      renderDockShell();
      syncDockUi();
    }

    function renderDockShell() {
      if (!state.mountEl || !state.media) return;
      const canVideo = Boolean(state.media.hasVideo);
      const kindLabel =
        state.media.mediaKind === 'youtube'
          ? 'Original YouTube media'
          : state.media.hasVideo
            ? 'Original uploaded video'
            : 'Original uploaded audio';

      state.mountEl.innerHTML = `
        <div class="aex-media-stage" id="aex-media-stage" data-mode="audio">
          <div class="aex-media-video-wrap" id="aex-media-video-wrap" hidden>
            <div class="aex-media-player-slot" id="aex-media-player-slot"></div>
          </div>
          <div class="aex-media-bar">
            <div class="aex-media-bar-left">
              <button type="button" class="aex-media-play-btn" id="aex-media-toggle-btn" aria-label="Play or pause original clip" title="Play / Pause original clip">
                <svg class="aex-media-ico-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.8v14.4a.9.9 0 0 0 1.38.76l11.2-7.2a.9.9 0 0 0 0-1.52l-11.2-7.2a.9.9 0 0 0-1.38.76Z"></path></svg>
                <svg class="aex-media-ico-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden><rect x="6" y="4.5" width="4" height="15" rx="1.2"></rect><rect x="14" y="4.5" width="4" height="15" rx="1.2"></rect></svg>
              </button>
              <button type="button" class="aex-icon-btn aex-media-replay-btn" id="aex-media-replay-btn" aria-label="Replay clip" title="Replay current clip" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
              </button>
              <div class="aex-media-copy">
                <div class="aex-media-label-row">
                  <span class="aex-media-title" id="aex-media-clip-title">${escapeHtml(kindLabel)}</span>
                  <span class="aex-media-time ltr-num" id="aex-media-time-label">Click any phrase clip to listen</span>
                </div>
                <div class="aex-media-progress-track" aria-hidden="true">
                  <div class="aex-media-progress-fill" id="aex-media-progress-fill" style="width: 0%"></div>
                </div>
              </div>
            </div>
            <div class="aex-media-bar-right">
              <div class="aex-media-speed-group" role="group" aria-label="Playback speed">
                <button type="button" class="aex-media-chip" data-aex-speed="0.75" aria-pressed="false">0.75x</button>
                <button type="button" class="aex-media-chip is-active" data-aex-speed="1" aria-pressed="true">1x</button>
              </div>
              ${
                canVideo
                  ? `<div class="aex-media-mode-switch" role="group" aria-label="Media playback mode">
                       <button type="button" class="aex-media-mode-btn is-active" data-aex-media-mode="audio" aria-pressed="true">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
                         <span>Audio</span>
                       </button>
                       <button type="button" class="aex-media-mode-btn" data-aex-media-mode="video" aria-pressed="false">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                         <span>Video</span>
                       </button>
                     </div>`
                  : ''
              }
            </div>
          </div>
          <div class="aex-media-error" id="aex-media-error" hidden></div>
        </div>
      `;

      state.mountEl.querySelector('#aex-media-toggle-btn')?.addEventListener('click', () => {
        if (state.playing) {
          pause();
        } else if (state.activeClip) {
          playClip(state.activeClip);
        } else {
          playClip({ index: -1, term: state.media.mediaKind === 'youtube' ? 'Original video' : 'Original audio', startSec: 0, endSec: Math.min(state.media.durationSeconds || 15, 15) });
        }
      });

      state.mountEl.querySelector('#aex-media-replay-btn')?.addEventListener('click', () => {
        if (state.activeClip) playClip(state.activeClip);
      });

      state.mountEl.querySelectorAll('[data-aex-speed]').forEach((btn) => {
        btn.addEventListener('click', () => {
          setSpeed(Number(btn.dataset.aexSpeed) || 1);
        });
      });

      state.mountEl.querySelectorAll('[data-aex-media-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          setMode(btn.dataset.aexMediaMode === 'video' ? 'video' : 'audio');
        });
      });
    }

    function syncDockUi() {
      if (!state.mountEl) return;
      const stage = state.mountEl.querySelector('#aex-media-stage');
      const videoWrap = state.mountEl.querySelector('#aex-media-video-wrap');
      const playBtn = state.mountEl.querySelector('#aex-media-toggle-btn');
      const playIco = state.mountEl.querySelector('.aex-media-ico-play');
      const pauseIco = state.mountEl.querySelector('.aex-media-ico-pause');
      const replayBtn = state.mountEl.querySelector('#aex-media-replay-btn');
      const titleEl = state.mountEl.querySelector('#aex-media-clip-title');
      const timeEl = state.mountEl.querySelector('#aex-media-time-label');
      const fillEl = state.mountEl.querySelector('#aex-media-progress-fill');
      const errEl = state.mountEl.querySelector('#aex-media-error');

      if (stage) {
        stage.dataset.mode = state.mode;
        stage.classList.toggle('is-playing', state.playing);
      }
      if (playBtn) {
        playBtn.classList.toggle('is-playing', state.playing);
        playBtn.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
      }
      if (videoWrap) {
        // Keep DOM mounted for YouTube audio engine while visually collapsing in audio-only mode
        const showVideo = state.mode === 'video' && Boolean(state.media?.hasVideo);
        videoWrap.hidden = !showVideo && !state.ytPlayer && !state.htmlMediaEl;
        videoWrap.classList.toggle('is-audio-hidden', !showVideo);
      }
      if (playIco) playIco.toggleAttribute('hidden', state.playing);
      if (pauseIco) pauseIco.toggleAttribute('hidden', !state.playing);
      if (replayBtn) replayBtn.disabled = !state.activeClip;

      if (titleEl && state.activeClip) {
        titleEl.textContent = state.activeClip.term || 'Original clip';
      }
      if (timeEl) {
        if (state.loading) {
          timeEl.textContent = 'Loading original media…';
        } else if (state.activeClip) {
          timeEl.textContent = `${formatTs(state.activeClip.startSec)} – ${formatTs(state.activeClip.endSec)}`;
        }
      }
      if (fillEl && state.activeClip) {
        const span = Math.max(0.1, state.activeClip.endSec - state.activeClip.startSec);
        const pct = Math.max(0, Math.min(100, ((state.currentTime - state.activeClip.startSec) / span) * 100));
        fillEl.style.width = `${pct.toFixed(1)}%`;
      } else if (fillEl) {
        fillEl.style.width = '0%';
      }

      if (errEl) {
        errEl.hidden = !state.error;
        errEl.textContent = state.error;
      }

      state.mountEl.querySelectorAll('[data-aex-media-mode]').forEach((btn) => {
        const active = btn.dataset.aexMediaMode === state.mode;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      state.mountEl.querySelectorAll('[data-aex-speed]').forEach((btn) => {
        const active = Math.abs(Number(btn.dataset.aexSpeed) - state.speed) < 0.01;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    function setSpeed(rate) {
      state.speed = rate === 0.75 ? 0.75 : 1;
      try {
        if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.setPlaybackRate === 'function') {
          state.ytPlayer.setPlaybackRate(state.speed);
        }
        if (state.htmlMediaEl) {
          state.htmlMediaEl.playbackRate = state.speed;
        }
      } catch {}
      syncDockUi();
    }

    function setMode(nextMode) {
      if (nextMode === 'video' && !state.media?.hasVideo) return;
      state.mode = nextMode === 'video' ? 'video' : 'audio';
      if (state.mode === 'video') {
        ensureEngineReady().catch(() => {});
      }
      syncDockUi();
    }

    async function ensureEngineReady() {
      if (!hasPlayableMedia()) {
        throw new Error('Original media is not available for this source.');
      }

      if (state.media.mediaKind === 'youtube') {
        if (state.ytPlayer && state.ytReady) return;
        if (state.ytInitPromise) return state.ytInitPromise;

        state.loading = true;
        state.error = '';
        notify();

        state.ytInitPromise = ensureYouTubeApi()
          .then((YT) => new Promise((resolve, reject) => {
            const slot = state.mountEl?.querySelector('#aex-media-player-slot');
            if (!slot) {
              reject(new Error('Media player container unavailable.'));
              return;
            }
            slot.innerHTML = '<div id="aex-yt-iframe-host"></div>';
            const hostEl = slot.querySelector('#aex-yt-iframe-host');
            const videoWrap = state.mountEl?.querySelector('#aex-media-video-wrap');
            if (videoWrap) videoWrap.hidden = false;

            const readyTimer = setTimeout(() => {
              reject(new Error('YouTube player timed out.'));
            }, 14000);

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
                  try { state.ytPlayer.setPlaybackRate(state.speed); } catch {}
                  resolve();
                },
                onStateChange: (ev) => {
                  const YTState = global.YT?.PlayerState || {};
                  if (ev.data === YTState.PLAYING) {
                    state.playing = true;
                    startBoundaryWatcher();
                    notify();
                  } else if (ev.data === YTState.PAUSED || ev.data === YTState.ENDED) {
                    state.playing = false;
                    stopWatcher();
                    notify();
                  }
                },
                onError: () => {
                  clearTimeout(readyTimer);
                  state.loading = false;
                  state.playing = false;
                  state.error = 'Original YouTube media could not be embedded — use TTS pronunciation instead.';
                  stopWatcher();
                  notify();
                  reject(new Error(state.error));
                },
              },
            });
          }))
          .catch((err) => {
            state.ytInitPromise = null;
            state.loading = false;
            state.error = err?.message || 'Original media unavailable — use TTS pronunciation instead.';
            notify();
            throw err;
          });

        return state.ytInitPromise;
      }

      // Persisted local HTML5 <audio> or <video> stream with Range support
      if (state.htmlMediaEl) return;
      const slot = state.mountEl?.querySelector('#aex-media-player-slot');
      if (!slot) throw new Error('Media container unavailable.');

      const tag = state.media.hasVideo ? 'video' : 'audio';
      const el = document.createElement(tag);
      el.className = tag === 'video' ? 'aex-html5-video' : 'aex-html5-audio';
      el.setAttribute('playsinline', '');
      el.setAttribute('preload', 'metadata');
      if (tag === 'video') el.setAttribute('controls', '');
      el.src = state.media.streamUrl;
      el.playbackRate = state.speed;
      slot.innerHTML = '';
      slot.appendChild(el);
      state.htmlMediaEl = el;

      const videoWrap = state.mountEl?.querySelector('#aex-media-video-wrap');
      if (videoWrap) videoWrap.hidden = false;

      el.addEventListener('play', () => {
        state.playing = true;
        state.loading = false;
        startBoundaryWatcher();
        notify();
      });
      el.addEventListener('pause', () => {
        state.playing = false;
        stopWatcher();
        notify();
      });
      el.addEventListener('ended', () => {
        state.playing = false;
        stopWatcher();
        notify();
      });
      el.addEventListener('error', () => {
        state.playing = false;
        state.loading = false;
        state.error = 'Original media file unavailable — use TTS pronunciation instead.';
        stopWatcher();
        notify();
      });
    }

    function startBoundaryWatcher() {
      stopWatcher();
      state.watchTimer = setInterval(() => {
        if (!state.activeClip) return;
        let now = state.currentTime;
        try {
          if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.getCurrentTime === 'function') {
            now = Number(state.ytPlayer.getCurrentTime()) || 0;
          } else if (state.htmlMediaEl) {
            now = Number(state.htmlMediaEl.currentTime) || 0;
          }
        } catch {}

        state.currentTime = now;
        syncDockUi();

        if (now >= state.activeClip.endSec - 0.03) {
          pause();
          state.currentTime = state.activeClip.endSec;
          syncDockUi();
        }
      }, 50);
    }

    async function playClip(clip) {
      if (!clip || typeof clip.startSec !== 'number' || typeof clip.endSec !== 'number') return;

      // Toggle pause if clicking the currently playing clip
      if (state.playing && state.activeItemIndex === clip.index) {
        pause();
        return;
      }

      // Stop TTS if speaking so original audio never overlaps TTS
      try {
        if (global.speechSynthesis) global.speechSynthesis.cancel();
      } catch {}

      state.activeClip = {
        index: clip.index,
        term: clip.term || 'Original clip',
        startSec: Math.max(0, Number(clip.startSec) || 0),
        endSec: Math.max(Number(clip.startSec) + 0.4, Number(clip.endSec) || 1),
      };
      state.activeItemIndex = clip.index;
      state.currentTime = state.activeClip.startSec;
      state.error = '';
      notify();

      try {
        await ensureEngineReady();
        if (state.ytPlayer && state.ytReady) {
          state.ytPlayer.setPlaybackRate(state.speed);
          state.ytPlayer.seekTo(state.activeClip.startSec, true);
          state.ytPlayer.playVideo();
          state.playing = true;
          startBoundaryWatcher();
          notify();
        } else if (state.htmlMediaEl) {
          state.htmlMediaEl.playbackRate = state.speed;
          state.htmlMediaEl.currentTime = state.activeClip.startSec;
          const p = state.htmlMediaEl.play();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              state.playing = false;
              state.error = 'Playback was blocked by the browser. Click Play again.';
              notify();
            });
          }
        }
      } catch {
        state.playing = false;
        notify();
      }
    }

    function pause() {
      stopWatcher();
      try {
        if (state.ytPlayer && state.ytReady && typeof state.ytPlayer.pauseVideo === 'function') {
          state.ytPlayer.pauseVideo();
        }
        if (state.htmlMediaEl) {
          state.htmlMediaEl.pause();
        }
      } catch {}
      state.playing = false;
      notify();
    }

    function destroy() {
      stopWatcher();
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
      state.activeItemIndex = null;
      state.activeClip = null;
      state.error = '';
    }

    return {
      mount,
      playClip,
      pause,
      setMode,
      setSpeed,
      destroy,
      isPlayingItem(index) {
        return state.playing && state.activeItemIndex === Number(index);
      },
      hasPlayableMedia,
    };
  }

  global.FlaptapA2PMediaPlayer = { create, formatTs };
})(window);
