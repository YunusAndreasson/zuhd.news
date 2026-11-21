import { Skia } from 'react-native-skia';

/** The part of `Skia.gpu` that says whether a canvas can draw at all. */
export interface GpuReading {
  isAvailable: boolean;
  backend: string;
}

/**
 * Whether this device has no GPU Skia can draw with, for the life of the
 * process: Dawn found no adapter meeting WebGPU's core requirements (no
 * Vulkan 1.1 driver, or one that falls short of them, as on a OnePlus 8 Pro
 * on Android 11). Every canvas then stays blank, and every GPU call throws.
 *
 * A lost device is not missing: it reads `isAvailable` false with its backend
 * still named while react-native-skia replaces it, as iOS does to an app in
 * the background.
 */
export function gpuMissing(gpu: GpuReading | null | undefined): boolean {
  return gpu != null && !gpu.isAvailable && gpu.backend === '';
}

/** `Skia.gpu`, or null where there is none to read. The first read in the
 *  process probes the GPU on the calling thread. */
export function readSkiaGpu(): GpuReading | null {
  try {
    return Skia.gpu;
  } catch {
    return null;
  }
}
