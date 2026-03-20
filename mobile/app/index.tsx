import { useCallback, useRef, useState, useEffect, createRef } from 'react';
import { View, Text, AppState, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';

import { CategoryBar } from '../components/CategoryBar';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BriefingButton } from '../components/BriefingButton';
import { Toast, type ToastRef } from '../components/Toast';
import { AboutPage } from '../components/AboutPage';

import { useNetworkState } from 'expo-network';
import { useArticles } from '../hooks/useArticles';
import { useHaptic } from '../hooks/useHaptic';
import { COLORS, FONT, TYPOGRAPHY, SPACING, CATEGORIES } from '../constants/theme';

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, refresh } = useArticles();
  const { impact, notification } = useHaptic();
  const network = useNetworkState();

  const pagerRef = useRef<PagerView>(null);
  const toastRef = useRef<ToastRef>(null);

  const [currentCategory, setCurrentCategory] = useState(0);
  const pagerIdle = useRef(true);

  const [pagerHeight, setPagerHeight] = useState(0);
  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(e.nativeEvent.layout.height);
  }, []);

  const pagerOffset = useSharedValue(0);
  const categoryProgresses = useSharedValue([0, 0, 0, 0, 0]);

  const onPageSelected = useCallback(
    (e: PagerViewOnPageSelectedEvent) => {
      const page = e.nativeEvent.position;
      setCurrentCategory(page);
      pagerOffset.value = page;
      impact();
    },
    [impact, pagerOffset],
  );

  const onCategoryPress = useCallback(
    (index: number) => {
      if (index === currentCategory && index < CATEGORIES.length) {
        listRefs[index].current?.scrollToTop();
      } else {
        pagerRef.current?.setPage(index);
      }
      impact();
    },
    [impact, currentCategory],
  );

  const handleRefresh = useCallback(async () => {
    impact();
    try {
      const newCount = await refresh();
      if (newCount > 0) {
        toastRef.current?.show(`${newCount} new article${newCount > 1 ? 's' : ''}`);
        notification();
      } else {
        toastRef.current?.show('Already up to date');
      }
    } catch {
      toastRef.current?.show('Could not refresh');
    }
  }, [impact, refresh, notification]);

  // Silent refresh when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh().then((n) => {
          if (n > 0) {
            toastRef.current?.show(`${n} new article${n > 1 ? 's' : ''}`);
            notification();
          }
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [refresh, notification]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>zuhd.news</Text>
      </View>
    );
  }

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    const offline = network.isInternetReachable === false;
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {offline ? 'No connection.' : 'Could not load articles.'}
        </Text>
        <Text style={styles.errorHint}>
          {offline ? 'Connect to the internet and reopen.' : error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CategoryBar
        pagerOffset={pagerOffset}
        categoryProgresses={categoryProgresses}
        onCategoryPress={onCategoryPress}
      />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={onPageSelected}
        onPageScroll={(e) => {
          pagerOffset.value = e.nativeEvent.position + e.nativeEvent.offset;
        }}
        onPageScrollStateChanged={(e) => {
          pagerIdle.current = e.nativeEvent.pageScrollState === 'idle';
        }}
        onLayout={onPagerLayout}
        overdrag
      >
        {CATEGORIES.map((cat, catIndex) => (
          <View key={cat} collapsable={false}>
            {pagerHeight > 0 && (
              <ArticleList
                ref={listRefs[catIndex]}
                articles={grouped[cat]}
                viewportHeight={pagerHeight}
                catIndex={catIndex}
                onRefresh={handleRefresh}
                pagerIdle={pagerIdle}
                progressesSV={categoryProgresses}
              />
            )}
          </View>
        ))}
        <View key="about" collapsable={false}>
          <AboutPage />
        </View>
      </PagerView>

      {currentCategory < CATEGORIES.length && <BriefingButton />}
      <Toast ref={toastRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  pager: {
    flex: 1,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeWordmark,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  errorHint: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
