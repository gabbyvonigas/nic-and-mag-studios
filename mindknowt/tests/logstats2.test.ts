/**
 * The Log tiles: peak time, average time to complete, and the change against
 * the period before.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs logstats2.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  changeBetween,
  rangeFor,
  sparkFor,
  shiftRange,
  summarizePeriod,
} = await import(`${ROOT}/src/history/period.ts`);
const { durationLabel, hourName, hourRange } = await import(
  `${ROOT}/src/history/periodLabels.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// A Wednesday.
const TODAY = new Date(2026, 5, 24, 12, 0, 0);

let seq = 0;
/** An event that rang at `fired` and was finished `minutes` later. */
function event(fired: Date, minutes: number | null, over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `e${seq}`,
    knowt_id: 'k1',
    schedule_id: null,
    fired_at: fired.getTime(),
    completed_at:
      minutes === null ? null : fired.getTime() + minutes * 60_000,
    method: minutes === null ? null : 'scan',
    note: null,
    snooze_count: 0,
    ...over,
  } as never;
}

const KNOWTS = [{ id: 'k1', name: 'Vitamins', category: { id: 'c1' } }] as never[];
const CATEGORIES = [{ id: 'c1', name: 'Home', color: '#FF4D3D' }] as never[];

function summarize(kind: 'month' | 'week' | 'day', events: never[], anchor = TODAY) {
  return summarizePeriod({
    range: rangeFor(kind, anchor),
    knowts: KNOWTS,
    categories: CATEGORIES,
    events,
    today: TODAY,
  });
}

// Peak time.

check('the peak window is the busiest two hours', () => {
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 7, 10), 2),
    event(new Date(2026, 5, 24, 7, 50), 2),
    event(new Date(2026, 5, 24, 8, 5), 2),
    event(new Date(2026, 5, 24, 14, 0), 2),
  ] as never[]);
  // 7am and 8am hold three between them; 2pm holds one.
  assert.equal(day.peakHour, 7);
});

check('a habit that straddles the hour is not split in half', () => {
  // Two at 8:55 and two at 9:05 is one habit, not two thin hours. A single
  // hour reading would tie every hour at two and report whichever came first.
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 8, 55), 1),
    event(new Date(2026, 5, 24, 8, 58), 1),
    event(new Date(2026, 5, 24, 9, 5), 1),
    event(new Date(2026, 5, 24, 9, 9), 1),
    event(new Date(2026, 5, 24, 17, 0), 1),
    event(new Date(2026, 5, 24, 17, 30), 1),
  ] as never[]);
  assert.equal(day.peakHour, 8, '8 to 10 holds four, 5pm holds two');
});

check('peak time is null when nothing was completed', () => {
  assert.equal(summarize('day', [] as never[]).peakHour, null);
  // An alarm that rang and was never answered has no completion time to bucket.
  const missed = summarize('day', [
    event(new Date(2026, 5, 24, 9, 0), null),
  ] as never[]);
  assert.equal(missed.peakHour, null);
  assert.equal(missed.missed, 1);
});

check('the peak window reads completion time, not firing time', () => {
  // Rang at 6am, done at 11am. The peak is when it actually got done, since
  // that is the sentence the tile writes.
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 6, 0), 300),
    event(new Date(2026, 5, 24, 6, 5), 300),
  ] as never[]);
  assert.equal(day.peakHour, 10, '11am completions fall in the 10 to 12 window');
});

check('a late night peak does not wrap past midnight incorrectly', () => {
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 23, 10), 1),
    event(new Date(2026, 5, 24, 23, 40), 1),
  ] as never[]);
  assert.equal(day.peakHour, 22, '11pm pairs with 10pm, both inside the day');
});

// Average time to complete.

check('the average is the mean minutes from ringing to done', () => {
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 8, 0), 2),
    event(new Date(2026, 5, 24, 9, 0), 4),
    event(new Date(2026, 5, 24, 10, 0), 12),
  ] as never[]);
  assert.equal(day.averageMinutes, 6);
});

check('a missed alarm is left out rather than counted as zero', () => {
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 8, 0), 10),
    event(new Date(2026, 5, 24, 9, 0), null),
  ] as never[]);
  // Counting the miss would report 5 minutes, which is faster than anything
  // that happened, and reward ignoring alarms.
  assert.equal(day.averageMinutes, 10);
});

check('a check-in with no alarm behind it has no duration', () => {
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 8, 0), 10),
    // Completed by hand, never rang.
    event(new Date(2026, 5, 24, 9, 0), 0, {
      fired_at: null,
      completed_at: new Date(2026, 5, 24, 9, 0).getTime(),
      method: 'tap',
    }),
  ] as never[]);
  assert.equal(day.averageMinutes, 10);
  assert.equal(day.completions, 2, 'it still counts as done');
});

check('the average is null when nothing rang', () => {
  assert.equal(summarize('day', [] as never[]).averageMinutes, null);
  const tapped = summarize('day', [
    event(new Date(2026, 5, 24, 9, 0), 0, {
      fired_at: null,
      completed_at: new Date(2026, 5, 24, 9, 0).getTime(),
      method: 'tap',
    }),
  ] as never[]);
  assert.equal(tapped.averageMinutes, null);
});

check('a slept-on alarm averages in hours, not clipped', () => {
  const day = summarize('day', [
    event(new Date(2026, 5, 24, 7, 0), 240),
    event(new Date(2026, 5, 24, 8, 0), 0),
  ] as never[]);
  assert.equal(day.averageMinutes, 120);
});

// Period over period. The gate, the like for like window and the rate in
// points are all in logdelta.test.ts; this file keeps the pure helper.

check('a change is a fraction of what came before', () => {
  assert.equal(changeBetween(12, 10), 0.2);
  assert.equal(changeBetween(8, 10), -0.2);
  assert.equal(changeBetween(10, 10), 0);
  assert.equal(changeBetween(30, 10), 2);
});

check('there is no change from nothing, so it reads as null', () => {
  // Dividing by an empty period is where a "+Infinity%" badge comes from.
  assert.equal(changeBetween(5, 0), null);
  assert.equal(changeBetween(0, 0), null);
  assert.equal(changeBetween(0, 4), -1, 'but dropping to nothing is -100%');
});

check('trend buckets carry what they need for a bar', () => {
  const week = summarize('week', [
    event(new Date(2026, 5, 22, 8, 0), 5),
    event(new Date(2026, 5, 22, 9, 0), null),
    event(new Date(2026, 5, 24, 9, 0), 5, { method: 'override' }),
  ] as never[]);
  assert.equal(week.trend.length, 7);
  assert.deepEqual(
    week.trend.map((b: { label: string }) => b.label),
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  );

  const monday = week.trend[1]!;
  assert.equal(monday.completions, 1);
  assert.equal(monday.total, 2, 'the miss is in the total, not the count');
  assert.equal(monday.overrides, 0);

  const wednesday = week.trend[3]!;
  assert.equal(wednesday.completions, 1);
  assert.equal(wednesday.overrides, 1);
  assert.equal(wednesday.current, true, 'today is marked for the lime bar');
  assert.equal(monday.current, false);
});

// Sparklines.

check('a sparkline is scaled against its own biggest bar', () => {
  const week = summarize('week', [
    event(new Date(2026, 5, 22, 8, 0), 5),
    event(new Date(2026, 5, 24, 8, 0), 5),
    event(new Date(2026, 5, 24, 9, 0), 5),
    event(new Date(2026, 5, 24, 10, 0), 5),
    event(new Date(2026, 5, 24, 11, 0), 5),
  ] as never[]);
  const spark = sparkFor(week, 'completions');
  assert.equal(spark.length, 7);
  assert.equal(spark[1], 0.25, 'one against a peak of four');
  assert.equal(spark[3], 1);
  assert.equal(spark[0], 0);
  for (const value of spark) assert.ok(value >= 0 && value <= 1);
});

check('an empty period draws a flat sparkline, not a crash', () => {
  // Dividing by a peak of zero is where NaN heights come from, and a NaN height
  // reaches the style as the string "NaN".
  for (const metric of ['completions', 'rate', 'overrides'] as const) {
    const spark = sparkFor(summarize('week', [] as never[]), metric);
    assert.equal(spark.length, 7);
    for (const value of spark) {
      assert.ok(Number.isFinite(value), `${metric} produced ${value}`);
      assert.equal(value, 0);
    }
  }
});

check('a rate sparkline is drawn as the fraction it already is', () => {
  const week = summarize('week', [
    // Monday: one of two.
    event(new Date(2026, 5, 22, 8, 0), 5),
    event(new Date(2026, 5, 22, 9, 0), null),
    // Wednesday: two of two.
    event(new Date(2026, 5, 24, 8, 0), 5),
    event(new Date(2026, 5, 24, 9, 0), 5),
  ] as never[]);
  const spark = sparkFor(week, 'rate');
  assert.equal(spark[1], 0.5);
  assert.equal(spark[3], 1);
  // A day where nothing came up is not a day at zero percent, but it has no
  // bar to draw either, so it sits on the floor.
  assert.equal(spark[5], 0);
});

check('a rate sparkline is not renormalized to its own peak', () => {
  // Every day one of four. Scaling against the peak would draw this flat and
  // full height, identical to a week where everything got done.
  const thin = summarize('week', [
    ...[22, 23, 24].flatMap((day) => [
      event(new Date(2026, 5, day, 8, 0), 5),
      event(new Date(2026, 5, day, 9, 0), null),
      event(new Date(2026, 5, day, 10, 0), null),
      event(new Date(2026, 5, day, 11, 0), null),
    ]),
  ] as never[]);
  const spark = sparkFor(thin, 'rate');
  assert.equal(spark[1], 0.25);
  assert.equal(spark[2], 0.25);
  assert.equal(Math.max(...spark), 0.25, 'nothing is pushed up to 1');
});

check('overrides get their own series, not the completion counts', () => {
  const week = summarize('week', [
    event(new Date(2026, 5, 22, 8, 0), 5),
    event(new Date(2026, 5, 24, 8, 0), 5, { method: 'override' }),
    event(new Date(2026, 5, 24, 9, 0), 5, { method: 'override' }),
  ] as never[]);
  assert.deepEqual(sparkFor(week, 'overrides')[1], 0, 'Monday had none');
  assert.equal(sparkFor(week, 'overrides')[3], 1);
  assert.equal(sparkFor(week, 'completions')[1], 0.5);
});

check('a month sparkline has one point per day', () => {
  const month = summarize('month', [
    event(new Date(2026, 5, 3, 8, 0), 5),
  ] as never[]);
  assert.equal(sparkFor(month, 'completions').length, 30, 'June has 30 days');
});

// How the two new cards read.

check('the clock gets noon and midnight the right way round', () => {
  assert.equal(hourName(0), '12am');
  assert.equal(hourName(12), '12pm');
  assert.equal(hourName(1), '1am');
  assert.equal(hourName(11), '11am');
  assert.equal(hourName(13), '1pm');
  assert.equal(hourName(23), '11pm');
});

check('the peak window wraps past midnight rather than reading 25', () => {
  assert.equal(hourRange(7), '7am to 9am');
  assert.equal(hourRange(11), '11am to 1pm');
  assert.equal(hourRange(22), '10pm to 12am');
  assert.equal(hourRange(23), '11pm to 1am');
});

check('every hour of the day produces a sane window', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const label = hourRange(hour);
    assert.ok(/^\d{1,2}(am|pm) to \d{1,2}(am|pm)$/.test(label), label);
    // A 12 hour clock has no hour 0 and no hour 13 and up. "10am" contains the
    // characters "0am", so this has to anchor on the number, not the substring.
    for (const part of label.split(' to ')) {
      const value = Number.parseInt(part, 10);
      assert.ok(value >= 1 && value <= 12, `${label} has an hour of ${value}`);
    }
  }
});

check('a duration reads in minutes and hours', () => {
  assert.equal(durationLabel(0), 'Under a minute');
  assert.equal(durationLabel(0.4), 'Under a minute');
  assert.equal(durationLabel(1), '1 min');
  assert.equal(durationLabel(4.3), '4 min');
  assert.equal(durationLabel(59), '59 min');
  assert.equal(durationLabel(60), '1 hr');
  assert.equal(durationLabel(90), '1 hr 30 min');
  assert.equal(durationLabel(125), '2 hr 5 min');
  assert.equal(durationLabel(1440), '24 hr');
});

check('a duration never rounds into sixty minutes', () => {
  // 59.7 minutes rounds to 60, and "0 hr 60 min" is not a thing anyone says.
  assert.equal(durationLabel(59.7), '1 hr');
  assert.equal(durationLabel(119.8), '2 hr');
  for (let minutes = 0; minutes < 600; minutes += 0.1) {
    const label = durationLabel(minutes);
    assert.ok(!label.includes('60 min'), `${minutes} gave ${label}`);
    assert.ok(!label.startsWith('0 hr'), `${minutes} gave ${label}`);
  }
});

check('a duration that could not be computed is not drawn as a number', () => {
  assert.equal(durationLabel(Number.NaN), '-');
  assert.equal(durationLabel(-5), '-');
  assert.equal(durationLabel(Number.POSITIVE_INFINITY), '-');
});

console.log(`\n${passed} checks passed`);
