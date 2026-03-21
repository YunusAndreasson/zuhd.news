import { useNetworkState } from 'expo-network';
import { createRef, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { AboutPage } from '../components/AboutPage';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BriefingButton } from '../components/BriefingButton';
import { CategoryBar } from '../components/CategoryBar';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useHaptic } from '../hooks/useHaptic';

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, lastSeenAt, refresh, retry } = useArticles();
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

  const onPageScroll = useCallback(
    (e: { nativeEvent: { position: number; offset: number } }) => {
      pagerOffset.value = e.nativeEvent.position + e.nativeEvent.offset;
    },
    [pagerOffset],
  );

  const onPageScrollStateChanged = useCallback(
    (e: { nativeEvent: { pageScrollState: string } }) => {
      pagerIdle.current = e.nativeEvent.pageScrollState === 'idle';
    },
    [],
  );

  const onCategoryPress = useCallback(
    (index: number) => {
      if (index === currentCategory && index < CATEGORIES.length) {
        listRefs[index]?.current?.scrollToTop();
      } else {
        pagerRef.current?.setPage(index);
      }
      impact();
    },
    [impact, currentCategory],
  );

  const silentRefresh = useCallback(() => {
    refresh()
      .then((n) => {
        if (n > 0) {
          toastRef.current?.show(`${n} new article${n > 1 ? 's' : ''}`);
          notification();
        }
      })
      .catch(() => {});
  }, [refresh, notification]);

  const handleRefresh = useCallback(async () => {
    impact();
    try {
      const n = await refresh();
      if (n > 0) {
        toastRef.current?.show(`${n} new article${n > 1 ? 's' : ''}`);
        notification();
      } else {
        toastRef.current?.show('Already up to date');
      }
    } catch {
      toastRef.current?.show('Could not refresh');
    }
  }, [impact, refresh, notification]);

  // Silent refresh: on foreground + every 30 min
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') silentRefresh();
    });
    const id = setInterval(silentRefresh, 30 * 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [silentRefresh]);

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
        <Pressable
          onPress={retry}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          hitSlop={12}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
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
        onPageScroll={onPageScroll}
        onPageScrollStateChanged={onPageScrollStateChanged}
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
                lastSeenAt={lastSeenAt}
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

      {currentCategory < CATEGORIES.length && briefing?.available && (
        <BriefingButton date={briefing.date} />
      )}
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
  retryText: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
});
