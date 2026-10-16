/**
 * The iOS Large Content Viewer for a control whose text cannot grow with the
 * reader's text size (a gauge, a word in a row of controls, an icon): held
 * down at an accessibility size, it shows the control's words large in the
 * middle of the screen. `title` is the words on the control, not its spoken
 * label. Always on: React Native adds an interaction each time the flag turns
 * on and never removes one, and iOS shows the viewer only at those sizes
 * anyway. Android ignores both props.
 */
export function largeContent(title: string) {
  return {
    accessibilityShowsLargeContentViewer: true,
    accessibilityLargeContentTitle: title,
  } as const;
}
