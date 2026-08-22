# MindKnowt

iOS app. Expo SDK 57 (RN 0.86), TypeScript, CNG — no checked-in `ios/` directory.

- Bundle ID: `com.nicandmag.mindknowt`
- Deployment target: iOS 26.1 (`ios.deploymentTarget` in `app.json`) — AlarmKit module requires it
- `platforms: ["ios"]` — Android is planned but not configured yet

Requires a custom dev client. NFC works in neither Expo Go nor the simulator.

```sh
eas build --profile development --platform ios   # device build, internal distribution
npx expo start --dev-client
```

## Current scope

Build-order steps 1 to 4. The two hardware risks are proved on device; the
database and the Open-mode screens are built on top of them.

- **Today** — today's instances in time order, completed by tapping done.
- **All knowts** — grouped by category.
- **Add a knowt** — sequential, one decision per screen.
- **Knowt detail** — notes inline-editable, schedules, history.
- **Ringing** — the route an alarm reopens the app to. Deliberately a stub;
  scan-to-stop, snooze, override and the re-fire loop are step 5.
- **Dev** — app_meta, wipe/reseed, and the NFC and AlarmKit harnesses.

Everything is Open mode. No alarms are scheduled from knowts yet, and Strict
and Soft modes do not exist outside the schema.

## Layout

```
src/
  theme/index.ts          all colors, fonts, spacing, radii
  components/ui.tsx       shared primitives
  db/
    schema.ts             DDL, spec section 3; PRAGMA user_version migrations
    database.ts           open, migrate, app_meta, clear/destroy
    seed.ts               example content, seedIfEmpty, reseed
    knowts.ts             repository queries
    scheduling.ts         isDueOn and repeat description
    useQuery.ts           refetch on screen focus
  navigation/
    types.ts              route params
    linking.ts            URL routing
    navigationRef.ts      imperative routing from the alarm payload
    RootNavigator.tsx     tabs plus stack
  nfc/                    NfcReader interface + iOS implementation
  alarms/                 AlarmScheduler interface + iOS implementation
  screens/                one file per screen, presentational
```

### Platform boundary

`NfcReader` in `src/nfc/types.ts` is the only NFC contract the app depends on.
`react-native-nfc-manager` is imported in exactly one file (`NfcReader.ios.ts`);
the hook and screen never touch it. Metro picks the implementation by filename
at bundle time, so adding Android means filling in `NfcReader.android.ts` and
changing nothing else.

`NfcReader.ts` exists because Metro resolves platform suffixes but TypeScript
does not — it is what `./NfcReader` types against, which forces all three
implementations to share one shape.

Native errors are mapped to a platform-neutral `NfcFailureReason` union, so
screen copy never branches on an iOS-specific error class.

### Theme

Branding is not final. `src/theme/index.ts` holds the raw palette privately and
exposes semantic tokens (`textPrimary`, `dangerSurface`, `accent`). No screen
hardcodes a hex value or font family — rebranding is one file.

## NFC notes

`NfcReader.ios.ts` requests `[NfcTech.Ndef]` and nothing else, deliberately:

- On iOS, `requestTechnology` always opens an `NFCTagReaderSession` (never an
  `NFCNDEFReaderSession`), so the tag UID is returned even for tags carrying no
  NDEF payload. Blank/unformatted tags still read.
- `Ndef` is treated as a wildcard by the library's native tech filter — it
  connects to any detected tag type rather than requiring NDEF formatting.
- Default polling is ISO14443 + ISO15693, which covers the NTAG213/215/216
  stickers this product targets.

**Do not add `NfcTech.FelicaIOS`.** It switches on ISO18092 polling, which iOS
rejects unless the app also declares
`com.apple.developer.nfc.readersession.felica.systemcodes` in Info.plist. While
it was present, every scan failed instantly — no scan sheet, empty error
message, no tag ever involved. Confirmed on device. FeliCa is a Japanese
transit format with no use here; if it is ever genuinely needed, pass
`systemCodes` to the config plugin in `app.json` first.

UID arrives as a hex string on `tag.id` for MiFare/ISO7816/ISO15693 tags and on
`tag.idm` for FeliCa; both are handled.

The `react-native-nfc-manager` config plugin writes the
`com.apple.developer.nfc.readersession.formats` entitlement (`NDEF`, `TAG`) and
`NFCReaderUsageDescription`. Note the key has no `NS` prefix — Apple's key is
`NFCReaderUsageDescription`. Verify after changes with:

```sh
npx expo config --type introspect
```

The entitlement requires the **NFC Tag Reading** capability on the App ID in the
Apple Developer portal, or EAS credentials sync will fail the build.

## AlarmKit notes

`expo-alarm-kit` is pre-1.0 and third-party. It is confined to
`AlarmScheduler.ios.ts` behind the `AlarmScheduler` interface precisely so it
can be replaced without touching callers.

Its README documents setup through Xcode, which does not apply here — this is a
CNG project with no `ios/` directory, so everything is expressed in `app.json`
and generated at prebuild:

| Requirement | Where it lives |
|---|---|
| iOS 26.1 deployment target | `ios.deploymentTarget` |
| `NSAlarmKitUsageDescription` | `ios.infoPlist` |
| App Group | `ios.entitlements` → `com.apple.security.application-groups` |

**26.1, not 26.0** — the module's podspec declares `:ios => '26.1'`, so a 26.0
target fails pod install.

The App Group id in `app.json` must match `APP_GROUP_ID` in
`src/alarms/types.ts` exactly. They are the shared container between the app
and the AlarmKit dismiss intent; a mismatch makes `configure()` return false and
every schedule fail.

`launchAppOnDismiss: true` is the mechanism behind the product's core promise:
the Lock Screen Stop button reopens MindKnowt rather than silently clearing the
alarm. `dismissPayload` round-trips through `consumeLaunch()`, and is how a
knowt id will survive the launch and select the Ringing screen.

`consumeLaunch()` clears the payload natively on read, so it is called on mount
*and* on every foreground transition — the alarm can fire while the app is
already running.

## Database

Schema is spec section 3 verbatim: `knowts`, `categories`, `schedules`,
`events`, `app_meta`. `PRAGMA user_version` records the migration level; bump
`SCHEMA_VERSION` when the DDL changes.

`install_generation` is written as `pre_ads` on first launch with
`INSERT OR IGNORE`, so it is created if absent and can never be overwritten
afterwards — including by a reseed. Spec section 3 calls it impossible to
retrofit, which is why it is written before any content exists. `first_launch_at`
is stamped the same way. Both are visible on the Dev screen.

Two different wipes, deliberately:

| Function | Effect |
|---|---|
| `reseed()` | Clears content tables, re-inserts examples. **Leaves `app_meta` alone.** |
| `destroyDatabase()` | Deletes the file. The next open is a genuine first launch. |

The seed inserts the six shipped categories and five Open-mode knowts, using
the spec's own note examples, so the screens are populated during testing.
`seedIfEmpty()` runs at launch and does nothing once real knowts exist.

`scheduling.ts` is pure logic with no device dependency, and is covered by
assertions for every repeat type including `supply`, which counts backward from
running out rather than forward on a fixed interval.

## Navigation and deep linking

React Navigation, native stack plus bottom tabs. Every route is addressable:

```sh
npx uri-scheme open "mindknowt://ringing/<knowtId>" --ios
```

**AlarmKit does not deliver a URL.** It relaunches the process and leaves a
payload, so routing from an alarm is imperative, via `navigationRef`. The
linking config exists so the Ringing screen can be exercised without waiting for
a real alarm, and is what spec section 9's queued Shortcuts action will build on.

`consumeLaunch()` clears the payload natively on read, so exactly one caller may
invoke it. `App.tsx` owns that call and publishes the result through
`src/alarms/launchStore.ts`; the router and the dev harness both subscribe
rather than reading the native side again.
