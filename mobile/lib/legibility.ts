/**
 * The system's reading settings the app's own type and inks have to follow,
 * because they are drawn from the app's files and palette and the system
 * cannot reach them: iOS's Bold Text, Increase Contrast and Reduce
 * Transparency, and Android's High contrast text. React Native exposes no
 * Android Bold text, so it is not here.
 */

export interface Legibility {
  /** iOS Bold Text: Source Sans steps a weight (`emboldened`). */
  boldText: boolean;
  /** iOS Increase Contrast, Android High contrast text: the contrast palette. */
  moreContrast: boolean;
  /** iOS Reduce Transparency: the player is solid, not glass or blur. */
  reduceTransparency: boolean;
}

export const PLAIN_LEGIBILITY: Legibility = {
  boldText: false,
  moreContrast: false,
  reduceTransparency: false,
};

export type LegibilityRead =
  | 'isBoldTextEnabled'
  | 'isDarkerSystemColorsEnabled'
  | 'isReduceTransparencyEnabled'
  | 'isHighTextContrastEnabled';

export type LegibilityEvent =
  | 'boldTextChanged'
  | 'darkerSystemColorsChanged'
  | 'reduceTransparencyChanged'
  | 'highTextContrastChanged';

export interface LegibilitySetting {
  key: keyof Legibility;
  /** The `AccessibilityInfo` method that reads it. */
  read: LegibilityRead;
  /** The `AccessibilityInfo` event that reports its change. */
  event: LegibilityEvent;
}

/** The setting behind each field, on each platform. */
export const LEGIBILITY_SETTINGS: Record<'ios' | 'android', readonly LegibilitySetting[]> = {
  ios: [
    { key: 'boldText', read: 'isBoldTextEnabled', event: 'boldTextChanged' },
    {
      key: 'moreContrast',
      read: 'isDarkerSystemColorsEnabled',
      event: 'darkerSystemColorsChanged',
    },
    {
      key: 'reduceTransparency',
      read: 'isReduceTransparencyEnabled',
      event: 'reduceTransparencyChanged',
    },
  ],
  android: [
    { key: 'moreContrast', read: 'isHighTextContrastEnabled', event: 'highTextContrastChanged' },
  ],
};

/** The state with one setting changed, or the same state when it already was. */
export function withSetting(state: Legibility, key: keyof Legibility, on: boolean): Legibility {
  return state[key] === on ? state : { ...state, [key]: on };
}
