# Site images

Every picture on the landing page is a file in this folder. Nothing on the
page draws a device, a plant, a tag or a stroke of lime in CSS or SVG, so
replacing any of these with a real render or photograph is a file swap with
no code change, as long as the replacement keeps the size and the shape
below.

| File | What it is | Size | Format | Must keep |
|---|---|---|---|---|
| `knowt-tag.png` | The Knowt Tag disc, used eight times from this one file | **2000 x 2000** | PNG, transparent | The disc fills the middle **74 percent**, centered. Rim, lighting and both shadows baked in. |
| `phone-hero.png` | The large hero phone, Daily screen | **852 x 1796** | PNG, transparent outside the body | The body touches all four edges. **No shadow baked in**, the page adds it. |
| `phone-kit.png` | The large kit panel phone, Knowts screen | **852 x 1796** | PNG, transparent outside the body | Same as above. |
| `step-stick.png` | Step 01, a plant in a pot on a pale lime wash | **800 x 800** | PNG, transparent | Square. The wash is part of the image, the tag is not. Keep the lower right clear. |
| `step-set.png` | Step 02, an upright phone with four category rows | **800 x 800** | PNG, transparent | Square. |
| `step-tap.png` | Step 03, an upright phone with one Knowt row done, and the signal arcs | **800 x 800** | PNG, transparent | Square. Keep the lower right clear, the tag sits there. |
| `screens/daily.png` | The Daily capture, for the small system row phone | 804 x 1748 | PNG | A plain capture. That frame is CSS. |
| `screens/knowts.png` | The Knowts capture | 804 x 1748 | PNG | Same. |
| `screens/log.png` | The Log capture | 804 x 1748 | PNG | Same. |
| `wordmark.png` | The stacked lockup, copied from the app's brand folder unmodified | 1352 x 769 | PNG, transparent | Header, footer, menu. |
| `og-image.png` | The link preview card | 1200 x 630 | PNG | |
| `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` | Derived from the app's shipped icon | | PNG | |
| `fonts/Quicksand-variable.woff2` | The whole typeface, one file | | woff2 | See below. |
| `nav.js` | The menu. The only JavaScript on the site. | | | |

PNG rather than JPEG everywhere because every one of them needs a transparent
background, and at these sizes none of it is big enough to be worth a format
argument. **Deliver replacements at the exact pixel sizes above**: the page
sizes each one as a percentage of the box it sits in, so a different aspect
ratio shifts the layout around it.

## knowt-tag.png

The disc fills the middle **74 percent** of the square and the rest is
transparent. That margin is not spare: both shadows are painted into the file
and need room around the disc. `--disc-in-box` in the stylesheet is the 0.74
that turns a box width into a disc width, so a replacement that fills more or
less of its square moves all eight placements.

2000 is twice the largest the page can ever draw it, so it stays sharp on a
phone.

The lighting is in the file: an off white radial gradient with its highlight
up and to the left, cooling toward the bottom right, a thin rim of light
along the top edge, a little thickness along the bottom, then a tight contact
shadow and a wider soft one under it. A photograph of the real sticker brings
all of that with it, which is why none of it is in CSS.

The mark is placed by its rounded rectangle rather than by its bounding box:
the rectangle is centered on the disc and the signal arcs overhang its top
right corner, the way they do on the product.

The five tags in the kit cluster are this one file, each turned a few degrees
by the stylesheet. Keep the rotation small, or the baked light starts coming
from a different direction on each one.

## phone-hero.png and phone-kit.png

Frame, screen and island in one image, transparent outside the rounded body.
**No shadow baked in**: the page adds `filter: drop-shadow`, which follows the
alpha of a rounded body, and a render that brought its own would wear two.

For a real device render, the body should touch all four edges of the file
with no padding, and the screen content should already be in it.

The three small phones in the system row are not these. They are plain
captures from `screens/` in a CSS frame, because at 150 points wide that
frame is four lines of CSS and a second set of files is not worth keeping in
sync.

## knowt-tag.png, and the real sticker

The product is a 25mm round sticker 0.8mm thick: flat matte white, a crisp
thin rim all the way round, and almost no thickness to speak of. The file
carries all three. It used to swell along the bottom, which read as a puck a
few millimeters thick, and it had no rim at all, which is the one feature the
product photographs make unmistakable. 0.8 on 25 is three percent, so the
thickness is a hairline and nothing more.

## The step illustrations

Square, transparent, with the pale lime wash included. The Knowt Tag is not
in them: it is `knowt-tag.png` laid over the top by the stylesheet, so one
file still changes every tag on the page.

Three things are shared deliberately, and a replacement should keep them or
the three tiles stop reading as a set:

- **One stroke weight.** 16 units on the 800 box, which is what all three were
  already drawn at and what a replacement should keep.
- **One wash.** `#DDF495`, an ellipse of 324 by 300, centered on whatever the
  tile's subject is.
- **One clear corner.** The lower right, because the stylesheet lays the tag
  badge there on Stick and on Tap at one size and one position. It used to
  hang off two different edges at two different sizes.

**The phones are upright.** They were tilted, and a tilted phone at this size
reads as a phone lying on its side. Step 01 is untouched: the subject is the
plant pot it has always been.

Step 03's screen carries one Knowt row in its done state, the category's pale
tint with a solid check, which is how a completed Knowt actually looks. It used
to be empty. The name on that row is two bars rather than type, because at the
104 to 130 points the page draws this tile, lettering is smaller than a pixel
and reads as grit.

The lime slashes beside them are gone. They were a comic book motion line,
which is not a language the rest of the page speaks. Step 03 carries three
arcs instead, struck in the tag mark's own idiom at the mark's own weight, in
the gap the signal actually crosses between the tag and the phone. Steps 01 and
02 carry none: nothing is being tapped in either, and a motion cue with
nothing moving is decoration.

## Regenerating these

`illustrations.py` draws the three step files and `tag-disc.py` draws the
disc. Both need Pillow, and `illustrations.py` needs Quicksand as a TTF, which
`fontTools` will make from the woff2 beside it. Neither runs as part of
serving the site, which still has no build step: they are here so the next
change to a drawing is an edit rather than a redraw.

## fonts/Quicksand-variable.woff2

One file, the whole typeface, `wght` axis 300 to 700, latin subset, OFL
licensed. `OFL.txt` beside it is the license.

There used to be three files named 400, 500 and 700, and **they were not
three weights**. The 700 file was this variable font. The other two were
`&text=` subsets whose only letter from the alphabet was a capital A, so
anything set at 400 or 500 drew its A from Quicksand and every other letter
from the next font in the stack. That is why one letter in CLEANING, ADMIN
and PLANT looked like a different typeface: every letter except the A was.

Do not go back to per-weight files. A variable font cannot have a weight
missing and cannot disagree with its own name.
