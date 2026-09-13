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
// Complete document for hosting (site root): head parts go into <head>, the rest into <body>
const cut = html.indexOf('<header');
const headPart = html.slice(0, cut), bodyPart = html.slice(cut);
const full = [
  '<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="description" content="' + en.meta.metaDescription.replace(/"/g, '&quot;') + '">',
  headPart, '<style>body{margin:0}</style>', '</head>', '<body>', bodyPart, '</body>', '</html>', ''
].join(String.fromCharCode(10));
fs.writeFileSync(path.join(root, 'index.html'), full);
console.log('index.html (site root) written');
console.log('prototype/index.html written,', (html.length / 1024).toFixed(0), 'KB');
