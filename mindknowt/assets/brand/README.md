# Brand files

The wordmark and marks as supplied. Source of record, not app assets.

**These are `.webp`, which is why nothing here is wired into the app yet.**
React Native on iOS does not decode webp through the standard `Image`, and
`app.json`'s `icon` has to be a PNG. There is no converter in the build
environment (no PIL, no sharp, and jimp does not read webp), so these are kept
as the originals and the app draws what it needs instead.

| File | What it is |
| --- | --- |
| `wordmark-tagline.webp` | Full wordmark with "for busy minds" |
| `wordmark.webp` | Wordmark alone |
| `app-icon-lime.webp` | Lime rounded square, wordmark |
| `app-icon-lime-tagline.webp` | Lime rounded square, wordmark and tagline |
| `mk-mark.webp` | The "mk." mark, lime circle and check as the period |

## What the app uses instead

The `mk.` lockup under each screen title is drawn in code, in `MkMark`. That
keeps it crisp at any size, lets it use the app's own rounded face, and avoids
the format problem entirely. It is the same reasoning as every other icon in
this project.

## What still needs a real file

The home screen app icon. Export the lime square at 1024 by 1024 as PNG and it
replaces `assets/icon.png`. That one cannot be drawn, because iOS reads it from
the bundle rather than from the app.
