import { redirectSystemPath } from '../app/+native-intent';

const go = (path: string) => redirectSystemPath({ path, initial: true });

describe('redirectSystemPath', () => {
  it("opens a story from the website's two story paths", () => {
    expect(go('zuhd-news://a/2026-09-26-trump-rejects-iran')).toBe(
      '/?story=2026-09-26-trump-rejects-iran',
    );
    expect(go('zuhd-news://s/2026-09-26-trump-rejects-iran/')).toBe(
      '/?story=2026-09-26-trump-rejects-iran',
    );
    expect(go('/a/some-slug?utm_source=x')).toBe('/?story=some-slug');
  });

  it('sends every other path to the map, never to an unmatched route', () => {
    // Any other path rendered Expo Router's development "Unmatched Route"
    // page, `Sitemap` link and all (seen on the emulator, 2026-09-27).
    expect(go('zuhd-news://c/politics')).toBe('/');
    expect(go('zuhd-news://a/')).toBe('/');
    expect(go('zuhd-news://a/../../etc')).toBe('/');
    expect(go('zuhd-news://expo-development-client/?url=http://localhost:8081')).toBe('/');
    expect(go('')).toBe('/');
  });
});
