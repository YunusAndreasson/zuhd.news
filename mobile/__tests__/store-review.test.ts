let mockKv: Map<string, string>;
let mockSecure: Map<string, string>;
const mockHasAction = jest.fn();
const mockRequestReview = jest.fn();

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockKv.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockKv.set(key, value);
    }),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure.get(key) ?? null),
}));

jest.mock('expo-store-review', () => ({
  hasAction: mockHasAction,
  requestReview: mockRequestReview,
}));

type ReviewModule = typeof import('../lib/store-review');

function loadReview(): ReviewModule {
  let review: ReviewModule | undefined;
  jest.isolateModules(() => {
    review = require('../lib/store-review');
  });
  if (!review) throw new Error('review module failed to load');
  return review;
}

beforeEach(() => {
  mockKv = new Map();
  mockSecure = new Map();
  mockHasAction.mockReset().mockResolvedValue(true);
  mockRequestReview.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
});

afterEach(() => jest.restoreAllMocks());

describe('store-review persistence and gating', () => {
  it('prompts at the threshold and atomically resets the persisted count', async () => {
    mockKv.set('zuhd_review_count', '19');
    await loadReview().maybeRequestReview();

    expect(mockRequestReview).toHaveBeenCalledTimes(1);
    expect(mockKv.get('zuhd_review_count')).toBe('0');
    expect(mockKv.get('zuhd_review_prompted')).toBe('2000000000000');
  });

  it('migrates a missing legacy cooldown independently of an existing SQLite count', async () => {
    mockKv.set('zuhd_review_count', '19');
    mockSecure.set('zuhd_review_prompted', String(Date.now() - 1_000));
    await loadReview().maybeRequestReview();

    expect(mockKv.get('zuhd_review_prompted')).toBe(String(Date.now() - 1_000));
    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(mockKv.get('zuhd_review_count')).toBe('20');
  });

  it('does not claim a prompt occurred when the platform has no review action', async () => {
    mockKv.set('zuhd_review_count', '19');
    mockHasAction.mockResolvedValue(false);
    await loadReview().maybeRequestReview();

    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(mockKv.has('zuhd_review_prompted')).toBe(false);
    expect(mockKv.get('zuhd_review_count')).toBe('20');
  });
});
