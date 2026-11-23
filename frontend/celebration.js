/**
 * Flaptap Festival / Party Celebration Effect (`FlaptapCelebrate`)
 * Zero-dependency, Apple-crafted celebratory confetti + glass pill banner
 * triggered whenever the user completes the final remaining item in any
 * multi-item feature (Learning Library, Anything to Phrases, Tech Lexicon,
 * Studio, Vocabulary Vault).
 *
 * API:
 *   FlaptapCelebrate.trigger({ title, subtitle, originEl, durationMs })
 *   FlaptapCelebrate.dismiss()
 */
(function (global) {
  'use strict';

  const FESTIVAL_COLORS = [
    '#34C759',
    '#0071E3',
    '#FF9500',
    '#FFD60A',
    '#FF2D55',
    '#5856D6',
    '#32ADE6',
    '#30D158',
  ];

  const MAX_PARTICLES = 260;
  const DEFAULT_DURATION_MS = 3800;

  const EMBLEM_SVG =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
    '<path d="M5.5 12.8 L9.6 16.9 L18.5 7.4" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '<path d="M19.5 2.5 L20.2 4.3 L22 5 L20.2 5.7 L19.5 7.5 L18.8 5.7 L17 5 L18.8 4.3 Z" fill="currentColor"></path>' +
    '<path d="M4.5 3.5 L5 4.8 L6.3 5.3 L5 5.8 L4.5 7.1 L4 5.8 L2.7 5.3 L4 4.8 Z" fill="currentColor" opacity="0.88"></path>' +
    '</svg>';

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let particles = [];
  let rafId = 0;
  let lastFrameTs = 0;
  let resizeBound = false;
  let waveTimers = [];

  let bannerWrap = null;
  let bannerEl = null;
  let bannerHideTimer = 0;
  let bannerRemoveTimer = 0;

  function escapeHtml(value) {
    if (typeof global.FlaptapUtils?.escapeHtml === 'function') {
      return global.FlaptapUtils.escapeHtml(value);
    }
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function prefersReducedMotion() {
    try {
      return Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickColor() {
    return FESTIVAL_COLORS[Math.floor(Math.random() * FESTIVAL_COLORS.length)];
  }

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    width = Math.max(1, global.innerWidth || document.documentElement.clientWidth || 1024);
    height = Math.max(1, global.innerHeight || document.documentElement.clientHeight || 768);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function ensureCanvas() {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'ft-celebration-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      resizeCanvas();
    }
    if (!resizeBound) {
      global.addEventListener('resize', resizeCanvas, { passive: true });
      resizeBound = true;
    }
  }

  function teardownCanvas() {
    if (rafId) {
      global.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (resizeBound) {
      global.removeEventListener('resize', resizeCanvas);
      resizeBound = false;
    }
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    canvas = null;
    ctx = null;
    particles = [];
    lastFrameTs = 0;
  }

  function pushParticles(newOnes) {
    if (!newOnes.length) return;
    particles.push(...newOnes);
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  function createParticle({ x, y, vx, vy, shape, gravity, drag, size, maxLife }) {
    return {
      x,
      y,
      vx,
      vy,
      color: pickColor(),
      shape: shape || 'rect',
      size: size || randomRange(6, 11),
      aspect: shape === 'ribbon' ? randomRange(1.9, 2.8) : randomRange(0.55, 0.9),
      gravity: gravity ?? 0.24,
      drag: drag ?? 0.985,
      swayAmp: randomRange(0.08, 0.32),
      swayFreq: randomRange(0.06, 0.14),
      swayPhase: randomRange(0, Math.PI * 2),
      tiltPhase: randomRange(0, Math.PI * 2),
      tiltSpeed: randomRange(0.08, 0.22),
      angle: randomRange(0, Math.PI * 2),
      spin: randomRange(-0.14, 0.14),
      life: 0,
      maxLife: maxLife || randomRange(95, 155),
    };
  }

  function spawnOriginBurst(originEl) {
    if (!originEl || !(originEl instanceof Element) || !originEl.isConnected) return;
    const rect = originEl.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const shapes = ['rect', 'circle', 'star', 'ribbon'];
    const batch = [];
    for (let i = 0; i < 36; i++) {
      const theta = randomRange(0, Math.PI * 2);
      const speed = randomRange(4.2, 11.5);
      batch.push(
        createParticle({
          x: cx,
          y: cy,
          vx: Math.cos(theta) * speed,
          vy: Math.sin(theta) * speed - randomRange(1.8, 4.2),
          shape: shapes[i % shapes.length],
          gravity: 0.23,
          drag: 0.965,
          size: randomRange(5.5, 9.5),
          maxLife: randomRange(70, 115),
        }),
      );
    }
    pushParticles(batch);
  }

  function spawnCornerCannons() {
    const w = width || global.innerWidth || 1024;
    const h = height || global.innerHeight || 768;
    const shapes = ['ribbon', 'rect', 'circle', 'star'];
    const batch = [];

    const launchSide = (isLeft) => {
      const originX = isLeft ? Math.max(16, w * 0.04) : Math.min(w - 16, w * 0.96);
      const originY = h - 14;
      const baseAngle = isLeft ? -Math.PI * 0.34 : -Math.PI * 0.66;
      const baseSpeed = Math.min(25, Math.max(15.5, h * 0.025));

      for (let i = 0; i < 55; i++) {
        const angle = baseAngle + randomRange(-0.34, 0.34);
        const speed = baseSpeed * randomRange(0.72, 1.24);
        batch.push(
          createParticle({
            x: originX + randomRange(-12, 12),
            y: originY + randomRange(-10, 6),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            shape: shapes[i % shapes.length],
            gravity: 0.27,
            drag: 0.982,
            size: randomRange(7, 12.5),
            maxLife: randomRange(110, 165),
          }),
        );
      }
    };

    launchSide(true);
    launchSide(false);
    pushParticles(batch);
  }

  function spawnTopShower() {
    const w = width || global.innerWidth || 1024;
    const shapes = ['ribbon', 'star', 'rect', 'ribbon'];
    const batch = [];
    for (let i = 0; i < 48; i++) {
      const x = w * randomRange(0.14, 0.86);
      const y = randomRange(-26, -4);
      batch.push(
        createParticle({
          x,
          y,
          vx: randomRange(-2.2, 2.2),
          vy: randomRange(2.4, 6.2),
          shape: shapes[i % shapes.length],
          gravity: 0.14,
          drag: 0.99,
          size: randomRange(6.5, 11.5),
          maxLife: randomRange(115, 175),
        }),
      );
    }
    pushParticles(batch);
  }

  function drawStar(c, r) {
    c.beginPath();
    const inner = r * 0.38;
    for (let i = 0; i < 8; i++) {
      const radius = i % 2 === 0 ? r : inner;
      const a = (i * Math.PI) / 4;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
  }

  function drawParticle(c, p) {
    const fadeWindow = p.maxLife * 0.28;
    const remaining = p.maxLife - p.life;
    const alpha = remaining < fadeWindow ? Math.max(0, remaining / fadeWindow) : 1;
    if (alpha <= 0.01) return;

    const tumble = Math.cos(p.tiltPhase);
    const scaleY = p.shape === 'circle' || p.shape === 'star' ? 1 : Math.max(0.22, Math.abs(tumble));

    c.save();
    c.globalAlpha = alpha;
    c.translate(p.x, p.y);
    c.rotate(p.angle);
    c.scale(1, scaleY);
    c.fillStyle = p.color;

    if (p.shape === 'circle') {
      c.beginPath();
      c.arc(0, 0, p.size * 0.42, 0, Math.PI * 2);
      c.fill();
    } else if (p.shape === 'star') {
      drawStar(c, p.size * 0.62);
    } else if (p.shape === 'ribbon') {
      const rw = p.size * p.aspect;
      const rh = p.size * 0.42;
      c.beginPath();
      c.moveTo(-rw / 2, -rh / 2);
      c.quadraticCurveTo(0, -rh * 1.15, rw / 2, -rh / 2);
      c.lineTo(rw / 2, rh / 2);
      c.quadraticCurveTo(0, -rh * 0.15, -rw / 2, rh / 2);
      c.closePath();
      c.fill();
    } else {
      const w = p.size;
      const h = p.size * p.aspect;
      c.fillRect(-w / 2, -h / 2, w, h);
    }

    c.restore();
  }

  function tick(ts) {
    if (!ctx || !canvas) {
      rafId = 0;
      return;
    }

    if (!lastFrameTs) lastFrameTs = ts;
    const dt = Math.min((ts - lastFrameTs) / 16.6667, 2.5);
    lastFrameTs = ts;

    ctx.clearRect(0, 0, width, height);

    const alive = [];
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;

      const dragFactor = Math.pow(p.drag, dt);
      p.vx *= dragFactor;
      p.vy = p.vy * dragFactor + p.gravity * dt;

      p.swayPhase += p.swayFreq * dt;
      p.tiltPhase += p.tiltSpeed * dt;
      p.angle += p.spin * dt;

      p.x += (p.vx + Math.sin(p.swayPhase) * p.swayAmp) * dt;
      p.y += p.vy * dt;

      if (p.y > height + 40 && p.vy > 0) continue;

      drawParticle(ctx, p);
      alive.push(p);
    }

    particles = alive;
    if (particles.length > 0) {
      rafId = global.requestAnimationFrame(tick);
    } else {
      teardownCanvas();
    }
  }

  function startAnimationLoop() {
    if (!rafId) {
      lastFrameTs = 0;
      rafId = global.requestAnimationFrame(tick);
    }
  }

  function clearWaveTimers() {
    for (let i = 0; i < waveTimers.length; i++) {
      global.clearTimeout(waveTimers[i]);
    }
    waveTimers = [];
  }

  function showBanner({ title, subtitle, durationMs }) {
    global.clearTimeout(bannerHideTimer);
    global.clearTimeout(bannerRemoveTimer);

    const safeTitle = escapeHtml(title || 'Completed!');
    const safeSubtitle = subtitle ? escapeHtml(subtitle) : '';

    if (bannerEl && bannerEl.isConnected) {
      bannerEl.classList.remove('is-leaving');
      const titleEl = bannerEl.querySelector('.ft-celebration-title');
      const subEl = bannerEl.querySelector('.ft-celebration-sub');
      if (titleEl) titleEl.textContent = title || 'Completed!';
      if (subEl) {
        subEl.textContent = subtitle || '';
        subEl.hidden = !subtitle;
      } else if (subtitle) {
        const copy = bannerEl.querySelector('.ft-celebration-copy');
        if (copy) {
          const nextSub = document.createElement('span');
          nextSub.className = 'ft-celebration-sub';
          nextSub.textContent = subtitle;
          copy.appendChild(nextSub);
        }
      }
      // Re-trigger entrance shimmer cleanly
      bannerEl.classList.remove('is-visible');
      void bannerEl.offsetWidth;
      bannerEl.classList.add('is-visible');
    } else {
      bannerWrap = document.createElement('div');
      bannerWrap.className = 'ft-celebration-banner-wrap';

      bannerEl = document.createElement('div');
      bannerEl.className = 'ft-celebration-banner';
      bannerEl.setAttribute('role', 'status');
      bannerEl.setAttribute('aria-live', 'polite');
      bannerEl.setAttribute('title', 'Click to dismiss');

      bannerEl.innerHTML =
        `<span class="ft-celebration-emblem" aria-hidden="true">${EMBLEM_SVG}</span>` +
        `<div class="ft-celebration-copy">` +
        `<span class="ft-celebration-title">${safeTitle}</span>` +
        (safeSubtitle ? `<span class="ft-celebration-sub">${safeSubtitle}</span>` : '') +
        `</div>`;

      bannerEl.addEventListener('click', () => {
        dismissBanner();
      });

      bannerWrap.appendChild(bannerEl);
      document.body.appendChild(bannerWrap);

      global.requestAnimationFrame(() => {
        if (bannerEl) bannerEl.classList.add('is-visible');
      });
    }

    const ttl = Number(durationMs) > 0 ? Number(durationMs) : DEFAULT_DURATION_MS;
    bannerHideTimer = global.setTimeout(() => {
      dismissBanner();
    }, ttl);
  }

  function dismissBanner() {
    global.clearTimeout(bannerHideTimer);
    global.clearTimeout(bannerRemoveTimer);
    if (!bannerEl) return;

    const currentBanner = bannerEl;
    const currentWrap = bannerWrap;
    currentBanner.classList.remove('is-visible');
    currentBanner.classList.add('is-leaving');

    bannerRemoveTimer = global.setTimeout(() => {
      if (currentWrap && currentWrap.parentNode) {
        currentWrap.parentNode.removeChild(currentWrap);
      }
      if (bannerEl === currentBanner) {
        bannerEl = null;
        bannerWrap = null;
      }
    }, 280);
  }

  function trigger({ title = 'Completed!', subtitle = '', originEl = null, durationMs = DEFAULT_DURATION_MS } = {}) {
    if (!document.body) return;

    showBanner({ title, subtitle, durationMs });

    if (prefersReducedMotion()) return;

    clearWaveTimers();
    ensureCanvas();
    resizeCanvas();

    // Wave 0 (0ms): Local radial burst from the checked button
    spawnOriginBurst(originEl);
    startAnimationLoop();

    // Wave 1 (50ms): Dual bottom-corner Party Cannons
    waveTimers.push(
      global.setTimeout(() => {
        if (!canvas) ensureCanvas();
        spawnCornerCannons();
        startAnimationLoop();
      }, 50),
    );

    // Wave 2 (260ms): Top-center Festival Shower
    waveTimers.push(
      global.setTimeout(() => {
        if (!canvas) ensureCanvas();
        spawnTopShower();
        startAnimationLoop();
      }, 260),
    );
  }

  function dismiss() {
    clearWaveTimers();
    dismissBanner();
    teardownCanvas();
  }

  global.FlaptapCelebrate = {
    trigger,
    dismiss,
  };
})(window);
