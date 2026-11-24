import { briefingSelection } from '../lib/briefing-selection';

it('switches the mounted widget recording to the addressed live generation before dispatching play', () => {
  const audio = {
    status: 'available',
    date: '2026-11-22',
    generated: 'yesterday',
    durationSeconds: 90,
  } as const;
  const live = { available: true, date: '2026-11-23', generated: 'today', duration: 100 };
  expect(
    briefingSelection(
      live,
      { audio, localOnly: true, serial: 1, source: 'widget', revision: 'old' },
      live.date,
    ),
  ).toMatchObject({
    date: audio.date,
    recorded: 'yesterday',
    localOnly: true,
    playbackRequest: 1,
  });
  const push = {
    source: 'briefing_push',
    date: live.date,
    recorded: live.generated,
    serial: 2,
  } as const;
  expect(briefingSelection(live, push, live.date)).toMatchObject({
    date: live.date,
    recorded: 'today',
    localOnly: false,
    playbackRequest: 2,
    playbackSource: 'briefing_push',
  });
  expect(
    briefingSelection({ ...live, generated: 'replacement' }, push, live.date).playbackRequest,
  ).toBeUndefined();
});

it('drops the mounted recording when archive revocation precedes the screen’s feed update', () => {
  const date = '2026-11-23';
  const generated = '2026-11-23T05:00:00Z';
  const live = { available: true, date, generated };
  const request = {
    source: 'widget',
    revision: 'a'.repeat(64),
    localOnly: true,
    serial: 1,
    audio: { status: 'available', date, generated },
  } as const;
  expect(briefingSelection(live, request, date, false)).toMatchObject({
    withdrawn: { source: 'withdrawn', date, recorded: generated },
    date: undefined,
    playbackRequest: undefined,
  });
  const revoked = { source: 'withdrawn', date, recorded: generated } as const;
  expect(briefingSelection(live, revoked, date, false).date).toBeUndefined();
  expect(briefingSelection({ ...live, generated: 'replacement' }, revoked, date)).toMatchObject({
    date,
    recorded: 'replacement',
    playbackRequest: undefined,
  });
});
