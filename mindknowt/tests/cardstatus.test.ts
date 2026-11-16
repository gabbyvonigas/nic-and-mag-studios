/**
 * The live line on a Daily card. The reported bug: a snoozed Knowt showed
 * nothing at all.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs cardstatus.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { cardStatus } = await import(`${ROOT}/src/knowts/cardStatus.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const NOW = new Date(2026, 9, 8, 13, 0).getTime();
const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m).getTime();
const clock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${h}:${`${d.getMinutes()}`.padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
};

const pending = (over: Record<string, unknown> = {}) =>
  ({
    id: 'p1', knowt_id: 'k1', schedule_id: null, alarmkit_id: 'a1',
    fires_at: at(13, 25), kind: 'snooze', signature: null, created_at: 0,
    ...over,
  }) as never;

const card = (over: Record<string, unknown> = {}) =>
  ({ completedAt: null, pending: null, ...over }) as never;

check('a snoozed Knowt says when it comes back', () => {
  const s = cardStatus(card({ pending: pending() }), NOW, clock);
  assert.equal(s?.text, 'Snoozed until 1:25 pm');
  assert.equal(s?.icon, 'snooze');
});

check('the snooze clears itself the moment it is due', () => {
  // Not at the next screen focus. The board is re-read on a timer for exactly
  // this, so the rule has to agree that a snooze in the past is not a snooze.
  const due = at(13, 25);
  assert.ok(cardStatus(card({ pending: pending() }), due - 1, clock));
  assert.equal(cardStatus(card({ pending: pending() }), due, clock), null);
  assert.equal(cardStatus(card({ pending: pending() }), due + 1, clock), null);
});

check('completing a snoozed Knowt replaces the snooze with done', () => {
  const s = cardStatus(
    card({ completedAt: at(13, 10), pending: pending() }),
    NOW,
    clock,
  );
  assert.equal(s?.text, 'Done at 1:10 pm');
  assert.equal(s?.icon, 'check');
});

check('a re-fire and a test ring each say what they are', () => {
  const refire = cardStatus(
    card({ pending: pending({ kind: 'refire', fires_at: at(13, 30) }) }),
    NOW, clock,
  );
  assert.equal(refire?.text, 'Rings again at 1:30 pm');
  assert.equal(refire?.icon, 'ringing');

  const test = cardStatus(
    card({ pending: pending({ kind: 'test', fires_at: at(13, 5) }) }),
    NOW, clock,
  );
  assert.equal(test?.text, 'Test alarm at 1:05 pm');
  assert.equal(test?.icon, 'test');
});

check('the standing schedule says nothing, because the card already shows it', () => {
  assert.equal(
    cardStatus(card({ pending: pending({ kind: 'scheduled', schedule_id: 's1' }) }), NOW, clock),
    null,
  );
});

check('a card with nothing armed and nothing done says nothing', () => {
  assert.equal(cardStatus(card(), NOW, clock), null);
});

console.log(`\n${passed} checks passed`);
