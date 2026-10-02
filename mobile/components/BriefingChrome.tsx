import { type Ref, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { BriefingBar } from './BriefingBar';

export interface BriefingChromeRef {
  toggle: () => void;
}

/** What the header needs to draw its control. Deliberately none of the
 *  high-frequency fields — see the note on the component. */
export interface BriefingStatus {
  available: boolean;
  resumable: boolean;
  duration?: number;
  /** Share already heard, 0–1, in fortieths — the play button's arc. */
  heard: number;
}

/** Steps the heard share is reported in: a 9° arc step, and never a tick. */
const HEARD_STEPS = 40;

interface BriefingChromeProps {
  date?: string;
  duration?: number;
  /** When the recording was made (`FeedResponse.briefing.generated`). */
  recorded?: string;
  onUnavailable: () => void;
  onPlaybackError: () => void;
  onVisibilityChange: (visible: boolean) => void;
  /** Fired when the *slow* fields change, never on an elapsed tick. */
  onStatusChange: (status: BriefingStatus) => void;
  /** The top bar's height: the player hangs just under it. */
  topOffset: number;
  /** The bar's measured height, so top toasts can start under it. */
  onHeightChange?: (height: number) => void;
  /** React 19: a prop. This was the app's last `forwardRef`. */
  ref?: Ref<BriefingChromeRef>;
}

/**
 * Owns the high-frequency audio status subscription at the edge of the screen.
 *
 * Keeping `useBriefingPlayer` here means the 500 ms elapsed-time cadence
 * updates only the player chrome, rather than reconciling HomeScreen, every
 * list row, the globe and all the sheet shells twice per second.
 *
 * That constraint is why the header's control is not simply rendered from
 * the player: it needs `available`, `resumable` and `duration`, and lifting
 * the hook to get them would lift `elapsed` with it. Those three change at
 * most a few times per session, so they are reported upward through
 * `onStatusChange` and `elapsed` never leaves this component.
 *
 * The bar it renders is the *playing* state only. The way in is the `▶` in
 * the map's top bar, and the bar hangs just under that bar, in the `▶`'s
 * place while it is hidden (2026-09-22, the user's request). It sat on the
 * dock at the foot of the screen until then — where the `▶` had been when the
 * dock held it — and once the `▶` moved to the top, pressing it opened a
 * player at the far end of the screen from the button that started it.
 * Floating, not part of the top bar's layout: making room for it there would
 * shrink and re-centre the globe and shorten the open sheet every time it
 * appeared. It clears an open story without that, because the open sheet
 * always leaves the globe at least `BAND_MIN` under the top bar.
 */
export function BriefingChrome({
  date,
  duration,
  recorded,
  onUnavailable,
  onPlaybackError,
  onVisibilityChange,
  onStatusChange,
  topOffset,
  onHeightChange,
  ref,
}: BriefingChromeProps) {
  const player = useBriefingPlayer(date, duration, recorded);
  // Called as functions, not as `player.toggle()`: a method call reads as a
  // change to `player`, and the compiler could not keep the callbacks below
  // memoized on the function alone.
  const { available, toggle, dismiss } = player;
  const [presented, setPresented] = useState(false);
  const visible = presented && player.state !== 'idle';

  const handleToggle = useCallback(() => {
    if (!available) {
      onUnavailable();
      return;
    }
    setPresented(true);
    toggle();
  }, [onUnavailable, available, toggle]);

  const handleDismiss = useCallback(() => {
    setPresented(false);
    dismiss();
  }, [dismiss]);

  useImperativeHandle(ref, () => ({ toggle: handleToggle }), [handleToggle]);

  useEffect(() => {
    onVisibilityChange(visible);
  }, [onVisibilityChange, visible]);

  // The heard share follows `elapsed`, which ticks twice a second while
  // playing — the very field this component exists to keep from reaching
  // HomeScreen. It is only read while the player is down (the top bar's
  // button is hidden while it plays), so it holds its last value until then,
  // and it moves in fortieths. Held as state, set during render when it
  // moves — React's pattern for a value kept from earlier renders; a ref
  // written during render did the same and kept this component from React
  // Compiler.
  const [heard, setHeard] = useState(0);
  if (player.state !== 'playing' && player.state !== 'preparing') {
    const at = player.elapsed > 0 ? player.elapsed : player.resumeAt;
    const next =
      player.resumable && player.duration > 0
        ? Math.round(Math.min(1, at / player.duration) * HEARD_STEPS) / HEARD_STEPS
        : 0;
    if (next !== heard) setHeard(next);
  }

  useEffect(() => {
    onStatusChange({
      available: player.available,
      resumable: player.resumable,
      duration: player.duration,
      heard,
    });
  }, [onStatusChange, player.available, player.resumable, player.duration, heard]);

  useEffect(() => {
    if (player.failureCount === 0) return;
    setPresented(false);
    onPlaybackError();
  }, [onPlaybackError, player.failureCount]);

  if (!visible) return null;

  return (
    <BriefingBar
      state={player.state}
      elapsed={player.elapsed}
      duration={player.duration}
      date={player.date}
      onToggle={player.toggle}
      onSeek={player.seek}
      onDismiss={handleDismiss}
      topOffset={topOffset}
      onHeightChange={onHeightChange}
    />
  );
}
