import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { BriefingBar } from './BriefingBar';

export interface BriefingChromeRef {
  toggle: () => void;
}

/** What the masthead needs to draw its control. Deliberately none of the
 *  high-frequency fields — see the note on the component. */
export interface BriefingStatus {
  available: boolean;
  resumable: boolean;
  duration?: number;
}

interface BriefingChromeProps {
  date?: string;
  duration?: number;
  onUnavailable: () => void;
  onPlaybackError: () => void;
  onVisibilityChange: (visible: boolean) => void;
  /** Fired when the *slow* fields change, never on an elapsed tick. */
  onStatusChange: (status: BriefingStatus) => void;
}

/**
 * Owns the high-frequency audio status subscription at the edge of the screen.
 *
 * Keeping `useBriefingPlayer` here means the 500 ms elapsed-time cadence
 * updates only the player chrome, rather than reconciling HomeScreen, every
 * list row, the globe and all the sheet shells twice per second.
 *
 * That constraint is why the masthead's control is not simply rendered from
 * the player: it needs `available`, `resumable` and `duration`, and lifting
 * the hook to get them would lift `elapsed` with it. Those three change at
 * most a few times per session, so they are reported upward through
 * `onStatusChange` and `elapsed` never leaves this component.
 *
 * The bar it renders is the *playing* state only. The way in moved to the
 * sheet's masthead: as a pill in the corner of the globe it was a control
 * sized to stay out of the way, which is a control nobody finds.
 */
export const BriefingChrome = forwardRef<BriefingChromeRef, BriefingChromeProps>(
  function BriefingChrome(
    { date, duration, onUnavailable, onPlaybackError, onVisibilityChange, onStatusChange },
    ref,
  ) {
    const player = useBriefingPlayer(date, duration);
    const [presented, setPresented] = useState(false);
    const visible = presented && player.state !== 'idle';

    const handleToggle = useCallback(() => {
      if (!player.available) {
        onUnavailable();
        return;
      }
      setPresented(true);
      player.toggle();
    }, [onUnavailable, player.available, player.toggle]);

    const handleDismiss = useCallback(() => {
      setPresented(false);
      player.dismiss();
    }, [player.dismiss]);

    useImperativeHandle(ref, () => ({ toggle: handleToggle }), [handleToggle]);

    useEffect(() => {
      onVisibilityChange(visible);
    }, [onVisibilityChange, visible]);

    useEffect(() => {
      onStatusChange({
        available: player.available,
        resumable: player.resumable,
        duration: player.duration,
      });
    }, [onStatusChange, player.available, player.resumable, player.duration]);

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
      />
    );
  },
);
