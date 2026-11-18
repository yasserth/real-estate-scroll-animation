# Project rules — real-estate-scroll-animation

AURELLE BUSINESS RESIDENCE — French-language showcase site for a fictional premium business residence
(office floors to let), aimed at investors. Opens with ONE continuous architectural film scrubbed by scroll.

## Hard constraints (from the owner)
- **Never generate media.** No AI images, no AI video, no new scenes, no Higgsfield/Monid/Codex
  calls. The scroll-world skill (`.claude/skills/scroll-world/`) is installed for its **scroll
  engine, encode settings and QA method only** — skip its Steps 0–5 (bootstrap, interview,
  stills, dives, connectors).
- The film is a single MP4 the owner made, hosted on Cloudflare R2. Never commit `.mp4/.mov/.webm`.
  The site plays it as a **WebP image sequence** extracted from that MP4 (real frames, resized only).
- Deploy target: **GitHub Pages** at `/real-estate-scroll-animation/`. No Netlify.
  All asset paths in `site/` must stay **relative** (no leading `/`).

## Layout
- `site/` — the deployed static site (published by `.github/workflows/deploy-pages.yml`)
  - `assets/frames/f_0000.webp…` — 734 frames (24 fps, 1920×1440) from the R2 film
  - `assets/js/film.config.js` — frame count/path, focal point, scroll length, scrub smoothing
  - `assets/js/scroll-sequence.js` — Canvas + GSAP ScrollTrigger image-sequence engine
  - `assets/vendor/` — GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.20 (vendored)
  - `assets/js/smooth-scroll.js` — Lenis smooth scrolling driven by GSAP's ticker, smooth anchor navigation
    (`window.smoothScrollTo`), scroll lock while a `<dialog>` is open; disabled under prefers-reduced-motion
  - `index.html` — hero chapters are `[data-film-chapter]` with `data-from`/`data-to` (0–1 of the film);
    then sections 02 Vision → 09 Contact, footer, and the three plateau `<dialog>`s
  - `mentions-legales.html` — legal & privacy page (placeholders « à compléter »)
  - `assets/css/site.css` — palette navy #171E25 / gold #C9AE83 / ivory #F4F0E8 / slate #7B858B / graphite #333D43
  - `assets/js/sections.js` — nav states, reveals, plateau dialogs, rental simulator
  - `assets/js/contact.js` + `site.config.js` — form validation; set `contact.endpoint` to receive requests
- `tools/extract-frames.sh` — rebuilds the frames from the original MP4 (colour-accurate BT.709→WebP)

## Content rules
- The hero frames and the film scroll length (`scrollLength: 6`) are frozen. Engine changes must keep the frames
  untouched and be measured with real wheel input (frames per refresh, long frames, settle time) before/after.
  Measured best on software canvas: Lenis + `scrub: 0.35`, `blend`/`decodeAhead` off (opt-in).
- Section images are frames of the film (`assets/frames/f_XXXX.webp`), always captioned « visuel conceptuel ».
- Never present fictional figures as facts: surfaces/rents are « indicatifs, non contractuels »; the simulator is
  « hypothèses de simulation »; services are « envisagés — à confirmer »; location/contacts « à confirmer/compléter ».
- The form must never show a success message unless the configured endpoint answers 2xx.

## Testing
Serve `site/` and open `?debug` to see frame / loaded / draw-time stats.
