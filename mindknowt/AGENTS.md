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

## Copy rules

**No em dashes. Anywhere, ever.** Not in user-facing copy, not in comments, not
in JSON content. Use a comma, a colon, a full stop or brackets. Verify with
`grep -rn "\u2014" src/ App.tsx`, which must return nothing.

The rest of the voice rules are spec section 8: sentence case, no exclamation
marks, no emoji, no praise. Errors state what happened and what to do. Empty
screens invite action rather than explain absence.

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
cancelling and re-arming everything each run: with a pre-1.0 alarm module, a
cancel that succeeds followed by a schedule that fails loses the alarm.

Completing a knowt clears its one-shots only (`cancelKnowtOneShots`). Cancelling
everything would kill the recurring alarm, so doing today's 8:00 am would stop
tomorrow's.

## Platform boundaries

`react-native-nfc-manager` is imported in exactly one file, and
`expo-alarm-kit` in exactly one file, each behind an interface in
`src/*/types.ts`. Both third-party modules are young; keeping callers ignorant
of them is deliberate. Do not import either outside its implementation file.
