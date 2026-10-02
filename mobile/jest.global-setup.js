// The suite runs in one zone, whatever the machine's.
//
// A test cannot choose its own: jest hands every test file a *copy* of
// `process.env`, so `process.env.TZ = '…'` inside a test changes nothing, and
// Node only re-reads the zone when the real one is assigned. That is how
// "counts from the reader's own date, not UTC's" (`cards-builders.test.ts`)
// came to pass only on a machine already east of UTC and fail on any UTC box,
// while looking as though it pinned Stockholm itself.
//
// Assigned here — in the parent, before any worker is forked — it reaches
// every test, in band or in workers. Stockholm because that test's instant is
// already the next day there and still the previous one in UTC, which is what
// it exists to tell apart.
module.exports = () => {
  process.env.TZ = 'Europe/Stockholm';
};
