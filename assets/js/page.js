// Shared subpage effects: scroll-filled statements, image parallax and the stacking step cards.
// Runs as a module (see app.js): once on load, then again for each page a transition brings in.
// Smooth scroll and in-page link gliding live in app.js.
(window.GSModules = window.GSModules || []).push({
  name: 'page',
  init(container, api) {
    if (!window.gsap || !window.ScrollTrigger || api.reduce) return;
    gsap.registerPlugin(ScrollTrigger);

    // Scroll-scrubbed text fill: words start ghosted (CSS) and darken one by one as the text scrolls up
    const cyan = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
    container.querySelectorAll('[data-fill]').forEach((el) => {
      const words = [];
      (function split(node) {
        [...node.childNodes].forEach((child) => {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
              const w = document.createElement('span');
              w.className = 'w';
              w.textContent = part;
              frag.appendChild(w);
              words.push(w);
            });
            child.replaceWith(frag);
          } else if (child.nodeType === 1) {
            split(child);
          }
        });
      })(el);
      el.classList.add('is-split');

      const color = getComputedStyle(el).color;
      const fill = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 85%', end: 'bottom 45%', scrub: 0.6 }
      });
      // each word flashes cyan, then settles to the text colour (as on the homepage)
      words.forEach((w, i) => {
        fill.to(w, { color: cyan, duration: 0.25, ease: 'none' }, i * 0.1)
            .to(w, { color, duration: 0.25, ease: 'none' }, i * 0.1 + 0.25);
      });
    });

    // Photos drift inside their frames while scrolling (frames clip the overflow)
    container.querySelectorAll('[data-parallax] img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    // Stacking step cards: each card pins as it reaches the top (10px lower than the one before),
    // and every card except the last tilts back and shrinks as the next ones slide over it.
    const nav = document.getElementById('nav');
    const topOffset = () => (nav ? nav.offsetHeight : 0) + 20;   // stop just below the fixed menu bar

    container.querySelectorAll('.steps-stack').forEach((stack) => {
      const wrappers = gsap.utils.toArray(stack.querySelectorAll('.step-wrap'));
      const cards = gsap.utils.toArray(stack.querySelectorAll('.step-card'));
      if (wrappers.length < 2) return;
      stack.classList.add('steps-stack--js');
      const last = wrappers.length - 1;

      wrappers.forEach((wrapper, i) => {
        const isLast = i === last;
        gsap.to(cards[i], {
          scale: isLast ? 1 : 0.9 + 0.025 * i,
          rotationX: isLast ? 0 : -10,
          transformOrigin: 'top center',
          ease: 'none',
          scrollTrigger: {
            trigger: wrapper,
            start: () => 'top ' + (topOffset() + 10 * i),
            // everything releases together once the last card has landed in its slot
            endTrigger: stack,
            end: () => 'bottom ' + (topOffset() + 10 * last + wrappers[last].offsetHeight),
            scrub: true,
            pin: wrapper,
            pinSpacing: false,
            invalidateOnRefresh: true,
          },
        });
      });
    });
  },
});
