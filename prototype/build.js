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
const BASE = process.env.SITE_BASE || '';          // '' on the real domain, '/qabas-shop-preview' on the preview host
const OUT = process.env.SITE_OUT || root;          // output directory
const PREVIEW = !!process.env.SITE_PREVIEW;         // preview build: noindex, preview banner
const pages = require(path.join(root, 'shop-src/pages.js'));
const BUILD_VERSION = Date.now().toString(36);
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'content/shop-products.json'), 'utf8'));
const AR_STRINGS = JSON.parse(fs.readFileSync(path.join(root, 'content/shop-strings.ar.json'), 'utf8'));
// Arabic copy of the catalog: every record that carries an `ar` block gets those fields on top
function localizeCatalog(c) { const x = JSON.parse(JSON.stringify(c)); const merge = (o) => { if (o && o.ar) Object.assign(o, o.ar); }; x.products.forEach(merge); x.categories.forEach(merge); (x.shipping || []).forEach(merge); (x.payments || []).forEach(merge); if (x.tax && x.tax.ar) Object.assign(x.tax, x.tax.ar); return x; }
const catalogAr = localizeCatalog(catalog);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), s); };
const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(OUT, to)), { recursive: true }); fs.copyFileSync(path.join(root, from), path.join(OUT, to)); };
const dataUri = (p, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(root, p)).toString('base64');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

const en = JSON.parse(read('content/site-content.en.json'));
const ar = JSON.parse(read('content/site-content.ar.json'));
const CONTENT = { en, ar };

// 1. Template with assets and content embedded
let base = read('prototype/index.template.html');
base = base.split('__LOGO__').join(dataUri('assets/logo-alqabas.png', 'image/png'));
base = base.split('__LOGO_WHITE__').join(dataUri('assets/logo-alqabas-white.png', 'image/png'));
base = base.split('__LOGO_MARK__').join(dataUri('assets/logo-mark.png', 'image/png'));
base = base.split('__LOGO_EPPENDORF__').join(dataUri('assets/logo-eppendorf.png', 'image/png'));
for (const f of fs.readdirSync(path.join(root, 'assets/photos'))) {
  base = base.split(`__IMG_${f.replace(/\.jpg$/, '')}__`).join(dataUri('assets/photos/' + f, 'image/jpeg'));
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
  pages.setLang(lang, lang === 'ar' ? AR_STRINGS : null);
  let html = injectSink(base, staticRender(lang));
  html = applyI18n(html, lang);
  if (lang === 'ar') html = html.split('href="/shop/" class="nav-shop"').join('href="/ar/shop/" class="nav-shop"');
  html = html.replace('<button class="lang-toggle"', pages.headerTools(BASE) + '<button class="lang-toggle"');
  html = html.replace('<header class="site-header">', pages.sprite + (PREVIEW ? '<div class="sh-preview-bar shop">' + pages.tt('Preview build. Sample prices and stock. Orders are stored in this browser only and nothing is charged.') + '</div>' : '') + '<header class="site-header">');
  html = html.replace('</style>', () => '</style>\n<style>' + read('shop-src/shop.css') + '</style>');
  html = html.replace('</script>', () => '</script>\n<script>window.SHOP_CONFIG = ' + JSON.stringify({ base: BASE, assets: BASE + '/assets/shop/', currency: catalog.meta.currency, version: BUILD_VERSION, lang: lang, strings: lang === 'ar' ? AR_STRINGS : undefined }) + ';</script>\n<script>' + read('shop-src/shop.js') + '</script>');
  return html;
}
function withBase(html) { if (!BASE) return html; const skip = BASE.slice(1) + '/'; return html.replace(/(href|src|action)="\/(?!\/)([^"]*)/g, (m, attr, rest) => rest.startsWith(skip) ? m : attr + '="' + BASE + '/' + rest); }

// Shop page: shared header, footer and script from the main page; body from shop.template.html
function shopPage(lang, forPreview) {
  let main = read('prototype/shop.template.html');
  for (const f of fs.readdirSync(path.join(root, 'assets/toppik'))) {
    const name = f.replace(/\.(png|jpg)$/, ''); const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    main = main.split(`__TOPPIK_${name}__`).join(forPreview ? dataUri('assets/toppik/' + f, mime) : '/assets/toppik/' + f);
  }
  main = main.split('__IMG_family__').join(forPreview ? dataUri('assets/photos/family.jpg', 'image/jpeg') : '/assets/photos/family.jpg');
  const page = pageHtml(lang);
  main = main.split('href="https://toppik.qabaspharmacy.com/online-store"').join('href="' + (lang === 'ar' ? '/ar' : '') + '/shop/toppik/"');
  const s = page.indexOf('<main id="top">'), e = page.indexOf('</main>') + 7;
  let html = page.slice(0, s) + main + page.slice(e);
  html = applyI18n(html, lang);
  const home = lang === 'ar' ? '/ar/' : '/';
  html = html.replace(/href="#(top|about|services|contact)"/g, (m, a) => `href="${home}#${a}"`);
  html = html.replace('aria-current="page" data-i18n="nav.home"', 'data-i18n="nav.home"').replace('class="nav-shop" data-i18n="nav.shop"', 'class="nav-shop" aria-current="page" data-i18n="nav.shop"');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(lang === 'ar' ? 'متجر توبيك' : 'Toppik Shop')}</title>`);
  return html;
}
function storeDoc(main, opts, lang) {
  lang = lang || 'en';
  const page = pageHtml(lang);
  const s = page.indexOf('<main id="top">'), e = page.indexOf('</main>') + 7;
  let html = page.slice(0, s) + main + page.slice(e);
  html = html.replace(/href="#(top|about|services|contact)"/g, (m, a) => `href="${lang === 'ar' ? '/ar/' : '/'}#${a}"`);
  html = html.replace('aria-current="page" data-i18n="nav.home"', 'data-i18n="nav.home"').replace('class="nav-shop" data-i18n="nav.shop"', 'class="nav-shop" aria-current="page" data-i18n="nav.shop"');
  const enPath = opts.path.replace(/^\/ar\//, '/');
  let doc = fullDoc(html, lang, Object.assign({ altEn: enPath, altAr: '/ar' + enPath, image: '/assets/shop/' + catalog.products[0].images[0] }, opts));
  doc = doc.replace('<body>', '<body data-page="' + opts.page + '"' + (opts.product ? ' data-product="' + opts.product + '"' : '') + (opts.category ? ' data-category="' + opts.category + '"' : '') + '>');
  if (opts.noindex || PREVIEW) doc = doc.replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow">\n<meta name="viewport"');
  return withBase(doc);
}

// 3. Complete document wrapper for hosting
function fullDoc(fragment, lang, opts) {
  const c = CONTENT[lang];
  const o = Object.assign({ path: lang === 'ar' ? '/ar/' : '/', altEn: '/', altAr: '/ar/', title: c.meta.siteTitle, description: c.meta.metaDescription, image: '/assets/photos/family.jpg' }, opts || {});
  const cut = fragment.indexOf('<header');
  let headPart = fragment.slice(0, cut), bodyPart = fragment.slice(cut);
  headPart = headPart.replace(/<title>[^<]*<\/title>/, '');
  const url = SITE + o.path;
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
    `<title>${esc(o.title)}</title>`,
    `<meta name="description" content="${esc(o.description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="en" href="${SITE}${o.altEn}">`, `<link rel="alternate" hreflang="ar" href="${SITE}${o.altAr}">`, `<link rel="alternate" hreflang="x-default" href="${SITE}${o.altEn}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="Al Qabas Pharmacy L.L.C">`,
    `<meta property="og:title" content="${esc(o.title)}">`, `<meta property="og:description" content="${esc(o.description)}">`,
    `<meta property="og:url" content="${url}">`, `<meta property="og:image" content="${SITE}${o.image}">`, `<meta property="og:locale" content="${lang === 'ar' ? 'ar_OM' : 'en_OM'}">`,
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
  'viviscal': '/#about', 'eva': '/#about', 'rudy': '/#about', 'vitayes': '/#about', 'morgan-s-pomade': '/#about',
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
write('index.html', withBase(fullDoc(enFragment, 'en')));
write('ar/index.html', withBase(fullDoc(pageHtml('ar'), 'ar')));
const shopOpts = (lang) => ({ path: lang === 'ar' ? '/ar/shop/' : '/shop/', altEn: '/shop/', altAr: '/ar/shop/', title: CONTENT[lang].shop.meta.title, description: CONTENT[lang].shop.meta.description, image: '/assets/toppik/hero-model.png' });
write('toppik/index.html', withBase(fullDoc(shopPage('en', false), 'en', Object.assign(shopOpts('en'), { path: '/toppik/', altEn: '/toppik/', altAr: '/ar/toppik/' }))));
write('ar/toppik/index.html', withBase(fullDoc(shopPage('ar', false), 'ar', Object.assign(shopOpts('ar'), { path: '/ar/toppik/', altEn: '/toppik/', altAr: '/ar/toppik/' }))));
write('prototype/shop.html', shopPage('en', true));
const A = BASE + '/assets/shop/';
for (const f of fs.readdirSync(path.join(root, 'assets/viviscal'))) copy('assets/viviscal/' + f, 'assets/viviscal/' + f);
const STORE_TEXT = {
  en: { brandsT: 'Shop | Al Qabas Pharmacy', brandsD: 'Genuine beauty, hair and skin care brands for which Al Qabas Pharmacy L.L.C is the official distributor in Oman, delivered across the country.', viviT: 'Viviscal in Oman | Al Qabas Pharmacy', viviD: 'Viviscal hair growth supplements, shampoo, conditioner and serum in Oman, imported and distributed by Al Qabas Pharmacy L.L.C.', gridT: 'Toppik Shop | Hair Building Fibers, Sprays and Kits in Oman | Al Qabas Pharmacy', gridD: 'Buy genuine Toppik hair building fibers, FiberHold Spray, kits and hair care in Oman. Official distributor, delivery across the Sultanate.', catT: (c) => c.name + ' | Toppik Shop | Al Qabas Pharmacy', prodT: (p) => 'Toppik ' + p.name + ' in Oman | Al Qabas Pharmacy', cartT: 'Your cart | Al Qabas Pharmacy', cartD: 'Your shopping cart.', coT: 'Checkout | Al Qabas Pharmacy', coD: 'Secure checkout.', okT: 'Order confirmed | Al Qabas Pharmacy', okD: 'Order confirmation.', ordT: 'My orders | Al Qabas Pharmacy', ordD: 'Your orders.', wishT: 'Wishlist | Al Qabas Pharmacy', wishD: 'Your saved products.' },
  ar: { brandsT: 'المتجر | صيدلية القبس', brandsD: 'علامات تجارية أصلية للجمال والعناية بالشعر والبشرة، صيدلية القبس ش.م.م هي موزعها الرسمي في عُمان، مع التوصيل إلى جميع أنحاء السلطنة.', viviT: 'فيفيسكال في عُمان | صيدلية القبس', viviD: 'مكملات فيفيسكال لنمو الشعر والشامبو والبلسم والسيروم في عُمان، مستوردة وموزعة من صيدلية القبس ش.م.م.', gridT: 'متجر توبيك | ألياف تكثيف الشعر والبخاخات والأطقم في عُمان | صيدلية القبس', gridD: 'اشترِ ألياف توبيك الأصلية لتكثيف الشعر وبخاخ فايبرهولد والأطقم ومنتجات العناية بالشعر في عُمان. الموزع الرسمي مع التوصيل إلى جميع أنحاء السلطنة.', catT: (c) => c.name + ' | متجر توبيك | صيدلية القبس', prodT: (p) => 'توبيك ' + p.name + ' في عُمان | صيدلية القبس', cartT: 'سلة التسوق | صيدلية القبس', cartD: 'سلة التسوق الخاصة بك.', coT: 'إتمام الطلب | صيدلية القبس', coD: 'إتمام الطلب بأمان.', okT: 'تم تأكيد الطلب | صيدلية القبس', okD: 'تأكيد الطلب.', ordT: 'طلباتي | صيدلية القبس', ordD: 'طلباتك.', wishT: 'المفضلة | صيدلية القبس', wishD: 'منتجاتك المحفوظة.' }
};
function writeStore(lang) {
  const X = STORE_TEXT[lang]; const P = lang === 'ar' ? 'ar/' : ''; const U = lang === 'ar' ? '/ar' : ''; const cat = lang === 'ar' ? catalogAr : catalog;
  pages.setLang(lang, lang === 'ar' ? AR_STRINGS : null);
  write(P + 'shop/index.html', storeDoc(pages.brandsPage(BASE), { page: 'brands', path: U + '/shop/', title: X.brandsT, description: X.brandsD }, lang));
  write(P + 'shop/viviscal/index.html', storeDoc(pages.viviscalPage(BASE), { page: 'viviscal', path: U + '/shop/viviscal/', title: X.viviT, description: X.viviD }, lang));
  write(P + 'shop/toppik/index.html', storeDoc(pages.shopGrid(BASE, cat, null), { page: 'shop', path: U + '/shop/toppik/', title: X.gridT, description: X.gridD }, lang));
  for (const c of cat.categories) write(P + 'shop/category/' + c.slug + '/index.html', storeDoc(pages.shopGrid(BASE, cat, c.slug), { page: 'shop', category: c.slug, path: U + '/shop/category/' + c.slug + '/', title: X.catT(c), description: c.description }, lang));
  for (const p of cat.products) write(P + 'shop/' + p.slug + '/index.html', storeDoc(pages.productPage(BASE, cat, p, A), { page: 'product', product: p.id, path: U + '/shop/' + p.slug + '/', title: X.prodT(p), description: p.shortDescription, image: '/assets/shop/' + p.images[0] }, lang));
  write(P + 'cart/index.html', storeDoc(pages.cartPage(BASE), { page: 'cart', path: U + '/cart/', title: X.cartT, description: X.cartD, noindex: true }, lang));
  write(P + 'checkout/index.html', storeDoc(pages.checkoutPage(BASE), { page: 'checkout', path: U + '/checkout/', title: X.coT, description: X.coD, noindex: true }, lang));
  write(P + 'order-success/index.html', storeDoc(pages.successPage(BASE), { page: 'success', path: U + '/order-success/', title: X.okT, description: X.okD, noindex: true }, lang));
  write(P + 'account/orders/index.html', storeDoc(pages.ordersPage(BASE), { page: 'orders', path: U + '/account/orders/', title: X.ordT, description: X.ordD, noindex: true }, lang));
  write(P + 'wishlist/index.html', storeDoc(pages.wishlistPage(BASE), { page: 'wishlist', path: U + '/wishlist/', title: X.wishT, description: X.wishD, noindex: true }, lang));
}
writeStore('en'); writeStore('ar');
write('shop-data/products.json', JSON.stringify(catalog));
for (const f of fs.readdirSync(path.join(root, 'assets/shop'))) copy('assets/shop/' + f, 'assets/shop/' + f);
for (const f of fs.readdirSync(path.join(root, 'assets/toppik'))) copy('assets/toppik/' + f, 'assets/toppik/' + f);
for (const f of ['photos/family.jpg', 'logo-alqabas.png', 'favicon-32.png', 'favicon-512.png', 'apple-touch-icon.png']) copy('assets/' + f, 'assets/' + f);
for (const [p, target] of Object.entries(REDIRECTS)) write(p + '/index.html', redirectPage(BASE ? BASE + target : target));
write('404.html', notFound);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
const today = new Date().toISOString().slice(0, 10);
const STORE_PATHS = ['/shop/', '/shop/toppik/', '/shop/viviscal/'].concat(catalog.categories.map((c) => '/shop/category/' + c.slug + '/'), catalog.products.map((p) => '/shop/' + p.slug + '/'));
const SITEMAP_URLS = [['/', 'en'], ['/ar/', 'ar'], ['/toppik/', 'en'], ['/ar/toppik/', 'ar']].concat(STORE_PATHS.map((u) => [u, 'en']), STORE_PATHS.map((u) => ['/ar' + u, 'ar']));
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  SITEMAP_URLS.map(([u, l]) => '  <url><loc>' + SITE + u + '</loc><lastmod>' + today + '</lastmod><changefreq>monthly</changefreq><priority>' + (l === 'en' ? '1.0' : '0.9') + '</priority>' + ('<xhtml:link rel="alternate" hreflang="en" href="' + SITE + u.replace('/ar/', '/') + '"/><xhtml:link rel="alternate" hreflang="ar" href="' + SITE + (u.startsWith('/ar/') ? u : '/ar' + u) + '"/><xhtml:link rel="alternate" hreflang="x-default" href="' + SITE + u.replace('/ar/', '/') + '"/>') + '</url>').join(String.fromCharCode(10)) + String.fromCharCode(10) + '</urlset>' + String.fromCharCode(10));
console.log('built: prototype/index.html, index.html, ar/index.html,', Object.keys(REDIRECTS).length, 'forwarding pages, 404.html, robots.txt, sitemap.xml');
