export interface ClockReading {
  wall: number;
  elapsed: number;
  offset: number;
}

/** Timer delays advance both clocks. A system time correction only moves wall time. */
export function clockChanged(before: ClockReading, after: ClockReading): boolean {
  return (
    before.offset !== after.offset ||
    Math.abs(after.wall - before.wall - (after.elapsed - before.elapsed)) >= 1000
  );
}
