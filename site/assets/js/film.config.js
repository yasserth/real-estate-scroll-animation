/* ----------------------------------------------------------------------------
   Film configuration — scroll-controlled image sequence.

   The frames are extracted from the original 30.6 s film with
   tools/extract-frames.sh (24 fps → 734 WebP frames, 1920×1440, no crop).
   They are served from this site (assets/frames/). To serve them from a CDN
   such as Cloudflare R2 instead, upload the folder and set `base` to its
   public URL, ending in a slash.

   Add ?debug to the page URL to see frame / load / draw-time stats.
---------------------------------------------------------------------------- */
window.FILM_CONFIG = {
  sequence: {
    base: 'assets/frames/',   // relative path → works under /real-estate-scroll-animation/
    prefix: 'f_',
    digits: 4,
    ext: '.webp',
    count: 734,               // f_0000.webp … f_0733.webp
    width: 1920,
    height: 1440,
    // Focal point for the full-screen cover fit (x, y from 0 to 1). The film is 4:3,
    // so a 16:9 screen trims a little from top and bottom; 0.38 keeps the spire in frame.
    focus: [0.5, 0.38],
  },

  // Total scroll distance of the film, in viewport heights (whole 30 s film).
  scrollLength: 6,

  // GSAP ScrollTrigger scrub: seconds the frame takes to catch up with the
  // scroll position. The scroll is already smoothed by Lenis (smooth-scroll.js),
  // so only a light extra cushion is needed. Measured: 0.35 s settles in ~0.6 s
  // with ≤ 3 frames per refresh, symmetric up and down.
  scrub: 0.35,

  // Optional rendering extras, OFF by default (measured slower on software-
  // rendered canvases; may help on some GPUs):
  // blend: true,       // crossfade frame n → n+1 by the fractional playhead
  // decodeAhead: 14,   // decode the next N frames off the main thread

  preload: 48,        // opening frames fetched first (2 s of film)
  concurrency: 6,     // parallel image requests
  maxDpr: 2,
  respectReducedMotion: true,
};
