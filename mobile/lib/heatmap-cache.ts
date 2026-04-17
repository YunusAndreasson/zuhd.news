import { createJsonCache } from './json-cache';
import { type HeatmapResponse, isHeatmapResponse } from './validate';

const heatmapCache = createJsonCache<HeatmapResponse>('zuhd-heatmap.json', isHeatmapResponse);

export const readHeatmapCache = heatmapCache.read;
export const writeHeatmapCache = heatmapCache.write;
