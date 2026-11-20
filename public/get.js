// `/get`, the page a link sends a phone through to its store: ads, and the bio links
// on X, Instagram and Facebook. A file rather than an inline script because the site's
// CSP allows none.
//
// Each store takes the campaign its own way. Play reads the UTM tags from its install
// referrer. The App Store reads only `ct`, and only beside the provider token `pt`.
// A visit with no tags goes on untagged, so the stores count it as organic, never as
// an ad. (Until 2026-11 an untagged visit was credited to paid Facebook, for July's
// bridge-versus-direct test, which has ended.)
(() => {
  const PLAY = 'https://play.google.com/store/apps/details?id=news.zuhd.app';
  const IOS = 'https://apps.apple.com/app/id6760964753';
  // App Store Connect's provider token, public in every campaign link (App Analytics,
  // Campaigns, Generate a Campaign Link). One value for every app on the account.
  const APPLE_PROVIDER_TOKEN = '2189605';
  // Apple takes campaign tokens of up to 30 characters.
  const APPLE_CAMPAIGN_LIMIT = 30;
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const SAFE = /^[\w.~-]{1,100}$/;

  // The first value of each tag only: Instagram appends its own tags to a bio link,
  // and nothing else in the query (fbclid and the like) goes to a store.
  const params = new URLSearchParams(location.search);
  const tags = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value && SAFE.test(value)) tags.set(key, value);
  }
  const referrer = tags.toString();
  const playUrl = referrer ? `${PLAY}&referrer=${encodeURIComponent(referrer)}` : PLAY;
  const campaign = tags.get('utm_campaign');
  const iosUrl =
    APPLE_PROVIDER_TOKEN && campaign
      ? `${IOS}?pt=${APPLE_PROVIDER_TOKEN}&ct=${encodeURIComponent(campaign.slice(0, APPLE_CAMPAIGN_LIMIT))}&mt=8`
      : IOS;

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
