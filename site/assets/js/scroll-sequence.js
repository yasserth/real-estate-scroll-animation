/* ============================================================================
   scroll-sequence.js — scroll-controlled image-sequence film (Canvas + GSAP)
   ----------------------------------------------------------------------------
   Replaces MP4 scrubbing. The film is a folder of WebP frames extracted from
   the original video (tools/extract-frames.sh). GSAP ScrollTrigger maps scroll
   position to a frame index with `scrub` smoothing; a requestAnimationFrame
   loop draws that frame to a <canvas> only when it changes.

   Why this is smoother than seeking a video: every frame is an independent
   image, so showing frame N costs one image draw, never "decode from the last
   keyframe". Scrolling up is exactly as cheap as scrolling down.

   Loading (progressive, so the page is usable in ~1 s):
     1. frame 0 → painted immediately
     2. the opening frames (cfg.preload)
     3. coarse-to-fine passes over the whole film (every 16th, 8th, 4th, 2nd,
        then all), so any scroll position has a nearby frame early on
     4. frames just ahead of the current position jump the queue
   Until a frame arrives, the nearest loaded frame is drawn instead.

   Memory: frames are kept as <img> elements (compressed WebP in memory; the
   browser's decode cache holds only recently drawn bitmaps). Nothing keeps
   734 decoded 1920×1440 bitmaps alive.

   Markup contract (unchanged from the video version, see index.html):
     <section data-film> <div data-film-stage> <canvas data-film-canvas> …
     chapters: [data-film-chapter][data-from][data-to][data-hold]
     UI: [data-film-progress] [data-film-counter] [data-film-loader]
   ========================================================================== */
(function () {
  'use strict';

  function mountScrollSequence(root, cfg) {
    cfg = cfg || {};
    const seq = cfg.sequence || {};
    const N = seq.count | 0;
    const q = new URLSearchParams(location.search);
    const debug = q.has('debug');
    const reduce = cfg.respectReducedMotion !== false && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stage = root.querySelector('[data-film-stage]');
    const loader = root.querySelector('[data-film-loader]');
    const chapters = Array.from(root.querySelectorAll('[data-film-chapter]'));
    const bar = document.querySelector('[data-film-progress]');
    const counter = document.querySelector('[data-film-counter]');

    root.style.setProperty('--film-length', String(cfg.scrollLength || 6));

    let canvas = root.querySelector('[data-film-canvas]');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.setAttribute('data-film-canvas', ''); stage.prepend(canvas); }
    const ctx = canvas.getContext('2d', { alpha: false });

    const clamp = (x, a, b) => Math.min(b === undefined ? 1 : b, Math.max(a || 0, x));
    const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
    const focusX = seq.focus ? seq.focus[0] : 0.5, focusY = seq.focus ? seq.focus[1] : 0.5;

    if (!N || !window.gsap || !window.ScrollTrigger) {
      console.warn('[scroll-sequence] missing sequence config or GSAP/ScrollTrigger');
      root.classList.add('film-empty'); return null;
    }
    gsap.registerPlugin(ScrollTrigger);

    // ---------------- frames + progressive loader ----------------
    const base = (seq.base || 'assets/frames/');
    const url = i => base + (seq.prefix || 'f_') + String(i).padStart(seq.digits || 4, '0') + (seq.ext || '.webp');
    const imgs = new Array(N).fill(null);       // HTMLImageElement once requested
    const ok = new Uint8Array(N);               // 1 = loaded & decodable
    let loadedCount = 0, inflight = 0;
    const MAX_INFLIGHT = cfg.concurrency || 6;

    const order = [];                           // coarse-to-fine background order
    const seen = new Uint8Array(N);
    const push = i => { if (i >= 0 && i < N && !seen[i]) { seen[i] = 1; order.push(i); } };
    push(0);
    for (let i = 1; i < Math.min(N, cfg.preload || 48); i++) push(i);
    [16, 8, 4, 2, 1].forEach(step => { for (let i = 0; i < N; i += step) push(i); });
    push(N - 1);
    let cursor = 0;

    const state = { frame: 0, target: 0, drawn: -1, dir: 1, progress: 0, drawMs: 0 };

    function nextToLoad() {
      // Frames just ahead of where the viewer is heading take priority.
      const t = Math.round(state.target);
      for (let k = 0; k <= 24; k++) {
        const i = t + state.dir * k;
        if (i >= 0 && i < N && !imgs[i]) return i;
      }
      while (cursor < order.length && imgs[order[cursor]]) cursor++;
      return cursor < order.length ? order[cursor] : -1;
    }

    function pump() {
      while (inflight < MAX_INFLIGHT) {
        const i = nextToLoad();
        if (i < 0) return;
        const img = new Image();
        img.decoding = 'async';
        imgs[i] = img; inflight++;
        img.onload = () => {
          inflight--; ok[i] = 1; loadedCount++;
          setLoader(loadedCount / N);
          if (i === 0 && !root.classList.contains('has-film')) { root.classList.add('has-film'); }
          if (state.drawn < 0 || Math.abs(i - Math.round(state.frame)) < Math.abs(state.drawn - Math.round(state.frame))) requestDraw();
          pump();
        };
        img.onerror = () => { inflight--; console.warn('[scroll-sequence] failed to load', img.src); pump(); };
        img.src = url(i);
      }
    }

    function setLoader(p) {
      if (!loader) return;
      loader.hidden = p >= 1;
      loader.style.setProperty('--p', String(clamp(p)));
      const label = loader.querySelector('[data-film-loader-label]');
      if (label) label.textContent = p > 0 && p < 1 ? Math.round(p * 100) + '%' : '';
    }

    function nearestLoaded(i) {
      if (ok[i]) return i;
      for (let k = 1; k < N; k++) {
        const a = i - k * state.dir, b = i + k * state.dir;   // prefer the frame we came from
        if (a >= 0 && a < N && ok[a]) return a;
        if (b >= 0 && b < N && ok[b]) return b;
      }
      return -1;
    }

    // ---------------- canvas ----------------
    let cssW = 0, cssH = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr || 2);
      cssW = stage.clientWidth; cssH = stage.clientHeight;
      // Never allocate a backing store larger than the frames can fill.
      // (frame pixels per CSS pixel under cover-fit; no point rendering finer than that)
      const cover = Math.max(cssW / seq.width, cssH / seq.height);
      const k = Math.min(dpr, Math.max(1, 1 / cover));
      canvas.width = Math.round(cssW * k); canvas.height = Math.round(cssH * k);
      canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      state.drawn = -1; requestDraw();
    }

    function draw() {
      const want = clamp(Math.round(state.frame), 0, N - 1);
      const i = nearestLoaded(want);
      if (i < 0 || i === state.drawn) return;
      const img = imgs[i];
      const cw = canvas.width, ch = canvas.height;
      // object-fit: cover with a focal point — fills the screen, never stretches.
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      const t0 = performance.now();
      ctx.drawImage(img, (cw - dw) * focusX, (ch - dh) * focusY, dw, dh);
      state.drawMs = performance.now() - t0;
      state.drawn = i;
      // Ask the browser to decode the next few frames in the direction of travel.
      for (let k = 1; k <= 2; k++) { const j = i + state.dir * k; if (j >= 0 && j < N && ok[j] && imgs[j].decode) imgs[j].decode().catch(() => {}); }
    }

    let drawQueued = false;
    function requestDraw() {
      if (drawQueued) return;
      drawQueued = true;
      requestAnimationFrame(() => { drawQueued = false; draw(); if (debug) drawDebug(); });
    }

    // ---------------- GSAP: scroll → frame ----------------
    const playhead = { frame: 0 };
    gsap.to(playhead, {
      frame: N - 1,
      ease: 'none',
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: 'bottom bottom',
        scrub: reduce ? true : (cfg.scrub != null ? cfg.scrub : 0.6),
        onUpdate: self => {
          state.target = self.progress * (N - 1);
          if (self.direction) state.dir = self.direction;
          pump();
        },
      },
      onUpdate: () => { state.frame = playhead.frame; requestDraw(); },
    });

    // ---------------- chapters / rail (same behaviour as before) ----------------
    function readUI() {
      const r = root.getBoundingClientRect();
      const span = Math.max(1, r.height - (stage.clientHeight || innerHeight));
      const p = clamp(-r.top / span);
      state.progress = p;
      chapters.forEach((c, i) => {
        const a = parseFloat(c.dataset.from || 0), b = parseFloat(c.dataset.to || 1);
        const fade = Math.min(0.06, (b - a) * 0.3);
        let o;
        if (p < a || p > b) o = 0;
        else if (i === 0 && a === 0) o = smooth((b - p) / fade);
        else if (c.hasAttribute('data-hold') && b >= 1) o = smooth((p - a) / fade);
        else o = Math.min(smooth((p - a) / fade), smooth((b - p) / fade));
        c.style.opacity = o.toFixed(3);
        c.style.transform = reduce ? 'none' : `translate3d(0, ${((0.5 - (p - a) / (b - a || 1)) * 3).toFixed(2)}vh, 0)`;
        c.classList.toggle('is-active', o > 0.5);
        c.setAttribute('aria-hidden', o > 0.5 ? 'false' : 'true');
      });
      if (bar) bar.style.transform = `scaleY(${p.toFixed(4)})`;
      if (counter && chapters.length) {
        let idx = 0;
        chapters.forEach((c, i) => { if (p >= parseFloat(c.dataset.from || 0)) idx = i; });
        counter.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(chapters.length).padStart(2, '0');
      }
      root.classList.toggle('film-started', p > 0.015);
      document.documentElement.classList.toggle('past-film', p >= 1 && r.bottom < innerHeight * 0.6);
    }
    let uiQueued = false;
    addEventListener('scroll', () => { if (!uiQueued) { uiQueued = true; requestAnimationFrame(() => { uiQueued = false; readUI(); }); } }, { passive: true });

    // ---------------- debug overlay (?debug) ----------------
    let dbg = null;
    function drawDebug() {
      if (!dbg) { dbg = document.createElement('pre'); dbg.className = 'film-debug'; document.body.appendChild(dbg); }
      dbg.textContent =
        `mode      image sequence (canvas)\n` +
        `progress  ${state.progress.toFixed(4)}\n` +
        `frame     ${state.drawn} / ${N - 1}  (target ${Math.round(state.target)})\n` +
        `loaded    ${loadedCount} / ${N}\n` +
        `draw      ${state.drawMs.toFixed(1)} ms\n` +
        `canvas    ${canvas.width}×${canvas.height}`;
    }

    let resizeT = 0;
    addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { resize(); ScrollTrigger.refresh(); readUI(); }, 120); });

    resize();
    setLoader(0.001);
    pump();
    readUI();
    return { state, canvas, frames: imgs, loaded: () => loadedCount };
  }

  window.mountScrollSequence = mountScrollSequence;
})();
