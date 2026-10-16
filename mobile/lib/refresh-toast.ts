import { formatTimeAgo } from './article-utils';

/**
 * The toast a failed refresh leaves: what failed, how old the stories on the
 * screen are, and that a tap tries again. Offline, the stories on the screen
 * are all the reader will get until the connection returns, so they are told
 * their age. `generated` is the build the screen holds (the feed's stamp).
 */
export function refreshFailedToast(offline: boolean, generated: string | null): string {
  const built = generated ? Date.parse(generated) : Number.NaN;
  const ago = Number.isFinite(built) ? formatTimeAgo(built) : null;
  return [
    offline ? 'No connection' : 'Could not refresh',
    ago && ago !== 'now' ? `updated ${ago}` : null,
    'tap to try again',
  ]
    .filter(Boolean)
    .join(' · ');
}
