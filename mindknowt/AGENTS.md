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
a column became a flex basis and every column stretched to fill its row. Pin
`flexGrow: 0` and `flexShrink: 0` whenever a ScrollView needs a fixed size in a
flex row.

## An animated scrollTo fires the event that called it

The time picker was three snapping `ScrollView`s, and it froze the app. The
settle handler was bound to `onMomentumScrollEnd` and called
`scrollTo({ animated: true })` with no "already there" guard. On iOS an
animated `scrollTo` ends by firing `onMomentumScrollEnd`, so every settle
scheduled another one, nothing converged, and three columns did it at once
until the JS thread stopped answering.

It is gone. Time is picked with `@react-native-community/datetimepicker` in
`display="spinner"`, which is UIKit's own wheel: the snapping, the am and pm
wrap and the touch handling are not ours to get wrong. What that costs is type:
a spinner draws its own font and size, so the rounded family does not reach it.
`textColor` is honored and is set; the surface around it is ours.

If a scroll handler ever has to reposition its own scroll view again, guard on
the offset actually being wrong and use `animated: false`.

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

## One icon set, one component

Every glyph goes through `src/components/Icon.tsx`. Ionicons, outline, sized by
role rather than by a number at the call site. **Do not import Ionicons anywhere
else and do not build an icon out of views.** If a glyph is missing, add a name
to `ICONS`.

This exists because the alternative was tried. Icons were drawn from plain
views, one at a time, and they drifted exactly as you would expect: a filled
heart beside an outlined house beside a clock with its own stroke weight, all
nominally the same size and none of them matching. Chevrons were worse, being
three different things at once: a rotated bordered square, a `'\u203a'` in a
`Text`, and in one place the same glyph turned 180 degrees to mean the other
direction.

The one exception to outline is the completion control on a card, where an
empty ring and a solid tick is how done reads at a glance.

Sizes come from `ICON_SIZE`: `hint` 12, `row` 16, `button` 20, `header` 22,
`tile` 24. Pass `role`, not `size`, unless there is a reason.

## The selection bar was invisible, not missing

`theme.color.surfaceMuted` and `theme.color.background` are the same value,
`#F4F5F6`. Anything filled with `surfaceMuted` and placed on the page
background is painted in the color behind it. The time wheel's selection band
was reported as gone and had in fact been drawn, in page gray on page gray, for
as long as it had been on a screen that was not a white card.

Check a fill against the surface it lands on before trusting it, and prefer a
border for anything that has to read on both the page and a card.

## Scan-only Knowts have no column

A Knowt that never rings is one with no schedule rows. That is all it is.
There is no `scan_only` flag, no migration, and `SCHEMA_VERSION` did not move,
because having no schedule was already a saveable state and already meant
exactly this. `isScanOnly` in `knowts/scanOnly.ts` is the single definition.

What it lacked was a life. `listDashboard` emitted one card per schedule due
today, so a Knowt with none produced none and never appeared on Daily at all.
That was deliberate once: open-mode Knowts used to be shown whether or not they
were due, and it filled Daily with things that were never going to ring. Scan
only is not a return to it. The test is having no schedule rather than having a
mode, the cards sit under their own `Anytime today` heading below the
timetable, and they say "Scan only" where a time would be.

Rules that fall out of the definition rather than being added to it:

- **The daily reset is not a reset.** Done or not is read from the day being
  looked at, so a new day is a new empty window. Nothing runs at midnight and
  nothing is stored to clear.
- **A completion of one can only carry a null `schedule_id`**, because there is
  no schedule to name, which is what makes the per-day read work.
- **No `fired_at`, ever.** `startRinging` is skipped for these: it stamps "an
  alarm went off at this moment" and none did. A false `fired_at` would put the
  Knowt into Avg complete time with a duration measured from the tap, and make
  the resume gate think a firing had been dealt with. The event is written at
  completion by `completeOccurrence`, which leaves it null.
- **Nothing reaches AlarmKit.** `syncScheduledAlarms` and `sweepMissed` both
  loop over `knowt.schedules`, so for one of these the loop body never runs.
  There is no code path from a scan-only Knowt to the alarm module, and
  `scanonlyboard.test.ts` asserts the `pending_alarms` table stays empty.
- **A paused schedule is not scan-only.** Someone switched it off and can
  switch it back on; calling it scan-only would move it to a different part of
  Daily and change what it means.
- **Never marked missed**, for the same reason: `sweepMissed` needs a schedule
  that came due. An unscanned day is not a miss, because nothing rang. That is
  a product choice, not an oversight, and it is one line in the sweep to
  reverse.

**Clock statistics exclude them.** Peak time, Avg complete time and the
time-of-day insight are all claims about when this person answers a reminder. A
scan of a fridge tag at quarter past three says when they walked past the
fridge. `timedCompletions` filters them out before those three are computed.
Avg complete time would already have excluded them through the missing
`fired_at`; filtering as well makes it correct by construction rather than by a
coincidence a later change could undo. Everything else, the rate, the
categories, the trend, the completed list and `X of Y` on Daily, counts them
like any other Knowt.

`isScanOnly` leans toward timed when it cannot tell. A wrong "scan-only"
quietly drops real completions out of those three statistics; a wrong "timed"
leaves them as they already were.

**The ringing screen is reused, not copied.** The scan, the sheet, the note and
the completion are identical; what changes is everything that assumes a ring.
It says SCAN ONLY instead of RINGING and does not pulse, and it offers no
snooze and no "remind me in", because both reschedule an alarm and there is
none to reschedule. A Knowt with no tag gets a way to attach one plus a manual
"Mark done", so it works before the tag arrives.

**Switching is adding or removing schedule rows.** There is no flag, so the
editor's choice does the thing that makes it true: scan only deletes the
schedules, which is the only way to stop something ringing, and asks first
because that is real data. History survives, since completions belong to the
Knowt and not to the schedule that prompted them. Removing them must resync, or
the alarms armed for schedules that no longer exist keep ringing.

The event note moved into `useRingingSession` as part of this. A scan-only Knowt
has no open event to attach a note to, so its note has to go in with the
completion, which means the code writing the completion has to be able to read
it. That is better on the timed path too: the note used to be saved after the
screen had decided to leave, which made it the last thing in a queue of awaits
behind a navigation.

## A scan that does nothing settles nothing

Reported as "the alarm opened the Knowt, the app never asked me to scan, and
tapping Scan did nothing, with no error". All three are one failure.

On iOS `requestTechnology` does not resolve when the reader sheet opens. It
stores the callback and resolves only once a tag is read or the session closes.
The native code builds the session with

    tagSession = [[NFCTagReaderSession alloc]
                  initWithPollingOption:pollFlags delegate:self queue:...];
    [tagSession beginSession];
    techRequestCallback = callback;

and that initializer **returns nil** when the app is not entitled to read tags.
`beginSession` on nil is a no-op, the callback is kept anyway, no delegate ever
fires, and the promise never settles. Nothing throws, so nothing is caught.

Then the screen: `scanning` is cleared in a `finally`, which never runs, and
the Scan button is `disabled={scanning}` with the label `'Scanning'`. So the
auto-scan silently hung, the button went gray and read Scanning, and pressing
it did nothing because it was disabled. One hang, three symptoms.

The fix is a signal, not a timeout of the whole scan: a session that is up and
waiting for a tag must be allowed to wait as long as iOS wants.
`isTagSessionAvailableIOS` reports whether a session object exists, which is
exactly what separates "the sheet is open" from "there was never going to be a
sheet". `scanTag` starts the request without awaiting it, waits
`SESSION_CHECK_MS`, and fails with reason `no-session` if no session exists by
then. A pre-flight `isSupported('iso15693')` catches the same condition sooner.

`isSupported('')` and `isSupported('Ndef')` report
`NFCNDEFReaderSession.readingAvailable`. Every other tech string reports
`NFCTagReaderSession.readingAvailable`, and **that** is the class every scan in
this app opens, so that is the one to ask. `isAvailable()` requires both. The
library's `index.d.ts` declares `isSupported()` with no arguments and
`isTagSessionAvailableIOS` as returning the `Boolean` wrapper; both
declarations are wrong against `src/NfcManager.js`, and they are narrowed once
in `NfcReader.ios.ts` rather than cast at each call.

**The entitlement cannot be read from JavaScript**, so do not claim to check
it. What can be read is whether the system will let a tag session exist, which
is what the entitlement decides. Dev tools, NFC check reports that line, plus
NDEF availability, whether a session is stuck open, and a scan with no alarm in
the way.

The copy for every failure is in `nfc/failureText.ts`, one place, because a
scan is started from five screens and each had written its own version. Exactly
one reason is silent, `canceled`, because backing out of the sheet is not a
failure. Two screens also had the same `canceled` branch written twice, an
`else if` that could never be reached.

The config is right and has always been right: `expo config --type introspect`
generates `com.apple.developer.nfc.readersession.formats` as `[NDEF, TAG]`
alongside the App Group, and `NFCReaderUsageDescription` (no `NS` prefix on
that key). `nfcconfig.test.ts` asserts it, because `ios.entitlements` in
`app.json` carries only the App Group and a merge that dropped the plugin's
keys would look exactly like a correct `app.json`. What cannot be checked from
here is whether the **installed build's provisioning profile** carries the NFC
Tag Reading capability. The App Group entitlement was added in `80dd023`, which
is the build after the one NFC was proven on, and a profile regenerated for a
capability change is the one way this could have regressed without a line of
NFC code changing.

**The once-only claim goes where the thing happens.** The Ringing screen's
auto-scan effect depends on `knowt`, `finish` and `scanToStop`. Setting
`autoScanned.current = true` when the effect ran meant a re-run saw the claim,
returned early, and left the AppState listener torn down with nothing
scheduled: the alarm opened the screen and then never asked for a tag. The flag
is set inside `start()` now, where a scan is actually scheduled.

## A full screen modal's only way out is a handler

`Ringing` is presented with `presentation: 'fullScreenModal'` and
`gestureEnabled: false`, so there is no edge swipe, no backdrop and no back
button. A handler that decides not to navigate is a dead end.

Done decided not to, and the reason was sequencing rather than navigation.
`leave()` was the last statement after an unbroken chain of awaits that ran
through the alarm module, every one of them *after* the completion had already
been written. A rejected native call skipped the line that closed the screen,
the call sites discard the rejection with `void`, and so nothing threw, nothing
logged and nothing on screen changed: the Knowt was done and the screen stayed
up. A native promise that never settled did the same thing and was
indistinguishable from a hang.

Three rules came out of it:

- **The decisive step comes first, and everything after it is housekeeping.**
  `resolve()` writes the completion, and only that can refuse. Canceling
  one-shots and resyncing cannot hold the door shut.
- **Actions report, they do not throw.** Every action on `useRingingSession`
  resolves to a boolean and does not reject. The rule that reads it is
  `shouldLeaveAfter` in `ringing/finishAction.ts`, which leaves on a throw too,
  because being trapped is worse than bookkeeping that went wrong.
- **Every call into the alarm module is bounded.** `alarms/settle.ts` returns a
  rejection instead of throwing one and gives up after
  `ALARM_CALL_TIMEOUT_MS`. Use it for anything a screen is waiting on.

Arming comes before recording for a deferral, which is the opposite of the
order `remindIn` used to run in. A snooze written against an alarm that was
never set is a Knowt that reads as handled and never rings again, so if arming
fails the screen says so and stays up: the alarm is still going, and closing on
it would be the app quietly dropping the reminder.

The way out is `leaveRinging()` in `navigation/navigationRef.ts`, a reset to
`[Tabs]` with Daily selected, for the same reason `navigateToRinging` is a
reset. The way out must not depend on what happens to be underneath.

## The snooze button ran none of our code

`doSnoozeIntent` was never passed. The module reads it as `false` and then
hands AlarmKit `secondaryIntent: nil`, so the snooze button still drew and
still started AlarmKit's own countdown, but no App Intent of ours ran. The
patch that writes a snooze record into App Group storage was in the build and
never executed, `listSnoozes()` always came back empty, and a Lock Screen
snooze was invisible to the app exactly as it had been before the patch.

It is on now. `launchAppOnSnooze` stays off: snoozing must not open the app.

`snoozeDuration` was never passed either, so the module defaulted the countdown
to nine minutes, which is a number nobody chose and does not match the Knowt's
own snooze length. It is passed now, and `snoozeLabel` states the same number
on the button, so the two cannot disagree.

**A snooze and a dismiss are indistinguishable from the launch payload.**
`buildLaunchPayload` is `{alarmId, payload}` and both intents set it, so a
Lock Screen snooze taken while the process is still resident leaves a payload
that looks exactly like a Stop. The evidence is the snooze record: the snooze
intent writes one and the dismiss intent removes it, so `consume()` imports
snoozes before asking `resolveRinging`, and `shouldPresentRinging` treats a
snooze pending ahead of now as an answer. A re-fire pending ahead of now is
deliberately not an answer: the app armed that one itself, nobody said later,
and suppressing a ring nobody asked to suppress is the one thing it must not
do.

## The banner has one line of text, not two

`AlarmPresentation.Alert(title:stopButton:secondaryButton:secondaryButtonBehavior:)`
takes a single `LocalizedStringResource`. There is no subtitle and no body, so
the scheduled time shares the title's line with the Knowt's name. `bannerTitle`
puts the name first and the time last, because the system truncates the tail: a
long name costs the time rather than the name.

Both buttons take a label as well as an SF Symbol, and the labels are ours.
`stopLabel` is the only place the banner can say a scan is needed, since
`stop.circle` is hardcoded in the module. `snoozeLabel` is why the `zzz` glyph
does not have to carry the meaning on its own.

The banner text is part of the alarm's signature, along with the Knowt's mode
and snooze length. Neither is the schedule's time, so without them an alarm
armed before either changed looked identical to the right one and sync left it
standing.

## A swipe is stolen by default

`PanResponder`'s `onPanResponderTerminationRequest` returns true unless you say
otherwise, so any other responder may take the gesture mid swipe. The list is a
ScrollView and it asks. The row then got `onPanResponderTerminate`, sprang back
to zero, and closed itself: Delete flashed and vanished, every time.

Two lines fix it, and both are needed: refuse the request, and
`onShouldBlockNativeResponder` so the list does not scroll under a swipe that
has already started. Terminating must also return the row to the state it was
actually in, not to shut.

Which row is open lives in `swipeRegistry.ts`, module state, so only one is ever
open and an unmounting row releases its claim. Never let a row assume it is the
only one.

## "Knowt" is capitalized in copy and lowercase in code

Every user-facing string says Knowt and Knowts. Identifiers, table names, route
paths, file names and JSON field names stay lowercase.

A blanket rewrite will get this wrong, and did: it capitalized import paths, the
`knowts` table in `schema.ts`, the `knowts` deep link segment, and inside test
files a property key and a helper function, because a regex matching between
quotes happily matches across two separate quoted strings on one line. Capitalize
inside the literal only, skip `${...}` expressions, and read the diff before
trusting it.

## What the alarm screen can and cannot be told to do

Researched October 2026 against the module's Swift and Apple's material, before
anything was built.

**Opening the app puts you on the right screen only if a button was pressed.**
`getLaunchPayload()` is set in exactly four places, all of them App Intents:
`AlarmDismissIntent`, `AlarmDismissIntentWithLaunch`, `AlarmSnoozeIntent` and
`AlarmSnoozeIntentWithLaunch`. Tapping the banner or the Dynamic Island runs no
intent, so the payload is nil and the app opens wherever it last was. AlarmKit's
`AlarmPresentation.Alert` takes a title and two buttons and has no tap action to
hang a deep link on.

The module also never reads `AlarmManager.shared.alarms` or `alarmUpdates`, so
JavaScript cannot ask which alarm is alerting right now. `getAllAlarms()` reads
App Group storage, which is a list of ids the app wrote, not live state. Until
that is exposed, there is no deterministic way to answer "what is ringing".

**The SF Symbols on both buttons are hardcoded** in the module, not passed from
JavaScript: `stop.circle`, and `clock.badge.checkmark` until the patch made it
`zzz`. What can be set is the title, the tint color, both button labels and both
label colors. The labels carry the meaning the glyphs cannot, which is why
`snoozeButtonLabel` says how many minutes rather than just "Snooze".

**A snooze taken on the Lock Screen does not open the app, and did not used to
reach it at all.** `launchAppOnSnooze` stays unset, so `AlarmSnoozeIntent` runs
with `openAppWhenRun = false` and AlarmKit restarts its own countdown.
`launchPayload` is a static variable, not App Group storage, so it does not
survive to the next launch. The patched intent writes `{alarmId, endsAt,
payload}` into the App Group instead, and `importExternalSnoozes` turns that
into a `pending_alarms` row of kind `snooze` on the next launch. That only
works with `doSnoozeIntent: true`, which is the part that was missing: see
"The snooze button ran none of our code".

**A live countdown needs a widget extension.** `AlarmPresentation` is built with
`alert:` only, so the countdown and paused states have nothing to draw even
though `secondaryButtonBehavior: .countdown` and a `postAlert` duration are both
set. Adding `countdown:` is not enough on its own: the countdown and paused
Live Activity views are drawn by the app's widget extension, and that extension
needs an `ActivityConfiguration` over the same `AlarmAttributes<Meta>` the alarm
was scheduled with. `Meta` is declared `struct Meta: AlarmMetadata {}` inline
inside each scheduling function, so no other target can name it. The alerting UI
is drawn by the system.

## Upcoming was gated, not removed

Reported as having been deleted from Daily. It never was. `showUpcoming` in
`knowts/dayProgress.ts` required `remaining === 0`, so the section only
rendered on a day that was already completely clear, and the component, the
query and the render were all still there the whole time. `git log -S` finds
one commit touching the function, `d99a9c9`, which *added* it in that shape.

The gate is now `stance === 'today'` and something scheduled, so the section
appears whenever there is anything ahead. It renders last, under the day's own
list: it is reference rather than work, and above the list it buried the day.

## The Log has one summary, not two

Every card on the Log reads `summarizeRange` for the span on the toggle. It used
to read `summarizeMonth` for the tiles, the method row and the gap cards, behind
a `periodKind === 'month'` check, and `summarizePeriod` for the trend panel. So
Day and Week showed a smaller screen, and the two sets of numbers had no reason
to agree with each other.

`loadMonthLog` and `loadMonthSummary` are no longer called by anything. They are
left in place with their tests rather than deleted in passing.

The two gap cards, Knowts without a tag and Knowts without a schedule, are
present tense on purpose. A Knowt has a tag now or it does not; scoping that to
a span would be answering a different question.

## ON HOLD until Apple org approval

Nothing in this list gets touched until the Apple Developer organization
account for Nic & Mag Studios LLC is approved. Each of them either needs that
team to exist or is not worth polishing until it does.

- Sign in with Apple.
- iCloud and CloudKit sync.
- Moving the bundle id `com.nicandmag.mindknowt` to the new team.
- The App Store Small Business Program.
- The Paid Apps agreement, banking and tax.
- The free tag Shopify claim: the Storefront token in `.env.local`, a zero cost
  shipping rate, and activating the free pack product.

The claim screen and the Shopify code already written stay as they are. Do not
change `Your first 5 tags`, the claim flow, the checkout, or anything about
accounts, sign-in or sync.

## v1.1, deliberately not built

- **Lock Screen and Dynamic Island countdown for a snooze.** Needs a widget
  extension with an `ActivityConfiguration` over `AlarmAttributes<Meta>`, and
  `Meta` is declared `struct Meta: AlarmMetadata {}` inline inside each
  scheduling function, so no other target can name it. The fork would have to
  hoist `Meta` to a shared type and add `countdown:` to `AlarmPresentation`,
  and a CNG project needs a config plugin to generate the extension target.
  The alerting UI stays system drawn either way.
- **Live alarm state from AlarmKit.** `AlarmManager.shared.alarms` is a
  throwing getter and the states are `.scheduled`, `.countdown`, `.paused`,
  `.alerting`, but whether the property on `Alarm` is `state` or `mode` could
  not be confirmed without Xcode, and a wrong guess fails the build rather than
  degrading. Opening the right Knowt during a ring is done from the app's own
  records instead (`resumeGate.ts`). Check the name in Xcode's completion
  before adding it.
- **A real tone set.** The bundled `mindknowt-test-tone.caf` is a throwaway for
  answering the two open questions, not a product sound.

## The module is patched, not forked

`patches/expo-alarm-kit+0.1.11.patch` is applied by `patch-package` from the
`postinstall` script. It covers the Swift, the compiled `build/` JavaScript and
the `src/` TypeScript, because the package ships `build/index.js` as its entry
and patching the source alone changes nothing at runtime.

What it changes:

- The snooze button's SF Symbol, `clock.badge.checkmark` to `zzz`. The label
  was already "Snooze"; the glyph is what read as something else.
- Snooze records in App Group storage. The snooze App Intent runs without
  launching the app, so it writes `{alarmId, endsAt, payload}` where the app can
  read it on its next launch. `launchAppOnSnooze` stays off: snoozing must not
  open the app.
- The snooze length and payload are stored when the alarm is scheduled, because
  the intent is handed an alarm id and nothing else.
- Dismissing clears any snooze record for that alarm.

Nothing in the patch calls an Apple API that was not already being called. That
is deliberate: there is no Swift toolchain in this environment, so a patch
cannot be compiled here, and the blast radius of a wrong guess is a failed
twenty minute build.

## Platform boundaries

`react-native-nfc-manager` is imported in exactly one file, and
`expo-alarm-kit` in exactly one file, each behind an interface in
`src/*/types.ts`. Both third-party modules are young; keeping callers ignorant
of them is deliberate. Do not import either outside its implementation file.
