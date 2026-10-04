import type { GdacsAlert } from '@shared/types';
import { Canvas, Circle, Group, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import type { ComponentProps } from 'react';
import { type ColorPalette, straitMarkColor, withAlpha } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { StraitState } from '../lib/strait-map';
import {
  GLYPH_HALF,
  getGlyphPath,
  getStraitPath,
  marketDirectionPath,
} from './globe/disaster-glyphs';
import {
  FAMINE_FRAME_PATH,
  FAMINE_FRAME_STROKE,
  getFamineBlocksPath,
  THERMAL_CORE_PATH,
  THERMAL_RAY_STROKE,
  THERMAL_RAYS_PATH,
} from './globe/overlay-glyphs';
import { ROW_LEADING } from './ListRow';

/**
 * A globe mark, drawn off the globe: in a list's row, the chooser, the map
 * key and a country's alerts. The paths are the ones `MiniGlobe` stamps and
 * the colours its `mark*` tokens, and this is the only place they are drawn
 * again, so no two surfaces can show one mark two ways.
 */
export type Mark =
  | { kind: 'gdacs'; eventtype: GdacsAlert['eventtype']; red?: boolean }
  | { kind: 'famine'; blocks: number }
  | { kind: 'thermal' }
  | { kind: 'genocide' }
  | { kind: 'conflict' }
  | { kind: 'strait'; state: StraitState }
  | { kind: 'market'; direction: 'up' | 'down' | 'flat' };

const BOX = ROW_LEADING;
const C = BOX / 2;
const CENTRE = [{ translateX: C - GLYPH_HALF }, { translateY: C - GLYPH_HALF }];

/** A row's glyph is drawn heavier than the globe's, over a plate of its own
 *  colour: it stands alone on the sheet's ground, not among other marks. */
const PLATE_STROKE = 1.6;
const PLATE_OPACITY = 0.14;

type SkiaPath = ComponentProps<typeof Path>['path'];

function Stroke({ path, color, width }: { path: SkiaPath; color: string; width: number }) {
  return (
    <Path
      path={path}
      color={color}
      style="stroke"
      strokeWidth={width}
      strokeJoin="round"
      strokeCap="round"
    />
  );
}

/** A glyph stroked in its colour, on its plate where it has one. */
function Stroked({
  path,
  color,
  plate,
  width,
  ring = false,
}: {
  path: SkiaPath;
  color: string;
  plate: boolean;
  /** The globe's own weight, for a glyph with no plate. */
  width: number;
  /** The globe's Red-alert ring. */
  ring?: boolean;
}) {
  return (
    <>
      {plate ? <Circle cx={C} cy={C} r={C} color={color} opacity={PLATE_OPACITY} /> : null}
      {plate && ring ? (
        <Circle cx={C} cy={C} r={C - 0.75} color={color} style="stroke" strokeWidth={1.5} />
      ) : null}
      <Group transform={CENTRE}>
        <Stroke path={path} color={color} width={plate ? PLATE_STROKE : width} />
      </Group>
    </>
  );
}

/** The mark's Skia nodes, for a canvas of `ROW_LEADING`. Takes its colours:
 *  nothing under a `Canvas` can read the theme's context. */
export function MarkGlyph({
  mark,
  colors,
  plate = false,
}: {
  mark: Mark;
  colors: ColorPalette;
  plate?: boolean;
}) {
  switch (mark.kind) {
    case 'gdacs':
      return (
        <Stroked
          path={getGlyphPath(mark.eventtype)}
          color={colors.markGdacs}
          plate={plate}
          width={1.1}
          ring={mark.red}
        />
      );
    case 'strait':
      return (
        <Stroked
          path={getStraitPath(mark.state)}
          color={straitMarkColor(mark.state, colors)}
          plate={plate}
          width={1}
        />
      );
    case 'market':
      return (
        <Stroked
          path={marketDirectionPath(mark.direction)}
          color={
            mark.direction === 'up'
              ? colors.markMarketUp
              : mark.direction === 'down'
                ? colors.markMarketDown
                : colors.textSecondary
          }
          plate={plate}
          width={1.2}
        />
      );
    case 'famine':
      return (
        <>
          {plate ? (
            <Circle cx={C} cy={C} r={C} color={colors.markFamine} opacity={PLATE_OPACITY} />
          ) : null}
          <Group transform={CENTRE}>
            <Stroke
              path={FAMINE_FRAME_PATH}
              color={colors.markFamine}
              width={FAMINE_FRAME_STROKE}
            />
            <Path path={getFamineBlocksPath(mark.blocks)} color={colors.markFamine} />
          </Group>
        </>
      );
    case 'thermal':
      return (
        <>
          {plate ? (
            <Circle cx={C} cy={C} r={C} color={colors.markThermal} opacity={PLATE_OPACITY} />
          ) : null}
          <Group transform={CENTRE}>
            <Path path={THERMAL_CORE_PATH} color={colors.markThermal} />
            <Stroke
              path={THERMAL_RAYS_PATH}
              color={colors.markThermal}
              width={THERMAL_RAY_STROKE}
            />
          </Group>
        </>
      );
    case 'genocide':
      return (
        <>
          <Circle cx={C} cy={C} r={9} color={colors.markGenocideCore} />
          <Circle
            cx={C}
            cy={C}
            r={9}
            color={colors.markGenocide}
            style="stroke"
            strokeWidth={1.6}
          />
          <Circle cx={C} cy={C} r={3} color={colors.markGenocide} />
        </>
      );
    case 'conflict':
      // The globe's glow.
      return (
        <Circle cx={C} cy={C} r={9}>
          <RadialGradient
            c={vec(C, C)}
            r={9}
            colors={[colors.markConflict, withAlpha(colors.markConflict, 0)]}
          />
        </Circle>
      );
  }
}

const CANVAS = { width: BOX, height: BOX } as const;

/** The mark on its plate, as a row's leading glyph. */
export function MarkIcon({ mark }: { mark: Mark }) {
  const { colors } = useTheme();
  return (
    <Canvas style={CANVAS} pointerEvents="none">
      <MarkGlyph mark={mark} colors={colors} plate />
    </Canvas>
  );
}
