import { useCallback, useEffect, useState } from 'react';
import {
  cancelAnimation,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { getRestingView, isGlobeResting, subscribeRestingView } from '../lib/resting-view';

export interface SettledMapContext {
  exploring: boolean;
  clip: number;
  story: number;
  /** The gauges whose week the globe prints (`marksInView`). */
  named: readonly string[];
  /** The gauges in view the globe could not name. */
  unnamed: readonly string[];
  /** The countries whose capital is in view, as ISO-2 (`capitalsInView`). */
  countries: readonly string[];
}

/** Debounce on the UI thread: moving cameras never enqueue per-frame JS work.
 *  The camera's position and a flight's progress are watched only to hold the
 *  quiet period through the move; what is in view comes from the globe's own
 *  resting frame, whose publish restarts the period so one settle is one
 *  context. */
export function useSettledMapContext(
  exploring: SharedValue<boolean>,
  lat: SharedValue<number>,
  lng: SharedValue<number>,
  clip: SharedValue<number>,
  story: SharedValue<number>,
  flight: SharedValue<number>,
) {
  const [context, setContext] = useState<SettledMapContext | null>(null);
  const ready = useSharedValue(0);
  const view = useSharedValue(0);
  const pending = useSharedValue<{ exploring: boolean; clip: number; story: number } | null>(null);
  useEffect(() => {
    let revision = 0;
    return subscribeRestingView(() => {
      revision += 1;
      view.value = revision;
    });
  }, [view]);
  // A settle that changes nothing the strip reads keeps the old object, so a
  // turn of the globe over the same marks and capitals commits nothing.
  const commit = useCallback((exploring: boolean, clip: number, story: number) => {
    // One frame can outlast the quiet period, so the camera may still be on
    // its way: the story would be new and the view the last one. The globe's
    // next resting frame restarts the period.
    if (!isGlobeResting()) return;
    const { named, unnamed, countries } = getRestingView();
    setContext((previous) =>
      previous &&
      previous.exploring === exploring &&
      previous.clip === clip &&
      previous.story === story &&
      previous.named === named &&
      previous.unnamed === unnamed &&
      previous.countries === countries
        ? previous
        : { exploring, clip, story, named, unnamed, countries },
    );
  }, []);
  useAnimatedReaction(
    () => ({
      exploring: exploring.value,
      lat: lat.value,
      lng: lng.value,
      clip: clip.value,
      story: story.value,
      flight: flight.value,
      view: view.value,
    }),
    (next, previous) => {
      if (
        previous &&
        next.exploring === previous.exploring &&
        next.lat === previous.lat &&
        next.lng === previous.lng &&
        next.clip === previous.clip &&
        next.story === previous.story &&
        next.flight === previous.flight &&
        next.view === previous.view
      )
        return;
      pending.value = { exploring: next.exploring, clip: next.clip, story: next.story };
      cancelAnimation(ready);
      ready.value = 0;
      // This is a quiet-period timer, not visual motion.
      ready.value = withDelay(
        200,
        withTiming(1, { duration: 0, reduceMotion: ReduceMotion.Never }),
        ReduceMotion.Never,
      );
    },
  );
  useAnimatedReaction(
    () => ready.value,
    (value, previous) => {
      const settled = pending.value;
      if (value === 1 && previous !== 1 && settled)
        scheduleOnRN(commit, settled.exploring, settled.clip, settled.story);
    },
  );
  return context;
}
