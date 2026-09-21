// Builds the site from the template, the two content files, the logo and the photos.
// Outputs:
//   prototype/index.html  English page fragment (for the claude.ai preview)
//   index.html            English page, complete document (site root, hosted)
//   ar/index.html         Arabic page, complete document
//   <old-path>/index.html forwarding pages for every address the old Wix site had
//   404.html, robots.txt, sitemap.xml
// Usage: node prototype/build.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const SITE = 'https://www.qabaspharmacy.com';
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
const dataUri = (p, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(root, p)).toString('base64');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

const en = JSON.parse(read('content/site-content.en.json'));
const ar = JSON.parse(read('content/site-content.ar.json'));
const CONTENT = { en, ar };

// 1. Template with assets and content embedded
let base = read('prototype/index.template.html');
// Pictures are linked as files, not embedded, so the page itself stays small and the
// browser can fetch them in parallel and skip the ones nobody scrolls to.
base = base.split('__LOGO__').join('/assets/logo-alqabas.png');
base = base.split('__LOGO_WHITE__').join('/assets/logo-alqabas-white.png');
base = base.split('__LOGO_MARK__').join('/assets/logo-mark.png');
base = base.split('__LOGO_EPPENDORF__').join('/assets/logo-eppendorf.png');
for (const f of fs.readdirSync(path.join(root, 'assets/photos'))) {
  if (!/\.(jpe?g|png)$/i.test(f)) continue; // skip sub folders such as the raw sources
  base = base.split(`__IMG_${f.replace(/\.jpg$/, '')}__`).join('/assets/photos/' + f);
}
base = base.replace('__CONTENT_EN__', JSON.stringify(en)).replace('__CONTENT_AR__', JSON.stringify(ar));
const left = base.match(/__IMG_\w+__/g);
if (left) throw new Error('Unresolved image placeholders: ' + left.join(', '));

// 2. Static pre-render: run the page script against a tiny DOM stand-in and capture what it writes
function staticRender(lang) {
  const script = base.slice(base.lastIndexOf('<script>') + 8, base.lastIndexOf('</script>'));
  const sink = {};
  const fakeEl = (sel) => ({ set innerHTML(v) { sink[sel] = v; }, get innerHTML() { return sink[sel] || ''; }, addEventListener() {}, setAttribute() {}, classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } }, querySelector() { return fakeEl(sel); }, querySelectorAll() { return []; }, dataset: {}, hidden: false, closest() { return fakeEl(sel); }, remove() {}, style: {} });
  const sandbox = {
    document: { querySelector: fakeEl, querySelectorAll: () => [], getElementById: () => null, documentElement: {}, title: '', hidden: false, addEventListener() {}, removeEventListener() {} },
    window: {}, matchMedia: () => ({ matches: true }), localStorage: { getItem() { return null; }, setItem() {} },
    location: { search: '?lang=' + lang, pathname: lang === 'ar' ? '/ar/' : '/', hostname: 'build.local' },
    URLSearchParams: class { get(k) { return k === 'lang' ? lang : null; } },
    performance: { now: () => 0 }, requestAnimationFrame() {}, cancelAnimationFrame() {}, console, fetch: () => Promise.resolve({ ok: true }),
    addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1
  };
  vm.runInNewContext(script, sandbox);
  return sink;
}
function injectSink(html, sink) {
  for (const [sel, inner] of Object.entries(sink)) {
    const marker = 'id="' + sel.replace('#', '') + '"';
    const at = html.indexOf(marker);
    if (at < 0) { console.warn('no container for', sel); continue; }
    const gt = html.indexOf('>', at);
    if (html.slice(gt + 1, gt + 3) !== '</') { console.warn('container not empty for', sel); continue; }
    html = html.slice(0, gt + 1) + inner + html.slice(gt + 1);
  }
  return html;
}
// Replace the text of every data-i18n element with the given language's string
function applyI18n(html, lang) {
  const c = CONTENT[lang];
  const uiMatch = base.match(new RegExp("\\n\\s*" + lang + ": (\\{.*?\\}),?\\n"));
  return html.replace(/(<(\w+)([^>]*)\sdata-i18n="([^"]+)"([^>]*)>)([^<]*)(<\/\2>)/g, (m, open, tag, a, key, b, text, close) => {
    let v = key.startsWith('ui.') ? null : get(c, key);
    if (key.startsWith('ui.')) {
      // ui strings live in the page script; pull them from the UI object literal for this language
      const re = new RegExp(key.slice(3) + ": '((?:[^'\\\\]|\\\\.)*)'");
      const src = base.slice(base.indexOf('const UI = {'), base.indexOf('const ICONS = {'));
      const block = src.split('\n').find((l) => l.trim().startsWith(lang + ':')) || '';
      const mm = block.match(re); v = mm ? mm[1].replace(/\\'/g, "'") : null;
    }
    return typeof v === 'string' ? open + esc(v) + close : m;
  });
}

function pageHtml(lang) {
  let html = injectSink(base, staticRender(lang));
  html = applyI18n(html, lang);
  return html;
}

// 3. Complete document wrapper for hosting
function fullDoc(fragment, lang) {
  const c = CONTENT[lang];
  const cut = fragment.indexOf('<header');
  let headPart = fragment.slice(0, cut), bodyPart = fragment.slice(cut);
  headPart = headPart.replace(/<title>[^<]*<\/title>/, '');
  const url = SITE + (lang === 'ar' ? '/ar/' : '/');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': SITE + '/#organization',
    name: 'Al Qabas Pharmacy L.L.C', alternateName: 'صيدلية القبس ش.م.م', url: SITE + '/', logo: SITE + '/assets/favicon-512.png',
    description: en.meta.metaDescription, telephone: '+96822495161', email: 'info@qabaspharmacy.com', foundingDate: '2018',
    address: { '@type': 'PostalAddress', postOfficeBoxNumber: '307', postalCode: '124', addressLocality: 'Muscat', addressCountry: 'OM' },
    areaServed: ['Oman', 'Middle East', 'Africa'],
    contactPoint: [{ '@type': 'ContactPoint', telephone: '+96822495161', email: 'info@qabaspharmacy.com', contactType: 'sales', availableLanguage: ['en', 'ar'] }]
  };
  const head = [
    '<!doctype html>', `<html lang="${lang}" dir="${c.meta.dir}">`, '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(c.meta.siteTitle)}</title>`,
    `<meta name="description" content="${esc(c.meta.metaDescription)}">`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${SITE}/">`, `<link rel="alternate" hreflang="ar" href="${SITE}/ar/">`, `<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
    `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="Al Qabas Pharmacy L.L.C">`,
    `<meta property="og:title" content="${esc(c.meta.siteTitle)}">`, `<meta property="og:description" content="${esc(c.meta.metaDescription)}">`,
    `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${SITE}/assets/photos/family.jpg">`, `<meta property="og:locale" content="${lang === 'ar' ? 'ar_OM' : 'en_OM'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="icon" href="${SITE}/assets/favicon-32.png" type="image/png" sizes="32x32">`, `<link rel="icon" href="${SITE}/assets/favicon-512.png" type="image/png" sizes="512x512">`, `<link rel="apple-touch-icon" href="${SITE}/assets/apple-touch-icon.png">`,
    `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
    headPart.trim(), '<style>body{margin:0}</style>', '</head>', '<body>', bodyPart, '</body>', '</html>', ''
  ];
  return head.join('\n');
}

// 4. Forwarding pages for the old Wix addresses, so nothing Google indexed returns "not found"
const REDIRECTS = {
  'about-us': '/#about', 'contact': '/#contact', 'services-1': '/#services', 'services-1-1': '/#services', 'partners': '/#services',
  'viviscal': '/#about', 'toppik': '/#about', 'eva': '/#about', 'rudy': '/#about', 'vitayes': '/#about', 'morgan-s-pomade': '/#about',
  'vendor-portal': 'https://vendors.qabaspharmacy.com', 'member': 'https://erp.qabaspharmacy.com', 'home': '/'
};
function redirectPage(target) {
  const abs = target.startsWith('http') ? target : SITE + target;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Al Qabas Pharmacy L.L.C</title><link rel="canonical" href="${abs}"><meta http-equiv="refresh" content="0; url=${abs}"><meta name="viewport" content="width=device-width, initial-scale=1"><script>location.replace(${JSON.stringify(abs)});</script></head><body style="font-family:system-ui,sans-serif;padding:32px"><p>This page has moved. Continue to <a href="${abs}">${abs}</a>.</p></body></html>\n`;
}
const notFound = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | Al Qabas Pharmacy L.L.C</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:'DM Sans','Segoe UI',Arial,sans-serif;background:#F4F7FC;color:#0F1B45;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}.box{background:#fff;border:1px solid #DCE4F2;border-radius:24px;padding:40px 32px;max-width:520px;text-align:center;box-shadow:0 30px 60px -30px rgba(15,27,69,.3)}h1{font-size:28px;margin:18px 0 8px}p{color:#5B6785;margin:0 0 22px}a.btn{display:inline-block;padding:14px 24px;border-radius:999px;background:linear-gradient(100deg,#2038B8,#2A8FD1 55%,#3BBFD9);color:#fff;text-decoration:none;font-weight:600}.links{margin-top:18px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}.links a{color:#1F4FA3;text-decoration:none;font-size:14px}</style></head>
<body><div class="box"><img src="/assets/logo-alqabas.png" alt="Al Qabas Pharmacy L.L.C" style="height:56px"><h1>Page not found</h1><p>The address you followed is no longer in use. Everything about Al Qabas Pharmacy is now on one page.</p><a class="btn" href="/">Go to the homepage</a><div class="links"><a href="/#about">About Us</a><a href="/#services">Our Services</a><a href="/#contact">Contact</a><a href="/ar/">العربية</a></div></div>
<script>var m={'about-us':'/#about','contact':'/#contact','services-1':'/#services','services-1-1':'/#services','partners':'/#services','vendor-portal':'https://vendors.qabaspharmacy.com','member':'https://erp.qabaspharmacy.com'};var k=location.pathname.replace(/^\\/+|\\/+$/g,'').toLowerCase();if(m[k])location.replace(m[k]);</script></body></html>
`;

// 5. Write everything
const enFragment = pageHtml('en');
write('prototype/index.html', enFragment);
write('index.html', fullDoc(enFragment, 'en'));
write('ar/index.html', fullDoc(pageHtml('ar'), 'ar'));
for (const [p, target] of Object.entries(REDIRECTS)) write(p + '/index.html', redirectPage(target));
write('404.html', notFound);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  [['/', 'en'], ['/ar/', 'ar']].map(([u, l]) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${l === 'en' ? '1.0' : '0.9'}</priority><xhtml:link rel="alternate" hreflang="en" href="${SITE}/"/><xhtml:link rel="alternate" hreflang="ar" href="${SITE}/ar/"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/></url>`).join('\n') + '\n</urlset>\n');
console.log('built: prototype/index.html, index.html, ar/index.html,', Object.keys(REDIRECTS).length, 'forwarding pages, 404.html, robots.txt, sitemap.xml');
