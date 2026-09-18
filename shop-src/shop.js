/* Al Qabas Pharmacy shop engine.
   Layers: DATA PROVIDER (products, inventory, orders) -> STORE (cart, wishlist, totals) -> VIEWS (pages, drawer, modals).
   The provider is swappable: LocalProvider runs the preview entirely in the browser; a backend provider
   with the same six methods (products, reserveStock, createOrder, getOrder, listOrders, validatePromo) plugs in at launch. */
(function () {
  'use strict';
  const CFG = window.SHOP_CONFIG || {};
  const BASE = CFG.base || '';
  const ASSETS = CFG.assets || BASE + '/assets/shop/';
  const CUR = (CFG.currency || 'OMR');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => CUR + ' ' + (Math.round(n * 1000) / 1000).toFixed(3);
  const icon = (name, cls) => '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const url = (p) => BASE + p;
  const img = (f) => ASSETS + f;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const ls = { get(k, d) { try { const v = localStorage.getItem('qshop:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('qshop:' + k, JSON.stringify(v)); } catch (e) {} } };

  /* ---------- Data provider ---------- */
  function LocalProvider(catalog) {
    const stock = ls.get('stock', null) || (function () { const s = {}; catalog.products.forEach((p) => p.variants.forEach((v) => { const key = variantKey(p, v.size); if (v.stockByShade) Object.entries(v.stockByShade).forEach(([sh, n]) => { s[key + '|' + sh] = n; }); else s[key] = v.stock; })); return s; })();
    ls.set('stock', stock);
    return {
      name: 'local',
      async products() { await wait(120); return catalog; },
      stockOf(p, size, shade) { const key = variantKey(p, size) + (shade ? '|' + shade : ''); return stock[key] == null ? 0 : stock[key]; },
      async reserveStock(lines) { await wait(80); for (const l of lines) { const key = l.variantKey + (l.shade ? '|' + l.shade : ''); if ((stock[key] || 0) < l.qty) return { ok: false, line: l, available: stock[key] || 0 }; } for (const l of lines) { const key = l.variantKey + (l.shade ? '|' + l.shade : ''); stock[key] -= l.qty; } ls.set('stock', stock); return { ok: true }; },
      async createOrder(order) { await wait(700); const orders = ls.get('orders', []); order.id = 'AQ' + String(Date.now()).slice(-6) + String(orders.length + 1).padStart(2, '0'); order.createdAt = new Date().toISOString(); order.status = 'pending'; order.paymentStatus = order.payment.id === 'cod' ? 'pay_on_delivery' : 'pending'; orders.unshift(order); ls.set('orders', orders); return order; },
      async getOrder(id) { await wait(150); return ls.get('orders', []).find((o) => o.id === id) || null; },
      async listOrders() { await wait(200); return ls.get('orders', []); },
      async validatePromo(code, subtotal) { await wait(300); const c = (catalog.promoCodes || []).find((x) => x.code.toLowerCase() === String(code).trim().toLowerCase()); if (!c) return { ok: false, reason: 'That code is not valid.' }; const off = c.type === 'percent' ? subtotal * c.value / 100 : Math.min(c.value, subtotal); return { ok: true, code: c.code, discount: Math.round(off * 1000) / 1000, label: c.type === 'percent' ? c.value + '% off' : money(c.value) + ' off' }; }
    };
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const variantKey = (p, size) => p.id + (size ? '|' + size : '');

  /* ---------- Store ---------- */
  const Store = {
    catalog: null, provider: null, ready: null,
    cart: ls.get('cart', []), wishlist: ls.get('wishlist', []), promo: ls.get('promo', null),
    init() { if (this.ready) return this.ready; this.ready = (async () => { const c = CFG.catalog || await (await fetch(url('/shop-data/products.json') + (CFG.version ? '?v=' + CFG.version : ''))).json(); this.catalog = c; this.provider = LocalProvider(c); if (CFG.provider) this.provider = CFG.provider(c, LocalProvider(c)); this.emit('ready'); return c; })(); return this.ready; },
    on(ev, fn) { (this._h = this._h || {})[ev] = (this._h[ev] || []).concat(fn); },
    emit(ev, d) { ((this._h || {})[ev] || []).forEach((f) => f(d)); },
    product(idOrSlug) { return this.catalog.products.find((p) => p.id === idOrSlug || p.slug === idOrSlug); },
    variant(p, size) { return p.variants.find((v) => !size || v.size === size) || p.variants[0]; },
    price(p, size) { const v = this.variant(p, size); return { price: v.salePrice != null ? v.salePrice : v.price, old: v.salePrice != null ? v.price : null }; },
    minPrice(p) { return Math.min.apply(null, p.variants.map((v) => v.salePrice != null ? v.salePrice : v.price)); },
    hasSale(p) { return p.variants.some((v) => v.salePrice != null); },
    stock(p, size, shade) { return this.provider.stockOf(p, size, shade); },
    anyStock(p) { return p.variants.some((v) => v.stockByShade ? Object.values(v.stockByShade).some((n) => n > 0) : v.stock > 0); },
    stockState(n) { return n <= 0 ? 'out' : n <= 5 ? 'low' : 'in'; },
    lineKey(l) { return l.productId + '|' + (l.size || '') + '|' + (l.shade || ''); },
    inCart(productId, size, shade) { return this.cart.find((l) => l.productId === productId && (l.size || '') === (size || '') && (l.shade || '') === (shade || '')); },
    add(p, size, shade, qty) {
      const avail = this.stock(p, size, shade); const line = this.inCart(p.id, size, shade); const have = line ? line.qty : 0;
      if (avail <= 0) return { ok: false, reason: 'This item is out of stock.' };
      if (have + qty > avail) return { ok: false, reason: 'Only ' + avail + ' left in stock.' };
      const pr = this.price(p, size);
      if (line) line.qty += qty; else this.cart.push({ productId: p.id, name: p.name, slug: p.slug, size: size || null, shade: shade || null, qty, unit: pr.price, image: (p.variantImages && size && p.variantImages[size]) || p.images[0], variantKey: variantKey(p, size) });
      this.save(); return { ok: true };
    },
    setQty(key, qty) { const l = this.cart.find((x) => this.lineKey(x) === key); if (!l) return; if (qty <= 0) { this.cart = this.cart.filter((x) => x !== l); } else { const p = this.product(l.productId); const avail = this.stock(p, l.size, l.shade); l.qty = Math.min(qty, Math.max(avail, 1)); } this.save(); },
    remove(key) { this.cart = this.cart.filter((x) => this.lineKey(x) !== key); this.save(); },
    clearCart() { this.cart = []; this.promo = null; ls.set('promo', null); this.save(); },
    count() { return this.cart.reduce((n, l) => n + l.qty, 0); },
    subtotal() { return this.cart.reduce((n, l) => n + l.qty * l.unit, 0); },
    shippingFor(method) { const m = (this.catalog.shipping || []).find((s) => s.id === method); if (!m) return 0; if (m.freeAbove != null && this.subtotal() >= m.freeAbove) return 0; return m.price; },
    totals(method) { const sub = this.subtotal(); const disc = this.promo ? Math.min(this.promo.discount, sub) : 0; const ship = method ? this.shippingFor(method) : null; const taxable = sub - disc + (ship || 0); const tax = Math.round(taxable * ((this.catalog.tax || {}).rate || 0) * 1000) / 1000; return { sub, disc, ship, tax, total: taxable + tax }; },
    save() { ls.set('cart', this.cart); ls.set('wishlist', this.wishlist); this.emit('cart'); UI.badge(); },
    toggleWish(id) { const i = this.wishlist.indexOf(id); if (i >= 0) this.wishlist.splice(i, 1); else this.wishlist.push(id); this.save(); return i < 0; },
    wished(id) { return this.wishlist.includes(id); }
  };

  /* ---------- Shared UI ---------- */
  const UI = {
    badge() { $$('.shop-tools .count').forEach((el) => { const n = Store.count(); el.textContent = n; el.dataset.n = n; }); $$('.shop-tools .wcount').forEach((el) => { el.textContent = Store.wishlist.length; el.dataset.n = Store.wishlist.length; }); },
    toast(msg, err) { let t = $('.sh-toast'); if (!t) { t = document.createElement('div'); t.className = 'sh-toast'; document.body.appendChild(t); } t.className = 'sh-toast' + (err ? ' err' : ''); t.innerHTML = icon(err ? 'info' : 'check') + esc(msg); requestAnimationFrame(() => t.classList.add('show')); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400); },
    stars(p) { if (!p.reviewCount) return '<span class="sh-stars empty" title="No reviews yet">' + icon('star').repeat(5) + '</span><span class="muted small">No reviews yet</span>'; const full = Math.round(p.rating); return '<span class="sh-stars">' + icon('star').repeat(full) + '</span><span class="muted small">' + p.rating.toFixed(1) + ' (' + p.reviewCount + ')</span>'; },
    priceHtml(p, size) { const pr = Store.price(p, size); return '<span class="sh-price">' + money(pr.price) + (pr.old ? '<span class="old">' + money(pr.old) + '</span>' : '') + '</span>'; },
    badges(p) { const b = []; if (!Store.anyStock(p)) b.push('<span class="sh-badge out">Out of stock</span>'); else { if (p.bestSeller) b.push('<span class="sh-badge best">Best seller</span>'); if (p.isNew) b.push('<span class="sh-badge new">New</span>'); if (Store.hasSale(p)) b.push('<span class="sh-badge sale">Sale</span>'); } return b.join(''); },
    qty(value, max, cls) { return '<div class="sh-qty ' + (cls || '') + '" data-max="' + max + '"><button type="button" data-dec aria-label="Decrease">' + icon('minus', 'sm') + '</button><output>' + value + '</output><button type="button" data-inc aria-label="Increase"' + (value >= max ? ' disabled' : '') + '>' + icon('plus', 'sm') + '</button></div>'; },
    bindQty(root, onChange) { $$('.sh-qty', root).forEach((q) => { if (q._bound) return; q._bound = true; const out = $('output', q); const max = parseInt(q.dataset.max, 10) || 99; const set = (n) => { n = Math.max(1, Math.min(max, n)); out.textContent = n; out.classList.remove('bump'); void out.offsetWidth; out.classList.add('bump'); $('[data-inc]', q).disabled = n >= max; $('[data-dec]', q).disabled = n <= 1 && q.dataset.min !== '0'; onChange && onChange(n, q); }; $('[data-dec]', q).addEventListener('click', () => set(parseInt(out.textContent, 10) - 1)); $('[data-inc]', q).addEventListener('click', () => set(parseInt(out.textContent, 10) + 1)); }); },
    empty(iconName, title, text, btnText, href) { return '<div class="sh-empty">' + icon(iconName) + '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' + (btnText ? '<a class="sh-btn sh-btn-primary" href="' + href + '">' + esc(btnText) + '</a>' : '') + '</div>'; },
    skeletonCards(n) { return Array.from({ length: n }, () => '<div class="sk-card"><div class="sk" style="aspect-ratio:1"></div><div class="lines"><div class="sk" style="width:70%"></div><div class="sk" style="width:40%"></div><div class="sk" style="width:55%"></div></div></div>').join(''); },
    addedFx(btn) { const old = btn.innerHTML; btn.classList.add('is-added'); btn.innerHTML = icon('check') + 'Added'; setTimeout(() => { btn.classList.remove('is-added'); btn.innerHTML = old; }, 1400); }
  };

  /* ---------- Product card ---------- */
  function card(p) {
    const v0 = p.variants[0]; const sizeLabel = p.options.size ? p.options.size.length + ' sizes' : (v0.size || ''); const variantText = [sizeLabel, p.options.shade ? p.options.shade.length + ' shades' : ''].filter(Boolean).join(' · ');
    const avail = Store.anyStock(p); const simple = !p.options.size && !p.options.shade; const max = simple ? Store.stock(p) : 99;
    return '<article class="pcard" data-id="' + p.id + '">' +
      '<div class="media">' + '<a href="' + url('/shop/' + p.slug + '/') + '" aria-label="' + esc(p.name) + '"><img src="' + img(p.images[0]) + '" alt="' + esc(p.name) + '" loading="lazy"></a>' +
      '<div class="badges">' + UI.badges(p) + '</div>' +
      '<button type="button" class="wish' + (Store.wished(p.id) ? ' on' : '') + '" data-wish="' + p.id + '" aria-label="Add to wishlist">' + icon('heart', 'sm') + '</button>' +
      '<button type="button" class="sh-btn sh-btn-secondary sh-btn-sm quick" data-quick="' + p.id + '">' + icon('eye', 'sm') + 'Quick view</button></div>' +
      '<div class="body"><h3><a href="' + url('/shop/' + p.slug + '/') + '">' + esc(p.name) + '</a></h3>' +
      '<div class="variant">' + esc(variantText || p.type) + '</div>' +
      '<div class="rating">' + UI.stars(p) + '</div>' +
      '<div class="row">' + (simple ? UI.priceHtml(p) : '<span class="sh-price">From ' + money(Store.minPrice(p)) + '</span>') + '</div>' +
      '<div class="actions">' + (simple ? UI.qty(1, Math.max(max, 1)) : '') + (simple ? '<button type="button" class="sh-btn sh-btn-primary sh-btn-sm" data-add="' + p.id + '"' + (avail ? '' : ' disabled') + '>' + icon('shopping-cart', 'sm') + (avail ? 'Add to cart' : 'Out of stock') + '</button>' : '<a class="sh-btn sh-btn-primary sh-btn-sm" style="grid-column:1/-1" href="' + url('/shop/' + p.slug + '/') + '">' + (avail ? 'Choose options' : 'Out of stock') + icon('arrow-right', 'sm') + '</a>') + '</div></div></article>';
  }
  function bindCards(root) {
    UI.bindQty(root);
    $$('[data-add]', root).forEach((b) => b.addEventListener('click', () => { const p = Store.product(b.dataset.add); const q = b.closest('.pcard') ? parseInt($('.sh-qty output', b.closest('.pcard')).textContent, 10) : 1; const r = Store.add(p, null, null, q); if (!r.ok) return UI.toast(r.reason, true); UI.addedFx(b); Drawer.open(); }));
    $$('[data-wish]', root).forEach((b) => b.addEventListener('click', () => { const on = Store.toggleWish(b.dataset.wish); b.classList.toggle('on', on); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); UI.toast(on ? 'Saved to your wishlist' : 'Removed from wishlist'); if (document.body.dataset.page === 'wishlist') Pages.wishlist(); }));
    $$('[data-quick]', root).forEach((b) => b.addEventListener('click', () => QuickView.open(b.dataset.quick)));
  }

  /* ---------- Option picker (shared by product page and quick view) ---------- */
  function Picker(p, root, opts) {
    const state = { size: p.options.size ? (opts.size || p.options.size[1] || p.options.size[0]) : null, shade: p.options.shade ? (opts.shade || p.options.shade[0]) : null, qty: 1 };
    const colors = Store.catalog.shadeColors || {};
    function render() {
      const parts = [];
      if (p.options.size) parts.push('<div class="opt-group"><div class="lbl">Size <span>' + esc(state.size) + '</span></div><div class="opts">' + p.options.size.map((s) => { const v = Store.variant(p, s); const any = v.stockByShade ? Object.values(v.stockByShade).some((n) => n > 0) : v.stock > 0; return '<button type="button" class="opt' + (s === state.size ? ' on' : '') + (any ? '' : ' off') + '" data-size="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div></div>');
      if (p.options.shade) parts.push('<div class="opt-group"><div class="lbl">Shade <span>' + esc(state.shade) + '</span></div><div class="opts">' + p.options.shade.map((s) => { const n = Store.stock(p, state.size, s); return '<button type="button" class="opt' + (s === state.shade ? ' on' : '') + (n > 0 ? '' : ' off') + '" data-shade="' + esc(s) + '"><i class="dot" style="background:' + (colors[s] || '#ccc') + '"></i>' + esc(s) + '</button>'; }).join('') + '</div></div>');
      const n = Store.stock(p, state.size, state.shade); const st = Store.stockState(n);
      parts.push('<div class="stock-row"><span class="sh-stock ' + st + '">' + icon(st === 'out' ? 'x' : 'check', 'sm') + (st === 'in' ? 'In stock' : st === 'low' ? 'Low stock, ' + n + ' left' : 'Out of stock') + '</span></div>');
      parts.push('<div class="pdp-buy">' + UI.qty(Math.min(state.qty, Math.max(n, 1)), Math.max(n, 1)) + '<button type="button" class="sh-btn sh-btn-primary" data-pick-add' + (n > 0 ? '' : ' disabled') + '>' + icon('shopping-cart') + (n > 0 ? 'Add to cart' : 'Out of stock') + '</button>' + (opts.buyNow ? '<button type="button" class="sh-btn sh-btn-secondary sh-btn-block" data-pick-buy' + (n > 0 ? '' : ' disabled') + '>Buy now</button>' : '') + (opts.wish ? '<div class="wish-row"><button type="button" class="sh-icon-btn" data-pick-wish aria-label="Wishlist">' + icon('heart', 'sm') + '</button><span class="muted">' + (Store.wished(p.id) ? 'In your wishlist' : 'Save to wishlist') + '</span></div>' : '') + '</div>');
      root.innerHTML = parts.join('');
      $$('[data-size]', root).forEach((b) => b.addEventListener('click', () => { state.size = b.dataset.size; render(); opts.onChange && opts.onChange(state); }));
      $$('[data-shade]', root).forEach((b) => b.addEventListener('click', () => { state.shade = b.dataset.shade; render(); opts.onChange && opts.onChange(state); }));
      UI.bindQty(root, (q) => { state.qty = q; });
      const addBtn = $('[data-pick-add]', root);
      addBtn && addBtn.addEventListener('click', () => { const r = Store.add(p, state.size, state.shade, state.qty); if (!r.ok) return UI.toast(r.reason, true); UI.addedFx(addBtn); Drawer.open(); });
      const buy = $('[data-pick-buy]', root); buy && buy.addEventListener('click', () => { const r = Store.add(p, state.size, state.shade, state.qty); if (!r.ok) return UI.toast(r.reason, true); location.href = url('/checkout/'); });
      const w = $('[data-pick-wish]', root); w && w.addEventListener('click', () => { const on = Store.toggleWish(p.id); w.nextElementSibling.textContent = on ? 'In your wishlist' : 'Save to wishlist'; UI.toast(on ? 'Saved to your wishlist' : 'Removed from wishlist'); });
      opts.onRender && opts.onRender(state);
      if (!state._init) { state._init = true; opts.onChange && opts.onChange(state); }
    }
    render(); return state;
  }

  /* ---------- Quick view ---------- */
  const QuickView = {
    el: null,
    open(id) { const p = Store.product(id); if (!this.el) { this.el = document.createElement('div'); this.el.className = 'sh-modal shop'; this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); }); document.body.appendChild(this.el); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); }); }
      this.el.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-label="Quick view"><button type="button" class="sh-icon-btn close" aria-label="Close">' + icon('x') + '</button><div class="media"><img src="' + img(p.images[0]) + '" alt="' + esc(p.name) + '"></div><div class="info"><div>' + UI.badges(p) + '</div><h2>' + esc(p.name) + '</h2><div class="rating">' + UI.stars(p) + '</div><div class="price-row" data-qv-price>' + UI.priceHtml(p, p.options.size ? p.options.size[1] || p.options.size[0] : null) + '</div><p class="muted">' + esc(p.shortDescription) + '</p><div data-qv-picker></div><a class="sh-btn sh-btn-ghost" href="' + url('/shop/' + p.slug + '/') + '">View full product' + icon('arrow-right', 'sm') + '</a></div></div>';
      $('.close', this.el).addEventListener('click', () => this.close());
      const imgEl = $('.media img', this.el);
      Picker(p, $('[data-qv-picker]', this.el), { onChange: (s) => { $('[data-qv-price]', this.el).innerHTML = UI.priceHtml(p, s.size); if (p.variantImages && s.size && p.variantImages[s.size]) imgEl.src = img(p.variantImages[s.size]); } });
      this.el.classList.add('open'); document.body.style.overflow = 'hidden'; },
    close() { if (this.el) { this.el.classList.remove('open'); document.body.style.overflow = ''; } }
  };

  /* ---------- Cart drawer ---------- */
  const Drawer = {
    el: null, scrim: null,
    ensure() { if (this.el) return; this.scrim = document.createElement('div'); this.scrim.className = 'sh-drawer-scrim'; this.scrim.addEventListener('click', () => this.close()); this.el = document.createElement('aside'); this.el.className = 'sh-drawer shop'; this.el.setAttribute('aria-label', 'Your cart'); document.body.appendChild(this.scrim); document.body.appendChild(this.el); Store.on('cart', () => { if (this.el.classList.contains('open')) this.render(); }); },
    render() {
      const lines = Store.cart; const t = Store.totals(null);
      this.el.innerHTML = '<div class="head"><h2>Your cart <span class="muted small">(' + Store.count() + ')</span></h2><button type="button" class="sh-icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
        '<div class="items">' + (lines.length ? lines.map(lineHtml).join('') : UI.empty('shopping-cart', 'Your cart is empty.', 'Add a product and it will appear here.', 'Start shopping', url('/shop/toppik/'))) + '</div>' +
        (lines.length ? '<div class="foot">' + promoHtml() + '<div class="sum"><div><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' + (t.disc ? '<div class="disc"><span>Discount (' + esc(Store.promo.code) + ')</span><span>-' + money(t.disc) + '</span></div>' : '') + '<div><span>Shipping</span><span class="muted">Calculated at checkout</span></div><div class="total"><span>Total</span><span>' + money(t.sub - t.disc) + '</span></div></div><a class="sh-btn sh-btn-primary sh-btn-block" href="' + url('/checkout/') + '">Proceed to checkout' + icon('arrow-right', 'sm') + '</a><a class="sh-btn sh-btn-ghost sh-btn-block" href="' + url('/cart/') + '">View cart</a></div>' : '');
      $('[data-close]', this.el).addEventListener('click', () => this.close()); bindLines(this.el); bindPromo(this.el);
    },
    open() { this.ensure(); this.render(); this.el.classList.add('open'); this.scrim.classList.add('open'); },
    close() { if (!this.el) return; this.el.classList.remove('open'); this.scrim.classList.remove('open'); }
  };
  function lineHtml(l) { const p = Store.product(l.productId); const avail = Store.stock(p, l.size, l.shade); const key = Store.lineKey(l); return '<div class="cart-line" data-key="' + esc(key) + '"><img src="' + img(l.image) + '" alt=""><div><b>' + esc(l.name) + '</b><div class="v">' + [l.size, l.shade].filter(Boolean).map(esc).join(' · ') + '</div><div class="ctl">' + UI.qty(l.qty, Math.max(avail, 1), 'sm') + '<button type="button" class="rm" data-remove aria-label="Remove">' + icon('trash', 'sm') + '</button></div>' + (avail < l.qty ? '<div class="small" style="color:var(--sh-error)">Only ' + avail + ' available</div>' : '') + '</div><div class="sh-price">' + money(l.qty * l.unit) + '</div></div>'; }
  function bindLines(root) { $$('.cart-line', root).forEach((row) => { const key = row.dataset.key; const after = () => { if (!root.classList.contains('sh-drawer')) Pages.cartRefresh && Pages.cartRefresh(); if (document.body.dataset.page === 'checkout') Checkout.refresh(); }; UI.bindQty(row, (n) => { Store.setQty(key, n); after(); }); $('[data-remove]', row).addEventListener('click', () => { Store.remove(key); UI.toast('Removed from cart'); after(); }); }); }
  function promoHtml() { return Store.promo ? '<div class="sh-notice success">' + icon('check', 'sm') + '<span>Code <b>' + esc(Store.promo.code) + '</b> applied, ' + esc(Store.promo.label) + '. <a href="#" data-promo-clear>Remove</a></span></div>' : '<form class="sh-input-btn" data-promo><input type="text" placeholder="Promo code" aria-label="Promo code" autocomplete="off"><button type="submit" class="sh-btn sh-btn-ghost sh-btn-sm">Apply</button></form><div class="small" data-promo-msg style="color:var(--sh-error)"></div>'; }
  function bindPromo(root) { const f = $('[data-promo]', root); if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); const code = $('input', f).value; if (!code.trim()) return; const btn = $('button', f); btn.disabled = true; const r = await Store.provider.validatePromo(code, Store.subtotal()); btn.disabled = false; if (!r.ok) { $('[data-promo-msg]', root).textContent = r.reason; return; } Store.promo = r; ls.set('promo', r); Store.save(); UI.toast('Promo code applied'); Pages.cartRefresh && Pages.cartRefresh(); Checkout.refresh && Checkout.refresh(); }); const c = $('[data-promo-clear]', root); if (c) c.addEventListener('click', (e) => { e.preventDefault(); Store.promo = null; ls.set('promo', null); Store.save(); Pages.cartRefresh && Pages.cartRefresh(); Checkout.refresh && Checkout.refresh(); }); }

  /* ---------- Search ---------- */
  const Search = {
    el: null,
    open() { if (!this.el) { this.el = document.createElement('div'); this.el.className = 'sh-search shop'; this.el.innerHTML = '<div class="panel" role="dialog" aria-label="Search products"><div class="bar">' + icon('search') + '<input type="search" placeholder="Search products, SKU or category" autocomplete="off"><button type="button" class="sh-icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="results"></div></div>'; document.body.appendChild(this.el); this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); }); $('[data-close]', this.el).addEventListener('click', () => this.close()); $('input', this.el).addEventListener('input', (e) => this.query(e.target.value)); $('input', this.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') { location.href = url('/shop/toppik/?q=' + encodeURIComponent(e.target.value)); } if (e.key === 'Escape') this.close(); }); }
      this.el.classList.add('open'); $('input', this.el).value = ''; this.query(''); setTimeout(() => $('input', this.el).focus(), 50); },
    close() { this.el && this.el.classList.remove('open'); },
    match(q) { q = q.trim().toLowerCase(); if (!q) return []; const cat = (p) => (Store.catalog.categories.find((c) => c.slug === p.category) || {}).name || ''; const strong = Store.catalog.products.filter((p) => [p.name, p.sku, p.type, cat(p)].join(' ').toLowerCase().includes(q)); if (strong.length || q.length < 4) return strong; return Store.catalog.products.filter((p) => p.shortDescription.toLowerCase().includes(q)); },
    query(q) { const r = $('.results', this.el); if (!q.trim()) { r.innerHTML = '<div class="empty">Type to search the Toppik range.</div>'; return; } const hits = this.match(q).slice(0, 8); r.innerHTML = hits.length ? hits.map((p) => '<a class="hit" href="' + url('/shop/' + p.slug + '/') + '"><img src="' + img(p.images[0]) + '" alt=""><div><b>' + esc(p.name) + '</b><span>' + esc(p.type) + ' · ' + esc(p.sku) + '</span></div><span class="sh-price">' + (p.options.size ? 'From ' : '') + money(Store.minPrice(p)) + '</span></a>').join('') + '<a class="hit" href="' + url('/shop/toppik/?q=' + encodeURIComponent(q)) + '"><span>' + icon('search', 'sm') + '</span><b>See all results for "' + esc(q) + '"</b></a>' : '<div class="empty">No products match "' + esc(q) + '". Try another word, or browse the shop.</div>'; }
  };

  /* ---------- Pages ---------- */
  const Pages = {
    async shop() {
      const grid = $('#grid'); const params = new URLSearchParams(location.search);
      grid.innerHTML = UI.skeletonCards(8);
      await Store.init();
      const cat = Store.catalog; const cats = cat.categories; const catSlug = document.body.dataset.category || '';
      const state = { q: params.get('q') || '', cats: catSlug ? [catSlug] : [], types: [], shades: [], sizes: [], min: '', max: '', stock: false, sort: 'featured' };
      const products = cat.products;
      const types = Array.from(new Set(products.map((p) => p.type))); const sizes = Array.from(new Set(products.flatMap((p) => p.options.size || [])));
      const f = $('#filters');
      f.innerHTML = '<button type="button" class="sh-icon-btn close" data-fclose aria-label="Close filters">' + icon('x') + '</button>' +
        (catSlug ? '' : '<details open><summary>Category ' + icon('chevron-down', 'sm') + '</summary><div class="opts">' + cats.map((c) => '<label><input type="checkbox" data-f="cats" value="' + c.slug + '">' + esc(c.name) + '<span class="n">' + products.filter((p) => p.category === c.slug).length + '</span></label>').join('') + '</div></details>') +
        '<details open><summary>Product type ' + icon('chevron-down', 'sm') + '</summary><div class="opts">' + types.map((t) => '<label><input type="checkbox" data-f="types" value="' + esc(t) + '">' + esc(t) + '<span class="n">' + products.filter((p) => p.type === t).length + '</span></label>').join('') + '</div></details>' +
        '<details open><summary>Shade ' + icon('chevron-down', 'sm') + '</summary><div class="swatches">' + cat.shades.map((s) => '<button type="button" class="swatch" data-shade="' + esc(s) + '" title="' + esc(s) + '" aria-label="' + esc(s) + '" style="background:' + (cat.shadeColors[s] || '#ccc') + '"></button>').join('') + '</div></details>' +
        '<details><summary>Size ' + icon('chevron-down', 'sm') + '</summary><div class="opts">' + sizes.map((s) => '<label><input type="checkbox" data-f="sizes" value="' + esc(s) + '">' + esc(s) + '</label>').join('') + '</div></details>' +
        '<details><summary>Price (' + CUR + ') ' + icon('chevron-down', 'sm') + '</summary><div class="range"><input type="number" min="0" step="0.5" placeholder="Min" data-min><span class="muted">to</span><input type="number" min="0" step="0.5" placeholder="Max" data-max></div></details>' +
        '<details><summary>Availability ' + icon('chevron-down', 'sm') + '</summary><div class="opts"><label><input type="checkbox" data-stock>In stock only</label></div></details>' +
        '<button type="button" class="sh-btn sh-btn-ghost sh-btn-sm clear" data-fclear>Clear all filters</button>';
      const apply = () => {
        let list = products.filter((p) => (!state.cats.length || state.cats.includes(p.category)) && (!state.types.length || state.types.includes(p.type)) && (!state.shades.length || (p.options.shade || []).some((s) => state.shades.includes(s))) && (!state.sizes.length || (p.options.size || []).some((s) => state.sizes.includes(s))) && (state.min === '' || Store.minPrice(p) >= +state.min) && (state.max === '' || Store.minPrice(p) <= +state.max) && (!state.stock || Store.anyStock(p)) && (!state.q || Search.match(state.q).includes(p)));
        const s = state.sort; list = list.slice().sort((a, b) => s === 'price-asc' ? Store.minPrice(a) - Store.minPrice(b) : s === 'price-desc' ? Store.minPrice(b) - Store.minPrice(a) : s === 'name' ? a.name.localeCompare(b.name) : s === 'new' ? (b.isNew - a.isNew) : ((b.featured - a.featured) || (b.bestSeller - a.bestSeller)));
        $('#count').textContent = list.length + (list.length === 1 ? ' product' : ' products') + (state.q ? ' for "' + state.q + '"' : '');
        const chips = []; if (state.q) chips.push(['q', 'Search: ' + state.q]); state.cats.forEach((c) => chips.push(['cats:' + c, (cats.find((x) => x.slug === c) || {}).name || c])); state.types.forEach((t) => chips.push(['types:' + t, t])); state.shades.forEach((t) => chips.push(['shades:' + t, t])); state.sizes.forEach((t) => chips.push(['sizes:' + t, t])); if (state.min !== '' || state.max !== '') chips.push(['price', 'Price ' + (state.min || '0') + ' to ' + (state.max || 'any')]); if (state.stock) chips.push(['stock', 'In stock']);
        $('#chips').innerHTML = chips.map(([k, l]) => '<button type="button" data-chip="' + esc(k) + '">' + esc(l) + icon('x', 'sm') + '</button>').join('');
        $$('[data-chip]').forEach((b) => b.addEventListener('click', () => { const [key, val] = b.dataset.chip.split(':'); if (key === 'q') { state.q = ''; history.replaceState(null, '', location.pathname); } else if (key === 'price') { state.min = state.max = ''; $('[data-min]', f).value = ''; $('[data-max]', f).value = ''; } else if (key === 'stock') { state.stock = false; $('[data-stock]', f).checked = false; } else { state[key] = state[key].filter((x) => x !== val); $$('[data-f="' + key + '"]', f).forEach((i) => { if (i.value === val) i.checked = false; }); $$('[data-shade]', f).forEach((i) => { if (i.dataset.shade === val) i.classList.remove('on'); }); } apply(); }));
        grid.innerHTML = list.length ? list.map(card).join('') : UI.empty('search', 'No products match these filters.', 'Try removing a filter or searching for something else.', 'Clear filters', '#'); if (!list.length) $('.sh-empty a', grid).addEventListener('click', (e) => { e.preventDefault(); $('[data-fclear]', f).click(); });
        bindCards(grid);
      };
      $$('[data-f]', f).forEach((i) => i.addEventListener('change', () => { state[i.dataset.f] = $$('[data-f="' + i.dataset.f + '"]:checked', f).map((x) => x.value); apply(); }));
      $$('[data-shade]', f).forEach((b) => b.addEventListener('click', () => { b.classList.toggle('on'); state.shades = $$('[data-shade].on', f).map((x) => x.dataset.shade); apply(); }));
      $('[data-min]', f).addEventListener('input', (e) => { state.min = e.target.value; apply(); }); $('[data-max]', f).addEventListener('input', (e) => { state.max = e.target.value; apply(); });
      $('[data-stock]', f).addEventListener('change', (e) => { state.stock = e.target.checked; apply(); });
      $('[data-fclear]', f).addEventListener('click', () => { state.cats = catSlug ? [catSlug] : []; state.types = []; state.shades = []; state.sizes = []; state.min = state.max = ''; state.stock = false; state.q = ''; $$('input', f).forEach((i) => { if (i.type === 'checkbox') i.checked = false; else i.value = ''; }); $$('[data-shade]', f).forEach((i) => i.classList.remove('on')); history.replaceState(null, '', location.pathname); apply(); });
      $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
      const scrim = $('#fscrim'); $('#fopen').addEventListener('click', () => { f.classList.add('open'); scrim.classList.add('open'); }); const closeF = () => { f.classList.remove('open'); scrim.classList.remove('open'); }; $('[data-fclose]', f).addEventListener('click', closeF); scrim.addEventListener('click', closeF);
      apply();
    },
    async product() {
      await Store.init(); const p = Store.product(document.body.dataset.product); if (!p) { $('#pdp').innerHTML = UI.empty('package', 'Product unavailable', 'This product is no longer listed.', 'Back to the shop', url('/shop/toppik/')); return; }
      const params = new URLSearchParams(location.search);
      const gallery = $('#gallery'); const mainImg = $('img', $('.main', gallery)); const thumbs = $('.thumbs', gallery);
      const setImg = (f) => { if (mainImg.dataset.f === f) return; mainImg.classList.add('fade'); setTimeout(() => { mainImg.src = img(f); mainImg.dataset.f = f; mainImg.classList.remove('fade'); }, 180); $$('button', thumbs).forEach((b) => b.classList.toggle('on', b.dataset.f === f)); };
      $$('button', thumbs).forEach((b) => b.addEventListener('click', () => setImg(b.dataset.f)));
      $('.main', gallery).addEventListener('click', () => $('.main', gallery).classList.toggle('zoom'));
      const priceEl = $('#pdp-price'); const sticky = $('#sticky');
      Picker(p, $('#picker'), { buyNow: true, wish: true, size: params.get('size'), shade: params.get('shade'), onChange: (s) => { priceEl.innerHTML = UI.priceHtml(p, s.size); if (p.variantImages && s.size && p.variantImages[s.size]) setImg(p.variantImages[s.size]); }, onRender: (s) => { if (sticky) { $('.sh-price', sticky).innerHTML = UI.priceHtml(p, s.size); const n = Store.stock(p, s.size, s.shade); const b = $('button', sticky); b.disabled = n <= 0; b.onclick = () => { const r = Store.add(p, s.size, s.shade, s.qty); if (!r.ok) return UI.toast(r.reason, true); UI.addedFx(b); Drawer.open(); }; } } });
      const rel = $('#related'); if (rel) { const list = Store.catalog.products.filter((x) => x.id !== p.id && (x.category === p.category || x.featured)).slice(0, 4); rel.innerHTML = list.map(card).join(''); bindCards(rel); }
    },
    async wishlist() { await Store.init(); const g = $('#wgrid'); const list = Store.wishlist.map((id) => Store.product(id)).filter(Boolean); g.innerHTML = list.length ? list.map(card).join('') : UI.empty('heart', 'No wishlist products yet.', 'Tap the heart on any product to save it here.', 'Browse the shop', url('/shop/toppik/')); bindCards(g); },
    async cart() { await Store.init(); Pages.cartRefresh = () => { const root = $('#cart'); const lines = Store.cart; if (!lines.length) { root.innerHTML = UI.empty('shopping-cart', 'Your cart is empty.', 'Add a product and it will appear here.', 'Start shopping', url('/shop/toppik/')); return; } const t = Store.totals(null); root.innerHTML = '<div class="cart-layout"><div class="cart-table">' + lines.map(lineHtml).join('') + '</div><aside class="summary-card"><h2>Order summary</h2>' + promoHtml() + '<div class="sum"><div><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' + (t.disc ? '<div class="disc"><span>Discount (' + esc(Store.promo.code) + ')</span><span>-' + money(t.disc) + '</span></div>' : '') + '<div><span>Shipping</span><span class="muted">Calculated at checkout</span></div>' + ((Store.catalog.tax || {}).rate ? '<div><span>' + esc(Store.catalog.tax.label) + '</span><span>' + money(t.tax) + '</span></div>' : '') + '<div class="total"><span>Total</span><span>' + money(t.sub - t.disc) + '</span></div></div><a class="sh-btn sh-btn-primary sh-btn-block" href="' + url('/checkout/') + '">Checkout' + icon('arrow-right', 'sm') + '</a><a class="sh-btn sh-btn-ghost sh-btn-block" href="' + url('/shop/toppik/') + '">Continue shopping</a></aside></div>'; bindLines(root); bindPromo(root); }; Pages.cartRefresh(); },
    async checkout() { await Store.init(); Checkout.start(); },
    async success() { await Store.init(); const id = new URLSearchParams(location.search).get('order'); const o = id && await Store.provider.getOrder(id); const root = $('#success'); if (!o) { root.innerHTML = UI.empty('package', 'Order not found', 'We could not find that order in this browser.', 'Go to the shop', url('/shop/toppik/')); return; } root.innerHTML = '<div class="success-hero"><div class="tick">' + icon('check') + '</div><h1>Thank you for your order.</h1><p class="muted">A confirmation has been prepared for ' + esc(o.contact.email) + '.</p></div><div class="kv" style="margin-top:24px"><div><small>Order number</small><b>' + esc(o.id) + '</b></div><div><small>Order date</small><b>' + fmtDate(o.createdAt) + '</b></div><div><small>Order total</small><b>' + money(o.totals.total) + '</b></div><div><small>Payment</small><b>' + esc(paymentLabel(o)) + '</b></div></div><div class="co-panel" style="margin-top:20px"><div class="review-block"><div class="t">Delivery address</div><p>' + esc(addr(o.address)) + '</p></div><div class="review-block"><div class="t">Delivery method</div><p>' + esc(o.shipping.name) + ', ' + esc(o.shipping.eta) + '</p></div><div class="review-block"><div class="t">Products</div>' + o.lines.map((l) => '<p>' + l.qty + ' × ' + esc(l.name) + (l.size || l.shade ? ' (' + [l.size, l.shade].filter(Boolean).join(', ') + ')' : '') + ' <span class="muted">' + money(l.qty * l.unit) + '</span></p>').join('') + '</div></div><div class="co-actions" style="margin-top:20px"><a class="sh-btn sh-btn-secondary" href="' + url('/account/orders/?id=' + o.id) + '">View order</a><a class="sh-btn sh-btn-primary" href="' + url('/shop/toppik/') + '">Continue shopping</a></div>'; },
    async orders() { await Store.init(); const id = new URLSearchParams(location.search).get('id'); const root = $('#orders'); if (id) { const o = await Store.provider.getOrder(id); if (!o) { root.innerHTML = UI.empty('package', 'Order not found', 'We could not find that order.', 'My orders', url('/account/orders/')); return; } root.innerHTML = '<div class="shop-crumbs"><a href="' + url('/account/orders/') + '">My orders</a>' + icon('chevron-down') + '<span>' + esc(o.id) + '</span></div><div class="shop-head"><div><h1>Order ' + esc(o.id) + '</h1><p class="muted">Placed ' + fmtDate(o.createdAt) + '</p></div><span class="sh-status ' + o.status + '">' + statusLabel(o.status) + '</span></div><div class="kv"><div><small>Payment status</small><b>' + esc(paymentLabel(o)) + '</b></div><div><small>Delivery method</small><b>' + esc(o.shipping.name) + '</b></div><div><small>Total</small><b>' + money(o.totals.total) + '</b></div></div><div class="co-panel" style="margin-top:20px"><div class="review-block"><div class="t">Shipping address</div><p>' + esc(addr(o.address)) + '</p><p class="muted small">' + esc(o.contact.phone) + ' · ' + esc(o.contact.email) + '</p></div><div class="review-block"><div class="t">Items</div>' + o.lines.map((l) => '<div class="co-summary"><div class="line"><img src="' + img(l.image) + '" alt=""><div><b>' + esc(l.name) + '</b><span>' + [l.size, l.shade].filter(Boolean).map(esc).join(' · ') + ' · Qty ' + l.qty + '</span></div><span class="sh-price">' + money(l.qty * l.unit) + '</span></div></div>').join('') + '</div><div class="review-block"><div class="sum"><div><span>Subtotal</span><span>' + money(o.totals.sub) + '</span></div>' + (o.totals.disc ? '<div class="disc"><span>Discount</span><span>-' + money(o.totals.disc) + '</span></div>' : '') + '<div><span>Shipping</span><span>' + money(o.totals.ship) + '</span></div>' + (o.totals.tax ? '<div><span>Tax</span><span>' + money(o.totals.tax) + '</span></div>' : '') + '<div class="total"><span>Total</span><span>' + money(o.totals.total) + '</span></div></div></div></div><div class="co-actions" style="margin-top:20px"><button type="button" class="sh-btn sh-btn-secondary" data-reorder>' + icon('shopping-cart', 'sm') + 'Reorder</button><button type="button" class="sh-btn sh-btn-ghost" onclick="window.print()">' + icon('package', 'sm') + 'Print receipt</button></div>'; $('[data-reorder]', root).addEventListener('click', () => { let added = 0; o.lines.forEach((l) => { const p = Store.product(l.productId); if (p && Store.add(p, l.size, l.shade, l.qty).ok) added++; }); UI.toast(added ? added + ' item(s) added to your cart' : 'These items are currently unavailable', !added); if (added) Drawer.open(); }); return; }
      const list = await Store.provider.listOrders(); root.innerHTML = '<div class="shop-head"><div><h1>My orders</h1><p class="muted">Orders placed from this browser' + (Store.provider.name === 'local' ? ' (preview mode, no account sign in yet)' : '') + '.</p></div></div>' + (list.length ? '<div style="display:grid;gap:12px">' + list.map((o) => '<a class="order-card" href="' + url('/account/orders/?id=' + o.id) + '"><div><b>Order ' + esc(o.id) + '</b><span>' + fmtDate(o.createdAt) + ' · ' + o.lines.reduce((n, l) => n + l.qty, 0) + ' item(s)</span></div><div class="right"><span class="sh-status ' + o.status + '">' + statusLabel(o.status) + '</span><span class="sh-price">' + money(o.totals.total) + '</span></div></a>').join('') + '</div>' : UI.empty('package', 'No orders yet.', 'When you place an order it will be listed here with its status.', 'Start shopping', url('/shop/toppik/'))); }
  };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const addr = (a) => [a.line1, a.line2, a.city, a.state, a.postal, a.country].filter(Boolean).join(', ');
  const statusLabel = (s) => ({ pending: 'Pending', confirmed: 'Confirmed', processing: 'Processing', ready: 'Ready for dispatch', shipped: 'Shipped', outfordelivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' }[s] || s);
  const paymentLabel = (o) => o.paymentStatus === 'pay_on_delivery' ? 'Cash on delivery' : o.paymentStatus === 'paid' ? 'Paid' : o.paymentStatus === 'failed' ? 'Payment failed' : 'Payment pending';

  /* ---------- Checkout ---------- */
  const Checkout = {
    step: 1, data: null,
    start() {
      this.data = ls.get('checkout', { contact: {}, address: { country: 'Oman' }, shipping: 'standard', payment: 'cod', save: true, updates: true });
      if (!Store.cart.length) { $('#checkout').innerHTML = UI.empty('shopping-cart', 'Your cart is empty.', 'Add a product before checking out.', 'Start shopping', url('/shop/toppik/')); return; }
      this.render();
    },
    persist() { ls.set('checkout', this.data); },
    steps() { const names = ['Cart', 'Contact & Address', 'Delivery', 'Payment', 'Review']; return '<div class="co-steps">' + names.map((n, i) => '<div class="st' + (i + 1 === this.step ? ' on' : i + 1 < this.step ? ' done' : '') + '"><i>' + (i + 1 < this.step ? '✓' : i + 1) + '</i>' + n + '</div>').join('') + '</div>'; },
    summary() { const t = Store.totals(this.step >= 3 ? this.data.shipping : null); return '<aside class="summary-card co-summary"><details open><summary>Order summary ' + icon('chevron-down', 'sm') + '</summary><div class="lines">' + Store.cart.map((l) => '<div class="line"><img src="' + img(l.image) + '" alt=""><div><b>' + esc(l.name) + '</b><span>' + [l.size, l.shade].filter(Boolean).map(esc).join(' · ') + ' · Qty ' + l.qty + '</span></div><span class="sh-price">' + money(l.qty * l.unit) + '</span></div>').join('') + '</div>' + promoHtml() + '</details><div class="sum"><div><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' + (t.disc ? '<div class="disc"><span>Discount</span><span>-' + money(t.disc) + '</span></div>' : '') + '<div><span>Shipping</span><span>' + (t.ship == null ? '<span class="muted">Next step</span>' : t.ship === 0 ? 'Free' : money(t.ship)) + '</span></div>' + (t.tax ? '<div><span>' + esc(Store.catalog.tax.label) + '</span><span>' + money(t.tax) + '</span></div>' : '') + '<div class="total"><span>Total</span><span>' + money(t.total) + '</span></div></div></aside>'; },
    refresh() { if ($('#checkout') && Store.cart.length) this.render(); },
    render() {
      const d = this.data; let panel = '';
      if (this.step === 1) panel = '<div class="co-panel"><h2>Shopping cart</h2><div>' + Store.cart.map(lineHtml).join('') + '</div><div class="co-actions"><a class="sh-btn sh-btn-ghost" href="' + url('/shop/toppik/') + '">' + icon('arrow-left', 'sm') + 'Continue shopping</a><button type="button" class="sh-btn sh-btn-primary" data-next>Continue' + icon('arrow-right', 'sm') + '</button></div></div>';
      if (this.step === 2) panel = '<form class="co-panel" data-form novalidate><h2>Contact and shipping address</h2><div class="co-grid">' + field('email', 'Email', 'email', d.contact.email, 'full', 'Enter a valid email address') + field('firstName', 'First name', 'text', d.contact.firstName) + field('lastName', 'Last name', 'text', d.contact.lastName) + field('phone', 'Phone', 'tel', d.contact.phone, 'full', 'Enter a phone number with the country code') + fieldSelect('country', 'Country', d.address.country, ['Oman', 'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait'], 'full') + field('line1', 'Address line 1', 'text', d.address.line1, 'full') + field('line2', 'Address line 2 (optional)', 'text', d.address.line2, 'full', '', false) + field('city', 'City', 'text', d.address.city) + field('state', 'Governorate / region', 'text', d.address.state, '', '', false) + field('postal', 'Postal code', 'text', d.address.postal, '', '', false) + '</div><label class="sh-check"><input type="checkbox" name="save"' + (d.save ? ' checked' : '') + '>Save this address</label><label class="sh-check"><input type="checkbox" name="updates"' + (d.updates ? ' checked' : '') + '>Send me order updates</label><div class="co-actions"><button type="button" class="sh-btn sh-btn-ghost" data-back>' + icon('arrow-left', 'sm') + 'Back</button><button type="submit" class="sh-btn sh-btn-primary">Continue to delivery' + icon('arrow-right', 'sm') + '</button></div></form>';
      if (this.step === 3) panel = '<div class="co-panel"><h2>Delivery method</h2><div class="choice">' + Store.catalog.shipping.map((s) => { const price = Store.shippingFor(s.id); return '<label class="' + (d.shipping === s.id ? 'on' : '') + '"><input type="radio" name="ship" value="' + s.id + '"' + (d.shipping === s.id ? ' checked' : '') + '><div><b>' + esc(s.name) + '</b><span>' + esc(s.eta) + (s.freeAbove ? ' · free over ' + money(s.freeAbove) : '') + '</span></div><span class="p">' + (price === 0 ? 'Free' : money(price)) + '</span></label>'; }).join('') + '</div><div class="co-actions"><button type="button" class="sh-btn sh-btn-ghost" data-back>' + icon('arrow-left', 'sm') + 'Back</button><button type="button" class="sh-btn sh-btn-primary" data-next>Continue to payment' + icon('arrow-right', 'sm') + '</button></div></div>';
      if (this.step === 4) panel = '<div class="co-panel"><h2>Payment</h2><div class="choice">' + Store.catalog.payments.map((p) => '<label class="' + (d.payment === p.id ? 'on' : '') + (p.enabled ? '' : ' off') + '"><input type="radio" name="pay" value="' + p.id + '"' + (d.payment === p.id ? ' checked' : '') + (p.enabled ? '' : ' disabled') + '><div><b>' + esc(p.name) + '</b><span>' + esc(p.enabled ? (p.note || '') : 'Not available yet') + '</span></div>' + icon(p.id === 'cod' ? 'truck' : 'credit-card') + '</label>').join('') + '</div><div class="sh-notice">' + icon('lock', 'sm') + '<span>Your details are only used to process this order.</span></div><div class="co-actions"><button type="button" class="sh-btn sh-btn-ghost" data-back>' + icon('arrow-left', 'sm') + 'Back</button><button type="button" class="sh-btn sh-btn-primary" data-next>Review order' + icon('arrow-right', 'sm') + '</button></div></div>';
      if (this.step === 5) { const t = Store.totals(d.shipping); const ship = Store.catalog.shipping.find((s) => s.id === d.shipping); const pay = Store.catalog.payments.find((p) => p.id === d.payment); panel = '<div class="co-panel"><h2>Review and place order</h2><div class="review-block"><div class="t">Products <a href="#" data-go="1">Edit</a></div>' + Store.cart.map((l) => '<p>' + l.qty + ' × ' + esc(l.name) + (l.size || l.shade ? ' (' + [l.size, l.shade].filter(Boolean).join(', ') + ')' : '') + ' <span class="muted">' + money(l.qty * l.unit) + '</span></p>').join('') + '</div><div class="review-block"><div class="t">Shipping address <a href="#" data-go="2">Edit</a></div><p>' + esc(d.contact.firstName + ' ' + d.contact.lastName) + '<br>' + esc(addr(d.address)) + '<br><span class="muted">' + esc(d.contact.phone) + ' · ' + esc(d.contact.email) + '</span></p></div><div class="review-block"><div class="t">Delivery method <a href="#" data-go="3">Edit</a></div><p>' + esc(ship.name) + ', ' + esc(ship.eta) + '</p></div><div class="review-block"><div class="t">Payment method <a href="#" data-go="4">Edit</a></div><p>' + esc(pay.name) + '</p></div><div class="review-block"><div class="sum"><div><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' + (t.disc ? '<div class="disc"><span>Discount</span><span>-' + money(t.disc) + '</span></div>' : '') + '<div><span>Shipping</span><span>' + (t.ship === 0 ? 'Free' : money(t.ship)) + '</span></div>' + (t.tax ? '<div><span>Tax</span><span>' + money(t.tax) + '</span></div>' : '') + '<div class="total"><span>Grand total</span><span>' + money(t.total) + '</span></div></div></div><div data-err></div><div class="co-actions"><button type="button" class="sh-btn sh-btn-ghost" data-back>' + icon('arrow-left', 'sm') + 'Back</button><button type="button" class="sh-btn sh-btn-primary" data-place>' + icon('lock', 'sm') + 'Place order</button></div></div>'; }
      $('#checkout').innerHTML = this.steps() + '<div class="co-layout"><div>' + panel + '</div>' + this.summary() + '</div>';
      const root = $('#checkout'); bindLines(root); bindPromo(root); UI.bindQty(root);
      $$('[data-back]', root).forEach((b) => b.addEventListener('click', () => { this.step--; this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
      $$('[data-go]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); this.step = +a.dataset.go; this.render(); }));
      $$('[data-next]', root).forEach((b) => b.addEventListener('click', () => { if (!Store.cart.length) return UI.toast('Your cart is empty', true); this.step++; this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
      const form = $('[data-form]', root); if (form) form.addEventListener('submit', (e) => { e.preventDefault(); if (!validate(form)) return; const v = Object.fromEntries(new FormData(form).entries()); d.contact = { email: v.email.trim(), firstName: v.firstName.trim(), lastName: v.lastName.trim(), phone: v.phone.trim() }; d.address = { country: v.country, line1: v.line1.trim(), line2: (v.line2 || '').trim(), city: v.city.trim(), state: (v.state || '').trim(), postal: (v.postal || '').trim() }; d.save = !!v.save; d.updates = !!v.updates; this.persist(); this.step = 3; this.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      $$('input[name=ship]', root).forEach((r) => r.addEventListener('change', () => { d.shipping = r.value; this.persist(); this.render(); }));
      $$('input[name=pay]', root).forEach((r) => r.addEventListener('change', () => { d.payment = r.value; this.persist(); this.render(); }));
      const place = $('[data-place]', root); if (place) place.addEventListener('click', () => this.place(place));
    },
    async place(btn) {
      if (this._placing) return; this._placing = true; btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = 'Placing your order…'; const errBox = $('[data-err]');
      try {
        const d = this.data; const lines = Store.cart.map((l) => Object.assign({}, l));
        const res = await Store.provider.reserveStock(lines);
        if (!res.ok) { errBox.innerHTML = '<div class="sh-notice error">' + icon('info', 'sm') + '<span>' + esc(res.line.name) + ' now has only ' + res.available + ' in stock. Please adjust your cart.</span></div>'; Store.setQty(Store.lineKey(res.line), res.available); return; }
        const pay = await Payments.charge(d.payment, Store.totals(d.shipping).total);
        if (!pay.ok) { errBox.innerHTML = '<div class="sh-notice error">' + icon('info', 'sm') + '<span>' + esc(pay.error) + '</span></div>'; return; }
        const order = await Store.provider.createOrder({ lines, contact: d.contact, address: d.address, shipping: Store.catalog.shipping.find((s) => s.id === d.shipping), payment: { id: d.payment, transactionId: pay.transactionId || null, response: pay.response || null }, promo: Store.promo, totals: Store.totals(d.shipping), currency: CUR });
        Store.clearCart(); ls.set('checkout', Object.assign({}, d, d.save ? {} : { contact: {}, address: { country: 'Oman' } }));
        location.href = url('/order-success/?order=' + order.id);
      } catch (e) { errBox.innerHTML = '<div class="sh-notice error">' + icon('info', 'sm') + '<span>We could not create your order. Nothing was charged. Please try again or contact us on +968 2249 5161.</span></div>'; }
      finally { this._placing = false; btn.disabled = false; btn.innerHTML = old; }
    }
  };
  function field(name, label, type, val, cls, err, req) { req = req !== false; return '<div class="sh-field ' + (cls || '') + '"><label for="f-' + name + '">' + esc(label) + '</label><input id="f-' + name + '" name="' + name + '" type="' + type + '" value="' + esc(val || '') + '"' + (req ? ' required' : '') + ' autocomplete="on"><span class="err">' + esc(err || 'This field is required') + '</span></div>'; }
  function fieldSelect(name, label, val, opts, cls) { return '<div class="sh-field ' + (cls || '') + '"><label for="f-' + name + '">' + esc(label) + '</label><select id="f-' + name + '" name="' + name + '">' + opts.map((o) => '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>'; }
  function validate(form) { let ok = true; $$('input[required]', form).forEach((i) => { const f = i.closest('.sh-field'); let good = i.value.trim().length > 0; if (good && i.type === 'email') good = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.value.trim()); if (good && i.type === 'tel') good = /^\+?[0-9 ]{8,16}$/.test(i.value.trim()); f.classList.toggle('is-invalid', !good); if (!good) ok = false; }); if (!ok) { const first = $('.is-invalid input', form); first && first.focus(); } return ok; }

  /* ---------- Payment adapters (modular; no real credentials in the site) ---------- */
  const Payments = {
    adapters: {
      cod: async () => ({ ok: true, transactionId: null, response: { method: 'cod' } }),
      card: async (amount) => (CFG.paymentAdapters && CFG.paymentAdapters.card) ? CFG.paymentAdapters.card(amount) : ({ ok: false, error: 'Card payment is not enabled yet. Please choose Cash on Delivery.' }),
      applepay: async () => ({ ok: false, error: 'Apple Pay is not enabled yet.' }),
      googlepay: async () => ({ ok: false, error: 'Google Pay is not enabled yet.' })
    },
    async charge(id, amount) { const a = this.adapters[id]; if (!a) return { ok: false, error: 'Unknown payment method.' }; try { return await a(amount); } catch (e) { return { ok: false, error: 'Payment failed. You have not been charged. Please try again.' }; } }
  };

  /* ---------- Origin fill on primary buttons: the fill spreads from where the pointer entered ---------- */
  (function () {
    const cover = (w, h, x, y) => Math.ceil(2 * Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y)));
    const setOrigin = (btn, x, y) => { const r = btn.getBoundingClientRect(); btn.style.setProperty('--ox', x + 'px'); btn.style.setProperty('--oy', y + 'px'); btn.style.setProperty('--od', cover(r.width, r.height, x, y) + 'px'); };
    const fromPointer = (btn, e) => { const r = btn.getBoundingClientRect(); setOrigin(btn, e.clientX - r.left, e.clientY - r.top); };
    const fromCenter = (btn) => { const r = btn.getBoundingClientRect(); setOrigin(btn, r.width / 2, r.height / 2); };
    const target = (e) => e.target.closest && e.target.closest('.sh-btn-primary');
    document.addEventListener('pointerover', (e) => { const b = target(e); if (!b || b.disabled || (e.relatedTarget && b.contains(e.relatedTarget))) return; fromPointer(b, e); b.classList.add('fill'); });
    document.addEventListener('pointerout', (e) => { const b = target(e); if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return; b.classList.remove('fill'); });
    document.addEventListener('pointerdown', (e) => { const b = target(e); if (!b || b.disabled) return; fromPointer(b, e); b.classList.add('fill'); });
    document.addEventListener('focusin', (e) => { const b = target(e); if (!b || b.disabled || !b.matches(':focus-visible')) return; fromCenter(b); b.classList.add('fill'); });
    document.addEventListener('focusout', (e) => { const b = target(e); if (b && !b.matches(':hover')) b.classList.remove('fill'); });
  })();

  /* ---------- Banner slideshow: crossfade every 5 seconds, dots to pick, pauses while hovered ---------- */
  (function () {
    const box = document.querySelector('.shop-slides'); if (!box) return;
    const imgs = Array.from(box.querySelectorAll('img')); const dots = Array.from(box.querySelectorAll('[data-slide]')); let i = 0, timer = 0;
    const show = (n) => { i = (n + imgs.length) % imgs.length; imgs.forEach((im, k) => im.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
    const start = () => { stop(); timer = setInterval(() => show(i + 1), 5000); }; const stop = () => { if (timer) clearInterval(timer); timer = 0; };
    dots.forEach((d) => d.addEventListener('click', () => { show(+d.dataset.slide); start(); }));
    box.addEventListener('mouseenter', stop); box.addEventListener('mouseleave', start);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    start();
  })();

  /* ---------- Boot ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    UI.badge(); window.addEventListener('pageshow', UI.badge); window.addEventListener('storage', (e) => { if (e.key === 'qshop:cart' || e.key === 'qshop:wishlist') { Store.cart = ls.get('cart', []); Store.wishlist = ls.get('wishlist', []); UI.badge(); } });
    const so = $('[data-search-open]'); so && so.addEventListener('click', () => { Store.init().then(() => Search.open()); });
    const co = $('[data-cart-open]'); co && co.addEventListener('click', (e) => { e.preventDefault(); Store.init().then(() => Drawer.open()); });
    const page = document.body.dataset.page;
    if (page && Pages[page]) { try { await Pages[page](); } catch (e) { console.error(e); const main = $('#shop-main') || $('main'); if (main) main.innerHTML = '<div class="wrap shop-page">' + UI.empty('info', 'Something went wrong', 'The shop could not load. Please refresh the page or try again in a moment.', 'Reload', location.href) + '</div>'; } }
    else Store.init().then(UI.badge).catch(() => {});
  });
  window.QabasShop = { Store, UI, Drawer, Search, QuickView, Checkout, Payments };
})();
