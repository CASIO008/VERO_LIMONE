/* ============================================================
   DAVVERO LIMONE — camada de movimento (GSAP)
   Aprimora a loja e o checkout. Sem GSAP, ou com
   "reduzir movimento" ativo, nada aqui roda e o site
   continua funcionando normalmente.
   ============================================================ */
'use strict';

(function () {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.gsap) return;

  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  if (ST) gsap.registerPlugin(ST);

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  const onReady = fn => {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  };

  /* ---------------- botões magnéticos ---------------- */
  function magnetize(selector, strength = 0.2) {
    $$(selector).forEach(el => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });
      el.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength * 1.5);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------------- entrada do hero ---------------- */
  function heroIntro() {
    if (!$('.hero')) return;

    /* assume o controle dos reveals do hero para não brigar com o CSS */
    $$('.hero .reveal').forEach(el => { el.style.transition = 'none'; el.classList.add('in'); });
    const title = $('.hero-title');
    if (title) {
      title.classList.add('in');
      $$('.word > span', title).forEach(s => { s.style.transition = 'none'; });
    }

    const tl = gsap.timeline({ delay: 0.9, defaults: { ease: 'power3.out' } });
    if ($('.hero .eyebrow')) tl.from('.hero .eyebrow', { y: 18, autoAlpha: 0, duration: 0.6 });
    if (title) tl.from('.hero-title .word > span', { yPercent: 118, duration: 0.95, stagger: 0.055 }, '-=0.25');
    if ($('.hero-sub')) tl.from('.hero-sub', { y: 18, autoAlpha: 0, duration: 0.7 }, '-=0.55');
    if ($('.hero-cta')) tl.from('.hero-cta', { y: 18, autoAlpha: 0, duration: 0.7 }, '-=0.55');
    if ($('.hero-note')) tl.from('.hero-note', { y: 14, autoAlpha: 0, duration: 0.6 }, '-=0.55');
    /* só um fade: o limão e o palco não se movem no carregamento */
    if ($('.hero-stage')) tl.from('.hero-stage', { autoAlpha: 0, duration: 0.9 }, '-=0.95');
    if ($('.float-tag')) tl.from('.float-tag', { autoAlpha: 0, y: 16, scale: 0.82, stagger: 0.08, duration: 0.5 }, '-=0.6');
    if ($('.stats')) tl.from('.stats', { autoAlpha: 0, y: 24, duration: 0.8 }, '-=0.5');
  }

  /* ---------------- tilt 3D nos cards ---------------- */
  function cardTilt() {
    const grid = $('#grid');
    if (!grid) return;
    document.documentElement.dataset.gsap = '1';

    grid.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const card = e.target.closest('.card');
      if (!card) return;
      const media = $('.card-media', card);
      if (!media) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(media, {
        rotateY: px * 9,
        rotateX: -py * 9,
        y: -6,
        transformPerspective: 900,
        transformOrigin: 'center',
        duration: 0.5,
        ease: 'power2.out',
        overwrite: 'auto'
      });
    });

    grid.addEventListener('pointerout', e => {
      const card = e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      const media = $('.card-media', card);
      if (media) gsap.to(media, { rotateX: 0, rotateY: 0, y: 0, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
    });
  }

  /* ---------------- parallax no scroll ---------------- */
  function scrollParallax() {
    if (!ST) return;
    [
      ['.glow.g1', -22, '.hero'],
      ['.glow.g2', 18, '.hero'],
      ['.about-mark', -16, '.about'],
      ['.about-blob', 14, '.about'],
      ['.news-mark', -20, '.newsletter']
    ].forEach(([sel, amount, trigger]) => {
      const el = $(sel), trg = $(trigger);
      if (!el || !trg) return;
      gsap.to(el, {
        yPercent: amount,
        ease: 'none',
        scrollTrigger: { trigger: trg, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });
  }

  /* ---------------- checkout ---------------- */
  function checkoutMotion() {
    if (!$('.ck-body')) return;

    window.vlAnimateStep = panel => {
      if (!panel) return;
      gsap.from(panel, { autoAlpha: 0, y: 26, duration: 0.6, ease: 'power3.out' });
    };

    if ($('.ck-steps')) {
      gsap.from('.ck-steps li', { autoAlpha: 0, y: 14, stagger: 0.07, duration: 0.5, ease: 'power3.out', delay: 0.15 });
    }
    if ($('.ck-sum-card')) {
      gsap.from('.ck-sum-card', { autoAlpha: 0, y: 24, duration: 0.7, ease: 'power3.out', delay: 0.25 });
    }
  }

  onReady(() => {
    heroIntro();
    cardTilt();
    scrollParallax();
    checkoutMotion();
    magnetize('.hero-cta .btn, .lb-nav .lb-btn, .ig-cta .btn');
  });
})();
