# MindKnowt design tokens

The source of truth for the visual direction. Every value here is implemented
in `src/theme/`, and nothing outside that directory should carry a hex value, a
radius, a shadow or a font name. If a screen needs a value that is not here,
the value is added here first.

Light mode only. There is no dark palette yet, and nothing should be written as
if one exists.

`docs/design-notes.md` is the older running file for shape and navigation ideas
that are decided but not built. It stays. This file is different: these are
values that are live in the app.

## Core palette

| Token | Hex | What it is for |
| --- | --- | --- |
| `background` | `#F4F5F6` | The page. Light cool gray, never white, so cards read as cards. |
| `surface` | `#FFFFFF` | Cards. The only white in the app. |
| `primary` | `#111111` | Primary buttons, icons, headings, body text. Near black, not pure black. |
| `highlight` | `#D9FA3C` | Neon yellow green. Highlights, active states, key numbers. Nothing else. |
| `charcoal` | `#3A3A3A` | Secondary text. Where `primary` would be too heavy. |
| `gray` | `#6E7479` | Third level text, where charcoal is still too heavy. |
| `lightGray` | `#DCDFE3` | Dividers, borders, disabled and inactive states. Distinct from `background`. |

Every neutral is cool or exactly neutral, measured as red minus blue. The first
set was `+2` warm across the page, the border and the muted text, which is what
made white cards look faintly yellow sitting on it.

Contrast, measured, so these are not guesses:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `primary` on `surface` | 18.88 | Any size. |
| `primary` on `background` | 16.30 | Any size. |
| `primary` on `highlight` | 15.91 | Any size. This is the only text allowed on neon. |
| `surface` on `primary` | 18.88 | Any size. Primary button text. |
| `charcoal` on `surface` | 11.37 | Any size. |
| `charcoal` on `background` | 10.18 | Any size. |
| `highlight` on `surface` | 1.19 | Not text. Not a thin line. Fill only. |
| `lightGray` on `surface` | 1.38 | Not text. Dividers and disabled only. |

Two hard rules follow from that table:

1. **The neon never carries text and never draws a thin line.** At 1.19 against
   white it disappears. It is a fill, a bar, a dot, a filled pill, or the
   background behind `primary` text.
2. **Primary buttons are near black, not neon.** The neon marks what is active
   or what matters in a number. A screen with two neon blocks on it has one too
   many.

## Category colors

Vivid, and deliberately not muted. Brightening the original muted set was not
enough, because saturation was the problem rather than lightness: care sat at
0.31 saturation and admin at 0.17, which is gray with a hue attached. Next to
near-black and neon they read as dirt.

| Key | Name | Hex | Saturation | Ink | Fill |
| --- | --- | --- | --- | --- | --- |
| `home` | Coral | `#FF5A3C` | 0.76 | `#943423` | `#FFEBE8` |
| `daily` | Gold | `#F5A623` | 0.86 | `#8E6014` | `#FEF4E5` |
| `care` | Pink | `#FF4D9D` | 0.70 | `#942D5B` | `#FFEAF3` |
| `ritual` | Green | `#2FBF71` | 0.75 | `#1B6F42` | `#E6F7EE` |
| `go` | Blue | `#2E8BFF` | 0.82 | `#1B5194` | `#E6F1FF` |
| `admin` | Violet | `#7B61FF` | 0.62 | `#473894` | `#EFECFF` |

Two of the six changed identity rather than intensity, because there is no
vivid version of them: mauve pink became a true pink, and warm taupe became
violet. Coral and gold stay warm hues, because six categories need a spread of
hue to stay apart and an all-cool set of six collapses into three. They are
vivid rather than muted, which is the actual rule.

Ink is the swatch mixed 42 percent towards black, for label text and icons.
Every ink value clears 5.0 against both white and the page, so it is legible at
body size on either. Fill is the swatch mixed 88 percent towards white, and is
what the Knowts rows are filled with.

The swatch itself runs between 1.9 and 3.9 against the page, which is why it is
never used for text. Bars, dots, tiles and rules only.

**These are stored, not styled.** `categories.color` holds the swatch, so
changing this table means a migration back-fill matched on `is_custom = 0`. The
repaint SQL is generated from the current constant, so every change needs its
own back-fill entry stamped at the new version: an install already past the
previous one never runs it again. There is a test that asserts the newest
repaint is stamped at the current schema version, because forgetting is silent.

## Corner radius

| Token | Value | Used on |
| --- | --- | --- |
| `sm` | 10 | Chips, small controls, inputs. |
| `md` | 14 | Buttons, banners, notices. |
| `lg` | 18 | Grouped rows, panels. |
| `xl` | 22 | Cards. This is the shape of the app. |
| `pill` | 999 | Capsules and fully round controls. |

## Shadow

Soft and low, on white cards over the gray page. One level, used everywhere a
card lifts off the page.

```
shadowColor: '#111111'
shadowOpacity: 0.07
shadowRadius: 20
shadowOffset: { width: 0, height: 8 }
```

Cards carry no border. The shadow and the white against `#F0F0EE` do that job,
and a border on top of both reads as a line drawn around a card rather than a
card. Borders stay for inputs, dividers and anything inactive, in `lightGray`.

## Type

SF Pro Rounded, reached through the private family `.AppleSystemUIFontRounded`.
React Native does not expose it by family name and iOS does not install it as an
ordinary font, so there is no supported route to it from JavaScript.

**Confirmed working on device, with one hard limit: never set `fontWeight`.**

`RCTFont.mm` resolves a family it does not recognise by calling `fontWithName:`,
which returns the regular face and nothing else, then reassigns the family to
that font's real family, which is the plain system one. Any weight asked for is
matched against plain San Francisco faces from there. So `fontWeight` on rounded
text either does nothing or silently drops the rounding, depending on the iOS
version, and headers and button labels were the styles that had it.

There is therefore **one weight**. Hierarchy is size and colour. Real weights
mean bundling the SF Pro Rounded faces through `expo-font` so they resolve by
PostScript name through the ordinary path, which is native and costs a rebuild.

| Token | Size | Used on |
| --- | --- | --- |
| `xs` | 13 | Timestamps, tag UIDs, the smallest labels. |
| `sm` | 14 | Secondary lines, meta, hints. |
| `md` | 16 | Body, row names, button labels. |
| `lg` | 18 | Card titles, inputs. |
| `xl` | 22 | Section headings. |
| `display` | 32 | Screen titles. |

Everything below the two header steps went up one notch from the first pass.
Rounded runs optically smaller than Helvetica at the same point size, so
carrying the old scale across made the whole app read as fine print.

Weights: `regular` 400, `medium` 500, `semibold` 600, `bold` 700. Rounded
carries weight well, so `medium` does most of the work that `bold` used to.

Monospace stays Menlo, for tag UIDs only.

## Spacing

A single 4 point scale. Nothing between steps.

| Token | Value |
| --- | --- |
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 24 |
| `xxl` | 32 |

Gaps between cards are `md`. Screen side padding is `xl`.

## Where the neon goes

It is easy to ruin, so the places are fixed.

- **A header rule.** A 34 by 5 rounded bar above every screen title. One mark
  per screen, always the same size in the same place, which reads as a masthead
  rather than as decoration.
- **The active tab** in the capsule.
- **The chosen mode**, Scan Knowt or Alarm Only, and the chosen repeat.
- **The confirming action** on a screen that has exactly one, through the
  `highlight` button variant. Never two on a screen.
- **A high priority time pill** on Knowts, and the High flag in This week.

Near-black is the only thing that ever goes on top of it.

## What this supersedes

The flat Knowts row, no card and hairline dividers on a flat page, is gone. It
went too far the other way: it gave the eye nothing to land on.

Knowts rows are tall rounded rows filled with their category's own tint, with a
rounded tile for the mode icon and the next time in a pill on the right.
Definition comes from shape and fill rather than from a shadow, which is what
keeps them distinct from Daily's raised white cards.

Expanding and collapsing is a plus and a minus, not a chevron. The horizontal
bar stays put and only the upright comes and goes, so it reads as one control
changing state.

## Adding a palette colour

`categories.color` is stored, so changing `CATEGORY_COLORS` means adding a new
`RECOLOR_SQL` back-fill entry stamped at the new schema version. The repaint SQL
is generated from the current constant, so an install already past the previous
entry never runs it again and would keep the old colours silently. There is a
test that migrates a database from every version predating the newest repaint
and insists it lands on the current values.
