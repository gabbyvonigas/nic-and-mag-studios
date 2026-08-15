# MindKnowt

iOS app. Expo SDK 57 (RN 0.86), TypeScript, CNG — no checked-in `ios/` directory.

- Bundle ID: `com.nicandmag.mindknowt`
- Deployment target: iOS 26.0 (`ios.deploymentTarget` in `app.json`)
- `platforms: ["ios"]` — Android and web are deliberately not configured

Requires a custom dev client; NFC is unavailable in Expo Go and in the simulator.

```sh
eas build --profile development --platform ios   # device build, internal distribution
npx expo start --dev-client
```

## Current scope

Step 2 of the build order only: a single screen that opens the iOS NFC sheet and
displays the scanned tag's UID. No database, no alarms, no navigation.

## NFC notes

`App.tsx` requests `[NfcTech.Ndef, NfcTech.FelicaIOS]`, which is deliberate:

- On iOS, `requestTechnology` always opens an `NFCTagReaderSession` (never an
  `NFCNDEFReaderSession`), so the tag UID is returned even for tags that carry
  no NDEF payload. Blank/unformatted tags still read.
- `Ndef` is treated as a wildcard by the library's native tech filter — it
  connects to any detected tag type rather than requiring NDEF formatting.
- Including `FelicaIOS` widens polling to ISO18092 alongside the default
  ISO14443 + ISO15693.

UID arrives as a hex string on `tag.id` for MiFare/ISO7816/ISO15693 tags, and on
`tag.idm` for FeliCa; both are handled.

The `react-native-nfc-manager` config plugin writes the
`com.apple.developer.nfc.readersession.formats` entitlement (`NDEF`, `TAG`) and
`NFCReaderUsageDescription`. Verify after changes with:

```sh
npx expo config --type introspect
```

The entitlement requires the **NFC Tag Reading** capability on the App ID in the
Apple Developer portal — EAS credentials sync will fail the build without it.
