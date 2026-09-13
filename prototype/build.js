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
html = html.split('__LOGO_MARK__').join(dataUri('assets/logo-mark.jpg', 'image/jpeg'));
html = html.split('__LOGO_EPPENDORF__').join(dataUri('assets/logo-eppendorf.png', 'image/png'));
for (const f of fs.readdirSync(path.join(root, 'assets/photos'))) {
  const name = f.replace(/\.jpg$/, '');
  html = html.split(`__IMG_${name}__`).join(dataUri('assets/photos/' + f, 'image/jpeg'));
}
html = html.replace('__CONTENT_EN__', JSON.stringify(en)).replace('__CONTENT_AR__', JSON.stringify(ar));
const left = html.match(/__IMG_\w+__/g);
if (left) throw new Error('Unresolved image placeholders: ' + left.join(', '));
fs.writeFileSync(path.join(root, 'prototype/index.html'), html);
console.log('prototype/index.html written,', (html.length / 1024).toFixed(0), 'KB');
