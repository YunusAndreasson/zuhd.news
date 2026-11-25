import { Column, Image, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
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
  const { colors, stories, status, android } = m;
  const { small, large, inset, inner, header, count, row, lead, scale } = android;
  type Ink = 'title' | 'accent' | 'quiet';
  const tone = (role: Ink | 'paper' | 'rule') =>
    m.followsSystem ? { light: d.ink.light[role], dark: d.ink.dark[role] } : {};
  const surface = (role: 'paper' | 'rule') =>
    m.followsSystem ? { $type: 'newsWidgetBackground', ...tone(role) } : background(colors[role]);
  const txt = (value: string, size: number, lines: number, ink: Ink, strong = false) => (
    <Text
      color={colors[ink]}
      maxLines={lines}
      modifiers={[fillMaxWidth(), { $type: 'newsWidgetText', ...tone(ink) }]}
      style={{ fontSize: size, fontWeight: strong ? 'bold' : 'normal' }}
    >
      {value}
    </Text>
  );
  const rule = () => <Spacer modifiers={[fillMaxWidth(), height(1), surface('rule')]} />;
  const link = (url: string, label: string) =>
    env.preview ? { $type: 'previewLabel', label } : { $type: 'newsWidgetLink', url, label };
  const masthead = status || (small ? '' : m.sectionName);
  const showSection = !!masthead && !small && !env.editWidgetId;
  const showWordmark = scale <= 1.4 || (!small && !showSection);
  const headerWidth = inner - (env.editWidgetId ? 44 : 0);
  const afterMark = headerWidth - d.size.mark;
  const wordmarkWidth = showSection ? d.space.xxl + d.space.xl : afterMark - d.space.xxs;
  return (
    <Column
      modifiers={[fillMaxSize(), surface('paper'), padding(inset, d.space.sm, inset, d.space.sm)]}
    >
      <Row verticalAlignment="center" modifiers={[fillMaxWidth(), height(header - 1)]}>
        <Row
          verticalAlignment="center"
          modifiers={[
            width(headerWidth),
            height(header - 1),
            link(d.home, ['zuhd.news', masthead].filter(Boolean).join(', ')),
          ]}
        >
          <Image
            source={{ uri: 'zuhd_widget_mark' }}
            tint={colors.title}
            modifiers={[width(d.size.mark), height(d.size.mark)]}
          />
          {showWordmark ? (
            <>
              <Spacer modifiers={[width(d.space.xxs)]} />
              <Column modifiers={[width(wordmarkWidth)]}>
                {txt('zuhd.news', d.size.brand, 1, 'title', true)}
              </Column>
            </>
          ) : null}
          {showSection ? (
            <>
              <Spacer modifiers={[width(d.space.sm)]} />
              <Column
                modifiers={[
                  width(afterMark - d.space.sm - (showWordmark ? wordmarkWidth + d.space.xxs : 0)),
                ]}
              >
                {txt(masthead, d.size.meta, 1, status ? 'quiet' : 'accent')}
              </Column>
            </>
          ) : null}
        </Row>
        {env.editWidgetId ? (
          <Column
            verticalArrangement="center"
            modifiers={[
              width(44),
              height(header - 1),
              { $type: 'newsWidgetEdit', label: m.edit, id: String(env.editWidgetId) },
            ]}
          >
            {txt(m.edit, d.size.meta, 1, 'accent')}
          </Column>
        ) : null}
      </Row>
      {rule()}
      {(small || env.editWidgetId) && status ? txt(status, d.size.meta, 1, 'quiet') : null}
      {stories.length === 0 ? (
        <Column modifiers={[fillMaxWidth(), padding(0, d.space.md, 0, 0), link(d.home, m.empty)]}>
          {txt(m.empty, d.size.headline, 3, 'title', true)}
        </Column>
      ) : null}
      {stories.slice(0, count).map((story, index) => {
        const first = index === 0;
        const available = first ? lead : row;
        const showMap = first && !small && m.maps && !!story.image && scale < 1.5;
        const mapWidth = Math.round(inner * (large ? 0.35 : 0.24));
        const headlineSize = small || first ? d.size.lead : d.size.headline;
        const showMeta = android.hasMetadata(available);
        const lines = android.lines(available, headlineSize, showMeta);
        return (
          <Column key={story.url}>
            {index ? rule() : null}
            <Row
              verticalAlignment="center"
              modifiers={[
                fillMaxWidth(),
                height(available - (index ? 1 : 0)),
                link(story.url, `${story.title}, ${story.metadata}`),
              ]}
            >
              <Column modifiers={[width(showMap ? inner - mapWidth - d.space.sm : inner)]}>
                {txt(story.title, headlineSize, lines, 'title', first)}
                {showMeta ? (
                  <>
                    <Spacer modifiers={[height(d.space.xxs)]} />
                    {android.splitMetadata ? (
                      <>
                        {txt(story.sectionLabel, d.size.meta, 1, 'accent')}
                        {txt(story.ageLabel, d.size.meta, 1, 'quiet')}
                      </>
                    ) : (
                      txt(story.metadata, d.size.meta, 1, 'accent')
                    )}
                  </>
                ) : null}
              </Column>
              {showMap && story.image ? (
                <>
                  <Spacer modifiers={[width(d.space.sm)]} />
                  <Image
                    source={{ uri: story.image }}
                    contentScale="crop"
                    modifiers={[
                      width(mapWidth),
                      height(Math.min(available - d.space.sm, mapWidth)),
                      cornerRadius(d.space.xs),
                    ]}
                  />
                </>
              ) : null}
            </Row>
          </Column>
        );
      })}
    </Column>
  );
}
export default latestNewsWidget(LatestNews);
