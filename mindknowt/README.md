# MindKnowt

iOS app. Expo SDK 57 (RN 0.86), TypeScript, CNG — no checked-in `ios/` directory.

- Bundle ID: `com.nicandmag.mindknowt`
- Deployment target: iOS 26.0 (`ios.deploymentTarget` in `app.json`)
- `platforms: ["ios"]` — Android is planned but not configured yet

Requires a custom dev client. NFC works in neither Expo Go nor the simulator.

```sh
eas build --profile development --platform ios   # device build, internal distribution
npx expo start --dev-client
```

## Current scope

One screen: open the iOS NFC sheet, show the scanned tag's UID, and keep a
running list of every UID scanned this session. No database, no alarms, no
navigation. `expo-sqlite` is installed but deliberately unused.

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
  screens/ScanScreen.tsx  presentational only
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

`NfcReader.ios.ts` requests `[NfcTech.Ndef, NfcTech.FelicaIOS]`, deliberately:

- On iOS, `requestTechnology` always opens an `NFCTagReaderSession` (never an
  `NFCNDEFReaderSession`), so the tag UID is returned even for tags carrying no
  NDEF payload. Blank/unformatted tags still read.
- `Ndef` is treated as a wildcard by the library's native tech filter — it
  connects to any detected tag type rather than requiring NDEF formatting.
- `FelicaIOS` widens polling to ISO18092 alongside the default ISO14443 +
  ISO15693.

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
