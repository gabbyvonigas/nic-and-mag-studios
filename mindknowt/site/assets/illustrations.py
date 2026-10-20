"""
The three step illustrations, drawn to one specification.

They were three drawings with three stroke weights, two different tag badge
sizes hung off two different edges, and two phone screens with invented
content: colored dots and gray bars that are in no part of the app. The lime
slashes beside them were a comic book motion line, which is not a language the
rest of the page speaks.

Everything here is shared on purpose: one stroke width, one wash, one badge
box. The only thing that differs between the three is the subject.
"""
import os

from PIL import Image, ImageDraw, ImageFont

S = 4                      # supersample; PIL has no antialiased primitives
BOX = 800                  # the delivered square, per site/assets/README.md
W = BOX * S

# One stroke for every line in all three drawings. 20 over 800 is 2.5 percent,
# which at the 104 to 130 point the page draws these is a touch over one point.
STROKE = 20 * S
# The signal arcs are the tag mark's own weight, which is lighter than the
# outlines it sits beside.
ARC_STROKE = 14 * S

INK = (17, 17, 17, 255)
LIME = (217, 250, 60, 255)
WASH = (241, 255, 190, 255)        # --pale-lime
WHITE = (255, 255, 255, 255)
LINE = (220, 223, 227, 255)        # --line
CHARCOAL = (58, 58, 58, 255)
GRAY = (110, 116, 121, 255)
ROUTINE = (164, 53, 240, 255)      # the app's ritual swatch, the site's routine
ROUTINE_TINT = (243, 230, 253, 255)

FONT_DIR = os.environ.get('MK_FONT_DIR', '.')


def font(weight, size):
    return ImageFont.truetype(f'{FONT_DIR}/Quicksand-{weight}.ttf', int(size * S))


def fitted(draw, text, weight, start, limit, x, y, fill):
    """
    The largest size at or under `start` that keeps `text` inside `limit`.

    The name ran past the card's right edge at a hand picked size, which is the
    kind of thing that looks fine in the file and wrong on the page.
    """
    size = start
    while size > 10:
        f = font(weight, size)
        if draw.textlength(text, font=f) <= limit * S:
            break
        size -= 1
    draw.text((x * S, y * S), text, font=font(weight, size), fill=fill)
    return size


def canvas():
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def wash(draw, cx, cy, rx, ry):
    """
    The pale lime behind the subject. One shape in all three, so the drawings
    sit on the same ground rather than each inventing a blob.
    """
    draw.ellipse(
        [(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S],
        fill=WASH,
    )


def rrect(draw, box, radius, outline=INK, fill=None, width=None):
    x0, y0, x1, y1 = [v * S for v in box]
    draw.rounded_rectangle(
        [x0, y0, x1, y1],
        radius=radius * S,
        outline=outline,
        fill=fill,
        width=width if width is not None else STROKE,
    )


def arcs(draw, cx, cy, start, end, radii):
    """
    Signal, in the tag mark's own idiom: concentric arcs opening the same way
    the waves on the mark do, in lime, at the mark's stroke weight.
    """
    for r in radii:
        draw.arc(
            [(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S],
            start=start,
            end=end,
            fill=LIME,
            width=ARC_STROKE,
        )


def finish(img, name):
    out = img.resize((BOX, BOX), Image.LANCZOS)
    out.save(name)
    print('wrote', name)


# ---------------------------------------------------------------- 01 Stick
def stick():
    """
    A pill bottle with a Knowt Tag stuck on it.

    It was a plant, which is a thing you water rather than a thing you forget,
    and the tag floated beside the pot instead of being on anything. The bottle
    is drawn so the badge the stylesheet lays over the lower right lands on its
    face, which is the only way a flat overlay can read as stuck on.

    Scale is the real product's: a 25mm tag on a bottle about 45mm across, so
    the tag is a little over half the bottle's width.
    """
    img, d = canvas()
    wash(d, 400, 400, 250, 250)

    # White filled, so it reads as a white bottle standing on the wash rather
    # than as a lime one. Cap, then body, then the label band that tells a
    # pill bottle from a tin.
    rrect(d, (272, 150, 472, 230), 26, fill=WHITE)
    rrect(d, (240, 230, 504, 614), 38, fill=WHITE)
    d.line([240 * S, 322 * S, 504 * S, 322 * S], fill=INK, width=STROKE)

    finish(img, 'step-stick.png')


# ------------------------------------------------------------------ 02 Set
def set_step():
    """
    A Knowt card, the way the app draws one: the category's bar down the left
    edge, its dot, the name, and the time with the repeat under it.

    It was a tilted phone holding four gray bars and four colored dots, which
    is not a screen this app has. No signal arcs here: nothing is being tapped
    in this step, and a motion cue with nothing moving is decoration.
    """
    img, d = canvas()
    wash(d, 400, 400, 250, 250)

    # The card. One card, large, because the art box is 130 points wide at its
    # widest and a phone around the card would leave the card too small to be
    # anything.
    rrect(d, (150, 250, 650, 550), 44, outline=INK, fill=WHITE)
    # The category bar, the app's own left edge marker.
    d.rounded_rectangle(
        [190 * S, 300 * S, 212 * S, 500 * S], radius=11 * S, fill=ROUTINE,
    )
    # The dot, then the name and the time.
    d.ellipse([244 * S, 330 * S, 282 * S, 368 * S], fill=ROUTINE)
    fitted(d, 'Morning Smoothie', 700, 38, 650 - 298 - 40, 298, 326, INK)
    d.text((244 * S, 414 * S), '9:00 am, Every day', font=font(500, 32), fill=GRAY)

    finish(img, 'step-set.png')


# ------------------------------------------------------------------ 03 Tap
def tap():
    """
    The done state: the card filled with the category's pale tint and a solid
    check, which is exactly how the app shows a Knowt that has been completed.

    It was an empty lime rectangle. The arcs run from the lower right, where
    the stylesheet lays the tag badge, toward the card, because that is the one
    place on these three tiles where signal actually passes.
    """
    img, d = canvas()
    wash(d, 400, 400, 250, 250)

    rrect(d, (150, 208, 650, 470), 44, outline=INK, fill=ROUTINE_TINT)
    d.rounded_rectangle(
        [190 * S, 252 * S, 212 * S, 426 * S], radius=11 * S, fill=ROUTINE,
    )
    d.text((244 * S, 262 * S), 'Morning', font=font(700, 38), fill=INK)
    d.text((244 * S, 322 * S), 'Smoothie', font=font(700, 38), fill=INK)

    # The filled ring and tick. Filled rather than outlined is the one place
    # the app breaks its own outline rule, because an outlined tick inside an
    # outlined ring reads as neither.
    cx, cy, r = 570, 339, 48
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=ROUTINE)
    d.line(
        [(cx - 22) * S, cy * S, (cx - 6) * S, (cy + 17) * S, (cx + 24) * S, (cy - 19) * S],
        fill=WHITE, width=int(STROKE * 0.75), joint='curve',
    )

    # Signal, leaving the tag toward the card.
    #
    # The badge the stylesheet lays over this box is a disc of about 320 across
    # centred near (576, 576), so these are struck from that centre at radii
    # just outside it and swept only through the band that is clear of both the
    # badge and the card above. Drawn anywhere else they are hidden under the
    # badge, which is where they were.
    arcs(d, 576, 576, 184, 213, (178, 205, 232))

    finish(img, 'step-tap.png')


stick()
set_step()
tap()
