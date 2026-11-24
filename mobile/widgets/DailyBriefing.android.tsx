import { Box, Column, getMaterialColors, Image, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetFace } from '../lib/daily-widget';

function DailyBriefing(
  p: WidgetFace,
  env: WidgetEnvironment & {
    widthDp?: number;
    heightDp?: number;
    fontScale?: number;
  },
) {
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
  if (!p.date)
    return (
      <Column
        verticalArrangement="center"
        modifiers={[fillMaxSize(), background(paper), padding(16, 16, 16, 16)]}
      >
        {txt('Daily briefing', 18, true)}
        {txt(p.loading ? 'Checking edition' : 'Open zuhd.news', 14, false, muted)}
      </Column>
    );
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
export default createWidget('DailyBriefing', DailyBriefing, {});
