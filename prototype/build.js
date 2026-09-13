// Builds prototype/index.html from the template, the two content files, the logo and the photos.
// Usage: node prototype/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dataUri = (p, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(root, p)).toString('base64');
const en = JSON.parse(read('content/site-content.en.json'));
const ar = JSON.parse(read('content/site-content.ar.json'));
let html = read('prototype/index.template.html');
html = html.split('__LOGO__').join(dataUri('assets/logo-alqabas.png', 'image/png'));
html = html.split('__LOGO_WHITE__').join(dataUri('assets/logo-alqabas-white.png', 'image/png'));
html = html.split('__LOGO_MARK__').join(dataUri('assets/logo-mark.jpg', 'image/jpeg'));
html = html.split('__LOGO_EPPENDORF__').join(dataUri('assets/logo-eppendorf.png', 'image/png'));
for (const f of fs.readdirSync(path.join(root, 'assets/photos'))) {
  const name = f.replace(/\.jpg$/, '');
  html = html.split(`__IMG_${name}__`).join(dataUri('assets/photos/' + f, 'image/jpeg'));
}
html = html.replace('__CONTENT_EN__', JSON.stringify(en)).replace('__CONTENT_AR__', JSON.stringify(ar));
const left = html.match(/__IMG_\w+__/g);
if (left) throw new Error('Unresolved image placeholders: ' + left.join(', '));
// Pre-render the English lists by running the page script against a tiny DOM stand-in
const vm = require('vm');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const sink = {};
const fakeEl = (sel) => ({ set innerHTML(v) { sink[sel] = v; }, get innerHTML() { return sink[sel] || ''; }, addEventListener() {}, setAttribute() {}, classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } }, querySelector() { return fakeEl(sel); }, querySelectorAll() { return []; }, dataset: {}, hidden: false, closest() { return fakeEl(sel); } });
const sandbox = { document: { querySelector: fakeEl, querySelectorAll: () => [], getElementById: () => null, documentElement: {}, title: '' }, window: {}, matchMedia: () => ({ matches: true }), localStorage: { getItem() { return null; }, setItem() {} }, location: { search: '' }, URLSearchParams: class { get() { return null; } }, performance: { now: () => 0 }, requestAnimationFrame() {}, console };
vm.runInNewContext(script, sandbox);
for (const [sel, inner] of Object.entries(sink)) {
  const marker = 'id="' + sel.replace('#', '') + '"';
  const at = html.indexOf(marker);
  if (at < 0) { console.warn('no container for', sel); continue; }
  const gt = html.indexOf('>', at);
  if (html.slice(gt + 1, gt + 3) !== '</') { console.warn('container not empty for', sel); continue; }
  html = html.slice(0, gt + 1) + inner + html.slice(gt + 1);
}
fs.writeFileSync(path.join(root, 'prototype/index.html'), html);
console.log('prototype/index.html written,', (html.length / 1024).toFixed(0), 'KB');
