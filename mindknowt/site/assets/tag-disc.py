"""
The Knowt Tag disc, drawn to the real sticker's measurements.

The product is a 25mm round paper sticker 0.8mm thick: flat matte white, not a
glossy button. Three things in the previous version of this file were wrong
against the photographs. It had a radial gradient, which gave it a sheen no
matte paper has. It had a gray ring all the way round, which is an outline
rather than an edge. And its shadow was wide and soft enough that the disc
looked to be floating a centimeter above the page instead of lying on it.

What replaces them: a flat face with a barely visible tonal variation, a
hairline of slightly darker white along one side only, which is the edge the
stack photograph actually shows, and a tight contact shadow a couple of pixels
down at the size the page draws this.

The printed mark is placed by its RECTANGLE, not by its ink bounding box. The
signal arcs overhang the rectangle's top right the way they do on the product,
so centering on the ink would push the rectangle down and left of the middle.

One routine, largest_ink(), measures the rectangle in the source artwork and
again in the finished file. Using the same routine for both is what keeps the
scaling honest: an earlier version measured the two with different bounding
box conventions, one inclusive and one of PIL's exclusive ones, and drew the
rectangle a little under two pixels short without anything looking wrong.

Run: python3 tag-disc.py      (writes knowt-tag.png beside itself)
     python3 tag-disc.py test (measures the result and checks it)
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# --- the product ---------------------------------------------------------
#: The sticker, across. Three quarters of an inch.
#:
#: This is the one number that moves if the product changes size. The icon's
#: printed height does not move with it, so a smaller disc means the mark
#: covers more of it, and RECT_RATIO is what carries that through to the
#: drawing and to the test.
DISC_MM = 19.05
DISC_IN = 0.75                     # the same, in inches
ICON_RECT_IN = 0.35                # the mark's rectangle, printed height
#: The rectangle's height as a fraction of the disc. 0.35 over 0.75.
RECT_RATIO = ICON_RECT_IN / DISC_IN
#: What the test holds it to, and how far it may drift.
RECT_RATIO_NOMINAL = 0.467
RECT_RATIO_TOLERANCE = 0.005
#: The rectangle's center may sit this far from the disc's, in file pixels.
CENTER_TOLERANCE_PX = 1.0

# --- the file ------------------------------------------------------------
BOX = 2000                         # delivered square, per README.md
IN_BOX = 0.74                      # --disc-in-box in the stylesheet
D = BOX * IN_BOX                   # the disc, 1480
R = D / 2
CX = CY = BOX / 2

#: The largest the page ever draws this, so "a pixel at the displayed size"
#: can be turned into file pixels. The hero disc is about 230 points across.
#: The largest the page draws this. At real-world scale the hero disc is
#: 26.5 percent of the phone frame, which is about 110 points at the widest
#: the phone gets, not the 230 it was when the disc was drawn oversized.
#:
#: The shadow and the rim are set as multiples of PER_DISPLAY_PX, which makes
#: them fixed fractions of the diameter, so they scale with the disc rather
#: than staying put as it shrinks. That is what keeps a shadow tuned at one
#: size from looking heavy at another.
DISPLAY_PX = 110.0
PER_DISPLAY_PX = D / DISPLAY_PX

FACE = (253, 253, 252)             # matte, barely off white
RIM = (231, 229, 225)              # the edge, a touch darker than the face
SHADOW = (92, 86, 79)              # slightly warm gray
SHADOW_ALPHA = 54                  # low: it is a sticker lying flat
#: Measured at DISPLAY_PX, so each is a fixed fraction of the diameter.
SHADOW_OFFSET_PX = 1.0
SHADOW_BLUR_PX = 1.5
RIM_PX = 0.55
GRAIN = 2                          # tonal variation, in levels of 255
INK_LEVEL = 17                     # the printed mark, measured off the artwork
#: Halfway between ink and face, where an antialiased edge pixel is half
#: covered. A darker cutoff trims that edge and reports the shape short.
INK_CUT = (INK_LEVEL + FACE[0]) // 2

MARK_SRC = os.environ.get(
    'MK_MARK', '../../assets/brand/mindknowt-tag-mark.png',
)
MARK_CANVAS = 512
#: Measured off that artwork, and re-measured at build time. Recorded here so
#: the geometry is readable, and cross-checked so a new drawing cannot change
#: it silently.
MARK_RECT = (61, 114, 361, 484)
MARK_RECT_SLACK = 3


def largest_ink(im):
    """
    The largest connected run of ink in an RGBA image, as an inclusive
    (x0, y0, x1, y1) over the whole image.

    The mark's arcs are separate strokes, so the largest run is the rectangle.
    """
    flat = Image.new('RGB', im.size, FACE)
    flat.paste(im, (0, 0), im)
    ink = flat.convert('L').point(lambda v: 255 if v < INK_CUT else 0, '1')
    box = ink.getbbox()
    if not box:
        raise SystemExit('no ink found')
    # Walk only the region the ink occupies, not the whole square.
    ox, oy = box[0], box[1]
    sub = ink.crop(box).convert('L')
    w, h = sub.size
    data = sub.load()
    seen = [[False] * w for _ in range(h)]
    best = None
    for sy in range(h):
        for sx in range(w):
            if seen[sy][sx] or not data[sx, sy]:
                continue
            stack = [(sx, sy)]
            seen[sy][sx] = True
            n = 0
            x0 = x1 = sx
            y0 = y1 = sy
            while stack:
                x, y = stack.pop()
                n += 1
                if x < x0:
                    x0 = x
                if x > x1:
                    x1 = x
                if y < y0:
                    y0 = y
                if y > y1:
                    y1 = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and data[nx, ny]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if best is None or n > best[0]:
                best = (n, x0, y0, x1, y1)
    _, x0, y0, x1, y1 = best
    return (x0 + ox, y0 + oy, x1 + ox, y1 + oy)


def disc_mask(size, cx, cy, r, ss=4):
    """A clean circle, built big and scaled down because PIL will not antialias."""
    m = Image.new('L', (size * ss, size * ss), 0)
    ImageDraw.Draw(m).ellipse(
        [(cx - r) * ss, (cy - r) * ss, (cx + r) * ss, (cy + r) * ss], fill=255,
    )
    return m.resize((size, size), Image.LANCZOS)


def build():
    out = Image.new('RGBA', (BOX, BOX), (0, 0, 0, 0))
    mask = disc_mask(BOX, CX, CY, R)

    # --- contact shadow ---------------------------------------------------
    # Two pixels down and three of blur at the displayed size. Anything wider
    # reads as the disc hovering rather than resting.
    dy = round(SHADOW_OFFSET_PX * PER_DISPLAY_PX)
    blur = SHADOW_BLUR_PX * PER_DISPLAY_PX
    sh = Image.new('L', (BOX, BOX), 0)
    ImageDraw.Draw(sh).ellipse(
        [CX - R, CY - R + dy, CX + R, CY + R + dy], fill=SHADOW_ALPHA,
    )
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    layer = Image.new('RGBA', (BOX, BOX), SHADOW + (0,))
    layer.putalpha(sh)
    out = Image.alpha_composite(out, layer)

    # --- the face ---------------------------------------------------------
    # Flat, with a tonal variation of a couple of levels. No gradient: matte
    # paper has no highlight to catch.
    face = Image.new('RGB', (BOX, BOX), FACE)
    noise = Image.effect_noise((BOX, BOX), 18).point(
        lambda v: 128 + (v - 128) * GRAIN / 128
    )
    face = ImageChops.add(face, noise.convert('RGB'), scale=1, offset=-128)
    face = face.filter(ImageFilter.GaussianBlur(0.6)).convert('RGBA')
    face.putalpha(mask)
    out = Image.alpha_composite(out, face)

    # --- the edge ---------------------------------------------------------
    # One side only, a hairline at the displayed size. The stack photograph
    # shows the cut edge catching along the lower side and nothing at all
    # opposite it, so this is a full thin ring faded out by a gradient rather
    # than an arc, which would stop somewhere visible.
    w = max(1, round(RIM_PX * PER_DISPLAY_PX))
    ss = 4
    rim = Image.new('L', (BOX * ss, BOX * ss), 0)
    ImageDraw.Draw(rim).ellipse(
        [(CX - R) * ss + ss, (CY - R) * ss + ss,
         (CX + R) * ss - ss, (CY + R) * ss - ss],
        outline=255, width=w * ss,
    )
    rim = rim.resize((BOX, BOX), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
    # Full at the bottom, gone by a little above the middle.
    fade = Image.linear_gradient('L').resize((BOX, BOX))
    rim = ImageChops.multiply(rim, fade)
    rim = ImageChops.multiply(rim, mask)
    rim_layer = Image.new('RGBA', (BOX, BOX), RIM + (0,))
    rim_layer.putalpha(rim)
    out = Image.alpha_composite(out, rim_layer)

    # --- the printed mark -------------------------------------------------
    mark = Image.open(MARK_SRC).convert('RGBA')
    rx0, ry0, rx1, ry1 = largest_ink(mark)
    for got, want in zip((rx0, ry0, rx1, ry1), MARK_RECT):
        if abs(got - want) > MARK_RECT_SLACK:
            raise SystemExit(
                f'the artwork has changed: rectangle {(rx0, ry0, rx1, ry1)} '
                f'is not {MARK_RECT}'
            )
    scale = (RECT_RATIO * D) / (ry1 - ry0 + 1)
    size = round(MARK_CANVAS * scale)
    mark = mark.resize((size, size), Image.LANCZOS)
    # Where the rectangle's center lands inside the scaled mark, then the
    # paste that puts that point on the disc's center.
    rcx = ((rx0 + rx1 + 1) / 2) * scale
    rcy = ((ry0 + ry1 + 1) / 2) * scale
    out.alpha_composite(mark, (round(CX - rcx), round(CY - rcy)))

    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, 'knowt-tag.png')
    out.save(path)
    print(f'wrote {path} {out.size}')
    return path


def measure(path):
    x0, y0, x1, y1 = largest_ink(Image.open(path).convert('RGBA'))
    return {
        'rect': (x0, y0, x1, y1),
        'height': y1 - y0 + 1,
        'ratio': (y1 - y0 + 1) / D,
        'dx': (x0 + x1 + 1) / 2 - CX,
        'dy': (y0 + y1 + 1) / 2 - CY,
    }


def test(path):
    m = measure(path)
    print(f'  rectangle      : {m["rect"]}  height {m["height"]}px')
    print(f'  disc diameter  : {D:.0f}px')
    print(f'  rect / disc    : {m["ratio"]:.5f}   target {RECT_RATIO:.5f}')
    print(f'  center offset  : dx {m["dx"]:+.1f}px  dy {m["dy"]:+.1f}px')
    ok = True
    if abs(m['ratio'] - RECT_RATIO_NOMINAL) > RECT_RATIO_TOLERANCE:
        print(f'  FAIL ratio is not {RECT_RATIO_NOMINAL} within {RECT_RATIO_TOLERANCE}')
        ok = False
    if abs(m['dx']) > CENTER_TOLERANCE_PX or abs(m['dy']) > CENTER_TOLERANCE_PX:
        print(f'  FAIL rectangle center is over {CENTER_TOLERANCE_PX}px from the disc center')
        ok = False
    print('  ok' if ok else '  FAILED')
    return ok


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'build'
    here = os.path.dirname(os.path.abspath(__file__))
    if mode == 'check':
        # Measure the committed file without redrawing it, so a hand-edited
        # or stale knowt-tag.png is caught too.
        raise SystemExit(0 if test(os.path.join(here, 'knowt-tag.png')) else 1)
    path = build()
    if mode == 'test':
        raise SystemExit(0 if test(path) else 1)
