# MindKnowt design tokens

All copy in this file and in the app is American English. See the copy rules in
`AGENTS.md`.

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

| Key | Name | Hex | What it is | Ink | Mark | Fill |
| --- | --- | --- | --- | --- | --- | --- |
| `home` | Home | `#F5E07A` | Butter yellow | `#7A703D` | `#BFAF5F` | `#FEFBEF` |
| `daily` | Daily | `#D9FA3C` | The brand lime | `#64731C` | `#A1B92C` | `#FAFEE8` |
| `care` | Wellness | `#24C2B5` | Turquoise | `#157169` | `#24C2B5` | `#E5F8F6` |
| `ritual` | Routine | `#AFC0F0` | Icy periwinkle | `#666F8B` | `#9EADD8` | `#F5F7FD` |
| `go` | Activity | `#C9901E` | Darker mustard | `#755411` | `#C9901E` | `#F9F2E4` |
| `admin` | Admin | `#7B61FF` | Violet, unchanged | `#473894` | `#7B61FF` | `#EFECFF` |
| `seasonal` | Seasonal | `#8A1F3D` | Burgundy | `#501223` | `#8A1F3D` | `#F3E9EC` |

Three of these are pale by design, which is not the same as the muted set they
replaced: a pastel is light but clean, muted was gray with a hue attached.
Measured as HSL saturation the set runs 0.63 to 1.00, where the old mauve and
taupe sat at 0.24 and 0.14. HSV saturation cannot separate the two, so the
check uses HSL.

**Daily is the same value as the neon.** That is deliberate and it is the one
thing to watch: everywhere else the neon means active or selected, so a Daily
chip and a selected chip are the same color. If that reads as a bug on device,
Daily is the one to move.

`mark` is the swatch as a small mark, for dots, thin rules and bars. A butter
yellow dot on the page measures 1.22 against it and a lime one 1.09, which is
invisible, so the pale three are darkened until a small mark reaches 2.0. For
the other four it is the swatch unchanged. Large fills still use the swatch,
where its lightness is the point.

Neither derived mix is a constant any more. Ink is 42 percent towards black for
most, 50 and 54 for butter and lime, because pale colors have to go further to
stay legible; every value clears 4.5 against both white and the page. Fill is
88 percent towards white, and 90 for burgundy, which is dark enough that the
standard mix stops reading as a tint.

Seasonal exists to be archived. Decorations, wrapping and holiday shopping are
real for six weeks and noise for the rest of the year.

The swatch is never used for text. Fills, bars, dots, tiles and rules only,
and `mark` rather than the swatch wherever the mark is small.

**These are stored, not styled.** `categories.color` holds the swatch, so
changing this table means a migration back-fill matched on `is_custom = 0`. The
repaint SQL is generated from the current constant, so every change needs its
own back-fill entry stamped at the new version: an install already past the
previous one never runs it again. There is a test that migrates a database from
every version predating the newest repaint and insists it lands on the current
values, because forgetting is otherwise silent: the constant looks right and
the device keeps the old colors.

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

`RCTFont.mm` resolves a family it does not recognize by calling `fontWithName:`,
which returns the regular face and nothing else, then reassigns the family to
that font's real family, which is the plain system one. Any weight asked for is
matched against plain San Francisco faces from there. So `fontWeight` on rounded
text either does nothing or silently drops the rounding, depending on the iOS
version, and headers and button labels were the styles that had it.

There is therefore **one weight**. Hierarchy is size and color. Real weights
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

## Adding a palette color

`categories.color` is stored, so changing `CATEGORY_COLORS` means adding a new
`RECOLOR_SQL` back-fill entry stamped at the new schema version. The repaint SQL
is generated from the current constant, so an install already past the previous
entry never runs it again and would keep the old colors silently. There is a
test that migrates a database from every version predating the newest repaint
and insists it lands on the current values.

## The Lock Screen

AlarmKit draws it. This app supplies text and color, not a layout.

| What | Value |
| --- | --- |
| Tint | `#D9FA3C`, the same neon as the active tab and the primary action |
| Button text | `#111111`, because white on neon is 1.19 and fails everywhere |
| Stop label | "Scan to stop" when the knowt needs a tag, otherwise "Done" |
| Snooze label | "Snooze" |

The banner's background is the system's, not ours, so the near-black behind the
neon is whatever iOS draws for an alarm. The Stop label is the only way that
banner can say a scan is required, because the module hardcodes the button's SF
Symbol and builds an empty metadata type that no widget extension can match.

What that rules out without a patched `expo-alarm-kit` and a widget extension
target: the app's typeface on the banner, a scan glyph rather than the word, a
complete button next to dismiss, and any buttons at all while snoozed, since
only the alert presentation is configured and the countdown one is not.
