const mockDisk = new Map<string, string>();
const mockTrack = jest.fn();
jest.mock('expo-sqlite/kv-store', () => ({
  getItemSync: (key: string) => mockDisk.get(key) ?? null,
  setItemSync: (key: string, value: string) => mockDisk.set(key, value),
}));
jest.mock('../lib/analytics', () => ({
  analytics: { track: (...args: unknown[]) => mockTrack(...args) },
}));
const load = () =>
  jest.requireActual<typeof import('../lib/publisher-session')>('../lib/publisher-session');
beforeEach(() => {
  jest.resetModules();
  mockDisk.clear();
  mockTrack.mockClear();
});

it('keeps short interruptions inside session one and excludes a late acceptance after process death', () => {
  const start = Date.now();
  const s = load();
  s.checkpoint(true, true, start);
  s.checkpoint(false, false, start + 1);
  s.checkpoint(true, false, start + 2000);
  s.checkpoint(false, false, start + 3000);
  jest.resetModules();
  const restored = load();
  restored.observePublisher(
    {
      consent: true,
      registration: 'accepted',
      briefing: true,
      breaking: true,
      effective: true,
      observed_at: start + 400000,
    },
    'refresh',
  );
  restored.checkpoint(true, false, start + 400000);
  restored.checkpoint(true, false, start + 500000);
  const closed = mockTrack.mock.calls.filter(([event]) => event === 'First Session Closed');
  expect(closed).toHaveLength(1);
  expect(closed[0]?.[1]).toMatchObject({ effective: false, closed_at: start + 303000 });
});
it('does not open a first session for an upgrade or a background launch', () => {
  const s = load();
  s.checkpoint(false, true);
  s.checkpoint(true, false);
  s.checkpoint(false);
  expect(mockTrack).not.toHaveBeenCalled();
});

it('erases a genuine first session before a new identity can checkpoint it, including after restart', () => {
  const start = Date.now();
  const session = load();
  session.checkpoint(true, true, start);
  session.erasePublisherSession();
  mockTrack.mockClear();
  session.checkpoint(false, false, start + 1);
  session.checkpoint(true, true, start + 400000);
  jest.resetModules();
  load().checkpoint(true, true, start + 500000);
  expect(mockTrack).not.toHaveBeenCalled();
  expect([...mockDisk.values()].join('')).not.toContain('lastActive');
});
