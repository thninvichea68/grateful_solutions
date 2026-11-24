// Quote form: opens the visitor's email app with a subject line and a tidy, sectioned body.
// mailto: drafts are plain text only, so the layout uses headings, rules and line breaks.
// Without JS the form still falls back to its plain mailto action.
// Runs as a module (see app.js) for every page that comes in.
(window.GSModules = window.GSModules || []).push({
  name: 'quote',
  init(container) {
  const form = container.querySelector('#quote-form');
  if (!form) return;
  const to = form.getAttribute('action').replace(/^mailto:/, '');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (name) => (form.elements[name].value || '').trim();
    const rule = '------------------------------';

    const name = v('name'), company = v('company'), service = v('service');
    const subject = `Quote request: ${service} - ${company || name}`;

    const body = [
      'Hello Grateful Solutions team,',
      '',
      `I'd like a quote for ${service.toLowerCase()}. My details are below.`,
      '',
      'CONTACT DETAILS',
      rule,
      `Name: ${name}`,
      `Company: ${company}`,
      `Email: ${v('email')}`,
      `Phone / Telegram: ${v('phone')}`,
      '',
      'SHIPMENT',
      rule,
      `Service: ${service}`,
      `Port: ${v('port')}`,
      '',
      'ABOUT THE SHIPMENT',
      rule,
      v('message') || '(No details added yet)',
      '',
      'Thank you,',
      name,
      '',
      '',
      'Sent from the quote form on the Grateful Solutions website',
    ].join('\r\n');

    window.location.href =
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
  },
});
