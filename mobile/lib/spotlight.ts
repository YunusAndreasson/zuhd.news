import { NativeModules, Platform } from 'react-native';
import type { Article, Category } from '../types';

const DOMAIN = 'news.zuhd.articles';

// Check at module load whether the native module exists — avoids Invariant Violation in Expo Go
const hasNativeModule =
  Platform.OS === 'ios' && NativeModules.SpotlightSearch != null;

/**
 * Index articles into iOS Spotlight search.
 * No-ops on Android and Expo Go.
 */
export async function indexArticlesForSpotlight(
  grouped: Record<Category, Article[]>,
): Promise<void> {
  if (!hasNativeModule) return;

  const { indexItems } = require('react-native-spotlight-search') as typeof import('react-native-spotlight-search');

  const items = Object.entries(grouped).flatMap(([category, articles]) =>
    articles.map((a) => ({
      uniqueIdentifier: a.slug,
      title: a.title,
      contentDescription: a.sentences[0] ?? '',
      domain: DOMAIN,
      keywords: [category, a.location, a.source, ...(a.concepts ?? [])].filter(
        (k): k is string => !!k,
      ),
    })),
  );

  if (items.length === 0) return;

  try {
    await indexItems(items);
  } catch {}
}
