// Shop page builders. Each returns the <main> markup for one page; build.js wraps it in the site's header and footer.
// Call setLang(lang, strings) before building a page: it picks the language, the Arabic strings and the /ar path prefix.
const fs = require('fs');
const path = require('path');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let LANG = 'en', S = {}, PFX = '';
function setLang(lang, strings) { LANG = lang || 'en'; S = (strings && strings.ui) || {}; PFX = LANG === 'ar' ? '/ar' : ''; }
const tt = (en, vars) => { let s = (LANG === 'ar' && S[en] != null) ? S[en] : en; if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]); return s; };

// Outline icons, 24 unit grid, stroke based (Lucide style). Referenced as <use href="#i-name">.
const ICONS = {
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'shopping-cart': '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  'filter': '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  'sort': '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'minus': '<path d="M5 12h14"/>',
  'trash': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'package': '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'truck': '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  'edit': '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="none"/>',
  'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'droplet': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  'leaf': '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  'eye': '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>'
};
// Official Omani rial sign (Central Bank of Oman, medium weight), drawn as a filled symbol with its own view box.
const OMR_VIEWBOX = '478.8 331.2 351.1 244.3';
const OMR_PATH = fs.readFileSync(path.join(__dirname, 'omr-sign.path.txt'), 'utf8').trim();
const sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + Object.entries(ICONS).map(([k, v]) => '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + v + '</symbol>').join('') + '<symbol id="i-omr" viewBox="' + OMR_VIEWBOX + '"><path fill="currentColor" stroke="none" d="' + OMR_PATH + '"/></symbol></defs></svg>';
const ic = (name, cls) => '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
function money(cur, n) { return '<span class="money"><svg class="omr" role="img" aria-label="' + esc(tt('Omani rial')) + '"><use href="#i-omr"/></svg><span>' + n.toFixed(3) + '</span></span>'; }

// Header tools cluster inserted into the existing header on every page
function headerTools(base) {
  return '<div class="shop-tools shop">' +
    '<button type="button" data-search-open aria-label="' + esc(tt('Search products')) + '">' + ic('search') + '</button>' +
    '<a href="' + base + PFX + '/account/orders/" aria-label="' + esc(tt('My account')) + '">' + ic('user') + '</a>' +
    '<a href="' + base + PFX + '/wishlist/" aria-label="' + esc(tt('Wishlist')) + '">' + ic('heart') + '<span class="count wcount" data-n="0">0</span></a>' +
    '<a href="' + base + PFX + '/cart/" data-cart-open aria-label="' + esc(tt('Cart')) + '">' + ic('shopping-cart') + '<span class="count" data-n="0">0</span></a></div>';
}

function crumbs(base, items) { return '<nav class="shop-crumbs" aria-label="Breadcrumb"><a href="' + base + PFX + '/">' + esc(tt('Home')) + '</a>' + items.map(([t, h]) => ic('chevron-down') + (h ? '<a href="' + h + '">' + esc(t) + '</a>' : '<span>' + esc(t) + '</span>')).join('') + '</nav>'; }
const shopCrumb = (base) => [tt('Shop'), base + PFX + '/shop/'];

function shopGrid(base, catalog, category) {
  const cat = category ? catalog.categories.find((c) => c.slug === category) : null;
  const slides = ['slide-1-toppik-v4.jpg', 'slide-2-award-v4.jpg', 'slide-3-man-side-v4.jpg', 'slide-4-woman-long-v4.jpg', 'slide-5-man-crown-v4.jpg'];
  return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, cat ? [shopCrumb(base), [tt('Toppik'), base + PFX + '/shop/toppik/'], [cat.name]] : [shopCrumb(base), [tt('Toppik')]]) +
    (cat ? '' : '<div class="shop-banner shop-slides" aria-label="Toppik">' + slides.map((f, n) => '<img src="' + base + '/assets/toppik/' + f + '" alt="' + esc(n === 0 ? tt('Toppik, everything you need to transform fine, thin and thinning hair') : n === 1 ? tt('Toppik award winning hair building fibers') : tt('Before and after Toppik')) + '" width="1870" height="841"' + (n === 0 ? ' class="on"' : ' loading="lazy"') + '>').join('') + '<div class="dots">' + slides.map((f, n) => '<button type="button" data-slide="' + n + '"' + (n === 0 ? ' class="on"' : '') + ' aria-label="' + esc(tt('Slide {n}', { n: n + 1 })) + '"></button>').join('') + '</div></div>') +
    '<div class="shop-head"><div><h1>' + esc(cat ? cat.name : tt('Toppik Shop')) + '</h1><p class="muted">' + esc(cat ? cat.description : tt('Toppik hair building fibers cling to your own hair and make thin or thinning areas look full in thirty seconds. Undetectable, resistant to wind and rain, and washed out with shampoo. Genuine products delivered across Oman.')) + '</p></div>' +
    '</div>' +
    (cat ? '' : '<div class="shop-video"><video autoplay muted loop playsinline controls preload="metadata" poster="' + base + '/assets/toppik/how-to-apply-poster.jpg" aria-label="' + esc(tt('How to apply Toppik Hair Building Fibers')) + '"><source src="' + base + '/assets/toppik/how-to-apply.mp4" type="video/mp4"></video></div>') +
    '<div class="shop-toolbar"><span class="count" id="count">' + esc(tt('Loading products…')) + '</span><button type="button" class="sh-btn sh-btn-ghost sh-btn-sm filter-btn" id="fopen">' + ic('filter', 'sm') + esc(tt('Filters')) + '</button><label class="muted small" for="sort">' + esc(tt('Sort')) + '</label><select id="sort"><option value="featured">' + esc(tt('Featured')) + '</option><option value="price-asc">' + esc(tt('Price, low to high')) + '</option><option value="price-desc">' + esc(tt('Price, high to low')) + '</option><option value="name">' + esc(tt('Name, A to Z')) + '</option><option value="new">' + esc(tt('Newest')) + '</option></select></div>' +
    '<div class="shop-chips" id="chips"></div>' +
    '<div class="shop-layout"><aside class="shop-filters" id="filters" aria-label="' + esc(tt('Filters')) + '"></aside><div class="sh-scrim" id="fscrim"></div><section class="product-grid" id="grid" aria-live="polite"></section></div></div></main>';
}

function productPage(base, catalog, p, assets) {
  const cur = catalog.meta.currency; const minPrice = Math.min.apply(null, p.variants.map((v) => v.salePrice != null ? v.salePrice : v.price));
  const cat = catalog.categories.find((c) => c.slug === p.category);
  return '<main id="shop-main" class="shop"><div class="wrap shop-page pdp-page" id="pdp">' + crumbs(base, [shopCrumb(base), [cat.name, base + PFX + '/shop/category/' + cat.slug + '/'], [p.name]]) +
    '<div class="pdp"><div class="pdp-gallery" id="gallery"><div class="main"><img src="' + assets + p.images[0] + '" data-f="' + p.images[0] + '" alt="' + esc(p.name) + '"></div>' + (p.images.length > 1 ? '<div class="thumbs">' + p.images.map((f, i) => '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-f="' + f + '" aria-label="' + esc(tt('Image {n}', { n: i + 1 })) + '"><img src="' + assets + f + '" alt=""></button>').join('') + '</div>' : '') + '</div>' +
    '<div class="pdp-info"><div class="top">' + (p.bestSeller ? '<span class="sh-badge best">' + esc(tt('Best seller')) + '</span>' : '') + (p.isNew ? '<span class="sh-badge new">' + esc(tt('New')) + '</span>' : '') + (p.variants.some((v) => v.salePrice != null) ? '<span class="sh-badge sale">' + esc(tt('Sale')) + '</span>' : '') + '<span class="sh-badge">' + esc(p.type) + '</span></div>' +
    '<h1>' + esc(p.name) + '</h1><div class="rating"><span class="sh-stars empty">' + ic('star').repeat(5) + '</span><span>' + esc(tt('No reviews yet')) + '</span></div>' +
    '<div class="price-row" id="pdp-price"><span class="sh-price">' + money(cur, minPrice) + '</span></div>' +
    '<p class="muted">' + esc(p.shortDescription) + '</p>' +
    '<ul class="benefits">' + p.benefits.map((b) => '<li>' + ic('check') + '<span>' + esc(b) + '</span></li>').join('') + '</ul>' +
    '<div id="picker"></div>' +
    '<div class="assure"><div>' + ic('shield') + esc(tt('Genuine Toppik, official distributor')) + '</div><div>' + ic('truck') + esc(tt('Delivery across Oman')) + '</div><div>' + ic('phone') + esc(tt('Help on +968 2249 5161')) + '</div></div></div></div>' +
    '<div class="pdp-tabs"><details open><summary>' + esc(tt('Description')) + ' ' + ic('chevron-down') + '</summary><div class="content"><p>' + esc(p.description) + '</p></div></details>' +
    '<details><summary>' + esc(tt('How to use')) + ' ' + ic('chevron-down') + '</summary><div class="content"><ol>' + p.howToUse.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol></div></details>' +
    '<details><summary>' + esc(tt('Ingredients and specifications')) + ' ' + ic('chevron-down') + '</summary><div class="content"><table>' + p.specs.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '<tr><td>' + esc(tt('SKU')) + '</td><td>' + esc(p.sku) + '</td></tr></table></div></details>' +
    '<details><summary>' + esc(tt('Shipping')) + ' ' + ic('chevron-down') + '</summary><div class="content"><ul>' + catalog.shipping.map((s) => '<li>' + esc(s.name) + ': ' + esc(s.eta) + ', ' + (s.price === 0 ? esc(tt('free')) : money(cur, s.price)) + (s.freeAbove ? ', ' + tt('free on orders over {v}', { v: money(cur, s.freeAbove) }) : '') + '</li>').join('') + '</ul></div></details>' +
    '<details><summary>' + esc(tt('Returns')) + ' ' + ic('chevron-down') + '</summary><div class="content"><p>' + esc(tt('Unopened products in their original packaging can be returned within 7 days of delivery. Contact us on +968 2249 5161 or info@qabaspharmacy.com to arrange a return.')) + '</p></div></details>' +
    '<details><summary>' + esc(tt('FAQ')) + ' ' + ic('chevron-down') + '</summary><div class="content"><p><b>' + esc(tt('Is this genuine Toppik?')) + '</b><br>' + esc(tt('Yes. Al Qabas Pharmacy L.L.C imports Toppik directly and is the official distributor in Oman.')) + '</p><p style="margin-top:10px"><b>' + esc(tt('Which shade should I choose?')) + '</b><br>' + esc(tt('Match the shade to your hair colour. If you are between two shades, choose the lighter one, or send us a photo on WhatsApp and we will recommend one.')) + '</p></div></details></div>' +
    '<section class="related"><h2>' + esc(tt('You may also like')) + '</h2><div class="product-grid" id="related"></div></section></div>' +
    '<div class="sticky-buy shop" id="sticky"><span class="sh-price">' + money(cur, minPrice) + '</span><button type="button" class="sh-btn sh-btn-primary">' + ic('shopping-cart', 'sm') + esc(tt('Add to cart')) + '</button></div></main>';
}

const simple = (base, title, id, extra) => '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [shopCrumb(base), [title]]) + (extra || '<div class="shop-head"><h1>' + esc(title) + '</h1></div>') + '<div id="' + id + '"></div></div></main>';
function cartPage(base) { return simple(base, tt('Your cart'), 'cart'); }
function checkoutPage(base) { return simple(base, tt('Checkout'), 'checkout'); }
function successPage(base) { return simple(base, tt('Order confirmation'), 'success', '<div></div>'); }
function ordersPage(base) { return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [shopCrumb(base), [tt('My account')]]) + '<div class="account-layout"><nav class="account-nav"><a class="on" href="' + base + PFX + '/account/orders/">' + ic('package') + esc(tt('My orders')) + '</a><a href="' + base + PFX + '/wishlist/">' + ic('heart') + esc(tt('Wishlist')) + '</a><a href="' + base + PFX + '/#contact">' + ic('mail') + esc(tt('Contact us')) + '</a></nav><div id="orders"></div></div></div></main>'; }
function wishlistPage(base) { return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [shopCrumb(base), [tt('Wishlist')]]) + '<div class="shop-head"><div><h1>' + esc(tt('Your wishlist')) + '</h1><p class="muted">' + esc(tt('Saved on this device.')) + '</p></div></div><div class="product-grid" id="wgrid"></div></div></main>'; }

function brandsPage(base) {
  return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [[tt('Shop')]]) +
    '<div class="shop-head"><div><h1>' + esc(tt('Shop by Brand')) + '</h1><p class="muted">' + esc(tt('Genuine beauty, hair and skin care products from brands for which Al Qabas Pharmacy L.L.C is the official distributor in Oman, imported by us and delivered across the country.')) + '</p></div></div>' +
    '<div class="brand-grid">' +
    '<a class="brand-card" href="' + base + PFX + '/shop/toppik/"><div class="txt"><h3><img class="brand-logo" src="' + base + '/assets/toppik/toppik-logo.png" alt="Toppik" width="600" height="345"></h3><p>' + esc(tt('Hair building fibers, sprays, kits and hair care.')) + '</p><span class="go sh-btn sh-btn-primary sh-btn-sm">' + esc(tt('Shop Toppik')) + ic('arrow-right', 'sm') + '</span></div><img class="art" src="' + base + '/assets/toppik/card-toppik.png" alt=""></a>' +
    '<a class="brand-card" href="' + base + PFX + '/shop/viviscal/"><div class="txt"><h3><img class="brand-logo vivi" src="' + base + '/assets/viviscal/logo-viviscal.png" alt="Viviscal" width="622" height="157"></h3><p>' + esc(tt('Hair growth supplements, shampoo, conditioner and serum.')) + '</p><span class="go sh-btn sh-btn-primary sh-btn-sm">' + esc(tt('Shop Viviscal')) + ic('arrow-right', 'sm') + '</span></div><img class="art" src="' + base + '/assets/viviscal/products.png" alt=""></a>' +
    '</div></div></main>';
}

function viviscalPage(base) { return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [shopCrumb(base), [tt('Viviscal')]]) + '<div class="shop-head"><div><h1>Viviscal</h1><p class="muted">' + esc(tt('Viviscal supplements, shampoo, conditioner and serum nourish thinning hair from the inside and out, backed by clinical trials. Genuine products delivered across Oman.')) + '</p></div></div><div class="sh-empty">' + ic('package') + '<h2>' + esc(tt('Viviscal products are being added.')) + '</h2><p>' + esc(tt('The full Viviscal range will be listed here shortly. In the meantime, order or ask about availability on WhatsApp.')) + '</p><a class="sh-btn sh-btn-primary" href="https://wa.me/96891221609?text=' + encodeURIComponent(tt('Hello Al Qabas Pharmacy, I would like to ask about Viviscal: ')) + '" target="_blank" rel="noopener">' + esc(tt('Ask on WhatsApp')) + '</a></div></div></main>'; }

module.exports = { setLang, tt, brandsPage, viviscalPage, sprite, headerTools, shopGrid, productPage, cartPage, checkoutPage, successPage, ordersPage, wishlistPage };
