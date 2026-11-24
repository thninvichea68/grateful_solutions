// Page intro: the first screen's labels, intro text, buttons and lead photo build in, timed with the
// title rise (titles.js) and, when arriving by page transition, with the wipe (app.js).
//   labels      rise and fade in just before the title
//   intro text  rises line by line from behind a mask, after the title
//   buttons     the round arrow pops in as a circle, then the label pill stretches out of it
//               toward the left and its text fades in last
//   lead photo  rises into place while its picture settles from a slight zoom
// Runs as a module (see app.js). Without GSAP or with reduced motion, everything just shows.
(window.GSModules = window.GSModules || []).push({
  name: 'intro',
  init(container, api) {
    if (!window.gsap || api.reduce) return;
    const $ = (sel) => [...container.querySelectorAll(sel)];
    // Times count from the reveal (api.revealed). Arriving by transition, start as the wipe is landing
    // on the top of the page (titles.js uses the same 0.6s).
    const base = api.entering ? 0.6 : 0.15;
    // CSS-driven pieces (homepage title rise, the rule under headlines) shift by the same amount
    container.style.setProperty('--intro-shift', api.entering ? '0.5s' : '0s');

    // built now so every piece sits in its starting state, played once the page is revealed
    const tl = gsap.timeline({ paused: true, delay: base, defaults: { ease: 'power3.out' } });
    let revealedAt = null;
    api.revealed.then(() => {
      if (api.signal.aborted) return;
      revealedAt = performance.now();
      tl.restart(true);                               // true: honour the delay from now
    });

    // Small labels above the title
    const labels = $('.sub-hero .about__eyebrow, .ab-hero__pill, .hero__tagline');
    if (labels.length) tl.from(labels, { yPercent: 80, autoAlpha: 0, duration: 0.8, stagger: 0.06 }, 0);
    // Labels that sit under the title (legal pages' date badges)
    const later = $('.page-hero .badge-group > *');
    if (later.length) tl.from(later, { y: 18, autoAlpha: 0, duration: 0.7, stagger: 0.08 }, 0.45);

    // Buttons: circle pops, pill stretches out of it, label fades in
    const pairs = $('.sub-hero__head .btn-pair, .hero__cta .btn-pair');
    const singles = $('.hero__cta > .btn');
    const allBtns = [...pairs.flatMap((p) => [...p.querySelectorAll('.btn')]), ...singles];
    if (allBtns.length) {
      gsap.set(allBtns, { transition: 'none' });     // the CSS hover transitions would fight the tweens
      pairs.forEach((pair, i) => {
        const at = 0.4 + i * 0.12;
        const round = pair.querySelector('.btn--round');
        const pill = pair.querySelector('.btn:not(.btn--round)');
        if (round) tl.from(round, { scale: 0, duration: 0.7, ease: 'back.out(1.8)' }, at);
        if (pill) {
          tl.fromTo(pill, { clipPath: 'inset(0% 0% 0% 100% round 999px)' },
            { clipPath: 'inset(0% 0% 0% 0% round 999px)', duration: 0.8, ease: 'expo.inOut' }, at + 0.15)
            .from(pill, { color: 'rgba(0, 0, 0, 0)', duration: 0.5, ease: 'power1.out' }, at + 0.6);
        }
      });
      singles.forEach((btn, i) => {
        const at = 0.55 + (pairs.length + i) * 0.12;
        tl.fromTo(btn, { clipPath: 'inset(0% 50% 0% 50% round 999px)' },
          { clipPath: 'inset(0% 0% 0% 0% round 999px)', duration: 0.8, ease: 'expo.inOut' }, at)
          .from(btn, { color: 'rgba(0, 0, 0, 0)', duration: 0.5, ease: 'power1.out' }, at + 0.45);
      });
      // hand the buttons back to their CSS (hover transitions, hover scale) once built
      tl.add(() => gsap.set(allBtns, { clearProps: 'transition,clipPath,color,transform' }));
    }

    // Homepage feature cards along the bottom of the hero: their frame draws itself, then the
    // content fades up inside. One line sweeps across the top of all the cards from the left;
    // as it reaches each card's corner, that card's side line drops down.
    const features = $('.hero .feature');
    if (features.length) {
      const n = features.length;
      const sweep = { p: 0 };
      const SWEEP = 1.2, AT = 0.6;
      gsap.set(features, { '--top': 0, '--side': 0 });
      tl.to(sweep, {
        p: 1, duration: SWEEP, ease: 'power2.inOut',
        onUpdate: () => features.forEach((f, i) => {
          f.style.setProperty('--top', Math.min(1, Math.max(0, sweep.p * n - i)).toFixed(4));
        }),
      }, AT);
      features.forEach((f, i) => {
        // time at which the eased sweep reaches this card's corner (p = i / n)
        const ease = gsap.parseEase('power2.inOut');
        let lo = 0, hi = 1;
        for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (ease(mid) < i / n) lo = mid; else hi = mid; }
        tl.to(f, { '--side': 1, duration: 0.8, ease: 'power3.inOut' }, AT + lo * SWEEP);
        tl.from(f.children, { y: 24, autoAlpha: 0, duration: 0.8, stagger: 0.08 }, AT + lo * SWEEP + 0.35);
      });
    }

    // Lead photo under the page header
    const media = $('.svc-banner__frame, .ab-team');
    media.forEach((fig) => {
      tl.from(fig, { y: 90, duration: 1.4, ease: 'expo.out' }, 0.25);
      const img = fig.querySelector('img');
      if (img) tl.from(img, { scale: 1.18, duration: 1.6, ease: 'expo.out' }, 0.25);
    });

    // Intro text rises line by line. Lines are measured once the brand font is in; until then
    // the text stays hidden so it never shows unsplit.
    const leads = $('.sub-hero__lead');
    if (leads.length && window.SplitText) {
      gsap.set(leads, { autoAlpha: 0 });
      Promise.all([document.fonts.ready, api.revealed]).then(() => {
        if (api.signal.aborted) return;
        const since = revealedAt === null ? 0 : (performance.now() - revealedAt) / 1000;
        const delay = Math.max(0, base + 0.35 - since);
        api.add(() => {
          leads.forEach((el, i) => {
            const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'introline' });
            gsap.set(el, { autoAlpha: 1 });
            gsap.from(split.lines, {
              yPercent: 105, duration: 0.9, ease: 'power4.out', stagger: 0.08, delay: delay + i * 0.1,
              onComplete: () => split.revert(),          // back to plain text once it has landed
            });
          });
        });
      });
    }
  },
});
