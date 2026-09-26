/**
 * The zuhd mark — a Z cut by two diagonal slashes: the top-left wedge, the
 * bar and the bottom-right wedge — as the web draws it (`public/logo.svg`),
 * on the same 32-unit box. It was traced from the app icon, so the icon, the
 * site and the menu carry one drawing, not three. The paths are copied here
 * because the app cannot read the site's file at run time;
 * `__tests__/zuhd-mark.test.ts` holds them equal to it.
 */
export const ZUHD_MARK_BOX = 32;

export const ZUHD_MARK_PATHS = [
  'M4.5 4.5H12L4.5 16.25Z',
  'M19.5 4.5H27.5L12 27.5H4.5Z',
  'M27.5 16.25V27.5H20Z',
] as const;
