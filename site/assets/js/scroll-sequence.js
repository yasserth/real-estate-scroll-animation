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

   Smoothness: the page scroll itself is smoothed by Lenis (smooth-scroll.js),
   which runs inside GSAP's ticker, so each wheel notch becomes a glide and the
   playhead advances ~1 frame per display refresh. The draw happens in the same
   ticker frame as the scroll update. Opt-in extras (film.config.js):
   `blend` (sub-frame crossfade) and `decodeAhead` (off-thread decode window).

   Memory: frames are kept as <img> elements (compressed WebP); only the
   sliding window (≤ decodeCache, default 24) is held decoded, at canvas size.
   Nothing keeps 734 decoded 1920×1440 bitmaps alive.

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
    const tries = new Uint8Array(N);            // failed attempts per frame (retried up to 3×)
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

    // frame: continuous playhead (GSAP) · drawn: base frame on screen · shown: drawn + blend
    const state = { frame: 0, target: 0, drawn: -1, shown: 0, dir: 1, progress: 0, drawMs: 0, bitmaps: 0 };

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
          if (state.drawn < 0 || Math.abs(i - state.frame) < Math.abs(state.drawn - state.frame)) requestDraw();
          wantBitmaps();
          pump();
        };
        img.onerror = () => {
          inflight--; imgs[i] = null;
          // A dropped request must not leave a permanent hole: queue the frame again.
          if (++tries[i] <= 3) { order.push(i); setTimeout(pump, 500 * tries[i]); }
          else console.warn('[scroll-sequence] failed to load', url(i));
          pump();
        };
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

    // ---------------- canvas geometry ----------------
    // object-fit: cover with a focal point — fills the screen, never stretches.
    let geo = null;                              // { rw, rh, dx, dy } in canvas pixels
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr || 2);
      const cssW = stage.clientWidth, cssH = stage.clientHeight;
      // Never allocate a backing store larger than the frames can fill
      // (frame pixels per CSS pixel under cover-fit; no point rendering finer than that).
      const cover = Math.max(cssW / seq.width, cssH / seq.height);
      const k = Math.min(dpr, Math.max(1, 1 / cover));
      canvas.width = Math.round(cssW * k); canvas.height = Math.round(cssH * k);
      canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const cw = canvas.width, ch = canvas.height, s = Math.max(cw / seq.width, ch / seq.height);
      const rw = Math.round(seq.width * s), rh = Math.round(seq.height * s);
      geo = { rw, rh, dx: Math.round((cw - rw) * focusX), dy: Math.round((ch - rh) * focusY) };
      dropBitmaps();
      state.drawn = -1; lastKey = -1; requestDraw();
    }

    // ---------------- decoded window around the playhead ----------------
    // Frames near the playhead are decoded OFF the main thread (createImageBitmap),
    // already scaled to the canvas, so drawing one is a plain blit: no decode stall
    // in the middle of a scroll. Small sliding window, biased in the direction of
    // travel, evicted as it moves (bounded memory: BM_MAX bitmaps of canvas size).
    // Opt-in (cfg.decodeAhead > 0): measured slower than plain drawImage on
    // software-rendered canvases, useful only where decode stalls are visible.
    const canBitmap = typeof createImageBitmap === 'function' && cfg.decodeAhead > 0;
    const BM_AHEAD = cfg.decodeAhead || 0, BM_BEHIND = 4, BM_MAX = cfg.decodeCache || 24, BM_PAR = 3;
    const bm = new Map(), bmPending = new Set();
    let bmGen = 0;
    function dropBitmaps() { bmGen++; bm.forEach(b => b.close && b.close()); bm.clear(); bmPending.clear(); state.bitmaps = 0; }
    function wantBitmaps() {
      if (!canBitmap || !geo) return;
      const c = Math.round(state.frame);
      const lo = c - (state.dir > 0 ? BM_BEHIND : BM_AHEAD), hi = c + (state.dir > 0 ? BM_AHEAD : BM_BEHIND);
      bm.forEach((b, i) => { if (i < lo - 2 || i > hi + 2) { b.close && b.close(); bm.delete(i); } });
      for (let k = 0; k <= BM_AHEAD && bmPending.size < BM_PAR; k++) {
        for (const i of (k ? [c + state.dir * k, c - state.dir * k] : [c])) {
          if (i < lo || i > hi || i < 0 || i >= N || !ok[i] || bm.has(i) || bmPending.has(i)) continue;
          if (bm.size + bmPending.size >= BM_MAX || bmPending.size >= BM_PAR) return;
          const gen = bmGen; bmPending.add(i);
          createImageBitmap(imgs[i], { resizeWidth: geo.rw, resizeHeight: geo.rh, resizeQuality: 'high' })
            .then(b => {
              bmPending.delete(i);
              if (gen !== bmGen) { b.close && b.close(); return; }
              bm.set(i, b); state.bitmaps = bm.size;
              if (Math.abs(i - state.frame) <= 1.5) requestDraw();
              wantBitmaps();
            })
            .catch(() => { bmPending.delete(i); });
        }
      }
    }

    // ---------------- draw ----------------
    // Sub-frame blending: between frame n and n+1 the canvas shows n with n+1 laid
    // over it at the fractional opacity, so slow scrolling moves continuously
    // instead of stepping 24 times a second. Source frames are never altered.
    const BLEND = cfg.blend === true;   // opt-in: doubles the per-frame draw cost
    let lastKey = -1;
    function blit(src, alpha) {
      ctx.globalAlpha = alpha;
      if (src.close) ctx.drawImage(src, geo.dx, geo.dy);            // ImageBitmap: pre-scaled
      else ctx.drawImage(src, geo.dx, geo.dy, geo.rw, geo.rh);      // <img>: scaled on draw
    }
    function draw() {
      if (!geo) return;
      const f = clamp(state.frame, 0, N - 1);
      let i0 = Math.floor(f), frac = BLEND ? Math.round((f - i0) * 32) / 32 : Math.round(f - i0);
      if (frac >= 1) { i0 = Math.min(N - 1, i0 + 1); frac = 0; }
      const base = nearestLoaded(i0);
      if (base < 0) return;
      const exact = base === i0;
      const next = exact && frac > 0 && i0 + 1 < N && ok[i0 + 1] ? i0 + 1 : -1;
      const key = next >= 0 ? i0 + frac : base;
      if (key === lastKey) return;
      const t0 = performance.now();
      blit(bm.get(base) || imgs[base], 1);
      if (next >= 0) blit(bm.get(next) || imgs[next], frac);
      ctx.globalAlpha = 1;
      state.drawMs = performance.now() - t0;
      state.drawn = base; state.shown = key; lastKey = key;
      wantBitmaps();
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
      // Runs inside GSAP's ticker (already a requestAnimationFrame): draw in the
      // same frame as the scroll update — no extra frame of latency.
      onUpdate: () => { state.frame = playhead.frame; draw(); if (debug) drawDebug(); },
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
        `frame     ${Number(state.shown).toFixed(2)} / ${N - 1}  (target ${Math.round(state.target)})\n` +
        `decoded   ${state.bitmaps} bitmaps\n` +
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
