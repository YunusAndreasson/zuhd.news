import type { CountryData } from '@shared/countries/country-data';
import type { ArticleBlock } from '@shared/types';
import type { LinkOpener, MarkdownStyles } from '../../lib/markdown';
import { ActorsBlock } from './ActorsBlock';
import { CompareBlock } from './CompareBlock';
import { LocationsBlock } from './LocationsBlock';
import { ProseBlock } from './ProseBlock';
import { QuizBlock } from './QuizBlock';
import { QuoteBlock } from './QuoteBlock';
import { RankBlock } from './RankBlock';
import { SankeyBlock } from './SankeyBlock';
import type { BlockVariant } from './shared';
import { TimelineBlock } from './TimelineBlock';
import { TreemapBlock } from './TreemapBlock';
import { TrendBlock } from './TrendBlock';

// Re-export so existing `components/blocks` consumers still get BlockVariant
// and blockContainerStyle from the barrel. The source of truth lives in
// ./shared to avoid the require cycle with individual block files.
export type { BlockVariant } from './shared';
export { blockContainerStyle } from './shared';

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
          <ProseBlock
            key={key}
            text={block.text}
            mdStyles={opts.mdStyles}
            fontSize={opts.fontSize}
            dateline={isFirst ? opts.dateline : null}
            locationPrefix={isFirst ? opts.locationPrefix : null}
            openLink={opts.openLink}
            sourceLabel={sourceLabel}
          />
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
            series={block.series}
            label={block.label}
            unit={block.unit}
            periods={block.periods}
            highlight={block.highlight}
            annotations={block.annotations}
            scale={block.scale}
            band={block.band}
            variant={variant}
            sourceLabel={sourceLabel}
            onPress={block.link ? () => opts.openLink(block.link as string) : undefined}
          />
        );
      case 'locations':
        return (
          <LocationsBlock
            key={key}
            codes={block.codes}
            label={block.label}
            caption={block.caption}
            markers={block.markers}
            values={block.values}
            valueLabel={block.valueLabel}
            variant={variant}
            sourceLabel={sourceLabel}
            onCountryPress={opts.onCountryPress}
          />
        );
      case 'timeline':
        return (
          <TimelineBlock
            key={key}
            events={block.events}
            spans={block.spans}
            label={block.label}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      case 'rank':
        return (
          <RankBlock
            key={key}
            metric={block.metric}
            unit={block.unit}
            subjectCc={block.subjectCc}
            subjectLabel={block.subjectLabel}
            peers={block.peers}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      case 'sankey':
        return (
          <SankeyBlock
            key={key}
            nodes={block.nodes}
            links={block.links}
            label={block.label}
            variant={variant}
            sourceLabel={sourceLabel}
          />
        );
      case 'treemap':
        return (
          <TreemapBlock
            key={key}
            items={block.items}
            label={block.label}
            variant={variant}
            sourceLabel={sourceLabel}
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
