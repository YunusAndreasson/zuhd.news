import type { Widget } from 'expo-widgets';
import type { NewsConfiguration, NewsWidgetProps } from '../lib/news-widget';

declare const widget: Widget<NewsWidgetProps, NewsConfiguration>;
export default widget;
