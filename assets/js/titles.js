// Page titles (the 117px headings at the top of each page) rise in line by line,
// like the homepage hero title. Runs as a module (see app.js) for every page that comes in.
(window.GSModules = window.GSModules || []).push({
  name: 'titles',
  init(container, api) {
    const root = document.documentElement;
    // first load hides titles via html.titles-pending; transitions mark the incoming container instead
    const ready = () => {
      root.classList.remove('titles-pending');
      container.removeAttribute('data-titles-pending');
    };
    if (!window.gsap || !window.SplitText || api.reduce) { ready(); return; }
    gsap.registerPlugin(SplitText);

    const titles = container.querySelectorAll('.sub-hero__title, .page-title');
    if (!titles.length) { ready(); return; }

    // wait for GS Compressed so lines are measured with the real font, and for the page to be revealed
    Promise.all([document.fonts.ready, api.revealed]).then(() => {
      if (api.signal.aborted) return;           // page already left
      api.add(() => {
        titles.forEach((el) => {
          SplitText.create(el, {
            type: 'lines',
            mask: 'lines',
            linesClass: 'titleline',   // masks become .titleline-mask
            autoSplit: true,           // re-split when the width changes
            onSplit(self) {
              return gsap.from(self.lines, {
                yPercent: 105,
                duration: 1,
                ease: 'power4.out',
                stagger: 0.12,
                // arriving by transition: rise as the wipe uncovers the top of the page
                delay: api.entering ? 0.6 : 0.15,
              });
            },
          });
        });
      });
      ready();
    });
  },
});
