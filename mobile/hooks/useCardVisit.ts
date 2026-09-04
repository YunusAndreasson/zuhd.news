import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  buildDeckVisit,
  getCardHistory,
  markCardViewed,
  subscribeCardHistory,
} from '../lib/card-history';
import type { SwipeCard } from '../lib/cards/rank';

/** Freeze content and grouping for one visit. Preloaded neighbouring tabs do
 * not acknowledge anything; foreground + settled dwell are both required. */
export function useCardVisit(
  section: string,
  cards: SwipeCard[],
  active: boolean,
  index: number,
  moving: boolean,
) {
  const history = useSyncExternalStore(subscribeCardHistory, getCardHistory);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const visiting = active && foreground;
  const [visit, setVisit] = useState(() => ({
    active: visiting,
    pages: buildDeckVisit(section, cards),
  }));
  if (visiting !== visit.active || (visiting && !visit.pages.length && cards.length)) {
    setVisit({ active: visiting, pages: visiting ? buildDeckVisit(section, cards) : visit.pages });
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const page = visit.pages[index];
  useEffect(() => {
    if (!active || !foreground || moving || page?.kind !== 'card') return;
    const timer = setTimeout(() => markCardViewed(section, page.card), 800);
    return () => clearTimeout(timer);
  }, [active, foreground, moving, page, section]);
  return { pages: visit.pages, history };
}
