/* ==========================================================================
   THINK ALOUD — AUDIO / CAMERA / LIVE SPEECH RECORDER (think-aloud/recorder.js)
   Handles MediaRecorder, optional webcam preview, live AudioContext level bar,
   optional browser SpeechRecognition live captions, and Whisper fallback.
   ========================================================================== */

(function (global) {
  'use strict';

  function pickMimeType(withVideo) {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    const candidates = withVideo
      ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
  }

  function create() {
    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let audioCtx = null;
    let analyser = null;
    let levelRaf = null;
    let recognition = null;
    let recognizedText = '';
    let isRecording = false;

    async function start({
      withCamera = false,
      videoEl = null,
      onLevel = null,
      onInterimTranscript = null,
    } = {}) {
      stopMediaOnly();
      recordedChunks = [];
      recognizedText = '';

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone/camera capture is unavailable in this browser. Use Fast-Type mode.');
      }

      const constraints = withCamera
        ? { audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
        : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (withCamera && videoEl) {
        videoEl.srcObject = mediaStream;
        videoEl.muted = true;
        try {
          await videoEl.play();
        } catch {}
      }

      // Live audio level meter
      try {
        const AudioContextCls = global.AudioContext || global.webkitAudioContext;
        if (AudioContextCls) {
          audioCtx = new AudioContextCls();
          const source = audioCtx.createMediaStreamSource(mediaStream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tickLevel = () => {
            if (!analyser || !isRecording) return;
            analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (let i = 0; i < data.length; i++) {
              const v = Math.abs((data[i] - 128) / 128);
              if (v > peak) peak = v;
            }
            if (typeof onLevel === 'function') {
              onLevel(Math.min(100, Math.round(peak * 220)));
            }
            levelRaf = requestAnimationFrame(tickLevel);
          };
          isRecording = true;
          levelRaf = requestAnimationFrame(tickLevel);
        }
      } catch {
        isRecording = true;
      }

      isRecording = true;

      // Optional browser SpeechRecognition for instant live captions
      const SpeechRec = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          recognition = new SpeechRec();
          recognition.lang = 'en-US';
          recognition.continuous = true;
          recognition.interimResults = true;
          let finalAccum = '';
          recognition.onresult = (ev) => {
            let interim = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const txt = ev.results[i][0]?.transcript || '';
              if (ev.results[i].isFinal) {
                finalAccum += `${txt} `;
              } else {
                interim += txt;
              }
            }
            recognizedText = `${finalAccum}${interim}`.replace(/\s+/g, ' ').trim();
            if (typeof onInterimTranscript === 'function') {
              onInterimTranscript(recognizedText);
            }
          };
          recognition.onerror = () => {};
          recognition.start();
        } catch {
          recognition = null;
        }
      }

      const mimeType = pickMimeType(withCamera);
      mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
      };
      mediaRecorder.start(250);
    }

    async function stop({ videoEl = null } = {}) {
      isRecording = false;
      if (levelRaf) {
        cancelAnimationFrame(levelRaf);
        levelRaf = null;
      }
      if (recognition) {
        try {
          recognition.stop();
        } catch {}
        recognition = null;
      }

      const blob = await new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          resolve(recordedChunks.length ? new Blob(recordedChunks, { type: 'audio/webm' }) : null);
          return;
        }
        mediaRecorder.onstop = () => {
          const type = mediaRecorder?.mimeType || 'audio/webm';
          resolve(recordedChunks.length ? new Blob(recordedChunks, { type }) : null);
        };
        try {
          mediaRecorder.stop();
        } catch {
          resolve(null);
        }
      });

      stopMediaOnly(videoEl);
      return {
        blob,
        liveTranscript: recognizedText,
      };
    }

    function stopMediaOnly(videoEl = null) {
      isRecording = false;
      if (levelRaf) {
        cancelAnimationFrame(levelRaf);
        levelRaf = null;
      }
      if (recognition) {
        try {
          recognition.abort();
        } catch {}
        recognition = null;
      }
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch {}
        audioCtx = null;
      }
      analyser = null;
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        mediaStream = null;
      }
      if (videoEl) {
        try {
          videoEl.srcObject = null;
        } catch {}
      }
      mediaRecorder = null;
    }

    return {
      start,
      stop,
      cleanup: stopMediaOnly,
      isActive: () => isRecording,
    };
  }

  global.FlaptapTARecorder = { create };
})(window);
