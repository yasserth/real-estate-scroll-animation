/* ----------------------------------------------------------------------------
   Sections AURELLE : navigation, apparitions, fiches plateaux, simulateur.
   Indépendant de l'animation du hero (scroll-sequence.js), qui n'est pas touchée.
---------------------------------------------------------------------------- */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* 1. Apparitions : une seule fois à l'entrée dans l'écran.
        Les éléments d'une même liste (piliers, offres, services…) se révèlent
        en cascade très courte, plafonnée pour ne jamais faire attendre. */
  document.documentElement.classList.add('reveal-ready');
  const items = $$('.reveal');
  const groups = new Map();
  items.forEach(el => { const g = el.parentElement; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(el); });
  groups.forEach(list => { if (list.length > 1) list.forEach((el, i) => el.style.setProperty('--reveal-delay', Math.min(i * 70, 350) + 'ms')); });
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(el => io.observe(el));
  }

  /* 2. Navigation : transparente sur le film, panneau plein ensuite,
        claire sur les sections ivoire, lien de la section courante souligné. */
  const bar = $('[data-topbar]');
  const film = $('[data-film]');
  const sections = $$('main > section.sec');
  const links = $$('.topnav a');
  let queued = false;
  function updateNav() {
    queued = false;
    if (!bar) return;
    const y = bar.offsetHeight / 2;
    const solid = film ? film.getBoundingClientRect().bottom <= y : true;
    let under = null;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) { under = s; break; }
    }
    bar.classList.toggle('is-solid', solid);
    bar.classList.toggle('is-light', solid && !!under && under.classList.contains('tone-light'));

    const probe = innerHeight * 0.35;
    let active = null;
    for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= probe && r.bottom > probe) active = s.id; }
    links.forEach(a => {
      const on = a.getAttribute('href') === '#' + active;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  /* Transition film → sections : en quittant l'écran, la scène du film se fond
     doucement dans le bleu nuit (opacité seule, rendu GPU). */
  const stage = film && film.querySelector('[data-film-stage]');
  let exitVeil = null;
  if (stage) { exitVeil = document.createElement('div'); exitVeil.className = 'film__exit'; exitVeil.setAttribute('aria-hidden', 'true'); stage.appendChild(exitVeil); }
  function updateExit() {
    if (!exitVeil) return;
    const r = film.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, 1 - r.bottom / innerHeight));   // 0 : scène entière · 1 : scène sortie
    exitVeil.style.opacity = (t * t * 0.85).toFixed(3);
  }
  const onScroll = () => { updateNav(); updateExit(); };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(onScroll); } }, { passive: true });
  updateExit();
  addEventListener('resize', updateNav);
  updateNav();

  /* 3. Fiches plateaux (<dialog>) et « Demander une visite » */
  function openPlateau(key) {
    const d = document.getElementById('plateau-' + key);
    if (!d) return;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }
  $$('[data-open-plateau]').forEach(b => b.addEventListener('click', () => openPlateau(b.dataset.openPlateau)));
  $$('dialog.plateau').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) d.close(); });   // clic sur le fond
    $$('[data-close]', d).forEach(b => b.addEventListener('click', () => d.close()));
  });
  $$('[data-request]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const d = a.closest('dialog');
    if (d && d.open) d.close();
    const sel = $('#f-surface');
    if (sel) { sel.value = a.dataset.request; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    const focusName = () => { const f = $('#f-name'); if (f) f.focus({ preventScroll: true }); };
    if (window.smoothScrollTo) window.smoothScrollTo('#contact', { onComplete: focusName });
    else { $('#contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); setTimeout(focusName, reduce ? 0 : 900); }
  }));

  /* 4. Simulateur « Vision économique » — hypothèses ajustables par le visiteur */
  const sim = $('[data-sim]');
  if (sim) {
    const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
    const nums = $$('input[type=number]', sim);
    const occ = $('#sim-occ', sim);
    const out = { occ: $('[data-sim-occ]', sim), area: $('[data-sim-area]', sim), month: $('[data-sim-month]', sim), year: $('[data-sim-year]', sim) };
    const toInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
    function compute() {
      let area = 0, month = 0;
      nums.forEach(i => {
        const n = toInt(i.value, 0, Number(i.max) || 40);
        area += n * Number(i.dataset.area);
        month += n * Number(i.dataset.rent);
      });
      const rate = toInt(occ.value, 50, 100) / 100;
      month *= rate;
      out.occ.textContent = Math.round(rate * 100) + ' %';
      out.area.textContent = fmt.format(area) + ' m²';
      out.month.textContent = fmt.format(month) + ' MAD';
      out.year.textContent = fmt.format(month * 12) + ' MAD';
    }
    nums.forEach(i => {
      i.addEventListener('input', compute);
      i.addEventListener('change', () => { i.value = toInt(i.value, 0, Number(i.max) || 40); compute(); });
    });
    occ.addEventListener('input', compute);
    compute();
  }
})();
