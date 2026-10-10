# Site images

| File | What it is | Swapping it |
|---|---|---|
| `knowt-tag.png` | The Knowt Tag disc: a white circle with the tag mark on it, transparent outside the circle. | One file, used in the hero, in two of the step cards and five times in the kit cluster. Replace it and all eight update together. |
| `screens/daily.png` | The Daily screen. | See `screens/README.md`. |
| `screens/knowts.png` | The Knowts screen. | See `screens/README.md`. |
| `screens/log.png` | The Log screen. | See `screens/README.md`. |
| `wordmark.png` | The stacked lockup, copied from the app's `assets/brand/wordmark.png` unmodified. | Header, footer and the menu overlay. |
| `og-image.png` | The link preview card, generated from the wordmark. | 1200 by 630. |
| `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` | Derived from the app's shipped `assets/icon.png`. | |
| `nav.js` | The menu. The only JavaScript on the site. | |

## knowt-tag.png

**Square, 1000 by 1000, transparent outside the disc.** The shadow under it is
drawn in CSS, not baked into the file, so a replacement does not need one and
cannot end up with two.

The current file is built from the app's own `assets/brand/mindknowt-tag-mark.png`
on a plain white circle, with the mark at 40 percent of the disc. It stands in
for the real product shot, which will have a sticker on it.

The page never sizes it by its own height, only by a percentage width of the
box it sits in, so a replacement at a different resolution needs no code
change as long as it stays square and keeps the disc centered.
