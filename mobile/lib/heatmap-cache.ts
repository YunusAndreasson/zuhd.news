import { File, Paths } from 'expo-file-system';
import type { HeatmapPoint } from '../types';

interface HeatmapCache {
  generated: string;
  points: HeatmapPoint[];
}

const HEATMAP_FILE = new File(Paths.cache, 'zuhd-heatmap.json');

export function writeHeatmapCache(data: HeatmapCache): void {
  HEATMAP_FILE.write(JSON.stringify(data));
}

export async function readHeatmapCache(): Promise<HeatmapCache | null> {
  try {
    if (!HEATMAP_FILE.exists) return null;
    const text = await HEATMAP_FILE.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
