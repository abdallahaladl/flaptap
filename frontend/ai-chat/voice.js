/* ==========================================================================
   FLAPTAP AI CHAT — VOICE DICTATION & TTS (frontend/ai-chat/voice.js)
   Dual-mode speech capture: Web Speech API live dictation + MediaRecorder
   Whisper/Groq server transcription fallback, plus clean TTS playback.
   ========================================================================== */

(function (global) {
  'use strict';

  function createVoiceController(opts = {}) {
    const state = {
      active: false,
      speaking: false,
      speakingId: '',
      lang: localStorage.getItem('flaptap_ask_voice_lang') || 'auto',
      recognition: null,
      mediaRecorder: null,
      mediaStream: null,
      audioChunks: [],
      liveText: '',
    };

    function notifySpeakState() {
      opts.onSpeakStateChange?.({
        speaking: state.speaking,
        messageId: state.speakingId,
      });
    }

    function resolveLang() {
      if (state.lang === 'en-US' || state.lang === 'ar-EG') return state.lang;
      const uiLang =
        global.FlaptapWorkspace?.getUiLang?.() ||
        global.studioState?.uiLang ||
        document.documentElement.getAttribute('lang') ||
        'en';
      return uiLang === 'ar' ? 'ar-EG' : 'en-US';
    }

    function cycleLang() {
      const order = ['auto', 'en-US', 'ar-EG'];
      state.lang = order[(order.indexOf(state.lang) + 1) % order.length];
      try {
        localStorage.setItem('flaptap_ask_voice_lang', state.lang);
      } catch {}
      opts.onStateChange?.({ active: state.active, lang: state.lang, status: '' });
      return state.lang;
    }

    function getLangBadge() {
      return { auto: 'Auto', 'en-US': 'EN', 'ar-EG': 'AR' }[state.lang] || 'Auto';
    }

    async function start(getCurrentInputValue, setInputValue) {
      if (state.active) {
        return stop({ autoSend: true, getCurrentInputValue, setInputValue });
      }

      const preExisting = String(getCurrentInputValue?.() || '').trim();
      state.liveText = '';
      state.audioChunks = [];
      let startedAny = false;

      const SpeechRec = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = resolveLang();
          rec.continuous = true;
          rec.interimResults = true;
          let finalAccum = '';
          rec.onresult = (ev) => {
            let interim = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const txt = ev.results[i][0]?.transcript || '';
              if (ev.results[i].isFinal) finalAccum += `${txt} `;
              else interim += txt;
            }
            state.liveText = `${finalAccum}${interim}`.replace(/\s+/g, ' ').trim();
            setInputValue?.(preExisting ? `${preExisting} ${state.liveText}`.trim() : state.liveText);
          };
          rec.onerror = () => {};
          rec.onend = () => {
            if (state.active && !state.mediaRecorder) {
              state.active = false;
              opts.onStateChange?.({ active: false, lang: state.lang, status: '' });
            }
          };
          rec.start();
          state.recognition = rec;
          startedAny = true;
        } catch {
          state.recognition = null;
        }
      }

      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          state.mediaStream = stream;
          const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
          const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
          const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) state.audioChunks.push(ev.data);
          };
          recorder.start(250);
          state.mediaRecorder = recorder;
          startedAny = true;
        } catch {
          if (!startedAny) {
            opts.onError?.('Microphone permission denied or unavailable.');
            return;
          }
        }
      }

      if (!startedAny) {
        opts.onError?.('Voice dictation is unavailable in this browser.');
        return;
      }

      state.active = true;
      opts.onStateChange?.({
        active: true,
        lang: state.lang,
        status: 'Listening… tap mic again to send',
      });
    }

    async function stop({ autoSend = true, getCurrentInputValue, setInputValue } = {}) {
      if (!state.active && !state.recognition && !state.mediaRecorder) return '';
      state.active = false;

      if (state.recognition) {
        try {
          state.recognition.stop();
        } catch {}
        state.recognition = null;
      }

      let blob = null;
      if (state.mediaRecorder) {
        const rec = state.mediaRecorder;
        state.mediaRecorder = null;
        blob = await new Promise((resolve) => {
          if (rec.state === 'inactive') {
            resolve(
              state.audioChunks.length
                ? new Blob(state.audioChunks, { type: rec.mimeType || 'audio/webm' })
                : null,
            );
            return;
          }
          rec.onstop = () => {
            resolve(
              state.audioChunks.length
                ? new Blob(state.audioChunks, { type: rec.mimeType || 'audio/webm' })
                : null,
            );
          };
          try {
            rec.stop();
          } catch {
            resolve(null);
          }
        });
      }

      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        state.mediaStream = null;
      }

      let finalText = String(state.liveText || getCurrentInputValue?.() || '').trim();

      if (!finalText && blob && blob.size >= 512 && global.FlaptapAiChatApi?.transcribeAudio) {
        opts.onStateChange?.({
          active: false,
          lang: state.lang,
          status: 'Transcribing voice message…',
        });
        try {
          const res = await global.FlaptapAiChatApi.transcribeAudio(blob);
          if (res?.text) {
            finalText = String(res.text).trim();
            setInputValue?.(finalText);
          }
        } catch {}
      }

      opts.onStateChange?.({ active: false, lang: state.lang, status: '' });

      if (finalText && autoSend) {
        opts.onTranscriptReady?.(finalText);
      }
      return finalText;
    }

    function stopSpeaking() {
      const wasSpeaking = state.speaking;
      state.speaking = false;
      state.speakingId = '';
      if (typeof global.speechSynthesis !== 'undefined') {
        try {
          global.speechSynthesis.cancel();
        } catch {}
      }
      if (wasSpeaking) notifySpeakState();
    }

    function speak(text, messageId = '') {
      const clean = String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_#`~>]/g, '')
        .trim();
      if (!clean) return false;

      if (state.speaking && (!messageId || state.speakingId === messageId)) {
        stopSpeaking();
        return false;
      }

      stopSpeaking();

      if (global.FlaptapWordLookup?.speakText && typeof global.speechSynthesis === 'undefined') {
        state.speaking = true;
        state.speakingId = messageId;
        notifySpeakState();
        global.FlaptapWordLookup.speakText(clean.slice(0, 1200));
        return true;
      }

      if (typeof global.speechSynthesis !== 'undefined') {
        try {
          global.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(clean.slice(0, 1200));
          u.lang = /[\u0600-\u06FF]/.test(clean) ? 'ar-EG' : 'en-US';
          u.rate = 0.96;
          state.speaking = true;
          state.speakingId = messageId;
          notifySpeakState();
          const clear = () => {
            if (state.speakingId === messageId) {
              state.speaking = false;
              state.speakingId = '';
              notifySpeakState();
            }
          };
          u.onend = clear;
          u.onerror = clear;
          global.speechSynthesis.speak(u);
          return true;
        } catch {
          state.speaking = false;
          state.speakingId = '';
          notifySpeakState();
        }
      } else if (global.FlaptapWordLookup?.speakText) {
        global.FlaptapWordLookup.speakText(clean.slice(0, 1200));
        return true;
      }
      return false;
    }

    return {
      isActive: () => state.active,
      isSpeaking: () => state.speaking,
      getSpeakingMessageId: () => state.speakingId,
      getLang: () => state.lang,
      getLangBadge,
      cycleLang,
      start,
      stop,
      speak,
      stopSpeaking,
    };
  }

  global.FlaptapAiChatVoice = {
    create: createVoiceController,
  };
})(window);
