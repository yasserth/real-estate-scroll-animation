# real-estate-scroll-animation

Luxury real-estate website with a cinematic, scroll-controlled architectural film.
Scrolling down advances one continuous pre-rendered video; scrolling up reverses it.

- **Engine:** `site/assets/js/scroll-film.js` — adapted from the
  [scroll-world](https://github.com/oso95/scroll-world) skill's scrub engine (MIT), which is
  installed at project level in `.claude/skills/scroll-world/`.
- **Hosting:** GitHub Pages → `https://<user>.github.io/real-estate-scroll-animation/`
- **Video:** hosted externally; URL set in `site/assets/js/film.config.js`.

## 1 · Prepare the video

```bash
tools/prepare-video.sh path/to/your-film.mp4 out
```

Produces `film-desktop.mp4` (≤1920 wide, crf 20, keyframe every 8 frames),
`film-mobile.mp4` (720p, keyframe every 4 frames) and first-frame posters. Frequent keyframes
are what make scrubbing smooth, so encode with this script rather than uploading a normal export.

## 2 · Host the MP4

The page needs **either** of these from the host (ideally both):

| Host feature | Why | Result |
|---|---|---|
| CORS header `Access-Control-Allow-Origin: https://<user>.github.io` (or `*`) | Lets the page download the file as a Blob | Best: frame-accurate scrubbing anywhere, with a load-progress bar |
| HTTP Range requests (`Accept-Ranges: bytes`) | Lets `<video>` seek into a streamed file | Good: automatic fallback when CORS is missing |

Works well: Cloudflare R2 (public bucket + CORS rule), Bunny CDN, AWS S3/CloudFront (CORS
config), Backblaze B2 + CDN. GitHub Release assets have no CORS, so they rely on the stream
fallback — test before relying on them. YouTube/Vimeo page links will **not** work; it must be a
direct `.mp4` URL.

## 3 · Wire it

Edit `site/assets/js/film.config.js`:

```js
video: {
  src: 'https://your-cdn.example/film-desktop.mp4',
  srcMobile: 'https://your-cdn.example/film-mobile.mp4',
  poster: 'assets/media/poster.jpg',
  posterMobile: 'assets/media/poster-mobile.jpg',
},
```

Test any URL without editing: `…/real-estate-scroll-animation/?debug&video=<url>`.

## 4 · Deploy

Repo **Settings → Pages → Source: GitHub Actions**. Every push to `main` that touches `site/`
deploys via `.github/workflows/deploy-pages.yml`.

Local preview: `python3 -m http.server -d site 8000` → http://localhost:8000/?debug
