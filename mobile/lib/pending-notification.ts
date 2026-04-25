/** Module-scoped state from a tapped push notification, consumed by index.tsx
 *  after the feed finishes loading. Two independent intents because the user
 *  can tap a breaking-news push (slug → open article) or a daily-briefing
 *  push (briefing → trigger the audio player) and the resolution paths are
 *  different. Storing them separately avoids one tap clobbering the other. */
let pendingSlug: string | null = null;
let pendingBriefing = false;

export const get = (): string | null => pendingSlug;
export const set = (slug: string): void => {
  pendingSlug = slug;
};
export const clear = (): void => {
  pendingSlug = null;
};

export const getBriefing = (): boolean => pendingBriefing;
export const setBriefing = (): void => {
  pendingBriefing = true;
};
export const clearBriefing = (): void => {
  pendingBriefing = false;
};
