/**
 * The helper behind the ringing screen that would not close.
 *
 * Done completed the Knowt and left the screen standing, because the line that
 * closed it sat behind a chain of awaits into the alarm module. A rejection
 * skipped it and the call site discarded the rejection with `void`, so nothing
 * threw and nothing was logged. A native promise that never settled did the
 * same thing and was indistinguishable from a hang.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs settle.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { ALARM_CALL_TIMEOUT_MS, describeError, settled } = await import(
  `${ROOT}/src/alarms/settle.ts`
);

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

await check('work that succeeds comes back with its value', async () => {
  const result = await settled(Promise.resolve(7));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value, 7);
});

await check('a rejection is returned rather than thrown', async () => {
  // The whole point. A caller cannot forget to catch what never throws.
  const boom = new TypeError('no such alarm');
  const result = await settled(Promise.reject(boom));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, boom);
  assert.equal(result.ok === false && result.timedOut, false);
});

await check('work that never settles is given up on', async () => {
  const forever = new Promise<void>(() => {});
  const result = await settled(forever, 20);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.timedOut, true);
});

await check('the timeout does not fire for work that finished', async () => {
  // If the timer were left running, a test process would never exit and a
  // real screen would hold a handle for eight seconds after it was done.
  const started = Date.now();
  const result = await settled(Promise.resolve('quick'), 5_000);
  assert.equal(result.ok, true);
  assert.ok(Date.now() - started < 1_000, 'returned without waiting it out');
});

await check('slow work inside the window still succeeds', async () => {
  const slow = new Promise<string>((resolve) =>
    setTimeout(() => resolve('late but fine'), 15),
  );
  const result = await settled(slow, 200);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value, 'late but fine');
});

await check('the default window is a wait a person could tolerate', async () => {
  assert.equal(ALARM_CALL_TIMEOUT_MS, 8_000);
});

await check('an error always identifies itself', async () => {
  // Third-party errors are routinely built with an empty message, and
  // String(err) on one renders as the useless word "Error".
  class AlarmKitError extends Error {}
  assert.equal(describeError(new AlarmKitError()), 'AlarmKitError');
  assert.equal(
    describeError(new AlarmKitError('refused')),
    'AlarmKitError: refused',
  );
  assert.equal(describeError('plain string'), 'plain string');
  assert.equal(describeError(undefined), 'undefined');
});

// The decision the ringing screen got wrong.

const { shouldLeaveAfter } = await import(`${ROOT}/src/ringing/finishAction.ts`);

await check('an action that took closes the screen', async () => {
  assert.equal(await shouldLeaveAfter(async () => true), true);
});

await check('an action that returns nothing closes the screen', async () => {
  // Only an explicit false keeps it up. A handler that forgot to return must
  // not be read as a refusal.
  assert.equal(await shouldLeaveAfter(async () => undefined), true);
});

await check('only an explicit refusal keeps the screen up', async () => {
  // A wrong tag, or a snooze AlarmKit refused. Both have already put a message
  // on the screen, and the alarm is still ringing.
  assert.equal(await shouldLeaveAfter(async () => false), false);
});

await check('an action that throws still closes the screen', async () => {
  // The regression. Done wrote the completion, the alarm bookkeeping after it
  // rejected, and the screen stayed up with no way off it and nothing said.
  assert.equal(
    await shouldLeaveAfter(async () => {
      throw new Error('cancelAlarm failed');
    }),
    true,
  );
});

await check('a synchronous throw is caught too', async () => {
  assert.equal(
    await shouldLeaveAfter((() => {
      throw new Error('threw before returning a promise');
    }) as never),
    true,
  );
});

console.log(`\n${passed} checks passed`);
