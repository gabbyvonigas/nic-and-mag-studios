/**
 * The calendar on the schedule editor, and the date it used to invent.
 *
 * `EditScheduleScreen` serves three entries: "When it rings" from Setup, "Add
 * a schedule" and "Edit schedule". None of them has ever shown a calendar. The
 * component has existed since `8593265`, which put it in the Setup step and
 * nowhere else, and `git log -S MonthCalendar -- src/screens/EditScheduleScreen.tsx`
 * is empty: nothing removed it, it was never there. The screen wrote today
 * into `start_date` and said so in a line of hint text, which is the one thing
 * the project's own rule forbids outright.
 *
 * This fails if the calendar goes missing again, and it fails per preset, so a
 * shape that starts needing a date and does not get one is caught.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs schedulecalendar.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const screen = read('src/screens/EditScheduleScreen.tsx');
const setup = read('src/screens/SetupKnowtScreen.tsx');

const { REPEAT_PRESETS, shapeFor } = await import(`${ROOT}/src/knowts/repeats.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Every preset the request named, by the label a person reads. */
const WANTED = [
  'Just once',
  'Monthly',
  'Every 90 days',
  'Every 6 months',
  'Annually',
  'Every other day',
  'Every 2 weeks',
  'Every few days',
];

check('every preset that needs a date says so in its shape', () => {
  for (const label of WANTED) {
    const preset = REPEAT_PRESETS.find((p: { label: string }) => p.label === label);
    assert.ok(preset, `no preset labeled ${label}`);
    const shape = shapeFor(preset.id, { days: [2], count: 3 });
    assert.equal(shape.needsStartDate, true, label);
  }
});

check('a weekday recurrence takes no date, which is why it shows none', () => {
  // "Certain days" was asked for too. A days-of-week schedule has no anchor in
  // this model: it rings on those weekdays forever, and `shapeFor` returns
  // `needsStartDate: false` for it and for every other weekday preset. Giving
  // it one would mean "from this date onward", which nothing reads.
  for (const label of ['Certain days', 'Every day', 'Weekdays', 'Weekends', 'Weekly']) {
    const preset = REPEAT_PRESETS.find((p: { label: string }) => p.label === label);
    assert.ok(preset, label);
    assert.equal(shapeFor(preset.id, { days: [2] }).needsStartDate, false, label);
  }
});

check('the editor draws a calendar for exactly those shapes', () => {
  assert.match(screen, /import \{ MonthCalendar \} from '\.\.\/components\/MonthCalendar';/);
  // Gated on the shape, not on a list of preset ids, so a preset that starts
  // needing a date gets one without anyone remembering to add it here.
  assert.match(screen, /\{shapeFor\(preset\)\.needsStartDate \? \(/);
  const gate = screen.indexOf('{shapeFor(preset).needsStartDate ? (');
  const after = screen.slice(gate, gate + 900);
  assert.match(after, /<MonthCalendar/, 'the gate renders something else');
  assert.match(after, /month=\{visibleMonth\}/);
  assert.match(after, /selected=\{startDate\}/);
  assert.match(after, /onPick=\{\(day\) =>/);
  assert.match(after, /onShiftMonth=/);
});

check('the hint that stood in for it is gone', () => {
  assert.ok(!screen.includes('Counting from today.'), 'the invented default is back');
  assert.ok(!screen.includes('Counting from ${existing.start_date}'));
});

check('what gets saved is the day that was picked', () => {
  // Not `toISODate(new Date())`, which is what it used to write whatever the
  // person did.
  assert.match(screen, /startDate: shape\.needsStartDate \? toISODate\(startDate\) : null,/);
  assert.ok(
    !/startDate: shape\.needsStartDate\s*\n?\s*\? \(existing\?\.start_date \?\? toISODate\(new Date\(\)\)\)/.test(screen),
  );
});

check('editing opens on the schedule’s own date, not on today', () => {
  // Both paths are this one screen: `existingId` decides which. A new schedule
  // starts at today and an edited one at whatever it already had, so a rhythm
  // does not silently restart because someone opened the screen.
  assert.match(screen, /const \[startDate, setStartDate\] = useState\(\(\) => midnight\(new Date\(\)\)\);/);
  assert.match(screen, /const stored = existing\.start_date \? fromISODate\(existing\.start_date\) : null;/);
  assert.match(screen, /setStartDate\(stored\);/);
  assert.match(screen, /setVisibleMonth\(new Date\(stored\.getFullYear\(\), stored\.getMonth\(\), 1\)\);/);
  // And the screen really does serve both paths.
  assert.match(screen, /if \(existingId\) \{\n\s+await updateSchedule\(existingId, fields\);/);
  assert.match(screen, /await addSchedule\(params\.knowtId, \{/);
});

check('Setup keeps the calendar it already had', () => {
  // The one screen that has always shown one. If this breaks, the fix above
  // took something away rather than adding it.
  assert.match(setup, /<MonthCalendar/);
});

console.log(`\n${passed} checks passed`);
