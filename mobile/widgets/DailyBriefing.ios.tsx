import { HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  aspectRatio,
  background,
  clipped,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  privacySensitive,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WidgetFace } from '../lib/daily-widget';

function DailyBriefing(props: WidgetFace, env: WidgetEnvironment & { largeText?: boolean }) {
  'widget';
  const family = env.widgetFamily;
  const dark = env.colorScheme === 'dark';
  const full = !env.widgetRenderingMode || env.widgetRenderingMode === 'fullColor';
  const photo = full && !env.isLuminanceReduced && env.levelOfDetail !== 'simplified';
  const ink = dark ? '#FAFAFA' : '#1a1a1a';
  const paper = dark ? '#161619' : '#f5f2ed';
  const quiet = dark ? '#b3b3b3' : '#626262';
  const wide = family === 'systemMedium' && !!props.subject && !env.largeText;
  const publicAction = props.publicAction ?? 'Open zuhd.news';
  const name = props.example ? 'Example' : 'Daily briefing';
  const date = props.example && !wide ? 'Example · 22 Nov 2026' : props.date;
  const title = props.loading ? 'Checking edition' : publicAction;
  const modifiers = [
    containerBackground(paper, 'widget'),
    ...(!props.example ? [widgetURL(props.url ?? 'zuhd-news:///widget/open')] : []),
    accessibilityElement('ignore'),
    accessibilityLabel(
      (wide
        ? (props.closeLabel ?? '') +
          ' ' +
          (publicAction === 'Daily briefing' && props.action !== publicAction
            ? (props.publicLabel ?? '')
            : (props.privateLabel ?? ''))
        : props.publicLabel) || title,
    ),
  ];
  const inkMods = full ? [foregroundStyle(ink)] : [];
  const txt = (s: string, size: number, bold = false, muted = false) => (
    <Text
      modifiers={[
        font({ family: bold ? 'SourceSans3-SemiBold' : 'SourceSans3-Regular', size }),
        ...(full ? [foregroundStyle(muted ? quiet : ink)] : []),
      ]}
    >
      {s}
    </Text>
  );
  if (family === 'accessoryInline')
    return (
      <Text modifiers={modifiers}>
        {[name, props.shortDate, props.minutes].filter(Boolean).join(' · ')}
      </Text>
    );
  if (family === 'accessoryCircular')
    return (
      <VStack spacing={0} modifiers={modifiers}>
        {props.minutes ? (
          <Text modifiers={[font({ size: 19, weight: 'semibold' })]}>{props.minutes}</Text>
        ) : (
          <Image systemName="headphones" size={18} />
        )}
        {props.example ? <Text modifiers={[font({ size: 10 })]}>Example</Text> : null}
        <Text modifiers={[font({ size: 11 })]}>{props.shortDate ?? 'Briefing'}</Text>
      </VStack>
    );
  if (family === 'accessoryRectangular')
    return (
      <VStack alignment="leading" spacing={2} modifiers={modifiers}>
        <HStack spacing={4}>
          <Image systemName="headphones" size={13} />
          <Text>{name}</Text>
        </HStack>
        <Text modifiers={[font({ size: 19, weight: 'semibold' })]}>
          {[props.shortDate, props.minutes].filter(Boolean).join(' · ') || title}
        </Text>
      </VStack>
    );
  if (!date)
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          ...modifiers,
          padding({ all: 16 }),
          frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'leading' }),
        ]}
      >
        <Image systemName="book" size={16} />
        {txt(name, 18, true)}
        {txt(title, 14, false, true)}
      </VStack>
    );
  if (wide) {
    const chart = full ? (dark ? props.chartDark : props.chartLight) : props.chartMono;
    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[
          ...modifiers,
          privacySensitive(props.action === 'Listened' || props.action === 'Audio saved'),
          frame({ maxWidth: 10000, maxHeight: 10000 }),
        ]}
      >
        <VStack alignment="leading" spacing={1} modifiers={[padding({ horizontal: 16, top: 10 })]}>
          <HStack>
            {txt(props.subject ?? '', 16, true)}
            <Spacer />
            {txt(date, 13, false, true)}
          </HStack>
          <HStack spacing={4}>
            {txt(props.value ?? '', 40, true)}
            {txt('at close', 13, false, true)}
            <Spacer />
            {chart ? (
              <Image uiImage={chart} modifiers={[resizable(), frame({ width: 93, height: 42 })]} />
            ) : null}
          </HStack>
          {props.move ? txt(props.move, 13, false, true) : null}
        </VStack>
        <Spacer />
        <Spacer
          modifiers={[
            frame({ maxWidth: 10000, minHeight: 1, maxHeight: 1 }),
            background(dark ? '#39393b' : '#d6d2cd'),
          ]}
        />
        <HStack spacing={8} modifiers={[padding({ horizontal: 16 }), frame({ height: 45 })]}>
          <Image
            systemName={
              props.action === 'Listened'
                ? 'checkmark.circle.fill'
                : props.playable
                  ? 'play.circle.fill'
                  : 'book.circle'
            }
            size={24}
            modifiers={inkMods}
          />
          {txt(props.example ? 'Example' : (props.action ?? name), 15, true)}
          <Spacer />
          {txt(props.minutes ?? '', 13, false, true)}
        </HStack>
      </VStack>
    );
  }
  const bottom = props.example
    ? 'Example'
    : props.playable
      ? 'Listen'
      : props.date
        ? 'Open edition'
        : title;
  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[...modifiers, frame({ maxWidth: 10000, maxHeight: 10000 })]}
    >
      <VStack alignment="leading" spacing={0} modifiers={[padding({ horizontal: 16, top: 10 })]}>
        {txt(date, 13, false, true)}
        {txt('Daily briefing', 16, true)}
        {props.minutes ? (
          <HStack alignment="firstTextBaseline" spacing={4}>
            {txt(props.minutes.split(' ')[0] ?? '', photo ? 39 : 42, true)}
            {txt('min', 23, true)}
          </HStack>
        ) : (
          txt(
            props.playable
              ? 'Listen'
              : props.action === 'Audio pending'
                ? 'Pending'
                : 'Open edition',
            23,
            true,
          )
        )}
      </VStack>
      <Spacer />
      <ZStack
        alignment="leading"
        modifiers={[frame({ maxWidth: 10000, minHeight: 46, maxHeight: 46 }), clipped()]}
      >
        {photo && props.cover ? (
          <Image
            uiImage={props.cover}
            modifiers={[
              resizable(),
              aspectRatio({ contentMode: 'fill' }),
              frame({ maxWidth: 10000, minHeight: 46, maxHeight: 46 }),
              clipped(),
            ]}
          />
        ) : null}
        <HStack
          spacing={6}
          modifiers={[
            padding({ horizontal: 16 }),
            ...(photo && props.cover ? [foregroundStyle('white')] : inkMods),
          ]}
        >
          <Image systemName={props.playable ? 'play.fill' : 'book'} size={12} />
          <Text>{bottom}</Text>
        </HStack>
      </ZStack>
    </VStack>
  );
}
export default createWidget('DailyBriefing', DailyBriefing, {});
