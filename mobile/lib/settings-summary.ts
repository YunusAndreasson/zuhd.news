import type { AppearanceMode, FontSize } from '../constants/theme';

const TEXT_SIZE: Readonly<Record<FontSize, string>> = {
  small: 'Small text',
  default: 'Default text',
  large: 'Large text',
};

const APPEARANCE: Readonly<Record<AppearanceMode, string>> = {
  system: 'system theme',
  light: 'light',
  dark: 'dark',
};

/**
 * The `settings` row's line: what the settings are, not what the page holds.
 * `Large text · dark · notifications on` answers the question a reader opens
 * the page to ask; a list of the page's headings answered none.
 */
export function settingsSummary(settings: {
  fontSize: FontSize;
  appearance: AppearanceMode;
  /** On in the app and allowed by the system: denied there, they are off. */
  notifications: boolean;
}): string {
  return [
    TEXT_SIZE[settings.fontSize],
    APPEARANCE[settings.appearance],
    `notifications ${settings.notifications ? 'on' : 'off'}`,
  ].join(' · ');
}
