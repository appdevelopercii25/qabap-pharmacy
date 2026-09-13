// Builds prototype/index.html from the template, the two content files and the logo.
// Usage: node prototype/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const en = JSON.parse(read('content/site-content.en.json'));
const ar = JSON.parse(read('content/site-content.ar.json'));
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/logo-alqabas.png')).toString('base64');
let html = read('prototype/index.template.html');
html = html.split('__LOGO__').join(logo)
  .replace('__CONTENT_EN__', JSON.stringify(en))
  .replace('__CONTENT_AR__', JSON.stringify(ar));
fs.writeFileSync(path.join(root, 'prototype/index.html'), html);
console.log('prototype/index.html written,', (html.length / 1024).toFixed(0), 'KB');
