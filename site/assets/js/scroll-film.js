/* ============================================================================
   scroll-film.js — single-video scroll-scrub engine
   ----------------------------------------------------------------------------
   Adapted from the scroll-world skill's engine
   (.claude/skills/scroll-world/references/scrub-engine.js, MIT, (c) 2026 cyw),
   reduced to the case this site needs: ONE continuous pre-rendered video whose
   currentTime is driven by scroll position. Scrolling down advances the film,
   scrolling up reverses it; the frame always follows the scrollbar.

   Kept from the scroll-world engine:
     - blob loading (a Blob URL is always fully seekable, even on hosts that
       don't serve HTTP byte ranges)
     - rAF smoothing: displayed time eases toward the scroll target
     - seek coalescing: never issue a new seek while the decoder is `seeking`
       (stops fast flicks from piling up and freezing the video on phones)
     - poster stays up until the video has painted a real frame
     - iOS priming: muted play→pause on the first touch
     - lighter mobile source on coarse-pointer / ≤860px devices
     - prefers-reduced-motion: no video, poster only
   Added for an externally hosted MP4:
     - load: 'auto' tries a CORS fetch → Blob (with progress), and falls back
       to streaming the URL straight into <video> if the host blocks CORS.
     - '?video=<url>' query override for testing a hosted file before wiring it
     - '?debug' overlay (progress, time, mode, seekable range)

   Markup contract (see index.html):
     <section data-film>                       tall scroll track
       <div data-film-stage>                   sticky 100vh stage
         <img  data-film-poster>               optional poster
         <video data-film-video>               created if absent
         <div  data-film-chapter data-from=".0" data-to=".2">…</div>
       </div>
     </section>
   ========================================================================== */
(function () {
  'use strict';

  function mountScrollFilm(root, cfg) {
    cfg = cfg || {};
    const q = new URLSearchParams(location.search);
    const stage = root.querySelector('[data-film-stage]');
    const poster = root.querySelector('[data-film-poster]');
    const loader = root.querySelector('[data-film-loader]');
    const chapters = Array.from(root.querySelectorAll('[data-film-chapter]'));
    const bar = document.querySelector('[data-film-progress]');
    const counter = document.querySelector('[data-film-counter]');

    const reduce = cfg.respectReducedMotion !== false &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
    // Chosen ONCE at mount: switching sources mid-session would re-download a large file.
    const mobile = coarse || matchMedia('(max-width: 860px)').matches;
    const debug = q.has('debug');

    const V = cfg.video || {};
    const override = q.get('video');
    const src = override || (mobile && V.srcMobile) || V.src || '';
    const posterSrc = (mobile && V.posterMobile) || V.poster || '';
    const SMOOTH = reduce ? 1 : (cfg.smoothing || 0.14);
    const EPS = mobile ? 0.02 : 0.008;          // seconds; coarser on phones = fewer decodes

    // Scroll length of the film, in viewport heights (CSS var drives the track height).
    root.style.setProperty('--film-length', String(cfg.scrollLength || 8));
    if (V.focus) root.style.setProperty('--film-focus', V.focus);
    if (V.focusMobile) root.style.setProperty('--film-focus-mobile', V.focusMobile);

    if (poster && posterSrc) { poster.src = posterSrc; poster.hidden = false; }

    let video = root.querySelector('[data-film-video]');
    if (!video) { video = document.createElement('video'); video.setAttribute('data-film-video', ''); stage.prepend(video); }
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
    video.disablePictureInPicture = true; video.tabIndex = -1; video.setAttribute('aria-hidden', 'true');

    const state = { mode: 'none', ready: false, target: 0, cur: 0, progress: 0, inView: true, loaded: 0 };
    const clamp = (x, a, b) => Math.min(b === undefined ? 1 : b, Math.max(a || 0, x));
    const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

    // ---------------- loading ----------------
    function setLoader(p) {
      if (!loader) return;
      loader.hidden = p >= 1;
      loader.style.setProperty('--p', String(clamp(p)));
      const label = loader.querySelector('[data-film-loader-label]');
      if (label) label.textContent = p > 0 && p < 1 ? Math.round(p * 100) + '%' : '';
    }

    function attach(url, mode) {
      state.mode = mode;
      video.addEventListener('loadedmetadata', () => {
        state.ready = true; state.cur = state.target; kick();
        if (mode === 'stream') setTimeout(() => {
          const s = video.seekable;
          if (!s.length || s.end(0) < 0.5) console.warn('[scroll-film] host does not appear to support HTTP Range requests — the film cannot be scrubbed. Enable CORS (preferred) or byte ranges on the video host.');
        }, 1500);
      }, { once: true });
      // Reveal only once a real frame is on screen (iOS paints nothing for a never-played muted video).
      video.addEventListener('seeked', () => { root.classList.add('has-film'); setLoader(1); }, { once: true });
      video.addEventListener('loadeddata', () => {
        try { video.pause(); } catch (e) {}
        if (userReady) prime();
        // Force a first seek so `seeked` fires even at progress 0.
        try { video.currentTime = Math.max(0.001, timeFor(state.target)); } catch (e) {}
      }, { once: true });
      video.addEventListener('error', () => {
        console.warn('[scroll-film] video failed to load:', url);
        root.classList.add('film-error'); setLoader(1);
      });
      video.src = url;
      video.load();
    }

    async function loadBlob(url) {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('content-length')) || 0;
      if (!res.body || !total) { setLoader(0.02); return res.blob(); }
      const reader = res.body.getReader(); const parts = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length; setLoader(Math.min(0.99, got / total));
      }
      return new Blob(parts, { type: res.headers.get('content-type') || 'video/mp4' });
    }

    function start() {
      if (!src) {
        root.classList.add('film-empty');
        console.info('[scroll-film] No video configured. Set video.src in assets/js/film.config.js or append ?video=<url>.');
        setLoader(1); return;
      }
      if (reduce) { setLoader(1); return; }   // poster only, chapters still fade
      const strategy = q.get('load') || cfg.load || 'auto';
      if (strategy === 'stream') { setLoader(1); attach(src, 'stream'); return; }
      setLoader(0.001);
      loadBlob(src)
        .then(blob => attach(URL.createObjectURL(blob), 'blob'))
        .catch(err => {
          // Most often: the host doesn't send Access-Control-Allow-Origin. A plain
          // <video src> doesn't need CORS, so stream it instead (needs byte-range support).
          console.warn('[scroll-film] blob load failed (' + err.message + '); streaming instead.');
          setLoader(1); attach(src, 'stream');
        });
    }

    // ---------------- scroll → time ----------------
    function timeFor(p) {
      const d = video.duration;
      if (!d || !isFinite(d)) return 0;
      return clamp(p) * Math.max(0, d - 0.05);   // stop just short of the end (last frame stays decodable)
    }

    function read() {
      const r = root.getBoundingClientRect();
      const h = stage.clientHeight || innerHeight;
      const span = Math.max(1, r.height - h);
      const p = clamp(-r.top / span);
      state.progress = p; state.target = p;
      state.inView = r.bottom > 0 && r.top < innerHeight;

      chapters.forEach((c, i) => {
        const a = parseFloat(c.dataset.from || 0), b = parseFloat(c.dataset.to || 1);
        const fade = Math.min(0.06, (b - a) * 0.3);
        let o;
        if (p < a || p > b) o = 0;
        else if (i === 0 && a === 0) o = smooth((b - p) / fade);                // greets on landing
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
      kick();
    }

    // ---------------- render loop (runs only while there's work) ----------------
    let running = false;
    function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }
    function tick() {
      if (!state.ready) { running = false; if (debug) drawDebug(); return; }
      const diff = state.target - state.cur;
      state.cur = Math.abs(diff) < 0.0005 ? state.target : state.cur + diff * SMOOTH;
      if (!video.seeking && state.inView) {
        const t = timeFor(state.cur);
        if (Math.abs(video.currentTime - t) > EPS) { try { video.currentTime = t; } catch (e) {} }
      }
      if (debug) drawDebug();
      const settled = state.cur === state.target && !video.seeking;
      if (settled) { running = false; return; }
      requestAnimationFrame(tick);
    }

    // ---------------- iOS priming ----------------
    let userReady = false;
    function prime() {
      if (!mobile || !state.ready) return;
      try { const pr = video.play(); if (pr && pr.then) pr.then(() => { video.pause(); kick(); }).catch(() => {}); } catch (e) {}
    }
    function onGesture() { if (userReady) return; userReady = true; prime(); }
    addEventListener('pointerdown', onGesture, { once: true, passive: true });
    addEventListener('touchstart', onGesture, { once: true, passive: true });

    // ---------------- debug overlay ----------------
    let dbg = null;
    function drawDebug() {
      if (!dbg) { dbg = document.createElement('pre'); dbg.className = 'film-debug'; document.body.appendChild(dbg); }
      const s = video.seekable && video.seekable.length ? video.seekable.end(0).toFixed(2) : '0';
      dbg.textContent =
        `mode      ${state.mode}${mobile ? ' (mobile)' : ''}\n` +
        `progress  ${state.progress.toFixed(4)}\n` +
        `time      ${(video.currentTime || 0).toFixed(3)} / ${(video.duration || 0).toFixed(2)}s\n` +
        `seekable  0 → ${s}s\n` +
        `size      ${video.videoWidth}×${video.videoHeight}\n` +
        `src       ${src ? src.slice(0, 60) : '(none)'}`;
    }

    // ---------------- wire up ----------------
    let ticking = false;
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; read(); }); } }, { passive: true });
    // Touch browsers fire `resize` as the URL bar slides; the track is sized in CSS
    // vh (stable), so a cheap re-read is all we do — no layout rebuild, no jump.
    addEventListener('resize', read);
    addEventListener('orientationchange', read);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) read(); });

    start();
    read();
    return { state, video, refresh: read };
  }

  window.mountScrollFilm = mountScrollFilm;
})();
