# Project rules — real-estate-scroll-animation

Luxury real-estate site: ONE continuous, pre-rendered architectural film scrubbed by scroll.

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
  - `assets/vendor/` — GSAP 3.12.5 + ScrollTrigger (vendored)
  - `index.html` — chapters are `[data-film-chapter]` with `data-from`/`data-to` (0–1 of the film)
- `tools/extract-frames.sh` — rebuilds the frames from the original MP4 (colour-accurate BT.709→WebP)

## Testing
Serve `site/` and open `?debug` to see frame / loaded / draw-time stats.
