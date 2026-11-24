// Fleet monitoring ("Trucks and vans tracked live") on the homepage.
//   tabs     GPS / cameras / 4G cycle on their own while the section is on screen (a progress line
//            fills on the active tab), pause while the pointer or focus is on them, and can be picked
//            by click or the arrow keys
//   console  each tab wipes its own view onto the HUD: a truck running its route with speed,
//            distance and arrival; camera feeds stepping through four cameras; a live 4G signal chart
//   entrance the title rises line by line, the console opens from its middle, its corners snap in
// The console numbers are illustrative. Without GSAP or with reduced motion nothing moves on its own,
// but the tabs still switch views. Runs as a module (see app.js).
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
    const timers = [];
    root.classList.add('fleet--js');

    const tabs = $$('.fleet-tab');
    const panel = $('#fleet-console');
    const screen = $('.fc__screen');
    const views = Object.fromEntries($$('.fc-view').map((v) => [v.dataset.view, v]));
    const modeEl = $('[data-fc-mode]');
    const descEl = $('[data-fc-desc]');
    const LABEL = { gps: 'GPS tracking', cam: 'On-board cameras', net: '4G network' };
    const DESC = {
      gps: 'Illustration: a truck moving along its route from the port to the factory, with its speed, distance to go and arrival time.',
      cam: 'Illustration: live feeds from the four cameras on board a truck.',
      net: 'Illustration: the 4G link of each vehicle, with signal strength over time and latency.',
    };
    const DWELL = 7;                               // seconds each feature stays up when cycling

    // ---------- Clock (Phnom Penh time) ----------
    let fmtTime, fmtDate;
    try {
      fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Phnom_Penh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      fmtDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    const clocks = $$('[data-fc-clock]');
    const stamps = $$('[data-fc-stamp]');
    function tickClock() {
      const now = new Date();
      const t = fmtTime.format(now);
      clocks.forEach((c) => { c.textContent = t; });
      stamps.forEach((s) => { s.textContent = `${fmtDate.format(now)}  ${t}`; });
    }
    tickClock();
    timers.push(setInterval(tickClock, 1000));

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
    phoneMQ.addEventListener('change', fitMap, { signal: api.signal });
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

    // ---------- Cameras: step through the four feeds ----------
    const camMain = $$('.fc-cam__main img');
    const camThumbs = $$('.fc-cam__thumb');
    const camLabel = $('[data-cam-label]');
    let cam = 0, camT = 0;
    function showCam(i) {
      cam = i;
      camMain.forEach((img, k) => img.classList.toggle('is-on', k === i));
      camThumbs.forEach((th, k) => th.classList.toggle('is-on', k === i));
      camLabel.textContent = camMain[i].dataset.cam;
    }
    function drawCam(dt) {
      camT += dt;
      if (camT < 3.2) return;
      camT = 0;
      showCam((cam + 1) % camMain.length);
    }

    // ---------- 4G: rolling signal chart ----------
    const net = Object.fromEntries($$('[data-net]').map((el) => [el.dataset.net, el]));
    const bars = [...net.bars.children];
    const units = $$('.fc-net__mini');
    const N = 40;
    let seed = 0.74;
    const quality = () => {
      // drift around a good signal, with the odd short dip
      seed += (0.76 - seed) * 0.18 + (Math.random() - 0.5) * 0.12;
      if (Math.random() < 0.04) seed -= 0.25;
      return (seed = Math.min(0.97, Math.max(0.28, seed)));
    };
    const series = Array.from({ length: N }, quality);
    let netT = 0, ago = 1;
    const plotY = (v) => 90 - (v - 0.25) / 0.75 * 78;   // quality 0.25..1 across most of the plot height
    function drawNet() {
      const pts = series.map((v, i) => `${(i * 400 / (N - 1)).toFixed(1)} ${plotY(v).toFixed(1)}`);
      const line = 'M' + pts.join('L');
      net.line.setAttribute('d', line);
      net.area.setAttribute('d', `${line}L400 100L0 100Z`);
      const v = series[N - 1];
      net.head.style.setProperty('--y', `${plotY(v).toFixed(1)}%`);
      const lit = Math.max(1, Math.ceil(v * 5));
      bars.forEach((b, i) => b.classList.toggle('is-on', i < lit));
      net.dbm.textContent = `−${Math.round(110 - v * 50)}`;
      net.ms.textContent = Math.round(28 + (1 - v) * 70 + Math.random() * 6);
      net.ago.textContent = ago;
    }
    function stepNet(dt) {
      netT += dt;
      if (netT < 0.5) return;
      netT = 0;
      series.shift();
      series.push(quality());
      ago = Math.random() < 0.8 ? 1 : 2;
      if (Math.random() < 0.15) {                  // another vehicle's bars shift now and then
        const u = units[(Math.random() * units.length) | 0];
        const n = 2 + ((Math.random() * 3) | 0);
        [...u.children].forEach((b, i) => b.classList.toggle('is-on', i < n));
      }
      drawNet();
    }

    // first paint of every view, so each is complete even if nothing ever moves
    drawGps(0, 0);
    drawNet();

    // ---------- One frame loop for the console, running only while it's on screen ----------
    let raf = 0, last = 0;
    function frame(t) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
      last = t;
      drawGps(dt, t);
      const view = tabs[current].dataset.view;
      if (view === 'cam') drawCam(dt);
      if (view === 'net') stepNet(dt);
    }
    const startLoop = () => { if (animate && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; };

    // ---------- Mode label: a short scramble into the new name ----------
    let scrambleTimer = 0;
    function setMode(text) {
      clearInterval(scrambleTimer);
      if (!animate) { modeEl.textContent = text; return; }
      const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789/#';
      let f = 0;
      const total = 14;
      scrambleTimer = setInterval(() => {
        f++;
        const shown = Math.floor(text.length * f / total);
        modeEl.textContent = [...text].map((ch, i) => (i < shown || ch === ' ' ? ch : chars[(Math.random() * chars.length) | 0])).join('');
        if (f >= total) { clearInterval(scrambleTimer); modeEl.textContent = text; }
      }, 32);
    }

    // ---------- Tabs ----------
    let current = 0;
    let inView = false, held = false;
    let progress = null;

    function switchView(fromView, toView) {
      const out = views[fromView], inn = views[toView];
      if (!animate) {
        out.classList.remove('is-active');
        inn.classList.add('is-active');
        return;
      }
      own(() => {
        gsap.killTweensOf([out, inn, $('.fc__wipe')]);
        Object.values(views).forEach((v) => v !== out && v !== inn && v.classList.remove('is-active', 'is-leaving'));
        out.classList.remove('is-active');
        out.classList.add('is-leaving');
        inn.classList.remove('is-leaving');
        inn.classList.add('is-active');
        const wipe = $('.fc__wipe');
        const w = screen.offsetWidth;
        gsap.timeline({ defaults: { ease: 'expo.inOut', duration: 0.9 } })
          .fromTo(inn, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', clearProps: 'clipPath' }, 0)
          .fromTo(wipe, { x: 0, autoAlpha: 1 }, { x: w, ease: 'expo.inOut' }, 0)
          .to(wipe, { autoAlpha: 0, duration: 0.2, ease: 'none' }, 0.75)
          .fromTo(root.querySelectorAll('.fc__corner'), { scale: 1.8 }, { scale: 1, duration: 0.7, ease: 'expo.out', stagger: 0.04 }, 0.35)
          .add(() => out.classList.remove('is-leaving'));
      });
    }

    function runProgress() {
      if (!animate) return;
      if (progress) progress.kill();
      const tab = tabs[current];
      const o = { p: 0 };
      tab.style.setProperty('--p', 0);
      own(() => {
        progress = gsap.to(o, {
          p: 1, duration: DWELL, ease: 'none', paused: true,
          onUpdate: () => tab.style.setProperty('--p', o.p.toFixed(4)),
          onComplete: () => select((current + 1) % tabs.length),
        });
      });
      syncPlay();
    }
    function syncPlay() {
      if (progress) (inView && !held) ? progress.play() : progress.pause();
      inView ? startLoop() : stopLoop();
    }

    function select(i, focus) {
      const prev = current;
      current = i;
      tabs.forEach((t, k) => {
        const on = k === i;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (!on) t.style.removeProperty('--p');
      });
      if (focus) tabs[i].focus();
      const view = tabs[i].dataset.view;
      panel.setAttribute('aria-labelledby', tabs[i].id);
      descEl.textContent = DESC[view];
      setMode(`0${i + 1} · ${LABEL[view]}`);
      if (prev !== i) {
        switchView(tabs[prev].dataset.view, view);
        if (view === 'cam') { camT = 0; showCam(0); }
      }
      runProgress();
    }
    tabs.forEach((t, k) => { t.tabIndex = k === 0 ? 0 : -1; });

    const opts = { signal: api.signal };
    tabs.forEach((t, k) => t.addEventListener('click', () => { if (k !== current) select(k); }, opts));
    $('.fleet__tabs').addEventListener('keydown', (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      let next = null;
      if (e.key in keys) next = (current + keys[e.key] + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      select(next, true);
    }, opts);

    // Hold the cycle while someone is looking: pointer over the tabs or console, or focus on a tab
    const body = $('.fleet__body');
    let hovering = false, focused = false;
    const hold = () => { held = hovering || focused; syncPlay(); };
    body.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovering = true; hold(); } }, opts);
    body.addEventListener('pointerleave', () => { hovering = false; hold(); }, opts);
    // keyboard focus only: a mouse click also focuses the tab, and that shouldn't stop the cycle for good
    body.addEventListener('focusin', (e) => {
      let kb = true;
      try { kb = e.target.matches(':focus-visible'); } catch { /* older browsers: treat as keyboard */ }
      if (kb) { focused = true; hold(); }
    }, opts);
    body.addEventListener('focusout', (e) => { if (!body.contains(e.relatedTarget)) { focused = false; hold(); } }, opts);

    // Only cycle and animate while the console is on screen
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncPlay(); }, { threshold: 0.15 });
      io.observe(body);
    }
    runProgress();

    // ---------- Pointer: a soft spotlight follows it across the console (the card itself stays flat) ----------
    const fc = $('.fc');
    const fcIn = $('.fc__in');
    if (animate && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      fc.addEventListener('pointermove', (e) => {
        const r = fc.getBoundingClientRect();
        fcIn.style.setProperty('--mx', `${((e.clientX - r.left) / r.width * 100).toFixed(1)}%`);
        fcIn.style.setProperty('--my', `${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`);
      }, opts);
    }

    if (!animate) return () => { timers.forEach(clearInterval); clearInterval(scrambleTimer); if (io) io.disconnect(); };

    // ---------- Entrance ----------
    if (window.ScrollTrigger) {
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

          // Console opens from its middle, the corners snap in, the tabs rise
          gsap.timeline({ scrollTrigger: { trigger: body, start: 'top 78%' } })
            .fromTo(panel, { clipPath: 'inset(50% 0% 50% 0% round 20px)' },
              { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.3, ease: 'expo.inOut', clearProps: 'clipPath' }, 0)
            .from($$('.fc__bar > *'), { y: 12, autoAlpha: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08 }, 0.8)
            .from($$('.fc__corner'), { scale: 2.4, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06 }, 0.9)
            .from(tabs, { y: 50, autoAlpha: 0, duration: 1, ease: 'power3.out', stagger: 0.1 }, 0.15);
          ScrollTrigger.refresh();
        });
      });
    }

    return () => {
      timers.forEach(clearInterval);
      clearInterval(scrambleTimer);
      stopLoop();
      if (io) io.disconnect();
      if (progress) progress.kill();
    };
  },
});
