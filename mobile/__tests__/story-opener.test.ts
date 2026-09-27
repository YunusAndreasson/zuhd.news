import { act, renderHook } from '@testing-library/react';
import { useStoryOpener } from '../hooks/useStoryOpener';
import { fetchJson } from '../lib/fetchJson';

jest.mock('../lib/fetchJson', () => ({ fetchJson: jest.fn() }));
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
});
