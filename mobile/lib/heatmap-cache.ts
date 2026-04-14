import { File, Paths } from 'expo-file-system';
import type { HeatmapPoint } from '../types';
import { readJsonCache } from './json-cache';

interface HeatmapCache {
  generated: string;
  points: HeatmapPoint[];
}

const HEATMAP_FILE = new File(Paths.cache, 'zuhd-heatmap.json');

export function writeHeatmapCache(data: HeatmapCache): void {
  const json = JSON.stringify(data);
  setTimeout(() => {
    try {
      HEATMAP_FILE.write(json);
    } catch {}
  }, 0);
}

export async function readHeatmapCache(): Promise<HeatmapCache | null> {
  return readJsonCache<HeatmapCache>(HEATMAP_FILE);
}
