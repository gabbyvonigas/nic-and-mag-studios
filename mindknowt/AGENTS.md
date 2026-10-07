# MindKnowt working rules

Product spec: `mindknowt-v1-spec.md` in `gabbyvonigas/mindknowt`. Build order is
section 7. Steps 2 (NFC) and 4 (AlarmKit) are proven on hardware.

## Before claiming anything works

Run `npm run verify`, which is a typecheck plus a real iOS bundle. A change is not done
until it passes.

Config changes need `npx expo config --type introspect` as well. That is the
only way to see the Info.plist and entitlements prebuild will actually
generate; reading `app.json` is not the same thing.

Then say plainly what was verified and what was not. **Passing is not the same
as working on device.** NFC and AlarmKit cannot be exercised anywhere but a
physical iPhone. Never describe them as working because they compiled.

## Read the source; do not infer behavior

`docs.expo.dev` is blocked by this environment's network proxy. Read the
installed package instead: `node_modules/<pkg>`, including its native
`ios/*.swift` / `ios/*.m` and its `app.plugin.js`.

Both real bugs so far were found this way, and neither would have been found by
reasoning about what the library probably does:

- Requesting `NfcTech.FelicaIOS` silently enabled ISO18092 polling, which iOS
  rejects unless the app declares FeliCa system codes in Info.plist. Every scan
  failed instantly, before a tag was ever involved.
- `expo-alarm-kit` returns `"authorized"` immediately without prompting when
  permission already exists, which is what makes a mount-time read safe.

A third example, found the same way: a vertical `ScrollView` carries
`flexGrow: 1, flexShrink: 1` in its own `baseVertical` style, and
`ScrollView.js` applies it with `StyleSheet.compose(baseStyle, props.style)`.
A caller's `style` only wins for properties it actually sets, so `width: 72` on
a column became a flex basis and every column stretched to fill its row. The
time picker's three wheels ended up 116pt apart and stopped reading as a single
time. Pin `flexGrow: 0` and `flexShrink: 0` whenever a ScrollView needs a fixed
size in a flex row.

## An absolutely positioned layer measures its parent, not its sibling

`SwipeToDelete` fills its wrapper with the Delete button and slides the row
over it. The row carried `marginBottom`, which is inside the wrapper, so the
wrapper was taller than the row and the button stuck out below every one of
them: a pale pink rounded rectangle under a pale pink row, reported as each
row rendering twice.

Spacing between rows belongs to whatever owns the absolute layer, never to the
child inside it. When a "duplicate" or "shadow" appears under a row, look for a
sibling layer sized to a parent that is taller than it looks, before reaching
for `shadowOpacity`.

## When a report contradicts your explanation, the explanation is wrong

Do not explain a symptom away. Do not call something cosmetic before reading
the code. Twice the user's correction was the thing that located the bug, after
a confident wrong answer. Go read the relevant source first, then answer.

## Errors must never be opaque

Third-party errors are frequently constructed with an empty message, so
`String(err)` renders as the useless string `"Error"`. Always preserve the
error's class name. A failure that reaches the UI without identifying itself is
a bug in its own right, independent of whatever caused it.

## The app can be relaunched by an alarm

Dismissing an AlarmKit alarm relaunches the app, so React state resets to its
initial values. Never render state that was assumed rather than read from the
system, and re-read launch payloads on foreground transitions as well as mount.

## Do not clobber the user's files

`app.json` carries `extra.eas.projectId` and `owner`, written by `eas init` on
their machine. `package.json` carries `expo-dev-client`. Neither exists in a
scratch copy of this project.

Always review `git diff --cached` before committing. A copied file that drops
either one silently breaks their build.

## Platform config lives in app.json

This is a CNG project, so there is no `ios/` directory. Third-party READMEs give
Xcode instructions, which do not apply; translate them into `app.json`
(`ios.infoPlist`, `ios.entitlements`, `ios.deploymentTarget`) so prebuild
generates them.

`ios.deploymentTarget` is `26.1` because the `expo-alarm-kit` podspec requires
it. The App Group in `ios.entitlements` must match `APP_GROUP_ID` in
`src/alarms/types.ts` exactly.

## Native vs JS changes

A JS-only change hot-reloads over Metro in seconds. Anything that adds or
changes a native module needs a fresh `eas build`, which costs the user ~20
minutes. Always state which kind a change is.

**A package with no native code is a JS change, whatever it ships.**
`@expo/vector-icons` was put off for months as "needs a rebuild" and did not.
It is pure JavaScript: no `ios/`, no podspec, no `expo-module.config.json`. It
loads its font through `expo-font`, which was already linked, because
`expo-font` is a dependency of `expo` itself and autolinking has always found
it at `node_modules/expo/node_modules/expo-font`. The `.ttf` is a JS asset and
arrives over Metro like an image.

Check before claiming a rebuild: `npx expo-modules-autolinking search` lists
what is actually linked. If the list is the same before and after an install,
the existing dev client can run it.

## Copy rules

**American English only. Everywhere, permanently.**

MindKnowt and Nic & Mag Studios are American. This is not a per-file judgment
call and it is not limited to what a user reads: it covers in-app copy, code
comments, identifiers, documentation, commit messages and starter-set content.

color not colour, gray not grey, center not centre, organize not organise,
customize not customise, recognize not recognise, categorize not categorise,
canceled not cancelled, labeled not labelled, behavior not behaviour, license
not licence, defense not defence, analyze not analyse, judgment not judgement,
program not programme, and every other pair that works the same way.

Prefixed forms are the ones that get missed, because a word boundary does not
sit in front of them: `recoloured` survived a sweep that caught `coloured`.
Check with a bare stem, not with `\b`:

    grep -rniE "colour|behaviour|organis|customis|recognis|categoris|centre|grey|licence|defence|analyse|judgement|cancelled|labelled" src/ App.tsx assets/ docs/ design-notes.md

which must return nothing. It excludes this file on purpose, since the list
above spells out the forms it is looking for.

**This is enforced, not just documented.** `scripts/check-spelling.mjs` runs
in two places:

- `npm run verify` runs it first, over every tracked file. It is instant, and a
  spelling failure should not wait behind a bundle.
- `.githooks/pre-commit` runs it over staged files only, so an untouched file
  cannot block an unrelated commit. Install it once per clone with
  `npm run hooks:install`, which sets `core.hooksPath`. Git hooks live in
  `.git/hooks`, which is not committed, so a hook nobody installs enforces
  nothing.

- `.github/workflows/spelling.yml` runs it on every pull request and on every
  push to main, in both repositories. The workflow file sits at the repository
  root, which is a different place in each repo, so it is not mirrored by the
  usual patch and has to be edited in both. Pushes to main are covered because
  a web UI edit committed straight to main is not a pull request and would
  otherwise never be checked.

  The workflow has no install step. The checker uses only Node builtins, so
  there is nothing to fetch and nothing that can break independently of it.

  **A failing workflow reports; it does not block.** Blocking needs a branch
  protection rule on main requiring the "American English" check, set in
  Settings, Branches, in each repository. Without that rule a red check can be
  merged past.

The checker carries its own self-test (`--self-test`), which `check:spelling`
runs first. It asserts both halves: that the patterns catch real British
spellings, and that they leave correct American English alone. That second half
is the one that matters. Most words ending in -ise are correct American
English, so a general rule for them would flag surprise, advertise, exercise,
compromise, franchise, merchandise, supervise, promise and raise. The list is
curated for that reason, `organism` is not `organise`, and `analyses` is the
ordinary plural of `analysis`. A checker nobody has watched fire is
indistinguishable from a broken one.

**No em dashes. Anywhere, ever.** Not in user-facing copy, not in comments, not
in JSON content. Use a comma, a colon, a full stop or brackets. Verify with
`grep -rn "\u2014" src/ App.tsx`, which must return nothing.

The rest of the voice rules are spec section 8: sentence case, no exclamation
marks, no emoji, no praise. Errors state what happened and what to do. Empty
screens invite action rather than explain absence.

## Graph fills are never black

No bar, arc, sparkline or chart fill uses black, and none uses the near black
`ink` that text uses either. A solid dark bar reads as a hole punched in the
card rather than as something drawn. `theme.color.graph` (`#2E3236`) is the
value to reach for when a chart needs a dark fill, and `graphMuted` is for the
bars a chart is not pointing at.

Text keeps `ink`. This is about fills only.

Color in a chart marks *which* rather than *how much*. The Completion trend
paints today lime and every other day gray, whatever the counts are: the height
already says how much got done, and coloring the tallest bar turns a chart into
a scoreboard. The same reasoning is why the category tints on Log mean nothing.

## Never invent a default the user should choose

Times are entered by the person, never guessed. `Add a knowt` starts with an
empty time field, and applying a starter set prompts for a time per schedule.
Starter-set content may not supply times; a `time` in the JSON is ignored and
reported on the Dev screen rather than silently used.

The same reasoning applies to anything a wrong guess would quietly corrupt: a
default that is wrong more often than right is worse than an empty field.

## Migrations must be tested against an older database

A fresh database is not a test. It is built from the current schema, so it
passes trivially while an upgrade path is broken.

This already happened once: index creation sat alongside the table definitions
and ran before the ALTER steps, so `CREATE UNIQUE INDEX ... ON categories(key)`
threw `no such column: key` on every device that predated that column. Every
local check passed, because every local check started from nothing.

Order in `migrate()` is therefore: tables, then added columns, then back-fills,
then indexes, then the version stamp. Indexes go last because they can
reference columns the steps above add.

Column additions check `PRAGMA table_info` first, so a half-applied upgrade can
run again instead of failing forever on a duplicate column.

`node:sqlite` runs off-device, so migrations can and should be exercised
against a database built in the old shape before shipping.

## Alarms are reconciled, not fired and forgotten

`src/alarms/scheduleSync.ts` is the sole owner of `pending_alarms` rows of kind
`scheduled`. It runs at launch and after anything that changes a schedule.

A weekly repeat (daily, weekdays, weekends, named days) goes to the system as
one recurring alarm, so it keeps ringing with the app closed. Everything else
is armed one occurrence at a time and re-armed by the next sync, which means an
interval alarm that is ignored outright will not re-arm until the app is opened.
There is no background execution, so that limitation is real, not an oversight.

Sync compares a signature before touching anything. Do not "simplify" it into
canceling and re-arming everything each run: with a pre-1.0 alarm module, a
cancel that succeeds followed by a schedule that fails loses the alarm.

Sync reads what has been completed before deciding what to arm, so an
occurrence that has been done is not armed again. Completing today's 9:00 am at
seven used to leave its own alarm standing, and re-arming chose the same 9:00 am
over again, because the time had not passed yet.

Completing a knowt clears its one-shots (`cancelKnowtOneShots`) and resyncs.
Never cancel everything: that would kill the recurring alarm, so doing today's
8:00 am would stop tomorrow's. Every path that records a completion goes through
`completeOccurrence`, not `logCompletion`. `logCompletion` writes a history row
and touches no alarms, which is exactly the bug that let a checked-off knowt
ring: Daily's tap and Detail's check-in both called it directly.

A completion has to name the occurrence it covers, or none of this works. A
completion with no `schedule_id` is a person saying they did the thing, which is
worth recording but does not identify a firing, so it never stands an alarm
down.

Taking a completion back (`undoCompletion`) puts an occurrence back in play and
must resync, or "not done" also means "and it will not remind you".

**A recurring alarm is skipped by taking the day out of the week.**
`scheduleRepeatingAlarm` hands AlarmKit an `Alarm.Schedule.Relative` with a time
and a set of weekdays. There is no start date and no exclusion list, so the
system computes every firing itself and re-arming the same daily recurrence
still produces today's 9:00 am. The only lever is the weekday set, so today's
weekday comes out of it while today's occurrence is done and its time has not
come yet (`skipsToday` in `scheduleSync.ts`).

Nothing is stored to undo that. The day is left out only while those conditions
hold, so the first sync after the time has passed asks the same question, gets a
different answer, and puts the day back. Do not add a flag for it.

**The armed weekdays are part of the signature.** They are not always the days
the schedule stores, and without them in the signature a reduced alarm looks
identical to the full one, so sync leaves the old alarm standing and it rings.

A schedule that rings on a single weekday has nothing left to recur on once that
day comes out, so it falls back to arming the next occurrence on its own. The
recurrence returns with the next sync.

The worst case is bounded and visible: if the app is never opened again, a daily
knowt keeps ringing on the other six days and only that one weekday is missed.
That is the price of the exclusion, and it is better than the alarm stopping.

The Ringing screen is gated as well (`src/ringing/ringGate.ts`, rule in
`src/knowts/completions.ts`). Belt and braces: it covers the single-weekday
fallback, the window before a sync restores the day, and any firing the
exclusion did not reach.

The gate fails open everywhere it is unsure: an unknown knowt, a read that
threw, a firing with nothing due, or a re-fire, snooze or test ring, which are
asked for by name and are not answered by this morning's completion. A
suppressed ring that should have sounded is the app failing at its only job.
That last case is why `prunePastAlarms` keeps a fired one-shot for five minutes:
deleting it the instant its time passed threw away the record of the alarm the
app was being opened by.

## The dev build draws things this project does not

`expo-dev-client` puts a floating "Tools button" in its own window above every
screen: a translucent gray circle with a `gearshape.fill` glyph and a shadow,
at half opacity, in the top right. It is not app code, it appears on every
screen including ones with no such control, and it is absent from release
builds.

It was reported twice as a bug in the app's own settings gear, and answering
from the app's source alone said the gear did not exist there, which was
useless. When a control appears at the same screen position across screens
whose layouts differ, it is an overlay, so look outside the navigator first.

`ios.infoPlist.EXDevMenuShowFloatingActionButton` is `false` so new builds ship
without it. It only sets the registered default, so a device that already has
the preference stored keeps it: turn it off there under Tools button in the dev
menu.

## The Lock Screen is AlarmKit's, not ours

`expo-alarm-kit` hands AlarmKit an `AlarmPresentation` and lets it draw the
banner. What can be set from JavaScript is the title, the tint color, and the
two button labels and their text colors. Not fonts, not layout, not icons, not
extra buttons.

Three limits are in the module's own source, not in AlarmKit:

- `tintColor` defaults to `Color.blue`. That blue was never chosen; it is what
  you get by passing nothing.
- The stop button's SF Symbol is hardcoded to `stop.circle`, so the only way
  the banner can say a scan is needed is the button's label text.
- Every scheduling function declares `struct Meta: AlarmMetadata {}` inline and
  empty. A custom Live Activity needs a widget extension whose
  `ActivityConfiguration` matches `AlarmAttributes<Meta>`, and a `Meta`
  declared privately inside a function body cannot be referenced from another
  target. So no custom view can be attached without patching the package.

`AlarmPresentation` is built with `alert:` only. The countdown and paused
presentations are never configured, which is why a snoozed alarm's banner
carries no buttons: that state has no presentation to draw.

Anything beyond text and color therefore needs a patched or forked
`expo-alarm-kit` plus a widget extension target, and this is a CNG project with
no `ios/` directory, so the target needs a config plugin too. Do not promise
Lock Screen layout work as part of an ordinary rebuild.

## Custom alarm sounds, before anyone commissions audio

`expo-alarm-kit` already carries a `soundName` all the way from JavaScript to
`AlertConfiguration.AlertSound.named(soundName)`, falling back to `.default`.
Our wrapper never passes one, which is why every alarm uses the system default.
The type is ActivityKit's, reused by AlarmKit.

Researched October 2026, because the audio has to be licensed or made before
any of it can be used:

- **Format.** CoreAudio formats work: `.caf`, `.wav`, `.m4a`, `.mp3`. `.aiff` is
  reported not to. `.caf` is what the confirmed-working reports use.
- **Length.** Under 30 seconds. Longer files do not play.
- **Naming.** Pass the filename *with* its extension, `"tone.caf"`, not
  `"tone"`. Apple's own WWDC example omits it, and without it you silently get
  the default sound with no error thrown. The name must match exactly.
- **Location.** The app's main bundle. Apple's documentation also names
  `Library/Sounds` in the app's data container; that one is repeatedly reported
  not to work, so do not plan around it.
- **History.** Custom sounds were broken outright in iOS 26.0, playing a system
  error tone instead. Fixed around 26.0.1 and reported working since. Our
  deployment target is 26.1, so we are above that window, but the feature has a
  shaky record and belongs on a device before it is believed.

Two things are unverified and change what is worth commissioning, so test them
on hardware with one throwaway file first:

- Whether a custom sound **loops**. The default alarm sound repeats; a custom
  one was reported to play once and stop. That decides whether the tones are
  short chimes or thirty second beds, and this app's whole premise is an alarm
  that keeps going until a tag is scanned.
- Whether a custom sound **stops when Stop is pressed**. One report says it
  carries on.

There is no system ringtone picker in AlarmKit, so "let people choose" can only
ever mean choosing among tones we ship.

Bundling them is a config plugin's job. This is a CNG project with no `ios/`
directory, there is no `plugins/` directory yet, and `app.json` has no field for
arbitrary bundle resources.

## Platform boundaries

`react-native-nfc-manager` is imported in exactly one file, and
`expo-alarm-kit` in exactly one file, each behind an interface in
`src/*/types.ts`. Both third-party modules are young; keeping callers ignorant
of them is deliberate. Do not import either outside its implementation file.
