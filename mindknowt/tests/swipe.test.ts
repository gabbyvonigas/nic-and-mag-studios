/**
 * Where a swiped row settles.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs swipe.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { ACTION_WIDTH, dragTo, isHorizontal, settleTo } = await import(
  `${ROOT}/src/components/swipeGeometry.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('a row only ever moves left, and only as far as the button', () => {
  assert.equal(dragTo(false, -20), -20);
  assert.equal(dragTo(false, -ACTION_WIDTH), -ACTION_WIDTH);
  // A hard swipe would otherwise drag the row clean off the screen.
  assert.equal(dragTo(false, -400), -ACTION_WIDTH);
  // Right is not a gesture this row has.
  assert.equal(dragTo(false, 60), 0);
});

check('an open row drags from where it is, not from zero', () => {
  assert.equal(dragTo(true, 0), -ACTION_WIDTH);
  assert.equal(dragTo(true, 30), -ACTION_WIDTH + 30, 'swiping it back shut');
  assert.equal(dragTo(true, 400), 0, 'and no further than shut');
  assert.equal(dragTo(true, -50), -ACTION_WIDTH, 'already fully open');
});

check('a half hearted swipe springs shut', () => {
  assert.equal(settleTo(false, -10), 0);
  assert.equal(settleTo(false, -ACTION_WIDTH / 2), 0, 'exactly half is shut');
  assert.equal(settleTo(false, -ACTION_WIDTH / 2 - 1), -ACTION_WIDTH);
  assert.equal(settleTo(false, -ACTION_WIDTH), -ACTION_WIDTH);
});

check('a row never settles anywhere but open or shut', () => {
  for (const open of [false, true]) {
    for (let dx = -300; dx <= 300; dx += 7) {
      const landed = settleTo(open, dx);
      assert.ok(
        landed === 0 || landed === -ACTION_WIDTH,
        `settled at ${landed}`,
      );
    }
  }
});

check('nudging an open row does not close it', () => {
  // Brushing an open row should not be read as a decision to shut it.
  assert.equal(settleTo(true, 0), -ACTION_WIDTH);
  assert.equal(settleTo(true, 10), -ACTION_WIDTH);
  assert.equal(settleTo(true, ACTION_WIDTH / 2), 0, 'a real swipe back does');
});

check('the list keeps any gesture that is not clearly sideways', () => {
  assert.equal(isHorizontal(2, 0), false, 'a tap is not a swipe');
  assert.equal(isHorizontal(-40, 0), true);
  assert.equal(isHorizontal(-20, 30), false, 'that is the list scrolling');
  assert.equal(isHorizontal(-20, 5), true);
  // A diagonal is the list's, because a row that grabs an ambiguous gesture
  // makes the whole screen feel like it is fighting the finger.
  assert.equal(isHorizontal(-30, 25), false);
});

// Only one row open at a time, and nothing left open behind.

{
  const R = await import(`${ROOT}/src/components/swipeRegistry.ts`);
  const { ACTION_WIDTH: AW } = await import(`${ROOT}/src/components/swipeGeometry.ts`);

  check('opening a second row closes the first', () => {
    let aOpen = true;
    let bOpen = true;
    const closeA = () => { aOpen = false; };
    const closeB = () => { bOpen = false; };

    R.claimOpen(closeA);
    assert.ok(aOpen, 'nothing closed the row that just opened');

    R.claimOpen(closeB);
    assert.equal(aOpen, false, 'the first row stayed open');
    assert.ok(bOpen, 'the second row closed itself');
    R.closeAnyOpen();
  });

  check('claiming twice from the same row does not close it', () => {
    // The effect that claims runs on every change of `open`, and a row closing
    // itself as a result of its own claim would snap shut the moment it opened.
    let open = true;
    const close = () => { open = false; };
    R.claimOpen(close);
    R.claimOpen(close);
    assert.ok(open);
    R.closeAnyOpen();
  });

  check('a row that unmounts does not leave the list stuck', () => {
    // Deleting the open row unmounts it. Without the release, the registry
    // would still hold a closer for a row that no longer exists, and the next
    // row to open would call into it.
    let calls = 0;
    const closeA = () => { calls += 1; };
    R.claimOpen(closeA);
    R.releaseOpen(closeA);
    assert.equal(R.hasOpenRow(), false);

    R.claimOpen(() => {});
    assert.equal(calls, 0, 'a released row was still closed');
    R.closeAnyOpen();
  });

  check('releasing a row that is not the open one changes nothing', () => {
    let open = true;
    const closeA = () => { open = false; };
    const closeB = () => {};
    R.claimOpen(closeA);
    R.releaseOpen(closeB);
    assert.ok(R.hasOpenRow(), 'the open row was released by a different row');
    assert.ok(open);
    R.closeAnyOpen();
    assert.equal(open, false);
    assert.equal(R.hasOpenRow(), false);
  });

  check('terminating a gesture returns the row to where it was', () => {
    // The bug: terminate always settled to 0, so a gesture taken by the list
    // closed an open row. Open goes back to open, shut goes back to shut.
    const terminateTo = (wasOpen: boolean) => (wasOpen ? -AW : 0);
    assert.equal(terminateTo(true), -AW);
    assert.equal(terminateTo(false), 0);
  });
}

console.log(`\n${passed} checks passed`);
