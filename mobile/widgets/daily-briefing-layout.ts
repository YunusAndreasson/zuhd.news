import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { DARK_PAPER, LIGHT_PAPER, SPACING } from '../constants/paper';
import type { WidgetFace } from '../lib/daily-widget';

export type BriefingEnvironment = WidgetEnvironment & {
  widthDp?: number;
  heightDp?: number;
  fontScale?: number;
  largeText?: boolean;
  language?: string;
};

export const briefingWidgetDesign = {
  light: { ...LIGHT_PAPER, widgetPaper: LIGHT_PAPER.bg },
  dark: { ...DARK_PAPER, widgetPaper: DARK_PAPER.sheetBg },
  space: SPACING,
};

export function dailyBriefingWidget(
  layout: (
    p: WidgetFace,
    env: BriefingEnvironment,
    tokens: typeof briefingWidgetDesign,
  ) => React.JSX.Element,
) {
  // Widget functions are serialized without their JS closures.
  const source = `function(props, env) {
    return (${String(layout)})(props, env, ${JSON.stringify(briefingWidgetDesign)});
  }`;
  return createWidget(
    'DailyBriefing',
    source as unknown as (p: WidgetFace) => React.JSX.Element,
    {},
  );
}
