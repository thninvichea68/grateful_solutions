// Homepage scroll choreography: the "Who we are" text fill, the pinned "What we do" truck reel,
// hero parallax, the "Clearing customs" photo drift and the Promise frame.
// Runs as a module (see app.js) whenever the homepage is the current page.
(window.GSModules = window.GSModules || []).push({
  name: 'home',
  init(container, api) {
    if (!container.querySelector('#fields-stage')) return;     // not the homepage
    if (!window.gsap || !window.ScrollTrigger || api.reduce) return;
    gsap.registerPlugin(ScrollTrigger);

    const cyan = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();

    // Scroll-scrubbed text fill: each word flashes cyan (unless flash is false), then settles to its final colour
    function fillText(el, finalColor, flash = true) {
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

      const fill = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top 85%', end: 'bottom 45%', scrub: 0.6 }
      });
      words.forEach((w, i) => {
        if (!flash) { fill.to(w, { color: finalColor(w), duration: 0.5, ease: 'none' }, i * 0.1); return; }
        fill.to(w, { color: cyan, duration: 0.25, ease: 'none' }, i * 0.1)
            .to(w, { color: finalColor(w), duration: 0.25, ease: 'none' }, i * 0.1 + 0.25);
      });
    }

    fillText(container.querySelector('#about-text'), (w) => (w.closest('.accent') ? cyan : '#0A0A0A'));

    // What we do: one photo stays put while the panel pins in the middle of the screen;
    // each service's text slides out and the next slides in, and the progress line fills
    const stage = container.querySelector('#fields-stage');
    const fields = gsap.utils.toArray('.fields__item', stage);
    stage.classList.add('is-stacked');
    // Video is driven frame by frame from the scroll, never played on its own
    const fieldsVideo = container.querySelector('#fields-video');
    function seekVideo(p) {
      const d = fieldsVideo.duration;
      if (!d) return;                                   // metadata not loaded yet
      const t = Math.min(p * d, d - 0.05);
      if (Math.abs(fieldsVideo.currentTime - t) > 1 / 60) fieldsVideo.currentTime = t;
    }
    // iPhone only paints seeked frames after the video has been played once, so play and pause straight away
    fieldsVideo.play().then(() => fieldsVideo.pause()).catch(() => {});
    fieldsVideo.addEventListener('loadedmetadata', () => ScrollTrigger.refresh(), { once: true });

    // Desktop pins just the photo panel, centred. Phones pin the label + title together with it,
    // so "What we do / One field, start to finish." stays on screen until the last service.
    function buildFields(pinEl, start) {
      gsap.set(fields.slice(1), { autoAlpha: 0, yPercent: 12 });
      const fieldsTl = gsap.timeline({
        scrollTrigger: {
          trigger: pinEl, start, end: () => '+=' + window.innerHeight * (fields.length - 1),
          pin: true, scrub: 0.6, invalidateOnRefresh: true,
          // This pin is rebuilt whenever the screen crosses the phone breakpoint, which would put it last
          // in ScrollTrigger's refresh order. Everything below it (the card deck, the port map) would
          // then measure itself before this pin's spacing exists and pin ~2 screens too early.
          // A higher priority makes it measure first, as it does on a normal load.
          refreshPriority: 1,
        }
      });
      fieldsTl.fromTo('#fields-bar', { width: '0%' }, { width: '100%', ease: 'none', duration: fields.length - 1 }, 0);
      // The truck drives with the scroll: the video runs start to end across the four services,
      // backwards when scrolling up, frozen when the scrolling stops. Meanwhile the camera slowly pushes in.
      const reel = { p: 0 };
      fieldsTl
        .to(reel, { p: 1, ease: 'none', duration: fields.length - 1, onUpdate: () => seekVideo(reel.p) }, 0)
        .fromTo(fieldsVideo, { scale: 1.12 }, { scale: 1, ease: 'none', duration: fields.length - 1 }, 0);
      fields.slice(1).forEach((field, i) => {
        fieldsTl
          .to(fields[i], { autoAlpha: 0, yPercent: -12, ease: 'power1.in', duration: 0.45 }, i + 0.1)
          .to(field, { autoAlpha: 1, yPercent: 0, ease: 'power1.out', duration: 0.45 }, i + 0.5);
      });
    }
    const fieldsMM = gsap.matchMedia();
    fieldsMM.add('(min-width: 641px)', () => {
      // Like the Promise section: the panel starts as an inset card and opens out to full screen
      // as it reaches the top, then locks there while the services play through
      const section = stage.closest('.fields');
      // Starts at about 80% of the screen (10% in from every side), keeping the screen's proportions
      const startX = () => Math.round(window.innerWidth * 0.1) + 'px';
      const startY = () => Math.round(window.innerHeight * 0.1) + 'px';
      section.classList.add('fields--cinema');
      stage.classList.add('is-cinema');
      gsap.fromTo(stage, { '--gx': startX, '--gy': startY }, {
        '--gx': '0px', '--gy': '0px', ease: 'none',
        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'top top', scrub: true, invalidateOnRefresh: true, refreshPriority: 1 },
      });
      buildFields(stage, 'top top');
      return () => { stage.classList.remove('is-cinema'); section.classList.remove('fields--cinema'); };
    });
    fieldsMM.add('(max-width: 640px)', () => buildFields(stage.closest('.fields__pin'), 'top top'));

    // Hero: photo drifts down and zooms in slightly as the hero scrolls away
    gsap.to('.hero__parallax', {
      yPercent: 18, scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    // Clearing customs: photo drifts and zooms inside its panel (scale always covers the drift)
    gsap.fromTo('.clear__media-img', { yPercent: -6, scale: 1.12 }, {
      yPercent: 6, scale: 1.25, ease: 'none',
      scrollTrigger: { trigger: '.clear__media', start: 'top bottom', end: 'bottom top', scrub: true }
    });

    // Promise: frame grows from inset card to full screen as the section scrolls up
    const promiseFrame = container.querySelector('#promise-frame');
    gsap.fromTo(promiseFrame,
      { top: '3.2vw', right: '3.4vw', bottom: '3.2vw', left: '3.4vw' },
      { top: 0, right: 0, bottom: 0, left: 0, ease: 'none',
        scrollTrigger: { trigger: '.promise', start: 'top bottom', end: 'top top', scrub: true } });

    fillText(container.querySelector('#promise-text'), () => '#FBF6EE', false);

    // Why choose us: a deck of cards. Each card pins at its slot (a strip lower than the one before);
    // all of them stay pinned until the deck has held for a moment, then leave together.
    // A covered card sinks back as the next one slides over it: shrinks from its top edge and dims.
    const delayList = container.querySelector('.delays__list');
    const delayRows = gsap.utils.toArray('.delay-row', delayList);
    if (delayRows.length > 1) {
      delayList.classList.add('delays__list--js');
      const slot = (row) => parseFloat(getComputedStyle(row).scrollMarginTop) || 0;   // = CSS --top
      const last = delayRows[delayRows.length - 1];
      delayRows.forEach((row, i) => {
        ScrollTrigger.create({
          trigger: row,
          start: () => 'top ' + slot(row) + 'px',
          endTrigger: delayList,
          end: () => 'bottom ' + (slot(last) + last.offsetHeight) + 'px',
          pin: true, pinSpacing: false, invalidateOnRefresh: true,
        });
        const next = delayRows[i + 1];
        if (!next) return;
        const depth = delayRows.length - 1 - i;             // cards deeper in the deck sink further
        gsap.fromTo(row.querySelector('.delay-row__card'),
          { scale: 1, '--shade': 0 },
          { scale: 1 - 0.035 * depth, '--shade': 0.06 + 0.05 * depth, ease: 'none', immediateRender: false,
            scrollTrigger: {
              trigger: next,
              start: 'top bottom',
              end: () => 'top ' + slot(next) + 'px',        // done the moment the next card lands
              scrub: true, invalidateOnRefresh: true,
            } });
      });
    }

    // leaving the homepage: drop the responsive "What we do" setups too
    return () => fieldsMM.revert();
  },
});
