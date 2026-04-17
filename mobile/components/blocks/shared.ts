import { StyleSheet } from 'react-native';
import { SPACING } from '../../constants/theme';

/** Where a block is being rendered. `article` variant is the full-bleed
 *  article-page look; `context` is the embedded-in-timeline look (smaller
 *  visual weight, no self-animation). Lives here — not in index.tsx — so
 *  individual block components can import without creating a require cycle
 *  with the barrel that also imports them. */
export type BlockVariant = 'article' | 'context';

/** Shared outer-container spacing for every non-prose block. Keeps margin
 *  rhythm consistent between ActorsBlock, CompareBlock, LocationsBlock,
 *  QuoteBlock and TrendBlock without per-component style duplication. */
export const blockContainerStyle = StyleSheet.create({
  article: { marginBottom: SPACING.md },
  context: { marginVertical: SPACING.sm },
});
