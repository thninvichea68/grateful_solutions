// App shell: smooth scroll, page-script lifecycle and async page transitions.
//
// Every page keeps its content in [data-transition="container"] inside [data-transition="wrapper"];
// the menu bar stays outside and persists. Clicking an internal link fetches the next page,
// appends its container, and plays the transition (old page drops back and fades while the
// new one wipes up from the bottom). Then the old container is removed and its scripts torn down.
//
// Page scripts register themselves on window.GSModules as { name, init(container, api) }.
// init runs inside a gsap.context scoped to the container, gets an AbortSignal for listeners,
// and may return a cleanup function. Without GSAP, or with reduced motion, links navigate normally.
(function () {
  const gsap = window.gsap;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const modules = window.GSModules || [];
  const nav = document.getElementById('nav');
  const wrapper = document.querySelector('[data-transition="wrapper"]');
  const navOffset = () => -(nav ? nav.offsetHeight : 0);
  let busy = false;                                  // true while a transition runs; clicks are ignored
  let currentPath = location.pathname;

  if (gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // ---------- Smooth scroll (one Lenis for the whole visit) ----------
  let lenis = null;
  if (gsap && !reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.2 });
    window.lenis = lenis;                          // nav.js pauses it while the phone menu is open
    if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  function scrollToTarget(target, immediate) {
    if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : navOffset(), immediate, force: true });
    else if (target === 0) window.scrollTo(0, 0);
    else target.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' });
  }

  // ---------- Page-script lifecycle ----------
  // mount() starts every module on a container. It returns:
  //   freeze()  - stop reacting (listeners off, ScrollTriggers killed where they stand, no reverts),
  //               so the outgoing page holds perfectly still while it animates away
  //   dispose() - the full teardown, run later when nothing is moving
  //
  // api.revealed resolves when the page first comes into view: straight away on a normal load, or the
  // moment the transition starts moving. Entrance animations (title rise, intro build) wait for it,
  // so they play as the page is uncovered instead of underneath the curtain.
  function mount(container, { entering = false, revealed = Promise.resolve() } = {}) {
    const ac = new AbortController();
    const cleanups = [];
    const ctx = gsap ? gsap.context(() => {}, container) : null;
    const api = { ctx, signal: ac.signal, reduce, lenis, entering, revealed, add: (fn) => (ctx ? ctx.add(fn) : fn()) };
    modules.forEach((m) => {
      try {
        api.add(() => {
          const c = m.init(container, api);
          if (typeof c === 'function') cleanups.push(c);
        });
      } catch (err) { console.error(`[${m.name}]`, err); }
    });
    return {
      freeze() {
        ac.abort();
        if (window.ScrollTrigger) {
          ScrollTrigger.getAll().forEach((st) => {
            if (st.trigger && container.contains(st.trigger)) st.kill(false);
          });
        }
      },
      dispose() {
        ac.abort();
        cleanups.forEach((c) => { try { c(); } catch (err) { console.error(err); } });
        if (ctx) ctx.revert();
      },
    };
  }

  let container = document.querySelector('[data-transition="container"]');
  let page = mount(container);

  // Arriving with a #hash: glide to it once the layout has settled
  if (location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) window.addEventListener('load', () => scrollToTarget(target, true));
  }

  // ---------- Async transitions ----------
  const canTransition = gsap && !reduce && wrapper && container && window.fetch && window.DOMParser;
  const samePath = (a, b) => a.replace(/index\.html$/, '') === b.replace(/index\.html$/, '');

  // Same-page links (#ports, the logo on the homepage) glide instead of jumping
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;            // tel:, mailto: and other sites go through
    if (samePath(url.pathname, location.pathname)) {
      e.preventDefault();
      if (busy) return;
      const target = url.hash.length > 1 ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : 0;
      if (target !== null) scrollToTarget(target, false);
      return;
    }
    if (!canTransition) return;                              // normal navigation
    e.preventDefault();
    if (busy) return;
    navigate(url);
  });

  if (!canTransition) return;

  const ease = window.CustomEase
    ? (gsap.registerPlugin(CustomEase), CustomEase.create('pageTransition', 'M0,0 C0.38,0.05 0.48,0.58 0.65,0.82 0.82,1 1,1 1,1'))
    : 'power3.inOut';

  // The persistent menu bar was written with paths relative to the first page: make them absolute
  nav.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', a.href));
  nav.querySelectorAll('img[src]').forEach((img) => img.setAttribute('src', img.src));
  document.querySelectorAll('head style').forEach((s) => s.setAttribute('data-page-style', ''));

  // Fetch each page once; hovering a link starts the fetch early
  const cache = new Map();
  function load(url) {
    const key = url.pathname;
    if (!cache.has(key)) {
      cache.set(key, fetch(url.pathname, { credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
        .catch((err) => { cache.delete(key); throw err; }));
    }
    return cache.get(key);
  }
  const prefetch = (link) => {
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && !samePath(url.pathname, location.pathname)) load(url).catch(() => {});
  };
  ['pointerover', 'touchstart', 'focusin'].forEach((type) => document.addEventListener(type, (e) => {
    const link = e.target.closest && e.target.closest('a[href]');
    if (link) prefetch(link);
  }, { passive: true }));
  // The site is small: once the page is idle, fetch every page linked from the menu bar
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  window.addEventListener('load', () => idle(() => nav.querySelectorAll('a[href]').forEach(prefetch)));

  // Decode the incoming page's photos before anything moves, so no frame stalls on a big image.
  // (Images start loading as soon as importNode creates them; preloads come from the page's <head>.)
  function decodeImages(next, doc, url) {
    const imgs = [...next.querySelectorAll('img:not([loading="lazy"])')];
    doc.querySelectorAll('head link[rel="preload"][as="image"]').forEach((l) => {
      const media = l.getAttribute('media');
      if (media && !window.matchMedia(media).matches) return;   // e.g. the phone-sized hero on desktop
      const img = new Image();
      img.src = new URL(l.getAttribute('href'), url).href;
      imgs.push(img);
    });
    const all = Promise.all(imgs.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})));
    return Promise.race([all, new Promise((res) => setTimeout(res, 450))]);
  }

  // The transition, as in the Codrops demo: the old page drops back, shrinks and dims while the new
  // one wipes up from the bottom. The wipe is built from transforms only, so the GPU just moves
  // layers and nothing repaints mid-motion (a clip-path wipe repaints the whole screen every frame):
  //   curtain (fixed, dark, clips)  slides up 100%   -> its bottom edge is the wipe line
  //     hold                        slides down 100% -> cancels that, so the old page stays put
  //       old page (screen-sized)   drifts up, shrinks, dims
  // The new page sits still underneath, fully laid out, and is uncovered as the curtain leaves.
  const DURATION = 0.9;
  function pageTransition(curtain, hold, current) {
    return gsap.timeline()
      .to(curtain, { yPercent: -100, duration: DURATION, force3D: true, ease }, 0)
      .to(hold, { yPercent: 100, duration: DURATION, force3D: true, ease }, 0)
      .to(current, { y: '-30vh', opacity: 0.4, scale: 0.8, duration: DURATION, force3D: true, ease }, 0);
  }

  // Lift the outgoing page into the curtain as a screen-sized view scrolled to where the visitor was.
  // Its ScrollTriggers are killed where they stand first, so it holds perfectly still.
  function snapshot(current) {
    const y = window.scrollY;
    freezePins(current);
    page.freeze();
    const curtain = document.createElement('div');
    const hold = document.createElement('div');
    curtain.className = 'pt-curtain';
    hold.className = 'pt-hold';
    curtain.appendChild(hold);
    document.body.appendChild(curtain);
    current.classList.add('pt-old');                // (CSS: restarted animations finish instantly)
    hold.appendChild(current);
    current.scrollTop = y;
    return { curtain, hold };
  }

  // Pinned sections are position:fixed; inside the scaled page they'd jump, so hold them where they are
  function freezePins(scope) {
    if (!window.ScrollTrigger) return;
    ScrollTrigger.getAll().forEach((st) => {
      const pin = st.pin;
      if (!pin || !st.isActive || !scope.contains(pin) || getComputedStyle(pin).position !== 'fixed') return;
      const r = pin.getBoundingClientRect();
      const box = pin.parentNode.getBoundingClientRect();
      pin.style.position = 'absolute';
      pin.style.top = `${r.top - box.top}px`;
      pin.style.left = `${r.left - box.left}px`;
    });
  }

  // Move the menu bar's "current page" mark to match the new page
  function syncNav(doc, url) {
    const current = doc.querySelector('#nav a[aria-current="page"]');
    const path = current ? new URL(current.getAttribute('href'), url).pathname : null;
    nav.querySelectorAll('a[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
    if (!path) return;
    nav.querySelectorAll('a[href]').forEach((a) => {
      const u = new URL(a.href);
      if (samePath(u.pathname, path) && !u.hash) a.setAttribute('aria-current', 'page');
    });
  }

  async function navigate(url, { push = true } = {}) {
    busy = true;
    // close the mega menu / phone menu (nav.js listens for Escape)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    let html;
    try {
      html = await load(url);
    } catch {
      location.href = url.href;                       // offline, file:// or an error page: go the normal way
      return;
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const incoming = doc.querySelector('[data-transition="container"]');
    if (!incoming) { location.href = url.href; return; }

    if (push) history.pushState({}, '', url.href);  // before importing, so relative paths resolve to the new page
    currentPath = url.pathname;
    const next = document.importNode(incoming, true);
    await decodeImages(next, doc, url);

    // Head: title, description and any page-only styles (the legal pages carry their own)
    document.title = doc.title;
    const desc = doc.querySelector('meta[name="description"]');
    const ownDesc = document.querySelector('meta[name="description"]');
    if (desc && ownDesc) ownDesc.setAttribute('content', desc.getAttribute('content'));
    const oldStyles = [...document.querySelectorAll('head style[data-page-style]')];
    doc.querySelectorAll('head style').forEach((s) => {
      const copy = document.createElement('style');
      copy.textContent = s.textContent;
      copy.setAttribute('data-page-style', '');
      document.head.appendChild(copy);
    });

    // Body theme (light pages turn the menu bar dark) and the nav's current-page mark
    document.body.className = doc.body.className;
    syncNav(doc, url);

    const current = container;
    const outgoing = page;
    lenis && lenis.stop();
    document.documentElement.classList.add('is-transitioning');   // also keeps the menu bar solid
    const { curtain, hold } = snapshot(current);

    // The new page goes in at its final place in the flow, at the top, under the curtain.
    // Its scripts start now, against the real layout, so nothing has to be set up after the motion.
    next.setAttribute('data-titles-pending', '');   // big titles stay hidden until titles.js splits them
    next.setAttribute('data-intro-wait', '');       // CSS entrance animations hold until the reveal
    let reveal;
    const revealed = new Promise((res) => { reveal = res; });
    wrapper.appendChild(next);
    window.scrollTo(0, 0);
    if (lenis) { lenis.scrollTo(0, { immediate: true, force: true }); lenis.resize(); }
    container = next;
    page = mount(next, { entering: true, revealed });
    if (window.ScrollTrigger) ScrollTrigger.refresh();
    setTimeout(() => next.removeAttribute('data-titles-pending'), 3000);   // safety net

    // Let that setup paint, and start the motion only once frames are coming at a steady rate again,
    // so the animation clock never starts on a stalled frame
    await steadyFrames();
    // the new page's entrance clock starts with the wipe
    next.removeAttribute('data-intro-wait');
    reveal();
    await pageTransition(curtain, hold, current);

    curtain.remove();
    oldStyles.forEach((s) => s.remove());
    document.documentElement.classList.remove('is-transitioning');
    window.dispatchEvent(new Event('scroll'));       // menu bar settles to the new page's top state
    if (lenis) lenis.start();
    busy = false;

    if (url.hash.length > 1) {
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target) scrollToTarget(target, false);
    }
    // the old page's full teardown waits until the new page's entrance (title rise) has played out
    setTimeout(() => idle(() => outgoing.dispose()), 1200);
  }

  // Resolves after two consecutive quick frames (or 400ms at most)
  function steadyFrames() {
    return new Promise((res) => {
      const start = performance.now();
      let last = start, quick = 0;
      const tick = (t) => {
        quick = t - last < 20 ? quick + 1 : 0;
        last = t;
        if (quick >= 2 || t - start > 400) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // Back / forward
  window.addEventListener('popstate', () => {
    if (samePath(location.pathname, currentPath)) return;   // only the #hash changed
    if (busy) { location.reload(); return; }
    navigate(new URL(location.href), { push: false });
  });
})();
