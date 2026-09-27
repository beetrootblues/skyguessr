#!/usr/bin/env node
/* Build the Capacitor web dir (www/) from the site sources. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const www = path.join(root, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

const copy = (src, dest) => {
  const to = path.join(www, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, src), to);
};
const copyDir = (src, dest) => {
  for (const entry of fs.readdirSync(path.join(root, src), { withFileTypes: true })) {
    if (entry.isDirectory()) copyDir(path.join(src, entry.name), path.join(dest, entry.name));
    else copy(path.join(src, entry.name), path.join(dest, entry.name));
  }
};

copy('index.html', 'index.html');
copy('manifest.webmanifest', 'manifest.webmanifest');
copy('sw.js', 'sw.js');
copyDir('css', 'css');
copyDir('js', 'js');
copyDir('assets', 'assets');

// cache-bust the service worker for each build
const swPath = path.join(www, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace("const CACHE = 'skyq-v1';", `const CACHE = 'skyq-v${Date.now()}';`));

// ---- iOS native overrides (the native bundle must never behave like the web) ----
// 1) rewarded hints: no free grants without a real ad — the web demo path is a no-op here
let ads = fs.readFileSync(path.join(www, 'js/ads.js'), 'utf8');
const demoGrant = "      if (!window.SKYQ_REWARDED_DEMO) { addHints(1); return resolve({ ok: true, source: 'web-demo' }); }";
const nativeGuard = "      // iOS override: rewards come only from a real AdMob video (no web-demo free grant)\n      return resolve({ ok: false, error: 'ads-unavailable' });";
if (!ads.includes(demoGrant)) { console.error('FATAL: web-demo grant marker not found in ads.js — update build-www.js'); process.exit(1); }
ads = ads.replace(demoGrant, nativeGuard);
fs.writeFileSync(path.join(www, 'js/ads.js'), ads);

// 2) native ads render outside the webview (AdMob banner) — hide unused web slots
let css = fs.readFileSync(path.join(www, 'css/styles.css'), 'utf8');
css += '\n/* iOS native bundle: AdMob banner is rendered by the SDK outside this webview */\n[data-ad] { display: none !important; }\n';
fs.writeFileSync(path.join(www, 'css/styles.css'), css);

console.log('www built:', fs.readdirSync(www).join(', '));
