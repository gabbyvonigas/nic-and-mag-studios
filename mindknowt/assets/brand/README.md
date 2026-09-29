# Brand files

The wordmark and marks as supplied, plus the PNG the app actually loads.

| File | What it is |
| --- | --- |
| `wordmark.png` | **The header logo the app loads.** Trimmed from `wordmark.webp` |
| `wordmark.webp` | Wordmark alone, as supplied. Source of record |
| `wordmark-tagline.webp` | Full wordmark with "for busy minds" |
| `app-icon-lime.webp` | Lime rounded square, wordmark |
| `app-icon-lime-tagline.webp` | Lime rounded square, wordmark and tagline |
| `mk-mark.webp` | The "mk." mark, lime circle and check as the period |

## Why there is a PNG next to the webp

React Native on iOS does not decode webp through the standard `Image`, and
`app.json`'s `icon` has to be a PNG, so for a while the wordmark was drawn in
code instead: two lines of text with a lime circle positioned over the "i". It
was an approximation, and it looked like one.

`wordmark.png` is the real artwork. Pillow converts webp, so the conversion is
a one liner now:

    python3 -c "from PIL import Image; \
      im = Image.open('assets/brand/wordmark.webp').convert('RGBA'); \
      im.crop(im.getchannel('A').getbbox()).save('assets/brand/wordmark.png')"

**The crop is the only change, and it removes no artwork.** The supplied file
is a 2000 by 2000 canvas holding a 1352 by 769 logo, sitting off center with
27 percent empty above it and 35 percent below. Loaded whole into a header, the
logo would render small and float high, because `resizeMode: contain` fits the
empty canvas rather than the mark. Cropping to the alpha bounding box removes
only fully transparent pixels; every pixel of the artwork is byte for byte the
one in the webp.

`Wordmark` in `src/components/ui.tsx` takes a height and derives the width from
`WORDMARK_ASPECT`, which is this file's own 1352/769. If the artwork is ever
resupplied at different proportions, that constant moves with it.

## The app icon

Supplied and installed: `assets/icon.png` is the lime square with the tag,
check and signal arcs, 1024 by 1024 PNG. That one has to be a real file,
because iOS reads it from the bundle rather than from the app.
