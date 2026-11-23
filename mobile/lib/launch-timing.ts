/** Local Performance timeline. Opt in on a minified Metro run with
 *  EXPO_PUBLIC_LAUNCH_TIMING=1, where __DEV__ is false. */
export function markLaunch(stage: string, detail?: Record<string, number>): void {
  if (
    (typeof __DEV__ !== 'undefined' && __DEV__) ||
    process.env.EXPO_PUBLIC_LAUNCH_TIMING === '1'
  ) {
    performance.mark?.(`zuhd.launch.${stage}`, { detail });
  }
}
