import type { AndroidSymbol, SFSymbol } from 'expo-symbols';
import type { ICON, TextTone } from '../../constants/theme';

/**
 * One name per icon, drawn with each platform's own symbols: an SF Symbol on
 * iOS (`Icon.ios.tsx`) and a Material Symbol on Android (`Icon.tsx`). `glyph`
 * is the Material Symbol's codepoint in the font Android embeds; a test holds
 * it to the symbol's name.
 */
export const ICONS = {
  // The delta chip's direction arrows. A filled triangle rather than a line
  // arrow: at 14px beside 13pt type a stroked glyph reads as noise, and the
  // triangle is the mark a reader already associates with a price move.
  'caret-up': { ios: 'arrowtriangle.up.fill', android: 'arrow_drop_up', glyph: 0xe5c7 },
  'caret-down': { ios: 'arrowtriangle.down.fill', android: 'arrow_drop_down', glyph: 0xe5c5 },
  'chevron-back': { ios: 'chevron.left', android: 'chevron_left', glyph: 0xe5cb },
  'chevron-forward': { ios: 'chevron.right', android: 'chevron_right', glyph: 0xe5cc },
  'chevron-up': { ios: 'chevron.up', android: 'keyboard_arrow_up', glyph: 0xe316 },
  'chevron-down': { ios: 'chevron.down', android: 'keyboard_arrow_down', glyph: 0xe313 },
  'close-circle': { ios: 'xmark.circle.fill', android: 'cancel', glyph: 0xe5c9 },
  'close-sharp': { ios: 'xmark', android: 'close', glyph: 0xe5cd },
  // "More" is an ellipsis on both platforms. Android used to keep the Ionicons
  // hamburger for it, and the story list's settings button — reached from a
  // three-line list icon — was a second three-line icon doing something else.
  'ellipsis-horizontal': { ios: 'ellipsis', android: 'more_horiz', glyph: 0xe5d3 },
  'information-circle': { ios: 'info.circle.fill', android: 'info', glyph: 0xe88e },
  'information-circle-outline': { ios: 'info.circle', android: 'info', glyph: 0xe88e },
  list: { ios: 'list.bullet', android: 'format_list_bulleted', glyph: 0xe241 },
  // The top-right menu: search, saved, settings, the map key and the pages.
  // The only three-line icon in the app since the story list went.
  menu: { ios: 'line.3.horizontal', android: 'menu', glyph: 0xe5d2 },
  // A menu row that leaves the app — mail, the store, a data provider's site —
  // where a chevron would promise another page.
  'open-outline': { ios: 'arrow.up.right.square', android: 'open_in_new', glyph: 0xe89e },
  pause: { ios: 'pause.fill', android: 'pause', glyph: 0xe034 },
  play: { ios: 'play.fill', android: 'play_arrow', glyph: 0xe037 },
  search: { ios: 'magnifyingglass', android: 'search', glyph: 0xe8b6 },
  share: { ios: 'square.and.arrow.up', android: 'share', glyph: 0xe80d },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol; glyph: number }>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixel size — `xs` (11, a chip's caret only), `sm` (14), `md` (20), `lg`
   *  (26). Anything else is a mistake. */
  size?: keyof typeof ICON;
  /** Semantic tone. Ignored if `color` is set. */
  tone?: TextTone;
  /** Explicit color override. Prefer `tone`. */
  color?: string;
}
