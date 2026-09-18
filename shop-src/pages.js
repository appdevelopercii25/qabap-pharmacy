// Shop page builders. Each returns the <main> markup for one page; build.js wraps it in the site's header and footer.
const fs = require('fs');
const path = require('path');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
const sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + Object.entries(ICONS).map(([k, v]) => '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + v + '</symbol>').join('') + '</defs></svg>';
const ic = (name, cls) => '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';

// Header tools cluster inserted into the existing header on every page
function headerTools(base) {
  return '<div class="shop-tools shop">' +
    '<button type="button" data-search-open aria-label="Search products">' + ic('search') + '</button>' +
    '<a href="' + base + '/account/orders/" aria-label="My account">' + ic('user') + '</a>' +
    '<a href="' + base + '/wishlist/" aria-label="Wishlist">' + ic('heart') + '<span class="count wcount" data-n="0">0</span></a>' +
    '<a href="' + base + '/cart/" data-cart-open aria-label="Cart">' + ic('shopping-cart') + '<span class="count" data-n="0">0</span></a></div>';
}

function crumbs(base, items) { return '<nav class="shop-crumbs" aria-label="Breadcrumb"><a href="' + base + '/">Home</a>' + items.map(([t, h]) => ic('chevron-down') + (h ? '<a href="' + h + '">' + esc(t) + '</a>' : '<span>' + esc(t) + '</span>')).join('') + '</nav>'; }
function money(cur, n) { return cur + ' ' + n.toFixed(3); }

function shopGrid(base, catalog, category) {
  const cat = category ? catalog.categories.find((c) => c.slug === category) : null;
  return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, cat ? [['Shop', base + '/shop/'], ['Toppik', base + '/shop/toppik/'], [cat.name]] : [['Shop', base + '/shop/'], ['Toppik']]) +
    (cat ? '' : '<div class="shop-banner shop-slides" aria-label="Toppik">' + ['shop-banner.jpg', 'slide-man-side.jpg', 'slide-woman.jpg', 'slide-crown.jpg'].map((f, n) => '<img src="' + base + '/assets/toppik/' + f + '" alt="' + (n === 0 ? 'Toppik, everything you need to transform fine, thin and thinning hair' : 'Before and after Toppik') + '" width="1920" height="630"' + (n === 0 ? ' class="on"' : ' loading="lazy"') + '>').join('') + '<div class="dots">' + [0, 1, 2, 3].map((n) => '<button type="button" data-slide="' + n + '"' + (n === 0 ? ' class="on"' : '') + ' aria-label="Slide ' + (n + 1) + '"></button>').join('') + '</div></div>') +
    '<div class="shop-head"><div><h1>' + esc(cat ? cat.name : 'Toppik Shop') + '</h1><p class="muted">' + esc(cat ? cat.description : 'Toppik hair building fibers cling to your own hair and make thin or thinning areas look full in thirty seconds. Undetectable, resistant to wind and rain, and washed out with shampoo. Genuine products delivered across Oman.') + '</p></div>' +
    (cat ? '' : '<div class="shop-chips" style="margin:0">' + catalog.categories.map((c) => '<a class="sh-btn sh-btn-ghost sh-btn-sm" href="' + base + '/shop/category/' + c.slug + '/">' + esc(c.name) + '</a>').join('') + '</div>') + '</div>' +
    '<div class="shop-toolbar"><span class="count" id="count">Loading products…</span><button type="button" class="sh-btn sh-btn-ghost sh-btn-sm filter-btn" id="fopen">' + ic('filter', 'sm') + 'Filters</button><label class="muted small" for="sort">Sort</label><select id="sort"><option value="featured">Featured</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="name">Name, A to Z</option><option value="new">Newest</option></select></div>' +
    '<div class="shop-chips" id="chips"></div>' +
    '<div class="shop-layout"><aside class="shop-filters" id="filters" aria-label="Filters"></aside><div class="sh-scrim" id="fscrim"></div><section class="product-grid" id="grid" aria-live="polite"></section></div></div></main>';
}

function productPage(base, catalog, p, assets) {
  const cur = catalog.meta.currency; const minPrice = Math.min.apply(null, p.variants.map((v) => v.salePrice != null ? v.salePrice : v.price));
  const cat = catalog.categories.find((c) => c.slug === p.category);
  return '<main id="shop-main" class="shop"><div class="wrap shop-page pdp-page" id="pdp">' + crumbs(base, [['Shop', base + '/shop/'], [cat.name, base + '/shop/category/' + cat.slug + '/'], [p.name]]) +
    '<div class="pdp"><div class="pdp-gallery" id="gallery"><div class="main"><img src="' + assets + p.images[0] + '" data-f="' + p.images[0] + '" alt="' + esc(p.name) + '"></div>' + (p.images.length > 1 ? '<div class="thumbs">' + p.images.map((f, i) => '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-f="' + f + '" aria-label="Image ' + (i + 1) + '"><img src="' + assets + f + '" alt=""></button>').join('') + '</div>' : '') + '</div>' +
    '<div class="pdp-info"><div class="top">' + (p.bestSeller ? '<span class="sh-badge best">Best seller</span>' : '') + (p.isNew ? '<span class="sh-badge new">New</span>' : '') + (p.variants.some((v) => v.salePrice != null) ? '<span class="sh-badge sale">Sale</span>' : '') + '<span class="sh-badge">' + esc(p.type) + '</span></div>' +
    '<h1>' + esc(p.name) + '</h1><div class="rating"><span class="sh-stars empty">' + ic('star').repeat(5) + '</span><span>No reviews yet</span></div>' +
    '<div class="price-row" id="pdp-price"><span class="sh-price">' + money(cur, minPrice) + '</span></div>' +
    '<p class="muted">' + esc(p.shortDescription) + '</p>' +
    '<ul class="benefits">' + p.benefits.map((b) => '<li>' + ic('check') + '<span>' + esc(b) + '</span></li>').join('') + '</ul>' +
    '<div id="picker"></div>' +
    '<div class="assure"><div>' + ic('shield') + 'Genuine Toppik, official distributor</div><div>' + ic('truck') + 'Delivery across Oman</div><div>' + ic('phone') + 'Help on +968 2249 5161</div></div></div></div>' +
    '<div class="pdp-tabs"><details open><summary>Description ' + ic('chevron-down') + '</summary><div class="content"><p>' + esc(p.description) + '</p></div></details>' +
    '<details><summary>How to use ' + ic('chevron-down') + '</summary><div class="content"><ol>' + p.howToUse.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol></div></details>' +
    '<details><summary>Ingredients and specifications ' + ic('chevron-down') + '</summary><div class="content"><table>' + p.specs.map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>').join('') + '<tr><td>SKU</td><td>' + esc(p.sku) + '</td></tr></table></div></details>' +
    '<details><summary>Shipping ' + ic('chevron-down') + '</summary><div class="content"><ul>' + catalog.shipping.map((s) => '<li>' + esc(s.name) + ': ' + esc(s.eta) + ', ' + (s.price === 0 ? 'free' : money(cur, s.price)) + (s.freeAbove ? ', free on orders over ' + money(cur, s.freeAbove) : '') + '</li>').join('') + '</ul></div></details>' +
    '<details><summary>Returns ' + ic('chevron-down') + '</summary><div class="content"><p>Unopened products in their original packaging can be returned within 7 days of delivery. Contact us on +968 2249 5161 or info@qabaspharmacy.com to arrange a return.</p></div></details>' +
    '<details><summary>FAQ ' + ic('chevron-down') + '</summary><div class="content"><p><b>Is this genuine Toppik?</b><br>Yes. Al Qabas Pharmacy L.L.C imports Toppik directly and is the official distributor in Oman.</p><p style="margin-top:10px"><b>Which shade should I choose?</b><br>Match the shade to your hair colour. If you are between two shades, choose the lighter one, or send us a photo on WhatsApp and we will recommend one.</p></div></details></div>' +
    '<section class="related"><h2>You may also like</h2><div class="product-grid" id="related"></div></section></div>' +
    '<div class="sticky-buy shop" id="sticky"><span class="sh-price">' + money(cur, minPrice) + '</span><button type="button" class="sh-btn sh-btn-primary">' + ic('shopping-cart', 'sm') + 'Add to cart</button></div></main>';
}

const simple = (base, title, id, extra) => '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [['Shop', base + '/shop/'], [title]]) + (extra || '<div class="shop-head"><h1>' + esc(title) + '</h1></div>') + '<div id="' + id + '"></div></div></main>';
function cartPage(base) { return simple(base, 'Your cart', 'cart'); }
function checkoutPage(base) { return simple(base, 'Checkout', 'checkout'); }
function successPage(base) { return simple(base, 'Order confirmation', 'success', '<div></div>'); }
function ordersPage(base) { return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [['Shop', base + '/shop/'], ['My account']]) + '<div class="account-layout"><nav class="account-nav"><a class="on" href="' + base + '/account/orders/">' + ic('package') + 'My orders</a><a href="' + base + '/wishlist/">' + ic('heart') + 'Wishlist</a><a href="' + base + '/#contact">' + ic('mail') + 'Contact us</a></nav><div id="orders"></div></div></div></main>'; }
function wishlistPage(base) { return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [['Shop', base + '/shop/'], ['Wishlist']]) + '<div class="shop-head"><div><h1>Your wishlist</h1><p class="muted">Saved on this device.</p></div></div><div class="product-grid" id="wgrid"></div></div></main>'; }

function brandsPage(base) {
  return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [['Shop']]) +
    '<div class="shop-head"><div><h1>Choose a Brand</h1><p class="muted">Genuine products imported and distributed by Al Qabas Pharmacy L.L.C, delivered across Oman.</p></div></div>' +
    '<div class="brand-grid">' +
    '<a class="brand-card" href="' + base + '/shop/toppik/"><div class="txt"><h3><img class="brand-logo" src="' + base + '/assets/toppik/toppik-logo.png" alt="Toppik" width="600" height="345"></h3><p>Hair building fibers, sprays, kits and hair care.</p><span class="go sh-btn sh-btn-primary sh-btn-sm">Shop Toppik' + ic('arrow-right', 'sm') + '</span></div><img class="art" src="' + base + '/assets/shop/starter-kit.png" alt=""></a>' +
    '<a class="brand-card" href="' + base + '/shop/viviscal/"><div class="txt"><h3><img class="brand-logo vivi" src="' + base + '/assets/viviscal/logo-viviscal.png" alt="Viviscal" width="622" height="157"></h3><p>Hair growth supplements, shampoo, conditioner and serum.</p><span class="go sh-btn sh-btn-primary sh-btn-sm">Shop Viviscal' + ic('arrow-right', 'sm') + '</span></div><img class="art" src="' + base + '/assets/viviscal/products.png" alt=""></a>' +
    '</div></div></main>';
}

function viviscalPage(base) { return '<main id="shop-main" class="shop"><div class="wrap shop-page">' + crumbs(base, [['Shop', base + '/shop/'], ['Viviscal']]) + '<div class="shop-head"><div><h1>Viviscal</h1><p class="muted">Viviscal supplements, shampoo, conditioner and serum nourish thinning hair from the inside and out, backed by clinical trials. Genuine products delivered across Oman.</p></div></div><div class="sh-empty">' + ic('package') + '<h2>Viviscal products are being added.</h2><p>The full Viviscal range will be listed here shortly. In the meantime, order or ask about availability on WhatsApp.</p><a class="sh-btn sh-btn-primary" href="https://wa.me/96891221609?text=' + encodeURIComponent('Hello Al Qabas Pharmacy, I would like to ask about Viviscal: ') + '" target="_blank" rel="noopener">Ask on WhatsApp</a></div></div></main>'; }

module.exports = { brandsPage, viviscalPage, sprite, headerTools, shopGrid, productPage, cartPage, checkoutPage, successPage, ordersPage, wishlistPage };
