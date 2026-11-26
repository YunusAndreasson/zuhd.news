import { Box, Column, getMaterialColors, Image, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import type { briefingFrame } from '../lib/briefing-widget-layout';
import type { WidgetFace } from '../lib/daily-widget';
import {
  type BriefingEnvironment,
  type briefingWidgetDesign,
  dailyBriefingWidget,
} from './daily-briefing-layout';

function DailyBriefing(
  p: WidgetFace,
  env: BriefingEnvironment,
  d: typeof briefingWidgetDesign,
  frame: typeof briefingFrame,
) {
  'widget';
  const w = env.widthDp ?? 156;
  const h = env.heightDp ?? 156;
  const scale = env.fontScale ?? 1;
  const large = scale > 1.45;
  const dark = env.colorScheme === 'dark';
  const palette = p.wallpaper ? getMaterialColors({ scheme: dark ? 'dark' : 'light' }) : undefined;
  const ink = dark ? d.dark : d.light;
  const fg = palette?.onSurface ?? ink.textEmphasis;
  const muted = palette?.onSurface ?? ink.textSecondary;
  const paper = palette?.surface ?? ink.widgetPaper;
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
  const cover = palette ? undefined : p.cover;
  const { wide, body, footer, artwork, showHeading, showDuration } = frame(
    w,
    h,
    scale,
    !!p.subject,
    !!cover,
  );
  const inner = w - 2 * d.space.md;
  const chartWidth = wide && w >= 320 && !large && chart ? 82 : 0;
  const action =
    p.playable && (!p.action || p.action === 'Daily briefing')
      ? 'Listen'
      : (p.action ?? 'Open edition');
  return (
    <Column modifiers={[fillMaxSize(), background(paper)]}>
      {wide ? (
        <Column modifiers={[fillMaxWidth(), height(body), padding(d.space.md, 12, d.space.md, 0)]}>
          <Row verticalAlignment="center">
            <Box contentAlignment="centerStart" modifiers={[width(inner - 90)]}>
              {txt(p.subject ?? '', 16, true)}
            </Box>
            <Box contentAlignment="centerEnd" modifiers={[width(90)]}>
              {txt(p.date, 12, false, muted)}
            </Box>
          </Row>
          <Row verticalAlignment="center" modifiers={[height(Math.ceil(48 * scale))]}>
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
      ) : (
        <Column modifiers={[fillMaxWidth(), height(body), padding(d.space.md, 10, d.space.md, 0)]}>
          {txt(p.date, 13, false, muted)}
          {showHeading ? txt('Daily briefing', 16, true) : null}
          {showDuration && p.minutes ? (
            <Row verticalAlignment="bottom">
              {txt(p.minutes.split(' ')[0] ?? '', 36, true)}
              <Spacer modifiers={[width(d.space.xs)]} />
              {txt('min', 22, true)}
            </Row>
          ) : null}
        </Column>
      )}
      {cover && artwork ? (
        <Image
          source={{ uri: cover }}
          contentScale="crop"
          modifiers={[width(w), height(artwork)]}
        />
      ) : null}
      <Spacer modifiers={[fillMaxWidth(), height(1), background(ink.rule)]} />
      <Row
        verticalAlignment="center"
        modifiers={[
          fillMaxWidth(),
          height(footer),
          background(paper),
          padding(d.space.md, 0, d.space.md, 0),
        ]}
      >
        <Row verticalAlignment="center" modifiers={[width(wide ? inner - 58 : inner)]}>
          {icon(fg)}
          <Spacer modifiers={[width(d.space.sm)]} />
          {txt(action, 15, true)}
        </Row>
        {wide ? (
          <Box contentAlignment="centerEnd" modifiers={[width(58)]}>
            {txt(p.minutes ?? '', 13, false, muted)}
          </Box>
        ) : null}
      </Row>
    </Column>
  );
}
export default dailyBriefingWidget(DailyBriefing);
