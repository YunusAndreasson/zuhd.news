import { memo } from 'react';
import type { TextProps as RNTextProps } from 'react-native';
import type { TextTone } from '../constants/theme';
import { moveRuns } from '../lib/cards/format';
import { moveTone } from '../lib/valence';
import { Text } from './primitives';

/**
 * A caption line, with every move it prints in the move's colour: green up,
 * red down, slate unmoved (`moveTone`), as the chip prints one.
 *
 * A chip holds one move. The sentence under a card holds the ones it cannot —
 * a ratio's two parts (`wheat +14% and rice −29%`), a second window — and a
 * mark's row in the chooser holds its week, and both printed them in the
 * caption's grey beside a chip that was green or red.
 */
export const MoveCaption = memo(function MoveCaption({
  children,
  tone,
  numberOfLines,
  style,
}: {
  children: string;
  /** The words' ink. A move keeps its own. */
  tone?: TextTone;
  numberOfLines?: number;
  style?: RNTextProps['style'];
}) {
  const runs = moveRuns(children);
  return (
    <Text variant="caption" tone={tone} numberOfLines={numberOfLines} style={style}>
      {/* A line with no move stays one string: the primitive keeps a dash
          with the word before it only in a string. */}
      {runs.some((run) => run.direction)
        ? runs.map((run, i) =>
            run.direction ? (
              <Text key={i} variant="caption" tone={moveTone({ direction: run.direction })}>
                {run.text}
              </Text>
            ) : (
              run.text
            ),
          )
        : children}
    </Text>
  );
});
