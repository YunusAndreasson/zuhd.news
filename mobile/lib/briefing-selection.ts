import type { FeedResponse } from '@shared/types';
import type { Edition } from './daily-widget';

export type PlaybackRequest =
  | {
      source: 'widget' | 'widget_preview';
      revision: string;
      audio: NonNullable<Edition['audio']>;
      close?: Edition['close'];
      localOnly: boolean;
      serial: number;
    }
  | { source: 'withdrawn'; date: string; recorded: string }
  | {
      source: 'briefing_push';
      date: string;
      recorded?: string;
      serial: number;
    };

export function briefingSelection(
  live: FeedResponse['briefing'],
  request: PlaybackRequest | null,
  edition: string | null,
  archiveAvailable = true,
) {
  const selected = request && 'audio' in request ? request : null;
  const audio = selected?.audio;
  const sameEdition = audio && (audio.date === edition || audio.date === live?.date);
  const stillLive =
    live?.available && live.date === audio?.date && live.generated === audio.generated;
  const withdrawn =
    audio && (!archiveAvailable || (sameEdition && !stillLive))
      ? { source: 'withdrawn' as const, date: audio.date, recorded: audio.generated }
      : null;
  const widget = withdrawn ? null : selected;
  // The archive can revoke a download before the foreground query replaces
  // the old live feed. Keep that identity off the player across both commits.
  const revoked = withdrawn ?? (request?.source === 'withdrawn' ? request : null);
  const liveAvailable =
    live?.available && !(revoked?.date === live.date && revoked.recorded === live.generated);
  const date = widget?.audio.date ?? (liveAvailable ? live.date : undefined);
  const recorded = widget?.audio.generated ?? live?.generated;
  const addressed =
    request?.source === 'briefing_push'
      ? date === request.date && recorded === request.recorded
      : !!widget;
  return {
    withdrawn,
    date,
    recorded,
    duration: widget?.audio.durationSeconds ?? live?.duration,
    localOnly: widget?.localOnly ?? false,
    playbackRequest: addressed && request && 'serial' in request ? request.serial : undefined,
    playbackSource: request?.source === 'withdrawn' ? undefined : request?.source,
  };
}
