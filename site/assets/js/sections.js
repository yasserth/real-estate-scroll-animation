/* Editorial sections after the film — small, independent of the film engine.
   1. Gentle reveal of each section's content as it enters the viewport.
   2. Keeps the fixed top bar readable over the ivory sections (it is ivory-on-dark
      everywhere else, including the hero, where nothing changes). */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1 — reveal once, no re-animation on scroll back
  document.documentElement.classList.add('reveal-ready');
  const items = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    items.forEach(el => io.observe(el));
  }

  // 2 — top bar tone follows the section underneath it
  const bar = document.querySelector('.topbar');
  const light = Array.from(document.querySelectorAll('.tone-ivory'));
  if (!bar || !light.length) return;
  let queued = false;
  function update() {
    queued = false;
    const y = bar.offsetHeight / 2;
    const onLight = light.some(s => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
    bar.classList.toggle('on-light', onLight);
  }
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
})();
