import { storyArrivals } from '../lib/story-arrivals';

const empty = () => ({ known: new Set<string>(), pending: new Set<string>() });

it('never calls skipped unread stories arrivals', () => {
  let state = storyArrivals(empty(), ['a', 'b', 'c'], 0);
  for (const index of [1, 2, 0, 2, 1]) {
    state = storyArrivals(state, ['a', 'b', 'c'], index);
    expect([...state.pending]).toEqual([]);
  }
});

it('notices stories inserted ahead of an older article and acknowledges the batch on reaching it', () => {
  let state = storyArrivals(empty(), ['a', 'b'], 1);
  state = storyArrivals(state, ['new-1', 'new-2', 'a', 'b'], 3);
  expect([...state.pending]).toEqual(['new-1', 'new-2']);
  state = storyArrivals(state, ['new-1', 'new-2', 'a', 'b'], 1);
  expect([...state.pending]).toEqual([]);
  state = storyArrivals(state, ['new-1', 'new-2', 'a', 'b'], 3);
  expect([...state.pending]).toEqual([]);
});

it('does not announce the initial feed, a new front already shown, or older backfill', () => {
  expect(storyArrivals(empty(), ['a', 'b'], 1).pending.size).toBe(0);
  const state = storyArrivals(empty(), ['a', 'b'], 1);
  expect(storyArrivals(state, ['new', 'a', 'b'], 0).pending.size).toBe(0);
  expect(storyArrivals(state, ['a', 'b', 'older'], 1).pending.size).toBe(0);
});

it('does not relight removed and reintroduced stories, and drops expired notices', () => {
  let state = storyArrivals(empty(), ['a', 'b'], 1);
  state = storyArrivals(state, ['b'], 0);
  state = storyArrivals(state, ['a', 'b'], 1);
  expect(state.pending.size).toBe(0);
  state = storyArrivals(state, ['new', 'a', 'b'], 2);
  state = storyArrivals(state, ['a', 'b'], 1);
  expect(state.pending.size).toBe(0);
});
