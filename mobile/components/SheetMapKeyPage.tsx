import { CHOKEPOINT_DISRUPTED } from '@shared/chokepoint-thresholds';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  type SkPath,
  vec,
} from '@shopify/react-native-skia';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { type ColorPalette, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { CHOKEPOINT_PATH, GLYPH_HALF, getGlyphPath, MARKET_PATH } from './globe/disaster-glyphs';
import {
  FAMINE_FRAME_PATH,
  FAMINE_FRAME_STROKE,
  getFamineBlocksPath,
  THERMAL_CORE_PATH,
  THERMAL_RAY_STROKE,
  THERMAL_RAYS_PATH,
} from './globe/overlay-glyphs';
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

const BOX = 28;
const C = BOX / 2;

/** A glyph authored in the globe's 22-unit box, centred in the key's cell. */
function Glyph({
  path,
  color,
  stroke,
  fill,
}: {
  path: SkPath;
  color: string;
  stroke?: number;
  fill?: boolean;
}) {
  return (
    <Group transform={[{ translateX: C - GLYPH_HALF }, { translateY: C - GLYPH_HALF }]}>
      <Path
        path={path}
        color={color}
        style={fill ? 'fill' : 'stroke'}
        strokeWidth={stroke ?? 1}
        strokeJoin="round"
        strokeCap="round"
      />
    </Group>
  );
}

interface KeyEntry {
  label: string;
  meaning: string;
  draw: (colors: ColorPalette) => ReactNode;
}

const ENTRIES: readonly KeyEntry[] = [
  {
    label: 'story',
    meaning:
      "A place in the news, in its category's colour: politics, economy, science, tech. Larger where more outlets covered it, fainter as it ages.",
    draw: (colors) => (
      <>
        <Circle cx={C} cy={C} r={6.7} color={colors.bg} />
        <Circle cx={C} cy={C} r={5.5} color={colors.markPolitics} />
      </>
    ),
  },
  {
    label: 'read',
    meaning: 'A place whose stories you have all opened. Tap it to read the newest again.',
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
  {
    label: 'strait',
    meaning: 'A shipping strait, with traffic near its own 90-day normal.',
    draw: (colors) => <Glyph path={CHOKEPOINT_PATH} color={colors.markStrait} />,
  },
  {
    label: 'strait, squeezed',
    meaning: `Traffic ${Math.round(CHOKEPOINT_DISRUPTED * 100)}% or more below its normal.`,
    draw: (colors) => <Glyph path={CHOKEPOINT_PATH} color={colors.markStraitPinch} />,
  },
  {
    label: 'strait, busier',
    meaning: 'Traffic well above its normal, usually ships rerouted from a strait that is not.',
    draw: (colors) => <Glyph path={CHOKEPOINT_PATH} color={colors.markStraitSurge} />,
  },
  {
    label: 'exchange',
    meaning:
      'A stock exchange whose index moved enough to note, in green when it rose and rust when it fell.',
    draw: (colors) => <Glyph path={MARKET_PATH} color={colors.markMarketUp} stroke={1.2} />,
  },
  {
    label: 'hazard',
    meaning: 'An earthquake, cyclone, flood or other natural hazard on the UN–EU alert system.',
    draw: (colors) => <Glyph path={getGlyphPath('EQ')} color={colors.markGdacs} stroke={1.1} />,
  },
  {
    label: 'hunger',
    meaning: 'An area in food crisis or worse on the IPC scale. The column fills with the phase.',
    draw: (colors) => (
      <>
        <Glyph path={FAMINE_FRAME_PATH} color={colors.markFamine} stroke={FAMINE_FRAME_STROKE} />
        <Glyph path={getFamineBlocksPath(2)} color={colors.markFamine} fill />
      </>
    ),
  },
  {
    label: 'heat',
    meaning: 'Heat a satellite saw where a story is: a fire, a strike, a flare.',
    draw: (colors) => (
      <>
        <Glyph path={THERMAL_CORE_PATH} color={colors.markThermal} fill />
        <Glyph path={THERMAL_RAYS_PATH} color={colors.markThermal} stroke={THERMAL_RAY_STROKE} />
      </>
    ),
  },
  {
    label: 'conflict',
    meaning:
      'Fighting or unrest on the latest day the conflict data covers. Larger where more people were killed.',
    draw: (colors) => (
      <Circle cx={C} cy={C} r={9}>
        <RadialGradient
          c={vec(C, C)}
          r={9}
          colors={[colors.markConflict, `${colors.markConflict}00`]}
        />
      </Circle>
    ),
  },
  {
    label: 'genocide',
    meaning: 'A situation a UN body has determined to be genocide.',
    draw: (colors) => (
      <>
        <Circle cx={C} cy={C} r={9} color={colors.markGenocideCore} />
        <Circle cx={C} cy={C} r={9} color={colors.markGenocide} style="stroke" strokeWidth={1.6} />
        <Circle cx={C} cy={C} r={3} color={colors.markGenocide} />
      </>
    ),
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

const KeyRow = memo(function KeyRow({ entry, first }: { entry: KeyEntry; first: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopColor: colors.rule, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
      accessible
      accessibilityLabel={`${entry.label}: ${entry.meaning}`}
    >
      <Canvas style={styles.glyph} pointerEvents="none">
        {entry.draw(colors)}
      </Canvas>
      <View style={styles.text}>
        <Text variant="rowTitle">{entry.label}</Text>
        <Text variant="caption" tone="secondary">
          {entry.meaning}
        </Text>
      </View>
    </View>
  );
});

export const SheetMapKeyPage = memo(function SheetMapKeyPage() {
  return (
    <View>
      <Text variant="body" tone="secondary" style={styles.intro}>
        Every mark on the globe can be tapped, and opens what it stands for.
      </Text>
      {ENTRIES.map((entry, i) => (
        <KeyRow key={entry.label} entry={entry} first={i === 0} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  intro: { marginBottom: SPACING.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    paddingVertical: SPACING.smPlus,
  },
  glyph: { width: BOX, height: BOX },
  text: { flex: 1, minWidth: 0, gap: SPACING.xxs },
});
