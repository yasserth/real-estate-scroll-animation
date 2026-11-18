# Project rules — real-estate-scroll-animation

Luxury real-estate site: ONE continuous, pre-rendered architectural film scrubbed by scroll.

## Hard constraints (from the owner)
- **Never generate media.** No AI images, no AI video, no new scenes, no Higgsfield/Monid/Codex
  calls. The scroll-world skill (`.claude/skills/scroll-world/`) is installed for its **scroll
  engine, encode settings and QA method only** — skip its Steps 0–5 (bootstrap, interview,
  stills, dives, connectors).
- The film is a single MP4 the owner made, **hosted externally**. Never commit `.mp4/.mov/.webm`.
- Deploy target: **GitHub Pages** at `/real-estate-scroll-animation/`. No Netlify.
  All asset paths in `site/` must stay **relative** (no leading `/`).

## Layout
- `site/` — the deployed static site (published by `.github/workflows/deploy-pages.yml`)
  - `assets/js/film.config.js` — video URLs, scroll length, smoothing (the only file to edit to wire the film)
  - `assets/js/scroll-film.js` — single-video scrub engine adapted from the skill's `scrub-engine.js`
  - `index.html` — chapters are `[data-film-chapter]` with `data-from`/`data-to` (0–1 of the film)
- `tools/prepare-video.sh` — re-encodes the owner's film for scrubbing (skill Step 6 settings)

## Testing
Serve `site/` and open `?debug&video=<mp4 url>` to see progress/time/mode/seekable.
