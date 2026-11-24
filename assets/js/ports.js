// Port map ("Where your cargo arrives"): a sticky map camera beside three port chapters.
// As each chapter crosses the middle of the screen the camera pans and zooms to that gateway,
// its route draws in from Phnom Penh, a truck dot runs the road and the distance counts up.
// Positioning is plain JS; GSAP only adds the motion and is skipped for reduced motion.
// Runs as a module (see app.js): every tween goes through api.add so leaving the page kills it.
(window.GSModules = window.GSModules || []).push({
  name: 'ports',
  init(container, api) {
  const root = container.querySelector('.pm');
  if (!root) return;

  const stage = root.querySelector('.pm__stage');
  const world = stage.querySelector('.pm-world');
  const W = 672, H = 559;                       // map space (the company-profile map)
  const gsap = !api.reduce && window.gsap ? window.gsap : null;
  const own = (fn) => api.add(fn);              // record event-driven tweens in the page's gsap context
  const phone = window.matchMedia('(max-width: 860px)');

  // Camera presets: centre (x, y) in map space and zoom (s = 1 fits the whole country)
  const VIEWS = {
    all: { x: 336, y: 272, s: 1 },
    kti: { x: 321, y: 429, s: 3.1 },
    pnh: { x: 351, y: 421, s: 2.6 },
    shv: { x: 248, y: 452, s: 2 },
  };
  const TRUCK_TIME = { kti: 1.6, pnh: 2, shv: 3.6 };   // seconds per run, longer road = longer run

  const chapters = [...root.querySelectorAll('.pm-port')];
  const ids = chapters.map((c) => c.dataset.port);
  const anchors = [...stage.querySelectorAll('[data-x]')];
  const pins = [...stage.querySelectorAll('.pm-pin')];
  const truck = stage.querySelector('.pm-truck');
  const crossX = stage.querySelector('.pm-cross--x');
  const crossY = stage.querySelector('.pm-cross--y');
  const hudRoute = root.querySelector('#pm-hud-route');
  const hudIdx = root.querySelector('#pm-hud-idx');
  const bases = [...stage.querySelectorAll('.pm-route--base')];
  const lines = {};
  stage.querySelectorAll('.pm-route--line').forEach((p) => {
    const len = p.getTotalLength();
    lines[p.dataset.port] = { el: p, len, draw: { o: len } };
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
  });

  root.classList.add('pm--js');
  root.dataset.active = 'all';

  const cam = { ...VIEWS.all };
  let fw = 0, fh = 0, k0 = 1;
  let active = null;

  function measure() {
    fw = stage.clientWidth;
    fh = stage.clientHeight;
    // leave room for the HUD at the top and the tags around the coast
    k0 = Math.min(fw / W, (fh - 40) / H) * 0.88;
    render();
  }

  function toScreen(x, y) {
    const k = k0 * cam.s;
    return [(x - cam.x) * k + fw / 2, (y - cam.y) * k + fh / 2 + 16];
  }
  function place(el) {
    const [sx, sy] = toScreen(+el.dataset.x, +el.dataset.y);
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    return [sx, sy];
  }

  function render() {
    const k = k0 * cam.s;
    const [ox, oy] = toScreen(0, 0);
    world.setAttribute('transform', `translate(${ox} ${oy}) scale(${k})`);

    // Keep route strokes the same width on screen at every zoom
    bases.forEach((p) => {
      p.style.strokeWidth = 1.5 / k;
      p.style.strokeDasharray = `${3 / k} ${5 / k}`;
    });
    for (const id in lines) lines[id].el.style.strokeWidth = 2.5 / k;

    anchors.forEach(place);

    if (active) {
      const pin = pins.find((p) => p.dataset.port === active);
      const [sx, sy] = toScreen(+pin.dataset.x, +pin.dataset.y);
      crossX.style.transform = `translate3d(0, ${sy.toFixed(1)}px, 0)`;
      crossY.style.transform = `translate3d(${sx.toFixed(1)}px, 0, 0)`;
    }

    // Dot-grid floor moves with the map, scaled more gently so it reads as depth
    const g = 28 * Math.sqrt(cam.s);
    stage.style.setProperty('--gs', g.toFixed(2) + 'px');
    stage.style.setProperty('--gx', (ox % g).toFixed(1) + 'px');
    stage.style.setProperty('--gy', (oy % g).toFixed(1) + 'px');
  }

  // ---- Route drawing, truck and counters ----
  function setDraw(id, on) {
    const r = lines[id];
    const to = on ? 0 : r.len;
    if (!gsap) { r.draw.o = to; r.el.style.strokeDashoffset = to; return; }
    own(() => gsap.to(r.draw, {
      o: to, overwrite: true,
      duration: on ? 1.3 : 0.5, delay: on ? 0.45 : 0, ease: on ? 'power2.inOut' : 'power2.in',
      onUpdate: () => { r.el.style.strokeDashoffset = r.draw.o; },
    }));
  }

  let truckTween = null;
  function runTruck(id) {
    if (truckTween) { truckTween.kill(); truckTween = null; }
    truck.classList.remove('is-on');
    if (!gsap || !id) return;
    const r = lines[id];
    const prog = { t: 0 };
    own(() => { truckTween = gsap.to(prog, {
      t: 1, duration: TRUCK_TIME[id], ease: 'power1.inOut',
      delay: 1.6, repeat: -1, repeatDelay: 0.7,
      onStart: () => truck.classList.add('is-on'),
      onUpdate: () => {
        const p = r.el.getPointAtLength(prog.t * r.len);
        truck.dataset.x = p.x;
        truck.dataset.y = p.y;
        place(truck);
      },
    }); });
  }

  function countUp(chapter) {
    const num = chapter.querySelector('[data-count]');
    const target = +num.dataset.count;
    if (!gsap) { num.textContent = target; return; }
    const c = { v: 0 };
    own(() => gsap.to(c, {
      v: target, duration: 1.4, ease: 'power3.out', overwrite: true,
      onUpdate: () => { num.textContent = Math.round(c.v); },
    }));
  }

  function setActive(id) {
    if (id === active) return;
    const prev = active;
    active = id;
    root.dataset.active = id || 'all';
    chapters.forEach((c) => c.classList.toggle('is-active', c.dataset.port === id));
    pins.forEach((p) => p.classList.toggle('is-active', p.dataset.port === id));

    if (prev) setDraw(prev, false);
    if (id) {
      setDraw(id, true);
      countUp(chapters[ids.indexOf(id)]);
      hudRoute.textContent = `Phnom Penh → ${pins.find((p) => p.dataset.port === id).textContent.trim()}`;
      hudIdx.textContent = String(ids.indexOf(id) + 1).padStart(2, '0');
    } else {
      hudRoute.textContent = 'Phnom Penh · 3 gateways';
      hudIdx.textContent = '00';
    }
    runTruck(id);

    const view = VIEWS[id || 'all'];
    if (gsap) own(() => gsap.to(cam, { ...view, duration: 1.5, ease: 'power3.inOut', overwrite: true, onUpdate: render }));
    else { Object.assign(cam, view); render(); }
  }

  // ---- Which chapter is current: the last one whose content has risen past the trigger line ----
  // (measured from each chapter's badge row, so the overview shows until the first port's copy arrives)
  const heads = chapters.map((c) => c.querySelector('.pm-port__top'));
  function check() {
    const vh = window.innerHeight;
    // phones: the map covers the top half, so read the chapters in the lower half
    const line = phone.matches ? vh * 0.8 : vh * 0.62;
    let id = null;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < line) id = ids[i]; });
    setActive(id);
  }

  // ---- First reveal: provinces ripple out from Phnom Penh (paths are ordered by distance) ----
  let io = null;
  if (gsap && 'IntersectionObserver' in window) {
    const provs = stage.querySelectorAll('.pm-prov path');
    const extras = stage.querySelectorAll('.pm-coast, .pm-water, .pm-river, .pm-route--base');
    const marks = stage.querySelectorAll('.pm-city, .pm-pin, .pm-country');
    gsap.set(provs, { opacity: 0 });
    gsap.set(extras, { opacity: 0 });
    gsap.set(marks, { autoAlpha: 0 });
    io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      own(() => gsap.timeline({ defaults: { ease: 'power2.out' } })
        .to(provs, { opacity: 1, duration: 0.9, stagger: 0.035 }, 0)
        .to(extras, { opacity: 1, duration: 1.2, stagger: 0.1 }, 0.3)
        // clearProps hands opacity back to the CSS dimming of inactive pins
        .to(marks, { autoAlpha: 1, duration: 0.6, stagger: 0.08, clearProps: 'opacity,visibility' }, 0.8));
    }, { threshold: 0.25 });
    io.observe(stage);
  }

  // Overview index rows: hovering lights the pin and sweeps a cyan fill across the row.
  // The fill is a navy-text copy of the row, clipped: in from the left, out to the right.
  const index = root.querySelector('.pm-index');
  if (gsap) index.classList.add('is-wiping');
  root.querySelectorAll('.pm-index a').forEach((a) => {
    const pin = pins.find((p) => p.dataset.port === a.dataset.port);
    const fill = document.createElement('span');
    fill.className = 'pm-index__fill';
    fill.setAttribute('aria-hidden', 'true');
    a.querySelectorAll('.pm-index__name, .pm-index__km').forEach((n) => fill.appendChild(n.cloneNode(true)));
    a.appendChild(fill);

    let shown = false;   // false once a leave sweep has fully finished
    const wipe = { duration: 0.6, ease: 'power3.inOut', overwrite: true };
    const on = () => {
      pin.classList.add('is-hover');
      if (!gsap) return;
      // fully hidden: restart from the left edge; mid-leave: pull the fill back from where it is
      if (!shown) gsap.set(fill, { clipPath: 'inset(0% 100% 0% 0%)' });
      shown = true;
      own(() => gsap.to(fill, { ...wipe, clipPath: 'inset(0% 0% 0% 0%)' }));
    };
    const off = () => {
      pin.classList.remove('is-hover');
      if (!gsap) return;
      own(() => gsap.to(fill, { ...wipe, clipPath: 'inset(0% 0% 0% 100%)', onComplete: () => { shown = false; } }));
    };
    a.addEventListener('mouseenter', on);
    a.addEventListener('focus', on);
    a.addEventListener('mouseleave', off);
    a.addEventListener('blur', off);
  });

  // Pins and index rows jump to their chapter (app.js glides same-page links)
  const { signal } = api;
  measure();
  check();
  let ro = null;
  if ('ResizeObserver' in window) { ro = new ResizeObserver(measure); ro.observe(stage); }
  else window.addEventListener('resize', measure, { signal });
  window.addEventListener('resize', check, { signal });
  window.addEventListener('scroll', check, { passive: true, signal });
  document.fonts && document.fonts.ready.then(() => { if (!signal.aborted) measure(); });

  // leaving the page: stop observing (tweens and listeners go with the context and the signal)
  return () => {
    if (ro) ro.disconnect();
    if (io) io.disconnect();
  };
  },
});
