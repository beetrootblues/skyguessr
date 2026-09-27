/* SKYQ monetization layer.
   - Web: Google AdSense (banner + square slots below the board)
   - iOS/Android (Capacitor): AdMob banners + rewarded hints via admob-plus plugin
   - IAP: "Remove Ads" non-consumable + shop of hint packs
   Configure your IDs in one place: AD_CONFIG below. */
'use strict';

const AD_CONFIG = {
  adsense: {
    client: 'ca-pub-XXXXXXXXXXXXXXXX',      // ← your AdSense publisher ID
    bannerSlot: '0000000000',               // ← display slot id
    squareSlot: '0000000000',               // ← in-article/rectangle slot id
  },
  admob: {
    // ⚠️ Google's public TEST ids — launch-safe, serve test ads only. REPLACE all six with
    // your production ids before release (App Store review + policy require it). APPSTORE.md §6.
    iosApp: 'ca-app-pub-3940256099942544~1458002511',
    iosBanner: 'ca-app-pub-3940256099942544/2934735716',
    iosRewarded: 'ca-app-pub-3940256099942544/4411468910',
    androidApp: 'ca-app-pub-3940256099942544~3347511713',
    androidBanner: 'ca-app-pub-3940256099942544/6300978111',
    androidRewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  iap: {
    removeAds: 'com.skyq.removeads',
    hints5: 'com.skyq.hints5',
    hints20: 'com.skyq.hints20',
    hints60: 'com.skyq.hints60',
  },
};

const Monetization = (() => {
  const isNative = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  let removeAds = false;
  let hintBank = 0;
  let admobSdkReady = false;

  function load() {
    try {
      removeAds = localStorage.getItem('skyq.removeads') === '1';
      hintBank = parseInt(localStorage.getItem('skyq.hintbank') || '0', 10) || 0;
    } catch (e) { /* private mode */ }
  }
  function save() {
    try {
      localStorage.setItem('skyq.removeads', removeAds ? '1' : '0');
      localStorage.setItem('skyq.hintbank', String(hintBank));
    } catch (e) { /* ignore */ }
  }

  /* ---------- web AdSense ---------- */
  function initWebAds() {
    if (removeAds || isNative) return;
    if (!document.querySelector('script[data-adsense]')) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + AD_CONFIG.adsense.client;
      s.setAttribute('data-adsense', '1');
      s.crossOrigin = 'anonymous';
      document.head.appendChild(s);
    }
    document.querySelectorAll('[data-ad]').forEach(el => fillAdSlot(el));
  }
  function fillAdSlot(el) {
    if (removeAds || el.dataset.filled) return;
    el.dataset.filled = '1';
    el.innerHTML = '';
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.style.width = '100%';
    ins.style.minHeight = el.dataset.ad === 'square' ? '250px' : '60px';
    ins.setAttribute('data-ad-client', AD_CONFIG.adsense.client);
    ins.setAttribute('data-ad-slot', el.dataset.ad === 'square' ? AD_CONFIG.adsense.squareSlot : AD_CONFIG.adsense.bannerSlot);
    ins.setAttribute('data-ad-format', el.dataset.ad === 'square' ? 'rectangle' : 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    el.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
    catch (e) { /* script blocked or ids not configured yet */ }
  }

  /* ---------- native AdMob ---------- */
  const ADMOB_ID_RE = /^ca-app-pub-\d{16}~\d{10}$/;
  function admobConfigured() {
    const id = AD_CONFIG.admob.iosApp;
    return typeof id === 'string' && ADMOB_ID_RE.test(id);
  }

  async function initNativeAds() {
    if (!isNative) return;
    if (!admobConfigured()) {
      // placeholder GADApplicationIdentifier ⇒ the AdMob SDK aborts the process at init.
      // Fail soft instead: game stays fully playable, hint videos report unavailable.
      console.warn('[monetization] AdMob app id not configured — ads disabled');
      return;
    }
    try {
      const { AdMob } = window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins : {};
      if (!AdMob) return;
      const cfg = { ios: { appId: AD_CONFIG.admob.iosApp }, android: { appId: AD_CONFIG.admob.androidApp } };
      await AdMob.initialize(cfg);
      admobSdkReady = true;
      if (!removeAds) mountNativeBanner();
    } catch (e) { /* admob plugin missing in dev */ }
  }
  async function mountNativeBanner() {
    try {
      const AdMob = window.Capacitor.Plugins.AdMob;
      await AdMob.showBanner({
        adId: window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios' ? AD_CONFIG.admob.iosBanner : AD_CONFIG.admob.androidBanner,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
      });
    } catch (e) { /* ignore */ }
  }  /* ---------- rewarded hints ---------- */
  async function earnHintByAd() {
    // native: only grant a hint after a real rewarded-video completion.
    // App-Review rule: the reward must never be granted without the ad actually playing.
    if (isNative) {
      if (!admobSdkReady) return { ok: false, error: 'ads-not-ready' };
      try {
        const AdMob = window.Capacitor.Plugins.AdMob;
        const opts = {
          adId: window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios' ? AD_CONFIG.admob.iosRewarded : AD_CONFIG.admob.androidRewarded,
        };
        await AdMob.prepareRewardVideoAd(opts);
        const reward = await AdMob.showRewardVideoAd();
        if (reward && reward.type) { addHints(1); return { ok: true, source: 'admob' }; }
        return { ok: false, error: 'closed' };
      } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    }
    // Web: no rewarded fill before consent — use simulated flow when unconfigured
    return new Promise(resolve => {
      if (!window.SKYQ_REWARDED_DEMO) { addHints(1); return resolve({ ok: true, source: 'web-demo' }); }
      window.SKYQ_REWARDED_DEMO(resolve);
    });
  }

  /* ---------- IAP stubs (wire to RevenueCat/Capacitor store plugin) ---------- */
  async function purchase(product) {
    // TODO: integrate @capacitor-community/revenuecat or cordova-plugin-purchase
    if (product === AD_CONFIG.iap.removeAds) { removeAds = true; save(); unmountWebAds(); return { ok: true }; }
    return { ok: false, error: 'Store not configured yet' };
  }
  function unmountWebAds() {
    document.querySelectorAll('[data-ad]').forEach(el => { el.style.display = 'none'; el.innerHTML = ''; });
  }
  function addHints(n) { hintBank += n; save(); }
  function spendHint() {
    if (hintBank <= 0) return false;
    hintBank--; save();
    return true;
  }
  function hintCount() { return hintBank; }
  function adsRemoved() { return removeAds; }

  load();
  return { initWebAds, initNativeAds, earnHintByAd, purchase, addHints, spendHint, hintCount, adsRemoved, isNative };
})();

if (typeof window !== 'undefined') window.Monetization = Monetization;
if (typeof module !== 'undefined' && module.exports) module.exports = Monetization;
