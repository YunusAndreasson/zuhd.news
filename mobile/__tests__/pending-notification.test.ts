import { clear, get, set } from '../lib/pending-notification';

describe('pending-notification', () => {
  afterEach(() => clear());

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
});
