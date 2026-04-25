import {
  clear,
  clearBriefing,
  get,
  getBriefing,
  set,
  setBriefing,
} from '../lib/pending-notification';

describe('pending-notification', () => {
  afterEach(() => {
    clear();
    clearBriefing();
  });

  it('defaults to null', () => {
    expect(get()).toBeNull();
  });

  it('stores and retrieves a slug', () => {
    set('some-article-slug');
    expect(get()).toBe('some-article-slug');
  });

  it('clear resets to null', () => {
    set('slug');
    clear();
    expect(get()).toBeNull();
  });

  it('overwrites previous slug', () => {
    set('first');
    set('second');
    expect(get()).toBe('second');
  });

  it('briefing intent defaults to false', () => {
    expect(getBriefing()).toBe(false);
  });

  it('briefing intent set/clear toggles', () => {
    setBriefing();
    expect(getBriefing()).toBe(true);
    clearBriefing();
    expect(getBriefing()).toBe(false);
  });

  it('briefing and slug intents are independent', () => {
    set('slug');
    setBriefing();
    expect(get()).toBe('slug');
    expect(getBriefing()).toBe(true);
    clear();
    expect(get()).toBeNull();
    expect(getBriefing()).toBe(true);
  });
});
