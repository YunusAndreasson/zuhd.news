import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  aspectRatio,
  background,
  clipped,
  colorInvert,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { NewsWidgetProps } from '../lib/news-widget';
import { latestNewsWidget, type NewsEnvironment, type newsLayoutModel } from './news-layout';

type Design = Parameters<typeof newsLayoutModel>[2];

function LatestNews(
  _p: NewsWidgetProps,
  env: NewsEnvironment,
  d: Design,
  m: ReturnType<typeof newsLayoutModel>,
) {
  'widget';
  const small = env.widgetFamily === 'systemSmall';
  const large = env.widgetFamily === 'systemLarge' || env.widgetFamily === 'systemExtraLarge';
  const full = !env.widgetRenderingMode || env.widgetRenderingMode === 'fullColor';
  const accessible = !!env.largeText;
  const count = small ? 1 : large ? (accessible ? 3 : 5) : 2;
  const { colors, status } = m;
  const head = status || (small ? '' : m.sectionName);
  const txt = (
    value: string,
    size: number,
    lines: number,
    ink: 'title' | 'accent' | 'quiet',
    strong = false,
  ) => (
    <Text
      modifiers={[
        font({
          family: strong ? 'SourceSans3-SemiBold' : 'SourceSans3-Regular',
          size,
          textStyle: strong ? 'headline' : 'caption',
        }),
        lineLimit(lines),
        ...(full ? [foregroundStyle(colors[ink])] : []),
      ]}
    >
      {value}
    </Text>
  );
  const rule = () => (
    <Spacer
      modifiers={[frame({ maxWidth: 10000, minHeight: 1, maxHeight: 1 }), background(colors.rule)]}
    />
  );
  return (
    <VStack
      alignment="leading"
      spacing={small ? d.space.xs : d.space.sm}
      modifiers={[
        containerBackground(colors.paper, 'widget'),
        widgetURL(small ? (m.stories[0]?.url ?? d.home) : d.home),
        padding({ horizontal: small ? d.space.smPlus : d.space.md, vertical: d.space.sm }),
        frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }),
      ]}
    >
      <Link
        destination={d.home}
        modifiers={[accessibilityLabel(['zuhd.news', head].filter(Boolean).join(', '))]}
      >
        <HStack spacing={d.space.xs}>
          {env.brandMark ? (
            <Image
              uiImage={env.brandMark}
              modifiers={[
                resizable(),
                aspectRatio({ contentMode: 'fit' }),
                frame({ width: d.size.mark, height: d.size.mark }),
                ...(full && !m.dark ? [colorInvert()] : []),
              ]}
            />
          ) : null}
          {!small || !accessible || !env.brandMark
            ? txt('zuhd.news', d.size.brand, 1, 'title', true)
            : null}
          <Spacer />
          {!small && head ? txt(head, d.size.meta, 1, status ? 'quiet' : 'accent') : null}
        </HStack>
      </Link>
      {rule()}
      {small && status ? txt(status, d.size.meta, 1, 'quiet') : null}
      {m.stories.length === 0 ? txt(m.empty, d.size.headline, 3, 'title', true) : null}
      {m.stories.slice(0, count).map((story, index) => {
        const lead = index === 0;
        const map =
          lead && !small && m.maps && full && !accessible && !env.isLuminanceReduced && story.image;
        const side = large ? 80 : 50;
        return (
          <VStack key={story.url} spacing={large ? d.space.xs : d.space.xxs}>
            {index ? rule() : null}
            <Link destination={story.url}>
              <HStack
                spacing={d.space.sm}
                modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}
              >
                <VStack alignment="leading" spacing={0}>
                  {txt(
                    story.title,
                    lead ? d.size.lead : d.size.headline,
                    small && !accessible ? 4 : 2,
                    'title',
                    lead,
                  )}
                  {small && accessible ? (
                    <>
                      {txt(story.sectionLabel, d.size.meta, 1, 'accent')}
                      {txt(story.ageLabel, d.size.meta, 1, 'quiet')}
                    </>
                  ) : (
                    txt(story.metadata, d.size.meta, 1, 'accent')
                  )}
                </VStack>
                <Spacer />
                {map ? (
                  <Image
                    uiImage={map}
                    modifiers={[
                      resizable(),
                      aspectRatio({ contentMode: 'fill' }),
                      frame({ width: side, height: side }),
                      clipped(),
                      cornerRadius(d.space.xs),
                    ]}
                  />
                ) : null}
              </HStack>
            </Link>
          </VStack>
        );
      })}
      <Spacer minLength={0} />
    </VStack>
  );
}
export default latestNewsWidget(LatestNews);
