// Fleet monitoring ("Trucks and vans tracked live") on the homepage.
//   cards    GPS / cameras / 5G, each a console beside its copy. On desktop the cards are sticky
//            (CSS) and stack as you scroll; the one being covered shrinks back and dims
//   consoles only the GPS one is live: a truck running its route with speed, distance and arrival,
//            while the stack is on screen (no clock on any console). The camera and 5G consoles are still
//            pictures (.fc--still, plain markup), so nothing here drives them
//   entrance the title rises line by line, the GPS console opens from its middle, each card's copy rises
// The console numbers are illustrative. Without GSAP or with reduced motion nothing moves on its own,
// and the cards still stack (that part is plain CSS). Runs as a module (see app.js).
(window.GSModules = window.GSModules || []).push({
  name: 'fleet',
  init(container, api) {
    const root = container.querySelector('#fleet');
    if (!root) return;
    const gsap = window.gsap;
    const animate = !!gsap && !api.reduce;
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => [...root.querySelectorAll(sel)];
    const own = (fn) => api.add(fn);              // record event-driven tweens in the page's gsap context
    const opts = { signal: api.signal };

    const stack = $('.fleet__stack');
    const cards = $$('.fleet-card');

    // ---------- GPS: truck on its route ----------
    const route = $('[data-fc-route]');
    const truck = $('[data-fc-truck]');
    const heading = $('[data-fc-heading]');
    const gpsOut = Object.fromEntries($$('[data-gps]').map((el) => [el.dataset.gps, el]));
    const L = route.getTotalLength();
    const TRIP_KM = 38;                            // schematic trip length for the readouts
    const FROM = { lat: 11.4520, lng: 104.8510 }, TO = { lat: 11.6010, lng: 104.9640 };
    route.style.strokeDasharray = `${L} ${L}`;
    // Wide screens crop the map to fill the view; the square phone screen fits all of it instead
    const gpsSvg = route.ownerSVGElement;
    const phoneMQ = window.matchMedia('(max-width: 560px)');
    const fitMap = () => gpsSvg.setAttribute('preserveAspectRatio', phoneMQ.matches ? 'xMidYMid meet' : 'xMidYMid slice');
    fitMap();
    phoneMQ.addEventListener('change', fitMap, opts);
    let gp = 0.36;                                 // trip progress 0..1
    let gpsText = 0;                               // seconds since the readouts were last written
    let speed = 52;
    function drawGps(dt, t) {
      gp += dt / 28;                               // one trip every 28s, then a fresh one starts
      if (gp >= 1) gp = 0;
      const at = gp * L;
      const p = route.getPointAtLength(at);
      const q = route.getPointAtLength(Math.min(at + 2, L));
      const r = route.getPointAtLength(Math.max(at - 2, 0));
      const deg = Math.atan2(q.y - r.y, q.x - r.x) * 180 / Math.PI;
      truck.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      heading.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
      route.style.strokeDashoffset = (L * (1 - gp)).toFixed(1);

      gpsText += dt;
      if (dt && gpsText < 0.4) return;            // readouts change a few times a second, not every frame
      gpsText = 0;
      speed = 50 + Math.sin(t / 1900) * 7 + Math.sin(t / 530) * 2;
      const left = TRIP_KM * (1 - gp);
      gpsOut.speed.textContent = Math.round(speed);
      gpsOut.left.textContent = left.toFixed(1);
      gpsOut.eta.textContent = Math.max(1, Math.round(left / 48 * 60));
      const lat = FROM.lat + (TO.lat - FROM.lat) * gp;
      const lng = FROM.lng + (TO.lng - FROM.lng) * gp;
      gpsOut.coords.textContent = `${lat.toFixed(4)}° N · ${lng.toFixed(4)}° E`;
    }

    // first paint, so the map is complete even if nothing ever moves
    drawGps(0, 0);

    // ---------- Frame loop for the GPS console, running only while the stack is on screen ----------
    let raf = 0, last = 0;
    function frame(t) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
      last = t;
      drawGps(dt, t);
    }
    const startLoop = () => { if (animate && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; };
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(([entry]) => { entry.isIntersecting ? startLoop() : stopLoop(); });
      io.observe(stack);
    } else startLoop();

    const cleanup = () => {
      stopLoop();
      if (io) io.disconnect();
    };
    if (!animate) return cleanup;

    // ---------- Stacking: as a card slides up over the one before, that one shrinks back and dims ----------
    // Measured from the cards' live positions on every scroll, which stays right while they're stuck.
    const desktop = window.matchMedia('(min-width: 861px)');
    function stackUpdate() {
      if (!desktop.matches) return;
      const vh = window.innerHeight;
      for (let i = 0; i < cards.length - 1; i++) {
        const next = cards[i + 1];
        const stuckAt = parseFloat(getComputedStyle(next).top) || 0;
        const p = Math.min(1, Math.max(0, (vh - next.getBoundingClientRect().top) / Math.max(1, vh - stuckAt)));
        gsap.set(cards[i], { scale: 1 - p * 0.06, '--shade': (p * 0.6).toFixed(3) });
      }
    }
    function stackReset() {
      if (!desktop.matches) gsap.set(cards, { clearProps: 'transform,--shade' });
      else stackUpdate();
    }
    desktop.addEventListener('change', stackReset, opts);

    if (window.ScrollTrigger) {
      own(() => {
        ScrollTrigger.create({
          trigger: stack, start: 'top bottom', end: 'bottom top',
          onUpdate: stackUpdate, onRefresh: stackUpdate,
        });
      });

      // ---------- Entrance ----------
      Promise.resolve(document.fonts && document.fonts.ready).then(() => {
        if (api.signal.aborted) return;
        own(() => {
          // Title: lines rise out of masks, then the split is undone so the live dot's ripple isn't clipped
          const title = $('.fleet__title');
          if (window.SplitText) {
            gsap.registerPlugin(SplitText);
            const split = SplitText.create(title, { type: 'lines', mask: 'lines' });
            gsap.from(split.lines, {
              yPercent: 105, duration: 1.1, ease: 'power4.out', stagger: 0.12,
              scrollTrigger: { trigger: title, start: 'top 85%' },
              onComplete: () => split.revert(),
            });
          }
          gsap.from($$('.fleet__head .about__eyebrow, .fleet__lead'), {
            y: 30, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.12,
            scrollTrigger: { trigger: $('.fleet__head'), start: 'top 85%' },
          });

          // Each card's copy rises; the live (GPS) console also opens from its middle and its corners
          // snap in. The still consoles simply arrive with their card, like a picture.
          cards.forEach((card) => {
            const tl = gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 80%' } })
              .from(card.querySelectorAll('.fleet-card__body > *'), { y: 40, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.08 }, 0.2);
            const fc = card.querySelector('.fc:not(.fc--still)');
            if (!fc) return;
            tl.fromTo(fc, { clipPath: 'inset(50% 0% 50% 0% round 20px)' },
                { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.2, ease: 'expo.inOut', clearProps: 'clipPath' }, 0)
              .from(fc.querySelectorAll('.fc__bar > *'), { y: 12, autoAlpha: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08 }, 0.7)
              .from(fc.querySelectorAll('.fc__corner'), { scale: 2.4, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 }, 0.8);
          });
          ScrollTrigger.refresh();
        });
      });
    }

    return cleanup;
  },
});
