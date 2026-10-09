import { CHOKEPOINT_DISRUPTED } from '@shared/chokepoint-thresholds';
import { Canvas, Circle } from '@shopify/react-native-skia';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ColorPalette } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ListRow, ROW_LEADING } from './ListRow';
import { type Mark, MarkGlyph } from './MarkGlyph';
import { SectionLabel } from './MenuRow';
import { Text } from './primitives';

/**
 * What each mark on the globe means.
 *
 * The globe had no key. The web map has one beside its filter chips; on the
 * phone the only way to learn a mark was to tap it and read the sheet it
 * opened, which works for a reader who already believes the dots are
 * addressable and for nobody else. It is also the accessible path the globe's
 * gesture layer cannot be: every mark is described here in words.
 *
 * **Drawn from the globe's own vocabulary.** The glyph paths are the ones
 * `MiniGlobe` stamps (`disaster-glyphs.ts`, `overlay-glyphs.ts`) and the
 * colours are its `mark*` tokens, so the key cannot show a shape or a hue the
 * globe does not. Sizes are the globe's; nothing here is a picture of a mark.
 * The strait threshold is printed from the constant the globe tests against.
 */

const BOX = ROW_LEADING;
const C = BOX / 2;

/** A mark the globe stamps from a glyph (`MarkGlyph`), or one it draws as
 *  circles, which only the key draws again. */
type KeyEntry = { label: string; meaning: string } & (
  | { mark: Mark }
  | { draw: (colors: ColorPalette) => ReactNode }
);

const STORIES: readonly KeyEntry[] = [
  {
    label: 'coverage',
    meaning:
      'A glow where reporting is concentrated. Tap it to find the newest story there you have not found, or reopen the newest. Older coverage opens the country when no current story matches.',
    draw: (colors) => (
      <>
        <Circle cx={C} cy={C} r={11} color={colors.textEmphasis} opacity={0.08} />
        <Circle cx={C} cy={C} r={7} color={colors.textEmphasis} opacity={0.16} />
      </>
    ),
  },
  {
    label: 'story',
    meaning:
      'A place in the news, in its category’s colour: politics, economy, science, tech. Larger the more it was reported, fainter as it ages. A white number beside it is how many stories there you have not found yet.',
    draw: (colors) => (
      <>
        <Circle cx={C} cy={C} r={6.7} color={colors.bg} />
        <Circle cx={C} cy={C} r={5.5} color={colors.markPolitics} />
      </>
    ),
  },
  {
    // `found`, the word the dock and the all-found toast use for it; `read` is
    // a different thing the app also tracks (two seconds in front, `read-store`).
    label: 'found',
    meaning: 'A place whose stories you have all found. Tap it to open the newest again.',
    draw: (colors) => (
      <Circle
        cx={C}
        cy={C}
        r={3.5}
        color={colors.markEconomy}
        style="stroke"
        strokeWidth={1.2}
        opacity={0.7}
      />
    ),
  },
  {
    label: 'contested',
    meaning: 'A story its sources disagree sharply about.',
    draw: (colors) => (
      <>
        <Circle cx={C} cy={C} r={5.5} color={colors.markScience} />
        <Circle
          cx={C}
          cy={C}
          r={8.5}
          color={colors.markContested}
          style="stroke"
          strokeWidth={1.2}
          opacity={0.85}
        />
      </>
    ),
  },
];

const SHIPPING: readonly KeyEntry[] = [
  {
    label: 'strait',
    // The two rows under it say what its colours mean. This one used to say
    // "red when squeezed, slate otherwise", beside a squeezed mark drawn gold
    // and a busier one drawn teal.
    meaning:
      'A shipping strait. The arrow and the figure are its ships over the past week, as in the strip: green ↑ more, red ↓ fewer. Its shape and colour are its traffic against the 90-day normal.',
    mark: { kind: 'strait', state: 'rest' },
  },
  {
    label: 'strait, squeezed',
    meaning: `Traffic ${Math.round(CHOKEPOINT_DISRUPTED * 100)}% or more below its normal: the shores close in.`,
    mark: { kind: 'strait', state: 'pinch' },
  },
  {
    label: 'strait, busier',
    meaning: `Traffic more than ${Math.round(CHOKEPOINT_DISRUPTED * 100)}% above its normal, usually ships rerouted from a strait that is not: the shores open.`,
    mark: { kind: 'strait', state: 'surge' },
  },
  {
    label: 'exchange',
    meaning:
      'A stock exchange over the past week, as in the strip: green ↑ up, red ↓ down, − unchanged. * marks an older quote. A numbered circle is several exchanges close together; tap it for all of them, or zoom in to separate them.',
    mark: { kind: 'market', direction: 'up' },
  },
  {
    label: 'selected',
    meaning: 'The place of the market, strait or currency whose card is open.',
    draw: (colors) => (
      <Circle
        cx={C}
        cy={C}
        r={11}
        color={colors.textEmphasis}
        style="stroke"
        strokeWidth={1.5}
        opacity={0.9}
      />
    ),
  },
];

const CRISES: readonly KeyEntry[] = [
  {
    label: 'hazard',
    meaning: 'An earthquake, cyclone, flood or other natural hazard on the UN–EU alert system.',
    mark: { kind: 'gdacs', eventtype: 'EQ' },
  },
  {
    label: 'hunger',
    meaning: 'An area in food crisis or worse on the IPC scale. The column fills with the phase.',
    mark: { kind: 'famine', blocks: 2 },
  },
  {
    label: 'heat',
    meaning: 'Heat a satellite saw where a story is: a fire, a strike, a flare.',
    mark: { kind: 'thermal' },
  },
  {
    label: 'conflict',
    meaning:
      'Fighting or unrest on the latest day the conflict data covers. Larger where more people were killed. A red number beside it is how many events are close together.',
    mark: { kind: 'conflict' },
  },
  {
    label: 'genocide',
    meaning: 'A situation a UN body has determined to be genocide.',
    mark: { kind: 'genocide' },
  },
];

/** Three groups, so a reader looking for one mark scans a heading, not
 *  thirteen rows: what the news is, what moves goods and money, and what
 *  befalls people. */
const SECTIONS: readonly { label: string; entries: readonly KeyEntry[] }[] = [
  { label: 'stories', entries: STORIES },
  { label: 'shipping and markets', entries: SHIPPING },
  { label: 'crises', entries: CRISES },
];

const KeyRow = memo(function KeyRow({ entry, first }: { entry: KeyEntry; first: boolean }) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={entry.label}
      first={first}
      accessibilityLabel={`${entry.label}: ${entry.meaning}`}
      leading={
        <Canvas style={styles.glyph} pointerEvents="none">
          {'mark' in entry ? <MarkGlyph mark={entry.mark} colors={colors} /> : entry.draw(colors)}
        </Canvas>
      }
    >
      <Text variant="caption">{entry.meaning}</Text>
    </ListRow>
  );
});

export const SheetMapKeyPage = memo(function SheetMapKeyPage() {
  return (
    <View>
      {SECTIONS.map((section, s) => (
        <View key={section.label}>
          <SectionLabel label={section.label} first={s === 0} />
          {section.entries.map((entry, i) => (
            <KeyRow key={entry.label} entry={entry} first={i === 0} />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  glyph: { width: BOX, height: BOX },
});
