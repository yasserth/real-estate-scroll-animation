/* ----------------------------------------------------------------------------
   Défilement doux (Lenis 1.1, MIT) synchronisé avec GSAP ScrollTrigger.

   - Lenis interpole la position de défilement : chaque cran de molette devient
     un glissement continu au lieu d'un saut de 100 px.
   - Un seul moteur de rafraîchissement : Lenis avance dans le ticker de GSAP,
     et ScrollTrigger est mis à jour à chaque pas de Lenis. L'animation du film
     et le défilement sont donc calculés dans la même image, sans décalage.
   - Le défilement reste natif (window.scrollY) : position sticky, ancres,
     barre de défilement et accessibilité clavier continuent de fonctionner.
   - « Réduire les animations » (prefers-reduced-motion) : Lenis n'est pas
     activé, le défilement reste celui du système.
   Expose window.smoothScrollTo(cible, options) pour les autres scripts.
---------------------------------------------------------------------------- */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Hauteur de la navigation compacte (69 px) + 16 px d'air : arrivée identique quel que soit le point de départ.
  const navOffset = () => 85;
  // easeInOutQuart-like curve for long jumps: gentle start, long soft landing.
  const easeNav = t => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

  let lenis = null;
  if (!reduce && window.Lenis && window.gsap) {
    lenis = new Lenis({
      lerp: 0.085,            // inertie : plus bas = plus soyeux, plus haut = plus direct
      wheelMultiplier: 0.95,
      smoothWheel: true,
      syncTouch: false,       // tactile : défilement natif (le mobile n'est pas prioritaire)
    });
    if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);    // pas de « rattrapage » brutal après une image lente
    window.lenis = lenis;
  }

  function smoothScrollTo(target, opts) {
    opts = opts || {};
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (el == null && typeof target !== 'number') return;
    const offset = opts.offset != null ? opts.offset : -navOffset();
    if (lenis) {
      if (lenis.isStopped) lenis.start();   // ex. demande lancée depuis une fiche qui vient de se fermer
      const to = typeof target === 'number' ? target : el.getBoundingClientRect().top + scrollY + offset;
      // Durée proportionnelle à la distance, bornée : 1,1 s à 2,4 s.
      const d = Math.abs(to - scrollY);
      lenis.scrollTo(to, { duration: Math.min(2.4, Math.max(1.1, 0.8 + d / 6000)), easing: easeNav, lock: false, onComplete: opts.onComplete });
    } else {
      const top = typeof target === 'number' ? target : el.getBoundingClientRect().top + scrollY + offset;
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
      if (opts.onComplete) setTimeout(opts.onComplete, reduce ? 0 : 700);
    }
  }
  window.smoothScrollTo = smoothScrollTo;

  // Liens d'ancre (#section) : déplacement doux, URL mise à jour sans saut.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute('data-request') || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    smoothScrollTo(id === '#top' ? 0 : el, {
      offset: id === '#top' ? 0 : undefined,
      onComplete: () => {
        // Accessibilité : le focus suit la navigation, sans relancer de défilement.
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      },
    });
    if (history.pushState) history.pushState(null, '', id);
  });

  // Fenêtres modales : le fond ne défile plus, le contenu de la fiche oui.
  document.querySelectorAll('dialog').forEach(d => {
    d.setAttribute('data-lenis-prevent', '');
    new MutationObserver(() => { if (!lenis) return; d.open ? lenis.stop() : lenis.start(); })
      .observe(d, { attributes: true, attributeFilter: ['open'] });
  });
})();
