#!/usr/bin/env node
/* Bundle SKYQ into one self-contained HTML file (inline CSS/JS, data-URI icons + manifest).
   Output: skyq-standalone.html — perfect for previews, file://, and App Store review builds. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const b64 = p => 'data:image/png;base64,' + fs.readFileSync(path.join(root, p)).toString('base64');

let html = read('index.html');

// fonts: inline woff2 as data URIs so the single-file build is truly standalone
const FONTS = [
  'BarlowCondensed-500.woff2', 'BarlowCondensed-600.woff2', 'BarlowCondensed-700.woff2',
  'Barlow-400.woff2', 'Barlow-500.woff2', 'Barlow-600.woff2', 'Barlow-700.woff2',
  'IBMPlexMono-400.woff2', 'IBMPlexMono-500.woff2', 'IBMPlexMono-600.woff2',
];
let css = read('css/styles.css');
for (const f of FONTS) {
  const dataUri = 'data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'assets/fonts', f)).toString('base64');
  css = css.split(`../assets/fonts/${f}`).join(dataUri);
}

// css
html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => '<style>\n' + css + '\n</style>');

// manifest as data URI
const manifest = read('manifest.webmanifest')
  .replace(/\{"src":"assets\/icons\/icon-32\.png"/, '')
  .replace(/,?\s*\{[^{}]*icon-32[^{}]*\}/, '');
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', () =>
  '<link rel="manifest" href="data:application/manifest+json;base64,' + Buffer.from(manifest).toString('base64') + '">');

// icons
html = html.replace(/href="assets\/icons\/icon-32\.png"/g, () => `href="${b64('assets/icons/icon-32.png')}"`);
html = html.replace(/href="assets\/icons\/apple-touch-icon\.png"/g, () => `href="${b64('assets/icons/apple-touch-icon.png')}"`);
html = html.replace(/content="assets\/icons\/og-cover\.png"/g, () => `content="${b64('assets/icons/og-cover.png')}"`);
html = html.replace(/src="assets\/icons\/icon-192\.png"/g, () => `src="${b64('assets/icons/icon-192.png')}"`);

// scripts
for (const f of ['data.js', 'countries.js', 'engine.js', 'ads.js', 'bureau.js', 'routemap.js', 'app.js']) {
  html = html.replace(`<script src="js/${f}"></script>`, () => '<script>\n' + read('js/' + f) + '\n</script>');
}

// world map data: inline as a global so bureau.js needs no fetch
const worldMap = fs.readFileSync(path.join(root, 'assets/world-map.json'), 'utf8');
html = html.replace('<div id="bureauMapMount"></div>', () => `<div id="bureauMapMount"></div><script>window.WORLD_MAP_JSON = ${worldMap};</script>`);

// disable SW registration inside the single-file bundle (no sw.js next to it in file:// contexts)
html = html.replace("navigator.serviceWorker.register('sw.js')", 'false && navigator.serviceWorker.register("sw.js")');

fs.writeFileSync(path.join(root, 'skyq-standalone.html'), html);
console.log('built skyq-standalone.html (' + Math.round(html.length / 1024) + ' KB)');
