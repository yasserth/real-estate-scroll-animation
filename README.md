# real-estate-scroll-animation

Luxury real-estate website (AURELLE) with a cinematic, scroll-controlled architectural film.
Scrolling down advances the film frame by frame; scrolling up reverses it.

## How it works

- The original 30.6 s film (hosted on Cloudflare R2) is extracted into **734 WebP frames**
  (24 fps, 1920×1440, colour-accurate) in `site/assets/frames/` by `tools/extract-frames.sh`.
- `site/assets/js/scroll-sequence.js` draws the current frame to a full-screen `<canvas>`.
  **GSAP ScrollTrigger** (vendored in `site/assets/vendor/`) maps scroll position to a frame
  with `scrub` smoothing, and a `requestAnimationFrame` loop redraws only when the frame changes.
- Frames load progressively: frame 0 first, then the opening 2 s, then coarse-to-fine passes
  over the whole film, with frames ahead of the scroll position jumping the queue.
- Settings (scroll length, smoothing, focal point, frame path) live in `site/assets/js/film.config.js`.

## Rebuilding the frames

```bash
tools/extract-frames.sh "path/to/film.mp4"
```

Then update `sequence.count` in `film.config.js` if the frame count changed.

## Hosting

GitHub Pages via `.github/workflows/deploy-pages.yml` (Settings → Pages → Source: GitHub Actions).
The frames (~66 MB) are served from Pages. To serve them from R2 instead, upload
`site/assets/frames/` and set `sequence.base` to the public folder URL.

Local preview: `python3 -m http.server -d site 8000` → http://localhost:8000/?debug
