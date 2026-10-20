"""
The Knowt Tag disc, drawn from the product photographs.

The real tag is a 25mm round sticker 0.8mm thick: flat matte white, a crisp
thin rim all the way round, and almost no thickness to speak of. The previous
file had a soft swell along the bottom that read as a puck a few millimetres
thick and no rim at all, which is the one feature the stack photograph makes
unmistakable.

The contract with the stylesheet, from site/assets/README.md: 2000 square, the
disc filling the middle 74 percent, both shadows baked in, the mark placed by
its rounded rectangle rather than by its bounding box. All four are kept.
"""
import os

from PIL import Image, ImageDraw, ImageFilter

BOX = 2000
IN_BOX = 0.74                      # --disc-in-box in the stylesheet
D = int(BOX * IN_BOX)              # 1480
R = D / 2
CX = CY = BOX / 2

MARK_SRC = os.environ.get(
    'MK_MARK', '../../assets/brand/mindknowt-tag-mark.png',
)
# The mark's rounded rectangle inside its 512 canvas, measured: the ink runs
# 59..452 by 24..487, and the rectangle is the ink with the signal arcs, which
# overhang its top right, left out.
MARK_RECT_H_OVER_INK = 370 / 463


def radial(size, inner, outer, cx, cy, radius):
    """A soft radial wash, built by hand because PIL has no gradient."""
    img = Image.new('L', (size, size), 0)
    px = img.load()
    for y in range(size):
        dy = y - cy
        for x in range(size):
            dx = x - cx
            t = min(1.0, ((dx * dx + dy * dy) ** 0.5) / radius)
            px[x, y] = int(255 * t)
    base = Image.new('RGB', (size, size), inner)
    return Image.composite(Image.new('RGB', (size, size), outer), base, img)


def build():
    out = Image.new('RGBA', (BOX, BOX), (0, 0, 0, 0))

    # The circle the whole thing is cut to, at 4x so the edge is clean.
    S = 4
    mask = Image.new('L', (BOX * S, BOX * S), 0)
    ImageDraw.Draw(mask).ellipse(
        [(CX - R) * S, (CY - R) * S, (CX + R) * S, (CY + R) * S], fill=255,
    )
    mask = mask.resize((BOX, BOX), Image.LANCZOS)

    # --- the two shadows, under everything -----------------------------
    # A tight contact shadow and a wider soft one. The sticker lies nearly
    # flat, so the contact shadow is close and the soft one is shallow.
    for blur, dy, alpha, grow in ((18, 14, 72, 0), (64, 40, 46, -6)):
        sh = Image.new('L', (BOX, BOX), 0)
        ImageDraw.Draw(sh).ellipse(
            [CX - R - grow, CY - R - grow + dy, CX + R + grow, CY + R + grow + dy],
            fill=alpha,
        )
        sh = sh.filter(ImageFilter.GaussianBlur(blur))
        layer = Image.new('RGBA', (BOX, BOX), (17, 17, 17, 0))
        layer.putalpha(sh)
        out = Image.alpha_composite(out, layer)

    # --- the face ------------------------------------------------------
    # Matte, barely warm white, cooling away from a highlight up and left.
    face = radial(BOX, (255, 255, 255), (238, 240, 242), CX - R * 0.42, CY - R * 0.46, R * 1.72)
    face = face.convert('RGBA')
    face.putalpha(mask)
    out = Image.alpha_composite(out, face)

    # --- the rim -------------------------------------------------------
    # The crisp thin line around the circumference, the feature the stack
    # photograph makes unmistakable. 7 at 2000 holds about a pixel at the
    # largest the page ever draws this.
    rim = Image.new('RGBA', (BOX * S, BOX * S), (0, 0, 0, 0))
    ImageDraw.Draw(rim).ellipse(
        [(CX - R) * S + 2, (CY - R) * S + 2, (CX + R) * S - 2, (CY + R) * S - 2],
        outline=(198, 203, 209, 255), width=7 * S,
    )
    out = Image.alpha_composite(out, rim.resize((BOX, BOX), Image.LANCZOS))

    # --- the thickness -------------------------------------------------
    # 0.8mm on 25mm is three percent, so this is a hairline along the lower
    # edge and nothing more. The old file swelled here and read as a puck.
    edge = Image.new('L', (BOX, BOX), 0)
    ImageDraw.Draw(edge).ellipse([CX - R, CY - R + 9, CX + R, CY + R + 9], fill=255)
    cut = Image.new('L', (BOX, BOX), 0)
    ImageDraw.Draw(cut).ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
    edge = Image.composite(edge, Image.new('L', (BOX, BOX), 0), ImageChopsSub(edge, cut))
    thickness = Image.new('RGBA', (BOX, BOX), (206, 211, 217, 255))
    thickness.putalpha(edge.filter(ImageFilter.GaussianBlur(3)))
    out = Image.alpha_composite(out, thickness)

    # --- the printed mark ----------------------------------------------
    mark = Image.open(MARK_SRC).convert('RGBA')
    ink = mark.split()[-1].getbbox()
    mark = mark.crop(ink)
    # Sized by its rounded rectangle, not its bounding box, so the arcs
    # overhang the top right the way they do on the product.
    rect_h = D * 0.355
    ink_h = rect_h / MARK_RECT_H_OVER_INK
    scale = ink_h / mark.height
    mark = mark.resize((max(1, int(mark.width * scale)), int(ink_h)), Image.LANCZOS)
    # Centre the rectangle on the disc. The rectangle's bottom sits 4/463 of
    # the ink height above the ink's bottom edge.
    rect_cy = mark.height - (rect_h / 2) - (4 / 463) * mark.height
    out.alpha_composite(
        mark,
        (int(CX - mark.width / 2) - int(0.035 * D), int(CY - rect_cy)),
    )

    out.save('knowt-tag.png')
    print('wrote knowt-tag.png', out.size)


def ImageChopsSub(a, b):
    from PIL import ImageChops
    return ImageChops.subtract(a, b)


build()
