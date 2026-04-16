import type { HeatmapPoint } from '../types';
import { createJsonCache } from './json-cache';

interface HeatmapCache {
  generated: string;
  points: HeatmapPoint[];
}

const heatmapCache = createJsonCache<HeatmapCache>('zuhd-heatmap.json');

export const readHeatmapCache = heatmapCache.read;
export const writeHeatmapCache = heatmapCache.write;
