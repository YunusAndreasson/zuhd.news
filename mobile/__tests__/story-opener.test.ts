import type { GroupedArticles } from '@shared/types';
import { act, renderHook } from '@testing-library/react';
import { useStoryOpener } from '../hooks/useStoryOpener';
import { fetchJson, HttpError } from '../lib/fetchJson';
import { articleFromStory } from '../lib/story-payload';

jest.mock('../lib/fetchJson', () => ({
  ...jest.requireActual('../lib/fetchJson'),
  fetchJson: jest.fn(),
}));
jest.mock('../lib/bookmark-store', () => ({ getSnapshot: () => [] }));
const fetchStory = jest.mocked(fetchJson);
const grouped = { current: { politics: [], economy: [], science: [], tech: [] } };
const payload = (slug: string) => ({
  slug,
  title: slug,
  category: 'science',
  date: '2026-09-27',
  bodyHtml: '<p>The exact story.</p>',
  location: null,
});
beforeEach(() => jest.clearAllMocks());

it('fetches and opens the notification article absent from the cached feed', async () => {
  fetchStory.mockResolvedValue(payload('notified-story'));
  const open = jest.fn();
  const error = jest.fn();
  const { result } = renderHook(() => useStoryOpener(grouped, open, error));
  await act(() => result.current('notified-story'));
  expect(fetchStory).toHaveBeenCalledWith(
    expect.stringContaining('/api/story/notified-story.json'),
    expect.any(Function),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(open).toHaveBeenCalledWith(
    'notified-story',
    expect.objectContaining({ slug: 'notified-story', sentences: ['The exact story.'] }),
    'science',
  );
  expect(error).not.toHaveBeenCalled();
});

it('does not open a different article returned by the endpoint', async () => {
  fetchStory.mockResolvedValue(payload('wrong-story'));
  const open = jest.fn();
  const error = jest.fn();
  const { result } = renderHook(() => useStoryOpener(grouped, open, error));
  await act(() => result.current('requested-story'));
  expect(open).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('requested-story', false);
});

it('keeps the latest tap when an older request finishes afterwards', async () => {
  let finish!: (value: unknown) => void;
  fetchStory.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fetchStory.mockResolvedValueOnce(payload('second'));
  const open = jest.fn();
  const error = jest.fn();
  const { result } = renderHook(() => useStoryOpener(grouped, open, error));
  const first = result.current('first');
  await act(() => result.current('second'));
  expect(fetchStory.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  await act(async () => {
    finish(payload('first'));
    await first;
  });
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(
    'second',
    expect.objectContaining({ slug: 'second' }),
    'science',
  );
});

it('reports a fetch failure instead of opening an unrelated story', async () => {
  fetchStory.mockRejectedValue(new Error('offline'));
  const open = jest.fn();
  const error = jest.fn();
  const { result } = renderHook(() => useStoryOpener(grouped, open, error));
  await act(() => result.current('requested-story'));
  expect(open).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith('requested-story', false);
});

it('resolves a colliding URL from one authoritative article instead of the first feed row', async () => {
  const slug = 'same-link';
  const known = articleFromStory({ ...payload(slug), location: 'Lagos' });
  if (!known) throw new Error('Invalid fixture');
  const collision: GroupedArticles = {
    politics: [{ ...known.article, lat: 6.52, lng: 3.38 }],
    economy: [],
    science: [{ ...known.article, title: 'From Sapporo', location: 'Sapporo', lat: 43.06 }],
    tech: [],
  };
  const official = {
    ...payload(slug),
    title: 'The Lagos report',
    location: 'Lagos',
    bodyHtml: '<p>Nine executives were wanted in Lagos.</p>',
  };
  fetchStory.mockResolvedValue(official);
  const open = jest.fn();
  const error = jest.fn();
  const { result } = renderHook(() => useStoryOpener({ current: collision }, open, error));
  await act(() => result.current(slug));
  expect(fetchStory).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(
    slug,
    expect.objectContaining({
      slug,
      title: official.title,
      location: official.location,
      lat: null,
      lng: null,
      sentences: ['Nine executives were wanted in Lagos.'],
    }),
    'science',
  );
  expect(error).not.toHaveBeenCalled();
});

// The site writes no file for a story without a place, and none for a slug
// since removed: trying again cannot open either.
it('reports a story the site has no file for as missing', async () => {
  fetchStory.mockRejectedValue(new HttpError(404));
  const open = jest.fn();
  const error = jest.fn();
  const { result } = renderHook(() => useStoryOpener(grouped, open, error));
  await act(() => result.current('placeless-story'));
  expect(open).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith('placeless-story', true);
});
