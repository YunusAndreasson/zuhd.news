import type { File } from 'expo-file-system';

export async function readJsonCache<T>(file: File): Promise<T | null> {
  try {
    if (!file.exists) return null;
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
