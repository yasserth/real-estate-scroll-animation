# real-estate-scroll-animation

**AURELLE BUSINESS RESIDENCE** — site vitrine (FR) d'un projet conceptuel de résidence d'affaires premium, destiné à une présentation investisseurs. Il s'ouvre sur un film architectural piloté par le défilement.
Scrolling down advances the film frame by frame; scrolling up reverses it.

## How it works

- The original 30.6 s film (hosted on Cloudflare R2) is extracted into **734 WebP frames**
  (24 fps, 1920×1440, colour-accurate) in `site/assets/frames/` by `tools/extract-frames.sh`.
- `site/assets/js/scroll-sequence.js` draws the current frame to a full-screen `<canvas>`.
  **GSAP ScrollTrigger** (vendored in `site/assets/vendor/`) maps scroll position to a frame
  with `scrub` smoothing, and a `requestAnimationFrame` loop redraws only when the frame changes.
- Frames load progressively: frame 0 first (preloaded), then the opening 2 s, then coarse-to-fine passes
  over the whole film, with frames ahead of the scroll position jumping the queue; a failed frame is retried.
- **Smooth scrolling:** Lenis (vendored, MIT) interpolates the page scroll inside GSAP's ticker, so each
  wheel notch glides and the film advances about one frame per display refresh, in both directions.
  Menu links glide to their section (`site/assets/js/smooth-scroll.js`). Disabled when the visitor
  prefers reduced motion.
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

## Formulaire de contact — à connecter

Le formulaire « Demander une présentation privée » valide réellement les saisies, mais **n'envoie rien tant
qu'aucun service de réception n'est configuré** : le visiteur en est informé, sans fausse confirmation.

Pour l'activer, renseigner `site/assets/js/site.config.js` :

```js
contact: {
  endpoint: 'https://formspree.io/f/xxxxxxx',   // ou Getform, Basin, votre API / CRM (POST FormData)
  fallbackEmail: 'contact@exemple.ma',          // proposé en secours en cas d'échec
}
```

La confirmation ne s'affiche que si le service répond avec succès (HTTP 2xx). Compléter ensuite
`site/mentions-legales.html` (éditeur, responsable du traitement, durée de conservation, CNDP).
