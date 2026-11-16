/**
 * The Insights rules: what is allowed to surface, and what must stay quiet.
 *
 * Most of these assert silence. An insight engine that fires on thin data
 * produces confident nonsense, so the interesting cases are the ones just
 * under a threshold.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs insights.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  MIN_COMPLETIONS,
  MIN_OVERRIDES,
  OVERRIDE_WINDOW,
  candidateInsights,
  pickInsight,
} = await import(`${ROOT}/src/history/insights.ts`);

type Ev = {
  knowtId: string;
  knowtName: string;
  hasTag: boolean;
  completedAt: number | null;
  method: 'scan' | 'tap' | 'override' | null;
  /** Whether the Knowt has a schedule. The time-of-day rule reads only these. */
  timed: boolean;
};

const NOW = new Date('2026-06-24T12:00:00');

/** A completion at a given hour, `daysAgo` before NOW. */
function at(daysAgo: number, hour: number, over: Partial<Ev> = {}): Ev {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return {
    knowtId: 'k1',
    knowtName: 'Vitamins',
    hasTag: false,
    completedAt: d.getTime(),
    method: 'scan',
    timed: true,
    ...over,
  };
}

function miss(daysAgo: number, over: Partial<Ev> = {}): Ev {
  return { ...at(daysAgo, 9, over), completedAt: null, method: null };
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// ---------------------------------------------------------------- sample size

check('nothing at all is said about an empty history', () => {
  assert.equal(pickInsight([], NOW), null);
  assert.deepEqual(candidateInsights([], NOW), []);
});

check('a pattern stays quiet one completion short of the minimum', () => {
  const thin = Array.from({ length: MIN_COMPLETIONS - 1 }, (_, i) => at(i, 8));
  assert.equal(
    candidateInsights(thin, NOW).some((i) => i.kind === 'time-of-day'),
    false,
    `${MIN_COMPLETIONS - 1} completions should not be enough`,
  );
});

check('and speaks once it reaches it', () => {
  const enough = Array.from({ length: MIN_COMPLETIONS }, (_, i) => at(i, 8));
  assert.equal(
    candidateInsights(enough, NOW).some((i) => i.kind === 'time-of-day'),
    true,
  );
});

check('a weekday claim needs three weeks, not three completions', () => {
  // Plenty of completions, all inside one week, all on a Wednesday.
  const oneWeek = Array.from({ length: 10 }, (_, i) => at(i % 7, 9));
  assert.equal(
    candidateInsights(oneWeek, NOW).some((i) => i.kind === 'day-of-week'),
    false,
    'two weeks of history cannot support a claim about a weekday',
  );

  // The same shape spread over two months.
  const spread = Array.from({ length: 10 }, (_, i) => at(i * 7, 9));
  assert.equal(
    candidateInsights(spread, NOW).some((i) => i.kind === 'day-of-week'),
    true,
  );
});

check('the tag comparison needs both sides, not just a tagged pile', () => {
  const taggedOnly = Array.from({ length: 12 }, (_, i) =>
    at(i, 9, { hasTag: true }),
  );
  assert.equal(
    candidateInsights(taggedOnly, NOW).some((i) => i.kind === 'tag-attached'),
    false,
    'with nothing untagged there is nothing to compare against',
  );
});

// ------------------------------------------------------------------ overrides

check('one of two is never an override insight', () => {
  const thin: Ev[] = [
    at(1, 9, { method: 'override' }),
    at(2, 9, { method: 'scan' }),
  ];
  assert.equal(
    candidateInsights(thin, NOW).some((i) => i.kind === 'override-frequency'),
    false,
  );
});

check('the override insight needs a real ratio over a full window', () => {
  // Exactly at the line: 3 overrides in the last 5.
  const onTheLine: Ev[] = [
    at(1, 9, { method: 'override' }),
    at(2, 9, { method: 'override' }),
    at(3, 9, { method: 'override' }),
    at(4, 9, { method: 'scan' }),
    at(5, 9, { method: 'scan' }),
  ];
  assert.equal(onTheLine.length, OVERRIDE_WINDOW);
  const fired = candidateInsights(onTheLine, NOW).find(
    (i) => i.kind === 'override-frequency',
  );
  assert.ok(fired, `${MIN_OVERRIDES} of ${OVERRIDE_WINDOW} should qualify`);

  // One fewer override, same window, must not.
  const under: Ev[] = [...onTheLine];
  under[0] = at(1, 9, { method: 'scan' });
  assert.equal(
    candidateInsights(under, NOW).some((i) => i.kind === 'override-frequency'),
    false,
  );
});

check('only the worst offender is ever offered, never several', () => {
  const two: Ev[] = [
    ...Array.from({ length: 5 }, (_, i) =>
      at(i + 1, 9, { knowtId: 'a', knowtName: 'Workout', method: 'override' }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      at(i + 1, 9, {
        knowtId: 'b',
        knowtName: 'Pills',
        method: i < 3 ? 'override' : 'scan',
      }),
    ),
  ];
  const adjustments = candidateInsights(two, NOW).filter(
    (i) => i.tone === 'adjustment',
  );
  assert.equal(adjustments.length, 1, 'two qualifying knowts, one insight');
  assert.match(adjustments[0]!.text, /Workout/, 'the stronger ratio wins');
});

// --------------------------------------------------------------- prioritizing

check('a positive insight beats an adjustment even when both qualify', () => {
  const both: Ev[] = [
    // A clear morning pattern, spread over months.
    ...Array.from({ length: 10 }, (_, i) =>
      at(i * 7, 8, { knowtId: 'c', knowtName: 'Water', method: 'scan' }),
    ),
    // And a knowt being overridden repeatedly.
    ...Array.from({ length: 5 }, (_, i) =>
      at(i + 1, 8, { knowtId: 'a', knowtName: 'Workout', method: 'override' }),
    ),
  ];
  const candidates = candidateInsights(both, NOW);
  assert.ok(
    candidates.some((i) => i.tone === 'adjustment'),
    'the adjustment should qualify',
  );
  assert.equal(pickInsight(both, NOW)?.tone, 'positive');
});

check('the adjustment surfaces only when nothing positive qualifies', () => {
  const onlyOverrides: Ev[] = Array.from({ length: 5 }, (_, i) =>
    at(i + 1, 8 + (i % 9), {
      knowtId: 'a',
      knowtName: 'Workout',
      method: 'override',
    }),
  );
  const picked = pickInsight(onlyOverrides, NOW);
  assert.equal(picked?.kind, 'override-frequency');
  assert.ok(picked?.action, 'it has to come with its fix');
  assert.equal(picked.action.kind, 'adjust-time');
});

check('exactly one insight comes back, ever', () => {
  const busy: Ev[] = [
    ...Array.from({ length: 12 }, (_, i) =>
      at(i * 5, 8, { knowtId: 'c', knowtName: 'Water', hasTag: true }),
    ),
    ...Array.from({ length: 8 }, (_, i) => miss(i * 5, { knowtId: 'd', knowtName: 'Bins' })),
    ...Array.from({ length: 5 }, (_, i) =>
      at(i + 1, 8, { knowtId: 'a', knowtName: 'Workout', method: 'override' }),
    ),
  ];
  assert.ok(candidateInsights(busy, NOW).length > 1, 'several should qualify');
  const picked = pickInsight(busy, NOW);
  assert.ok(picked);
  assert.equal(typeof picked.text, 'string');
});

// ----------------------------------------------------------------------- tone

check('no insight is ever phrased about the person', () => {
  const samples: Ev[][] = [
    Array.from({ length: 10 }, (_, i) => at(i * 7, 8)),
    Array.from({ length: 5 }, (_, i) =>
      at(i + 1, 8, { knowtName: 'Workout', method: 'override' }),
    ),
    [
      ...Array.from({ length: 8 }, (_, i) => at(i * 3, 9, { hasTag: true })),
      ...Array.from({ length: 8 }, (_, i) =>
        miss(i * 3, { knowtId: 'd', knowtName: 'Bins' }),
      ),
    ],
  ];

  const blaming = [
    'you keep',
    'you never',
    'you missed',
    'you are',
    "you're",
    'failed',
    'fail',
    'bad',
    'should have',
    'again',
    'streak',
  ];

  for (const events of samples) {
    for (const insight of candidateInsights(events, NOW)) {
      const lower = insight.text.toLowerCase();
      for (const phrase of blaming) {
        assert.ok(
          !lower.includes(phrase),
          `"${insight.text}" contains "${phrase}"`,
        );
      }
      assert.ok(!insight.text.includes('!'), insight.text);
      assert.ok(!insight.text.includes('—'), 'no em dashes');
    }
  }
});

check('an adjustment names the knowt, not the habit of missing it', () => {
  const overrides: Ev[] = Array.from({ length: 5 }, (_, i) =>
    at(i + 1, 8, { knowtName: 'Workout', method: 'override' }),
  );
  const insight = pickInsight(overrides, NOW);
  assert.ok(insight);
  assert.match(insight.text, /^Workout /, 'it opens with the knowt');
  assert.match(insight.text, /different time/);
});

check('the time-of-day claim ignores Knowts that never rang', () => {
  // A scan-only Knowt has no alarm, so the hour it was scanned says when
  // someone walked past its tag, not when they answer reminders. Twelve
  // evening scans of a standing item must not turn into a finding about them.
  const standing = Array.from({ length: 12 }, (_, i) =>
    at(i, 20, { knowtId: 'fridge', knowtName: 'Water filter', timed: false }),
  );
  assert.notEqual(
    pickInsight(standing, NOW)?.kind,
    'time-of-day',
    'a scan-only run produced a time-of-day claim',
  );

  // The same twelve on a timed Knowt do earn it, which is what proves the
  // filter is the thing making the difference.
  const timed = Array.from({ length: 12 }, (_, i) => at(i, 20));
  assert.equal(
    pickInsight(timed, NOW)?.kind,
    'time-of-day',
    'a timed run lost its claim',
  );
});

console.log(`\n${passed} checks passed.`);
