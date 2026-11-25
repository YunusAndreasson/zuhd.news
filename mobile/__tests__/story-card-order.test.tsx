// biome-ignore-all lint/correctness/noReactNativeRawText: jsdom doubles use HTML elements.
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { StoryCard } from '../components/map/StoryCard';
import type { GraphCard } from '../lib/cards/types';
import type { StoryRow } from '../lib/map-feed';
import { archiveStory } from '../lib/opening-story';

let mockFontScale = 1;
const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
const rn = jest.requireMock('react-native');
Object.assign(rn, {
  View: passthrough,
  Pressable: passthrough,
  useWindowDimensions: () => ({ fontScale: mockFontScale }),
});
Object.assign(rn.AccessibilityInfo, { sendAccessibilityEvent: jest.fn() });

jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: {}, font: {}, typography: {} }),
}));
jest.mock('../lib/markdown', () => ({
  makeMarkdownStyles: () => ({}),
  renderSentences: (sentences: string[]) =>
    sentences.map((sentence) => <p key={sentence}>{sentence}</p>),
}));
jest.mock('../lib/bookmark-store', () => ({}));
jest.mock('../lib/fresh-store', () => ({ useNewSpent: () => false }));
jest.mock('../lib/read-store', () => ({}));
jest.mock('../lib/open-link', () => ({}));
jest.mock('../components/primitives', () => ({
  Icon: () => null,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
jest.mock('../components/ArchiveGoldChart', () => ({
  ARCHIVE_QUOTE: 'Archive quote',
  ArchiveGoldChart: () => <p>{'Archive chart'}</p>,
}));
jest.mock('../components/OddsLine', () => ({}));
jest.mock('../components/PublisherOffer', () => ({ PublisherOffer: () => <p>{'Alert offer'}</p> }));
jest.mock('../components/StoryChart', () => ({ StoryChart: () => <p>{'Live chart'}</p> }));

const live = { ...archiveStory, slug: 'live-story', sentences: ['Live hook', 'Live body'] };
const chart = { id: 'live', kind: 'reading', title: 'Live chart', reading: '42' } as GraphCard;

function Card({
  open,
  starter = false,
  showChart = true,
}: {
  open: boolean;
  starter?: boolean;
  showChart?: boolean;
}) {
  const article = starter ? archiveStory : live;
  const row: StoryRow = {
    slug: article.slug,
    title: article.title,
    article,
    meta: '',
    mark: null,
    fresh: false,
    mostCovered: false,
    odds: null,
    coords: null,
  };
  return (
    <StoryCard
      row={row}
      starter={starter}
      archiveReady
      odds={null}
      chart={showChart ? chart : null}
      open={open}
      progress={useSharedValue(0)}
      veil={false}
      onOpen={jest.fn()}
      onEntityPress={jest.fn()}
      onOddsPress={jest.fn()}
      onCountryPress={jest.fn()}
    />
  );
}

function follows(before: string, after: string) {
  expect(screen.getByText(before).compareDocumentPosition(screen.getByText(after))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

it('keeps the live chart above the hook at peek and when open', () => {
  mockFontScale = 2;
  const view = render(<Card open={false} />);
  follows('Live chart', 'Live hook');
  view.rerender(<Card open />);
  follows('Live chart', 'Live hook');
  follows('Live hook', 'Alert offer');
  follows('Alert offer', 'Live body');
});

it('keeps the starter hook above its archive chart and large-text offer', () => {
  mockFontScale = 2;
  const view = render(<Card starter open={false} />);
  follows(archiveStory.sentences[0]!, 'Archive chart');
  view.rerender(<Card starter open />);
  follows(archiveStory.sentences[0]!, 'Alert offer');
  follows('Alert offer', 'Archive chart');
});

it('reads the hook before the body without a chart', () => {
  mockFontScale = 1;
  render(<Card open showChart={false} />);
  expect(screen.queryByText('Live chart')).toBeNull();
  follows('Live hook', 'Live body');
});
