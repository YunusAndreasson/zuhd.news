import { Fragment } from 'react';
import { StyleSheet } from 'react-native';
import type { CountryData } from '../../constants/country-data';
import { SPACING } from '../../constants/theme';
import type { LinkOpener, MarkdownStyles } from '../../lib/markdown';
import type { ArticleBlock } from '../../types';
import { ActorsBlock } from './ActorsBlock';
import { CompareBlock } from './CompareBlock';
import { LocationsBlock } from './LocationsBlock';
import { ProseBlock } from './ProseBlock';
import { QuizBlock } from './QuizBlock';
import { QuoteBlock } from './QuoteBlock';
import { TrendBlock } from './TrendBlock';

export type BlockVariant = 'article' | 'context';

/** Shared outer-container spacing for every non-prose block. Keeps margin
 *  rhythm consistent between ActorsBlock, CompareBlock, LocationsBlock,
 *  QuoteBlock and TrendBlock without per-component style duplication. */
export const blockContainerStyle = StyleSheet.create({
  article: { marginBottom: SPACING.md },
  context: { marginVertical: SPACING.sm },
});

interface RenderBlocksOptions {
  mdStyles: MarkdownStyles;
  fontSize?: number;
  locationPrefix?: string | null;
  dateline?: string | null;
  openLink: LinkOpener;
  /** `article`: full-bleed rendering inside an article page (default).
   *  `context`: embedded inside a timeline entry — smaller visual weight and
   *  no wrapper animation (parent entry already fades in). */
  variant?: BlockVariant;
  /** Brief-level citation strings. Blocks with a `source` index render the
   *  corresponding entry as a small caption beneath. */
  sources?: string[];
  /** Tap on a country chip inside a LocationsBlock opens the shared
   *  CountrySheet. Parent wires this to whatever sheet ref it owns. */
  onCountryPress?: (payload: { countryName: string; data: CountryData | null }) => void;
}

function resolveSource(idx: number | undefined, sources: string[] | undefined): string | undefined {
  if (idx == null || !sources) return undefined;
  return sources[idx];
}

/** Render each block in sequence. Individual blocks own their mount animation
 *  (trend path-draw, compare row stagger, locations pulse) — this function
 *  intentionally does NOT wrap them in a parent FadeInDown, which would stack
 *  on top of sheet-entry animations and cause visible judder. */
export function renderBlocks(blocks: ArticleBlock[], opts: RenderBlocksOptions): React.ReactNode[] {
  const variant = opts.variant ?? 'article';
  let proseSeen = 0;
  return blocks.map((block, i) => {
    const key = `${block.type}-${i}`;
    const sourceLabel = resolveSource(block.source, opts.sources);
    switch (block.type) {
      case 'prose': {
        const isFirst = proseSeen === 0;
        proseSeen += 1;
        return (
          <Fragment key={key}>
            <ProseBlock
              text={block.text}
              mdStyles={opts.mdStyles}
              fontSize={opts.fontSize}
              dateline={isFirst ? opts.dateline : null}
              locationPrefix={isFirst ? opts.locationPrefix : null}
              openLink={opts.openLink}
              sourceLabel={sourceLabel}
            />
          </Fragment>
        );
      }
      case 'compare':
        return (
          <CompareBlock
            key={key}
            rows={block.rows}
            label={block.label}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      case 'trend':
        return (
          <TrendBlock
            key={key}
            values={block.values}
            label={block.label}
            unit={block.unit}
            periods={block.periods}
            highlight={block.highlight}
            annotations={block.annotations}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      case 'locations':
        return (
          <LocationsBlock
            key={key}
            codes={block.codes}
            label={block.label}
            caption={block.caption}
            variant={variant}
            sourceLabel={sourceLabel}
            onCountryPress={opts.onCountryPress}
          />
        );
      case 'quote':
        return (
          <QuoteBlock
            key={key}
            text={block.text}
            speaker={block.speaker}
            year={block.year}
            variant={variant}
          />
        );
      case 'actors':
        return (
          <ActorsBlock
            key={key}
            people={block.people}
            label={block.label}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      case 'quiz':
        return (
          <QuizBlock
            key={key}
            question={block.question}
            options={block.options}
            correct={block.correct}
            explanation={block.explanation}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      default:
        return null;
    }
  });
}
