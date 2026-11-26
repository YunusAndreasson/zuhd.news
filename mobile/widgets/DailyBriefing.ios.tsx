import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
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
  layoutPriority,
  padding,
  privacySensitive,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetFace } from '../lib/daily-widget';
import {
  type BriefingEnvironment,
  type briefingWidgetDesign,
  dailyBriefingWidget,
} from './daily-briefing-layout';

function DailyBriefing(
  props: WidgetFace,
  env: BriefingEnvironment,
  d: typeof briefingWidgetDesign,
) {
  'widget';
  const family = env.widgetFamily;
  const dark = env.colorScheme === 'dark';
  const full = !env.widgetRenderingMode || env.widgetRenderingMode === 'fullColor';
  const photo = full && !env.isLuminanceReduced && env.levelOfDetail !== 'simplified';
  const theme = dark ? d.dark : d.light;
  const { textEmphasis: ink, widgetPaper: paper, textSecondary: quiet, rule } = theme;
  const wide = family === 'systemMedium' && !!props.subject && !env.largeText;
  const publicAction = props.publicAction ?? 'Open zuhd.news';
  const arabic = env.language === 'ar';
  const name = props.example
    ? 'Example'
    : arabic && !props.date
      ? 'الموجز اليومي'
      : 'Daily briefing';
  const date = props.example && !wide ? 'Example · 22 Nov 2026' : props.date;
  const title = props.loading
    ? arabic
      ? 'جارٍ البحث عن الموجز'
      : 'Checking for briefing'
    : arabic
      ? 'لا يوجد موجز بعد'
      : 'No edition yet';
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
        : props.publicLabel) || `${name}, ${title}`,
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
        <Text modifiers={[font({ size: 11 })]}>
          {props.shortDate ??
            (props.loading
              ? arabic
                ? 'جارٍ التحميل'
                : 'Checking'
              : arabic
                ? 'الموجز'
                : 'Briefing')}
        </Text>
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
        spacing={d.space.xs}
        modifiers={[
          ...modifiers,
          padding({ all: d.space.lg }),
          frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }),
        ]}
      >
        <HStack spacing={d.space.xs}>
          {!env.largeText ? <Image systemName="headphones" size={16} modifiers={inkMods} /> : null}
          {txt(name, 14, true)}
        </HStack>
        <Spacer
          modifiers={[
            frame({ maxWidth: 10000, minHeight: 1, maxHeight: 1 }),
            background(dark ? d.dark.rule : d.light.rule),
          ]}
        />
        {txt(title, 14, false, true)}
      </VStack>
    );
  const action = props.example
    ? 'Example'
    : props.playable && (!props.action || props.action === 'Daily briefing')
      ? 'Listen'
      : (props.action ?? 'Open edition');
  const footer = (
    <VStack alignment="leading" spacing={0} modifiers={[layoutPriority(1)]}>
      <Spacer
        modifiers={[frame({ maxWidth: 10000, minHeight: 1, maxHeight: 1 }), background(rule)]}
      />
      <HStack
        spacing={d.space.sm}
        modifiers={[
          padding({ horizontal: d.space.md, vertical: d.space.xs }),
          frame({ minHeight: 40 }),
        ]}
      >
        <Image
          systemName={
            props.action === 'Listened'
              ? 'checkmark.circle.fill'
              : props.playable
                ? 'play.circle.fill'
                : 'book.circle'
          }
          size={20}
          modifiers={inkMods}
        />
        <Text
          modifiers={[
            font({ family: 'SourceSans3-SemiBold', size: 15, textStyle: 'callout' }),
            ...inkMods,
          ]}
        >
          {action}
        </Text>
        <Spacer minLength={0} />
        {wide ? txt(props.minutes ?? '', 13, false, true) : null}
      </HStack>
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
        <Spacer minLength={0} />
        {footer}
      </VStack>
    );
  }
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
        ) : null}
      </VStack>
      <Spacer minLength={0} />
      {photo && !env.largeText && props.cover ? (
        <Image
          uiImage={props.cover}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: 'fill' }),
            frame({ maxWidth: 10000, minHeight: 26, maxHeight: 26 }),
            clipped(),
          ]}
        />
      ) : null}
      {footer}
    </VStack>
  );
}
export default dailyBriefingWidget(DailyBriefing);
