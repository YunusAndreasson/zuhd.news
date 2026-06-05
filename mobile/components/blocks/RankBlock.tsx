import { displayNameFromCode } from '@shared/countries/iso';
import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import { extent } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { memo, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import {
  type BlockVariant,
  blockContainerStyle,
  blockSharedStyles,
  formatBlockNumber,
} from './shared';

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;
const STRIP_HEIGHT = 64;
const STRIP_PAD_X = 16;
const PEER_DOT_R = 3;
const SUBJECT_DOT_R = 6;
const AXIS_TICK_LEN = 4;

interface Peer {
  cc?: string;
  label?: string;
  value: number;
}

interface RankBlockProps {
  metric: string;
  unit?: string;
  subjectCc?: string;
  subjectLabel?: string;
  peers: Peer[];
  variant?: BlockVariant;
  sourceLabel?: string;
}

export const RankBlock = memo(function RankBlock({
  metric,
  unit,
  subjectCc,
  subjectLabel,
  peers,
  variant = 'article',
  sourceLabel,
}: RankBlockProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  const cleanPeers = useMemo(
    () =>
      peers.filter(
        (p): p is Peer =>
          typeof p?.value === 'number' && Number.isFinite(p.value) && (!!p.cc || !!p.label),
      ),
    [peers],
  );

  const subject = useMemo(() => {
    if (subjectCc) {
      const cc = subjectCc.toUpperCase();
      return cleanPeers.find((p) => p.cc?.toUpperCase() === cc) ?? null;
    }
    if (subjectLabel) {
      return cleanPeers.find((p) => p.label === subjectLabel) ?? null;
    }
    return null;
  }, [cleanPeers, subjectCc, subjectLabel]);

  const { scale, lo, hi, rank, total } = useMemo(() => {
    if (cleanPeers.length === 0 || width <= 0) {
      return { scale: null, lo: 0, hi: 0, rank: 0, total: 0 };
    }
    const values = cleanPeers.map((p) => p.value);
    const [eLo, eHi] = extent(values) as [number, number];
    const safeLo = eLo ?? 0;
    const safeHi = eHi ?? 1;
    const domain: [number, number] =
      safeLo === safeHi ? [safeLo - 1, safeHi + 1] : [safeLo, safeHi];
    const s = scaleLinear()
      .domain(domain)
      .range([STRIP_PAD_X, width - STRIP_PAD_X]);
    // Rank = 1 + count of peers with value strictly higher than the subject
    // (i.e. dense ranking from the top). Returns 0 if subject not found.
    let r = 0;
    if (subject) {
      const above = cleanPeers.filter((p) => p.value > subject.value).length;
      r = above + 1;
    }
    return { scale: s, lo: safeLo, hi: safeHi, rank: r, total: cleanPeers.length };
  }, [cleanPeers, subject, width]);

  if (cleanPeers.length === 0) return null;

  const axisY = STRIP_HEIGHT * 0.6;

  return (
    <View style={blockContainerStyle[variant]}>
      <View style={styles.headerRow}>
        <Text variant="labelSm" style={styles.metric}>
          {metric}
        </Text>
        {subject && rank > 0 ? (
          <Text variant="labelSm" tone="accent">
            {`#${rank} OF ${total}`}
          </Text>
        ) : null}
      </View>

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[blockSharedStyles.chartWrap, { height: STRIP_HEIGHT }]}
      >
        {scale && width > 0 ? (
          <Canvas style={{ width, height: STRIP_HEIGHT }}>
            {/* Axis line */}
            <Line
              p1={vec(STRIP_PAD_X, axisY)}
              p2={vec(width - STRIP_PAD_X, axisY)}
              color={colors.textSecondary}
              opacity={0.4}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            {/* Min/max ticks */}
            <Line
              p1={vec(STRIP_PAD_X, axisY - AXIS_TICK_LEN)}
              p2={vec(STRIP_PAD_X, axisY + AXIS_TICK_LEN)}
              color={colors.textSecondary}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            <Line
              p1={vec(width - STRIP_PAD_X, axisY - AXIS_TICK_LEN)}
              p2={vec(width - STRIP_PAD_X, axisY + AXIS_TICK_LEN)}
              color={colors.textSecondary}
              strokeWidth={StyleSheet.hairlineWidth}
            />
            {/* Peer dots */}
            {cleanPeers.map((p, i) => {
              const x = scale(p.value);
              const isSubject = subject != null && p === subject;
              return isSubject ? null : (
                <Circle
                  key={`peer-${p.cc ?? p.label}-${i}`}
                  cx={x}
                  cy={axisY}
                  r={PEER_DOT_R}
                  color={colors.textSecondary}
                  opacity={0.7}
                />
              );
            })}
            {/* Subject dot — accent + ring for prominence */}
            {subject ? (
              <>
                <Circle
                  cx={scale(subject.value)}
                  cy={axisY}
                  r={SUBJECT_DOT_R + 4}
                  color={colors.accent}
                  opacity={0.18}
                />
                <Circle
                  cx={scale(subject.value)}
                  cy={axisY}
                  r={SUBJECT_DOT_R}
                  color={colors.accent}
                />
              </>
            ) : null}
          </Canvas>
        ) : null}

        {/* Min/max labels positioned beneath the ticks. */}
        <View pointerEvents="none" style={styles.axisLabels}>
          <Text variant="labelXs" tone="secondary" style={styles.axisLabelLeft}>
            {formatBlockNumber(lo, unit)}
          </Text>
          <Text variant="labelXs" tone="secondary" style={styles.axisLabelRight}>
            {formatBlockNumber(hi, unit)}
          </Text>
        </View>

        {/* Subject value label above the dot. Width is wide enough to fit
            "Country Name · 1,234 unit" without clipping; centered on the dot
            and clamped inside the canvas at both edges. */}
        {subject && scale
          ? (() => {
              const subjectLabelW = 180;
              return (
                <View
                  pointerEvents="none"
                  style={[
                    styles.subjectLabel,
                    {
                      width: subjectLabelW,
                      left: Math.max(
                        0,
                        Math.min(width - subjectLabelW, scale(subject.value) - subjectLabelW / 2),
                      ),
                    },
                  ]}
                >
                  <Text
                    variant="labelXs"
                    tone="accent"
                    numberOfLines={1}
                    style={styles.subjectLabelText}
                  >
                    {`${subject.cc ? `${ccToFlag(subject.cc)} ${displayNameFromCode(subject.cc) ?? subject.cc.toUpperCase()}` : (subject.label ?? '')} · ${formatBlockNumber(subject.value, unit)}`}
                  </Text>
                </View>
              );
            })()
          : null}
      </View>

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: SPACING.xs,
  },
  metric: {
    flex: 1,
  },
  axisLabels: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabelLeft: {
    paddingLeft: 0,
  },
  axisLabelRight: {
    paddingRight: 0,
  },
  subjectLabel: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  subjectLabelText: {
    textAlign: 'center',
  },
});
