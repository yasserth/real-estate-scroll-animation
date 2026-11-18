/* ----------------------------------------------------------------------------
   Film configuration — the only file you need to edit to wire your video.

   Your MP4 is hosted externally (it's too large for the repo). Paste its public
   HTTPS URL into `src`. Relative paths (e.g. 'assets/media/film.mp4') also work
   if you ever decide to ship a small file inside /site.

   Test a URL without editing this file:
     https://<user>.github.io/real-estate-scroll-animation/?video=<url-encoded mp4 url>
   Add &debug to see progress / time / load mode, and &load=stream to force streaming.
---------------------------------------------------------------------------- */
window.FILM_CONFIG = {
  video: {
    src: '',            // REQUIRED — desktop master, e.g. 'https://cdn.example.com/estate/film-desktop.mp4'
    srcMobile: '',      // optional — lighter 720p / GOP-4 encode for phones (tools/prepare-video.sh makes it)
    poster: '',         // optional — first frame as an image, e.g. 'assets/media/poster.jpg'
    posterMobile: '',   // optional — portrait / smaller poster for phones
    focus: '50% 50%',        // object-position of the video on wide screens
    focusMobile: '50% 50%',  // object-position on portrait phones (keep the building in frame)
  },

  // 'auto'   → fetch the whole file as a Blob (perfectly seekable, best scrubbing),
  //            falling back to streaming if the host blocks CORS.
  // 'blob'   → same as auto (fallback still applies).
  // 'stream' → <video src> directly; the host must support HTTP Range requests.
  load: 'auto',

  // Total scroll distance of the film, in viewport heights. Longer = slower, more
  // cinematic. Roughly 1 viewport height per 3–5 seconds of video reads well.
  scrollLength: 9,

  // 0..1 — how quickly the displayed frame catches up with the scroll position.
  // Lower = silkier but laggier; 1 = locked 1:1 to the scrollbar.
  smoothing: 0.14,

  respectReducedMotion: true,
};
