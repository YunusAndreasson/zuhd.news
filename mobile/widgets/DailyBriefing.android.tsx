import { Box, Column, getMaterialColors, Image, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import type { WidgetFace } from '../lib/daily-widget';
import {
  type BriefingEnvironment,
  type briefingWidgetDesign,
  dailyBriefingWidget,
} from './daily-briefing-layout';

function DailyBriefing(p: WidgetFace, env: BriefingEnvironment, d: typeof briefingWidgetDesign) {
  'widget';
  const w = env.widthDp ?? 156;
  const h = env.heightDp ?? 156;
  const large = (env.fontScale ?? 1) > 1.45;
  const wide = w >= 280 && h >= 144 && !!p.subject && (env.fontScale ?? 1) < 1.9;
  const dark = env.colorScheme === 'dark';
  const palette = p.wallpaper ? getMaterialColors({ scheme: dark ? 'dark' : 'light' }) : undefined;
  const fg = palette?.onSurface ?? (dark ? '#fafafa' : '#1a1a1a');
  const muted = palette?.onSurface ?? (dark ? '#b3b3b3' : '#626262');
  const paper = palette?.surface ?? (dark ? '#161619' : '#f5f2ed');
  const txt = (value: string, fontSize: number, bold = false, color: string = fg) => (
    <Text
      color={color}
      style={{ fontSize, fontWeight: bold ? 'bold' : 'normal' }}
      maxLines={large ? 2 : 1}
    >
      {value}
    </Text>
  );
  if (!p.date) {
    const arabic = env.language === 'ar';
    const title = arabic ? 'الموجز اليومي' : 'Daily briefing';
    const status = p.loading
      ? arabic
        ? 'جارٍ البحث عن الموجز'
        : 'Checking for briefing'
      : arabic
        ? 'لا يوجد موجز بعد'
        : 'No edition yet';
    const ink = dark ? d.dark : d.light;
    const color = palette?.onSurface ?? ink.textEmphasis;
    const compactText = w < 220 && (env.fontScale ?? 1) > 1.15;
    const inset = large ? d.space.sm : compactText ? d.space.md : d.space.lg;
    return (
      <Column
        modifiers={[
          fillMaxSize(),
          palette
            ? background(palette.surface)
            : {
                $type: 'newsWidgetBackground',
                light: d.light.widgetPaper,
                dark: d.dark.widgetPaper,
              },
          padding(inset, d.space.sm, inset, d.space.sm),
        ]}
      >
        <Row verticalAlignment="center">
          {!compactText ? (
            <>
              <Image
                source={{ uri: 'zuhd_widget_mark' }}
                tint={color}
                modifiers={[width(22), height(22)]}
              />
              <Spacer modifiers={[width(d.space.xs)]} />
            </>
          ) : null}
          <Text
            color={color}
            style={{ fontSize: 14, fontWeight: 'bold' }}
            maxLines={compactText ? 2 : 1}
            modifiers={[
              palette
                ? { $type: 'newsWidgetText' }
                : {
                    $type: 'newsWidgetText',
                    light: d.light.textEmphasis,
                    dark: d.dark.textEmphasis,
                  },
            ]}
          >
            {title}
          </Text>
        </Row>
        <Spacer modifiers={[height(d.space.xs)]} />
        <Spacer
          modifiers={[
            fillMaxWidth(),
            height(1),
            palette
              ? background(color)
              : {
                  $type: 'newsWidgetBackground',
                  light: d.light.rule,
                  dark: d.dark.rule,
                },
          ]}
        />
        <Spacer modifiers={[height(d.space.sm)]} />
        <Text
          color={palette?.onSurface ?? ink.textSecondary}
          style={{ fontSize: 14 }}
          maxLines={2}
          modifiers={[
            fillMaxWidth(),
            palette
              ? { $type: 'newsWidgetText' }
              : {
                  $type: 'newsWidgetText',
                  light: d.light.textSecondary,
                  dark: d.dark.textSecondary,
                },
          ]}
        >
          {status}
        </Text>
      </Column>
    );
  }
  const chart = palette ? p.chartMono : dark ? p.chartDark : p.chartLight;
  const icon = (tint: string) => (
    <Image
      source={{
        uri:
          p.action === 'Listened'
            ? 'briefing_check'
            : p.playable
              ? 'briefing_play'
              : 'briefing_book',
      }}
      tint={tint}
      modifiers={[width(20), height(20)]}
    />
  );
  // Glance only maps start, centre and end arrangements. Reserve the
  // trailing column and footer from this instance's launcher bounds.
  const inner = w - 32;
  if (wide) {
    const chartWidth = w >= 320 && !large && chart ? 82 : 0;
    return (
      <Column modifiers={[fillMaxSize(), background(paper)]}>
        <Column modifiers={[fillMaxWidth(), height(h - 49), padding(16, 12, 16, 0)]}>
          <Row verticalAlignment="center">
            <Box contentAlignment="centerStart" modifiers={[width(inner - 90)]}>
              {txt(p.subject ?? '', 16, true)}
            </Box>
            <Box contentAlignment="centerEnd" modifiers={[width(90)]}>
              {txt(p.date, 12, false, muted)}
            </Box>
          </Row>
          <Row verticalAlignment="center" modifiers={[height(48)]}>
            <Row verticalAlignment="bottom" modifiers={[width(inner - chartWidth)]}>
              {txt(p.value ?? '', 37, true)}
              {w >= 320 && !large ? txt(' at close', 12, false, muted) : null}
            </Row>
            {chartWidth && chart ? (
              <Image source={{ uri: chart }} modifiers={[width(chartWidth), height(42)]} />
            ) : null}
          </Row>
          {p.move && !large ? txt(p.move, 13, false, muted) : null}
        </Column>
        <Spacer modifiers={[fillMaxWidth(), height(1), background(dark ? '#39393b' : '#d6d2cd')]} />
        <Row
          verticalAlignment="center"
          modifiers={[fillMaxWidth(), height(48), padding(16, 0, 16, 0)]}
        >
          <Row verticalAlignment="center" modifiers={[width(inner - 58)]}>
            {icon(fg)}
            <Spacer modifiers={[width(8)]} />
            {txt(p.action ?? 'Daily briefing', 15, true)}
          </Row>
          <Box contentAlignment="centerEnd" modifiers={[width(58)]}>
            {txt(p.minutes ?? '', 13, false, muted)}
          </Box>
        </Row>
      </Column>
    );
  }
  return (
    <Column modifiers={[fillMaxSize(), background(paper)]}>
      <Column
        modifiers={[
          fillMaxWidth(),
          height(h >= 140 && !large ? h - 48 : h),
          padding(16, 10, 12, 0),
        ]}
      >
        {txt(p.date, 13, false, muted)}
        {txt('Daily briefing', 16, true)}
        {p.minutes ? (
          <Row verticalAlignment="bottom">
            {txt(p.minutes.split(' ')[0] ?? '', 36, true)}
            <Spacer modifiers={[width(4)]} />
            {txt('min', 22, true)}
          </Row>
        ) : (
          txt(
            p.playable ? 'Listen' : p.action === 'Audio pending' ? 'Pending' : 'Open edition',
            22,
            true,
          )
        )}
      </Column>
      {h >= 140 && !large ? (
        <Box
          contentAlignment="centerStart"
          modifiers={[fillMaxWidth(), height(48), background(palette?.surface ?? '#161619')]}
        >
          {p.cover && !palette ? (
            <Image source={{ uri: p.cover }} contentScale="crop" modifiers={[fillMaxSize()]} />
          ) : null}
          <Row modifiers={[padding(16, 0, 0, 0)]}>
            {icon(palette?.onSurface ?? 'white')}
            <Spacer modifiers={[width(8)]} />
            {txt(
              p.action === 'Daily briefing' ? 'Listen' : (p.action ?? 'Open edition'),
              14,
              true,
              palette?.onSurface ?? 'white',
            )}
          </Row>
        </Box>
      ) : null}
    </Column>
  );
}
export default dailyBriefingWidget(DailyBriefing);
