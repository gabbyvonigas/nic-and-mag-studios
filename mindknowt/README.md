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

Build-order steps 2 and 4 only — the two hardware risks, proved before any
real screens exist. Two harnesses behind a plain tab switch:

- **NFC** — open the iOS scan sheet, show the tag UID, list every UID scanned
  this session.
- **Alarms** — request AlarmKit permission, schedule a one-shot alarm, and
  prove it reopens the app with its payload when Stop is pressed.

No database, no Knowts, no Ringing screen, no navigation library.
`expo-sqlite` is installed but deliberately unused.

## Layout

```
src/
  theme/index.ts          all colors, fonts, spacing, radii
  nfc/
    types.ts              NfcReader interface, ScannedTag, NfcScanError
    NfcReader.ios.ts      iOS implementation
    NfcReader.android.ts  stub — see TODO(android)
    NfcReader.ts          fallback for other platforms; what TS resolves
    useNfcScanner.ts      session state, platform-agnostic
    index.ts
  alarms/
    types.ts              AlarmScheduler interface, AlarmError, APP_GROUP_ID
    AlarmScheduler.ios.ts iOS implementation (expo-alarm-kit)
    AlarmScheduler.android.ts  stub — see TODO(android)
    AlarmScheduler.ts     fallback for other platforms; what TS resolves
    useAlarmTester.ts     harness state, platform-agnostic
    index.ts
  screens/
    ScanScreen.tsx        presentational only
    AlarmScreen.tsx       presentational only
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
