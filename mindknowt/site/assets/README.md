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

**Square, 2000 by 2000, with the disc filling the middle 74 percent and
everything else transparent.** That margin is not spare: both shadows are
painted into the file and need room around the disc. The page sizes the whole
box, and `--disc-in-box` in the stylesheet is the 0.74 that turns a box width
into a disc width, so a replacement has to keep the same proportion or every
placement on the page shifts.

2000 is twice the largest the page can draw it, so it stays sharp on a phone.

The lighting is in the file too: an off white radial gradient with its
highlight up and to the left, cooling toward the bottom right, a thin rim of
light along the top edge, a little thickness along the bottom, then a tight
contact shadow and a wider soft one underneath. A photograph of the real
sticker brings all of that with it, which is why none of it is drawn in CSS.

The mark on it is the app's own `assets/brand/mindknowt-tag-mark.png`, placed
by its rounded rectangle rather than by its bounding box: the rectangle is
centered on the disc and the signal arcs overhang its top right corner, the
way they do on the product. Centering the whole drawing instead pushes the
rectangle down and to the left.

The five tags in the kit cluster are this one file, each turned a few degrees
by the stylesheet. Keep the rotation small, or the light baked into the file
starts coming from a different direction on each one.
