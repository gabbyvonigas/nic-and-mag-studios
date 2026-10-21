"""
Steps 02 and 03, with the phone stood upright.

These start from the files on `site/landing-refresh` and change only three
things: the phone is portrait instead of tilted, the lime slashes are gone, and
step 03's screen carries a done Knowt row instead of being empty. Step 01 is
not touched at all, so the plant pot is the one on that branch.

Everything else is measured off those originals rather than re-picked: the wash
is #DDF495 as an ellipse of 324 by 300 centred in the box, the ink is #111111,
and every line is 16 units on the 800 box, which is what all three were already
drawn at.
"""
from PIL import Image, ImageDraw

S = 4
BOX = 800
W = BOX * S

STROKE = 16 * S                    # measured off the originals
ARC_STROKE = 11 * S                # the tag mark's lighter weight

INK = (17, 17, 17, 255)
WASH = (221, 244, 149, 255)        # measured off the originals
LIME = (217, 250, 60, 255)         # measured off the originals
WHITE = (255, 255, 255, 255)
BAR = (192, 192, 208, 255)         # the gray rows in the original step 02
ROUTINE = (164, 53, 240, 255)
ROUTINE_TINT = (243, 230, 253, 255)

# The phone, upright. Its size is the original tilted body turned back: the
# ink bbox of 389 by 602 at about 12 degrees is a 280 by 556 body, which is
# roughly an iPhone's 1 to 2.
PHONE_W, PHONE_H = 280, 556
RADIUS = 42


def canvas():
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def wash(d, cx=400, cy=400):
    """The original's ellipse, centred on whatever the tile's subject is."""
    d.ellipse([(cx - 324) * S, (cy - 300) * S, (cx + 324) * S, (cy + 300) * S],
              fill=WASH)


def phone(d, left, top):
    """Body, screen and island. One rounded rectangle, upright."""
    box = [left * S, top * S, (left + PHONE_W) * S, (top + PHONE_H) * S]
    d.rounded_rectangle(box, radius=RADIUS * S, fill=WHITE, outline=INK, width=STROKE)
    # The island, so it reads as an iPhone rather than a blank slab.
    iw, ih = 86, 17
    ix = left + (PHONE_W - iw) / 2
    iy = top + 30
    d.rounded_rectangle(
        [ix * S, iy * S, (ix + iw) * S, (iy + ih) * S],
        radius=(ih / 2) * S, fill=INK,
    )
    return box


def finish(img, name):
    img.resize((BOX, BOX), Image.LANCZOS).save(name)
    print('wrote', name)


# ------------------------------------------------------------------ 02 Set
def set_step():
    """
    The original screen, stood upright: four category dots down the left with
    a row beside each. The lime slashes beside it are gone and nothing
    replaces them, because nothing is being tapped in this step.
    """
    img, d = canvas()
    wash(d)
    left, top = 400 - PHONE_W / 2, 400 - PHONE_H / 2
    phone(d, left, top)

    # Four rows, the app's own category colors in place of the original's
    # unnamed red, yellow, green and teal.
    colors = [(255, 77, 61, 255), (217, 250, 60, 255),
              (36, 194, 181, 255), ROUTINE]
    row_h, gap = 30, 54
    y = top + 120
    for c in colors:
        d.ellipse([(left + 44) * S, y * S, (left + 74) * S, (y + row_h) * S], fill=c)
        d.rounded_rectangle(
            [(left + 96) * S, (y + 7) * S, (left + PHONE_W - 44) * S, (y + row_h - 7) * S],
            radius=8 * S, fill=BAR,
        )
        y += gap + row_h

    finish(img, 'step-set.png')


# ------------------------------------------------------------------ 03 Tap
def tap():
    """
    The same phone with one Knowt row done: the category's pale tint, its name,
    and a solid check. The original screen was empty.

    The arcs replace the lime slashes. Three of them, in the tag mark's own
    idiom at the mark's weight, struck from the centre of the badge the
    stylesheet lays over the lower right so they land in the gap between the
    tag and the phone. The mockup shows motion here, which is why there is any.
    """
    img, d = canvas()
    # Up and left of centre, so the badge in the lower right meets its corner.
    left, top = 232, 92
    wash(d, left + PHONE_W / 2, top + PHONE_H / 2)
    phone(d, left, top)

    # One done row, drawn the way the app draws a completed Knowt.
    rx0, rx1 = left + 38, left + PHONE_W - 38
    ry0 = top + 150
    ry1 = ry0 + 108
    d.rounded_rectangle([rx0 * S, ry0 * S, rx1 * S, ry1 * S], radius=22 * S,
                        fill=ROUTINE_TINT)
    d.rounded_rectangle(
        [(rx0 + 16) * S, (ry0 + 22) * S, (rx0 + 26) * S, (ry1 - 22) * S],
        radius=5 * S, fill=ROUTINE,
    )
    # The name, as two bars rather than type: at the size the page draws this
    # tile, lettering here is smaller than a pixel and reads as grit.
    d.rounded_rectangle([(rx0 + 42) * S, (ry0 + 30) * S, (rx1 - 74) * S, (ry0 + 44) * S],
                        radius=7 * S, fill=ROUTINE)
    d.rounded_rectangle([(rx0 + 42) * S, (ry0 + 58) * S, (rx1 - 108) * S, (ry0 + 70) * S],
                        radius=6 * S, fill=BAR)
    # The check, filled, which is the one place the app breaks its outline rule.
    cx, cy, r = rx1 - 40, (ry0 + ry1) / 2, 26
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=ROUTINE)
    d.line([(cx - 12) * S, cy * S, (cx - 3) * S, (cy + 9) * S, (cx + 13) * S, (cy - 11) * S],
           fill=WHITE, width=int(STROKE * 0.72), joint='curve')

    # Signal, in the gap the badge leaves between itself and the phone.
    for rr in (196, 224, 252):
        d.arc([(576 - rr) * S, (576 - rr) * S, (576 + rr) * S, (576 + rr) * S],
              start=183, end=214, fill=LIME, width=ARC_STROKE)

    finish(img, 'step-tap.png')


set_step()
tap()
