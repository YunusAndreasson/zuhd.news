import { Canvas, Circle } from '@shopify/react-native-skia';
import { memo, useCallback } from 'react';
import { useTheme } from '../hooks/useTheme';
import type { MarkRowData } from '../lib/mark-rows';
import type { TapResult } from '../lib/tap-result';
import { ListRow, ROW_LEADING } from './ListRow';
import { type Mark, MarkIcon } from './MarkGlyph';
import { Text } from './primitives';

/** The globe mark a row stands for, or null for a story's row: stories have
 *  no glyph on the globe, only a dot. */
function markOf(row: MarkRowData): Mark | null {
  switch (row.kind) {
    case 'gdacs':
      return row.eventtype
        ? { kind: 'gdacs', eventtype: row.eventtype, red: row.alertlevel === 'Red' }
        : null;
    case 'famine':
      return { kind: 'famine', blocks: row.blocks ?? 0 };
    case 'thermal':
    case 'genocide':
    case 'conflict':
      return { kind: row.kind };
    case 'chokepoint':
      return { kind: 'strait', state: row.straitState ?? 'rest' };
    case 'market':
      return { kind: 'market', direction: row.direction ?? 'flat' };
    case 'hotspot':
    case 'article':
      return null;
  }
}

const C = ROW_LEADING / 2;
const CANVAS = { width: ROW_LEADING, height: ROW_LEADING } as const;

/** A story's place in the chooser: a framed dot for one story, rings for a
 *  place with several. */
function StoryIcon({ several }: { several: boolean }) {
  const { colors } = useTheme();
  return (
    <Canvas style={CANVAS} pointerEvents="none">
      {several ? <Circle cx={C} cy={C} r={C} color={colors.accent} opacity={0.12} /> : null}
      <Circle
        cx={C}
        cy={C}
        r={several ? 8 : 6}
        color={several ? colors.accent : colors.textSecondary}
        opacity={several ? 0.5 : 0.4}
        style="stroke"
        strokeWidth={1}
      />
      <Circle cx={C} cy={C} r={2.5} color={colors.accent} />
    </Canvas>
  );
}

/**
 * One mark, as a pressable row: its glyph, what it is, and where. The chooser
 * wraps it in its entrance; the menu's lists render it bare.
 */
export const MarkRow = memo(function MarkRow({
  row,
  first,
  onPress,
}: {
  row: MarkRowData;
  first?: boolean;
  onPress: (result: TapResult) => void;
}) {
  const handlePress = useCallback(() => onPress(row.result), [onPress, row.result]);
  const mark = markOf(row);
  return (
    <ListRow
      title={row.primary}
      titleLines={1}
      first={first}
      onPress={handlePress}
      accessibilityLabel={`${row.primary}, ${row.secondary}`}
      leading={mark ? <MarkIcon mark={mark} /> : <StoryIcon several={row.kind === 'hotspot'} />}
    >
      <Text variant="caption">{row.secondary}</Text>
    </ListRow>
  );
});
