import { Canvas, Path, Rect, Skia } from '@shopify/react-native-skia';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { memo, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import {
  type BlockVariant,
  blockContainerStyle,
  blockSharedStyles,
  useChartDrawProgress,
} from './shared';

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;
const CHART_HEIGHT = 200;
const NODE_WIDTH = 8;
const NODE_PADDING = 12;
const NODE_LABEL_PAD = 4;

interface SankeyNode {
  id: string;
  label: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
  label?: string;
}

interface SankeyBlockProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  label?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

interface LaidOutNode extends SankeyNode {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depth: number;
}

interface LaidOutLink {
  source: LaidOutNode;
  target: LaidOutNode;
  value: number;
  width: number;
  y0: number;
  y1: number;
  label?: string;
}

export const SankeyBlock = memo(function SankeyBlock({
  nodes,
  links,
  label,
  variant = 'article',
  sourceLabel,
}: SankeyBlockProps) {
  const { colors } = useTheme();
  const progress = useChartDrawProgress();
  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  // Horizontal room reserved for node labels at each side of the diagram.
  // 60px keeps the diagram itself dominant on a 360px viewport (>50% of the
  // canvas width) while still fitting ~8 chars at labelXs; longer node names
  // wrap to a second line via numberOfLines={2} on the label View below.
  const labelInset = 60;

  const layout = useMemo(() => {
    if (width <= 0 || nodes.length === 0 || links.length === 0) return null;
    try {
      const sk = sankey<SankeyNode, SankeyLink>()
        .nodeId((d) => d.id)
        .nodeWidth(NODE_WIDTH)
        .nodePadding(NODE_PADDING)
        .extent([
          [labelInset, 4],
          [width - labelInset, CHART_HEIGHT - 4],
        ]);
      // Clone inputs — sankey mutates objects in place.
      const nodesCopy = nodes.map((n) => ({ ...n }));
      const linksCopy = links.map((l) => ({ ...l }));
      const out = sk({ nodes: nodesCopy, links: linksCopy });
      const linkPathBuilder = sankeyLinkHorizontal();
      const laidLinks = (out.links as LaidOutLink[]).map((l) => {
        const d = linkPathBuilder(l as never) ?? '';
        const path = Skia.Path.MakeFromSVGString(d) ?? Skia.PathBuilder.Make().detach();
        return { l, path };
      });
      return {
        nodes: out.nodes as LaidOutNode[],
        links: laidLinks,
      };
    } catch {
      return null;
    }
  }, [nodes, links, width]);

  if (!layout) {
    if (width <= 0) {
      // Layout pass — register the layout listener and bail. Re-renders once
      // we have a real width.
      return (
        <View style={blockContainerStyle[variant]}>
          {label ? (
            <Text variant="labelSm" style={blockSharedStyles.label}>
              {label}
            </Text>
          ) : null}
          <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={[blockSharedStyles.chartWrap, { height: CHART_HEIGHT }]}
          />
        </View>
      );
    }
    return null;
  }

  // Pick label side per node by depth: leftmost column draws labels to the
  // right of the node, rightmost to the left, anything in between to the
  // right (which is the most common case in a 2-column flow).
  const maxDepth = Math.max(...layout.nodes.map((n) => n.depth ?? 0));
  const labelSide = (n: LaidOutNode): 'left' | 'right' =>
    n.depth === maxDepth && maxDepth > 0 ? 'left' : 'right';

  return (
    <View style={blockContainerStyle[variant]}>
      {label ? (
        <Text variant="labelSm" style={blockSharedStyles.label}>
          {label}
        </Text>
      ) : null}

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[blockSharedStyles.chartWrap, { height: CHART_HEIGHT }]}
      >
        <Canvas style={{ width, height: CHART_HEIGHT }}>
          {/* Links — translucent ribbons, drawn first so nodes overlay them */}
          {layout.links.map((entry, i) => (
            <Path
              key={`link-${i}`}
              path={entry.path}
              style="stroke"
              strokeWidth={Math.max(1, entry.l.width ?? 1)}
              color={colors.accent}
              opacity={0.28}
              start={0}
              end={progress}
            />
          ))}
          {/* Nodes — solid emphasis rectangles. */}
          {layout.nodes.map((n, i) => (
            <Rect
              key={`node-${n.id}-${i}`}
              x={n.x0}
              y={n.y0}
              width={Math.max(2, n.x1 - n.x0)}
              height={Math.max(1, n.y1 - n.y0)}
              color={colors.textEmphasis}
              opacity={0.9}
            />
          ))}
        </Canvas>

        {/* Node labels rendered as RNText overlays so we get system font
            metrics (Skia Text is more work and the labels don't need to live
            inside the canvas). */}
        {layout.nodes.map((n, i) => {
          const side = labelSide(n);
          const ny = (n.y0 + n.y1) / 2 - 8;
          return (
            <View
              key={`label-${n.id}-${i}`}
              pointerEvents="none"
              style={[
                styles.nodeLabel,
                side === 'left'
                  ? { right: width - n.x0 + NODE_LABEL_PAD, alignItems: 'flex-end' }
                  : { left: n.x1 + NODE_LABEL_PAD },
                { top: ny, width: labelInset - NODE_LABEL_PAD },
              ]}
            >
              <Text
                variant="labelXs"
                numberOfLines={2}
                style={side === 'left' ? styles.labelTextRight : styles.labelTextLeft}
              >
                {n.label}
              </Text>
            </View>
          );
        })}
      </View>

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  nodeLabel: {
    position: 'absolute',
  },
  labelTextLeft: {
    textAlign: 'left',
  },
  labelTextRight: {
    textAlign: 'right',
  },
});
