import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { BottomActionBar } from './BottomActionBar';
import { BriefingBar } from './BriefingBar';

export interface BriefingChromeRef {
  toggle: () => void;
}

interface BriefingChromeProps {
  date?: string;
  duration?: number;
  bottomInset: number;
  zoomLabel: string;
  articleActions: boolean;
  onZoomPress: () => void;
  onSharePress: () => void;
  onUnavailable: () => void;
  onPlaybackError: () => void;
  onVisibilityChange: (visible: boolean) => void;
}

/**
 * Owns the high-frequency audio status subscription at the edge of the screen.
 *
 * Keeping useBriefingPlayer here means the 500 ms elapsed-time cadence updates
 * only the player chrome, rather than reconciling HomeScreen, its PagerView,
 * every article/card page, and all sheet shells twice per second.
 */
export const BriefingChrome = forwardRef<BriefingChromeRef, BriefingChromeProps>(
  function BriefingChrome(
    {
      date,
      duration,
      bottomInset,
      zoomLabel,
      articleActions,
      onZoomPress,
      onSharePress,
      onUnavailable,
      onPlaybackError,
      onVisibilityChange,
    },
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
      if (player.failureCount === 0) return;
      setPresented(false);
      onPlaybackError();
    }, [onPlaybackError, player.failureCount]);

    if (!visible) {
      return (
        <BottomActionBar
          bottomInset={bottomInset}
          zoomLabel={zoomLabel}
          briefingDuration={player.duration}
          briefingResumable={player.resumable}
          onBriefingPress={handleToggle}
          onZoomPress={onZoomPress}
          articleActions={articleActions}
          onSharePress={onSharePress}
        />
      );
    }

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
