import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { NewsConfiguration, NewsWidgetProps } from '../lib/news-widget';
import { type NewsEnvironment, newsLayoutModel, newsWidgetDesign } from '../lib/news-widget-layout';

export type { NewsEnvironment, newsLayoutModel } from '../lib/news-widget-layout';

type Layout = (
  p: NewsWidgetProps,
  env: NewsEnvironment,
  d: typeof newsWidgetDesign,
  model: ReturnType<typeof newsLayoutModel>,
) => React.JSX.Element;

export function latestNewsWidget(layout: Layout) {
  // Expo serializes a 'widget' function without its lexical scope. Supply the
  // shared layout model and design tokens to both embedded and runtime layouts.
  const source = `function(props, env) {
    const design = ${JSON.stringify(newsWidgetDesign)};
    const model = (${String(newsLayoutModel)})(props, env, design);
    return (${String(layout)})(props, env, design, model);
  }`;
  type Entry = (p: NewsWidgetProps, env: WidgetEnvironment<NewsConfiguration>) => React.JSX.Element;
  return createWidget<NewsWidgetProps, NewsConfiguration>(
    'LatestNews',
    source as unknown as Entry,
    {},
  );
}
