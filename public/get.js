// `/get`, the page an advertisement lands on. A file rather than an inline
// script because the site's CSP allows none.
//
// Paid-only (noindex): a link that carried no params is still attributed to paid,
// so Play's Install Referrer can read it (control arm of the bridge-vs-direct
// destination test).
(() => {
  const PLAY = 'https://play.google.com/store/apps/details?id=news.zuhd.app';
  const IOS = 'https://apps.apple.com/app/id6760964753';
  const qs = location.search.replace(/^\?/, '') || 'utm_source=facebook&utm_medium=paid&utm_content=bridge';
  const playUrl = `${PLAY}&referrer=${encodeURIComponent(qs)}`;
  const iosUrl = `${IOS}?${qs}`;

  // Loaded from <head> and not deferred, so a phone goes to its store before the
  // body paints. Desktop and unknown clients fall through to both buttons.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document); // iPadOS desktop-mode
  if (/Android/i.test(ua)) location.replace(playUrl);
  else if (isIOS) location.replace(iosUrl);

  // A manual click-through is attributed store-side too.
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('play').href = playUrl;
    document.getElementById('ios').href = iosUrl;
  });
})();
