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
| `background` | `#F0F0EE` | The page. Light warm gray, never white, so cards read as cards. |
| `surface` | `#FFFFFF` | Cards. The only white in the app. |
| `primary` | `#111111` | Primary buttons, icons, headings, body text. Near black, not pure black. |
| `highlight` | `#D9FA3C` | Neon yellow green. Highlights, active states, key numbers. Nothing else. |
| `charcoal` | `#3A3A3A` | Secondary text. Where `primary` would be too heavy. |
| `lightGray` | `#D8D8D6` | Dividers, borders, disabled and inactive states. Distinct from `background`. |

Contrast, measured, so these are not guesses:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `primary` on `surface` | 18.88 | Any size. |
| `primary` on `background` | 16.55 | Any size. |
| `primary` on `highlight` | 15.91 | Any size. This is the only text allowed on neon. |
| `surface` on `primary` | 18.88 | Any size. Primary button text. |
| `charcoal` on `surface` | 11.37 | Any size. |
| `charcoal` on `background` | 9.97 | Any size. |
| `highlight` on `surface` | 1.19 | Not text. Not a thin line. Fill only. |
| `lightGray` on `surface` | 1.43 | Not text. Dividers and disabled only. |

Two hard rules follow from that table:

1. **The neon never carries text and never draws a thin line.** At 1.19 against
   white it disappears. It is a fill, a bar, a dot, a filled pill, or the
   background behind `primary` text.
2. **Primary buttons are near black, not neon.** The neon marks what is active
   or what matters in a number. A screen with two neon blocks on it has one too
   many.

## Category colors

Brightened to hold up against the higher contrast palette. Same six hues, same
names, pushed up in saturation and value.

| Key | Name | Was | Now | Ink | Fill |
| --- | --- | --- | --- | --- | --- |
| `home` | Terracotta | `#C06A4C` | `#D9744F` | `#7E432E` | `#FAEEEA` |
| `daily` | Mustard gold | `#C4972C` | `#E0A92B` | `#826219` | `#FBF5E6` |
| `care` | Mauve pink | `#AE7B92` | `#C98BA6` | `#755160` | `#F9F1F4` |
| `ritual` | Olive green | `#7C8A4E` | `#8FA254` | `#535E31` | `#F2F4EA` |
| `go` | Sky blue | `#5F8FB4` | `#6BA3CF` | `#3E5F78` | `#EDF4F9` |
| `admin` | Warm taupe | `#96897C` | `#A89A8B` | `#615951` | `#F5F3F1` |

Ink is the swatch mixed 42 percent towards black, for label text and icons on a
white card. Every ink value clears 5.6 against white, so it is legible at body
size. Fill is the swatch mixed 88 percent towards white, for chips and finished
cards.

The swatch itself runs between 2.1 and 3.2 against white, which is why it is
never used for text. Bars, dots and rules only.

**These are stored, not styled.** `categories.color` holds the swatch, so
changing this table means a migration back-fill for anyone who already has the
old values, matched on `is_custom = 0` so a color someone chose themselves is
never overwritten. Custom categories derive their own ink and fill from the same
two mixes.

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

SF Pro Rounded. This one comes with a caveat worth writing down: React Native
does not expose SF Pro Rounded by family name, and iOS does not install it as an
ordinary font. It is reached through the private family `.AppleSystemUIFontRounded`,
which is undocumented but has worked on iOS for years. If it ever stops working
the text falls back to San Francisco rather than breaking, so it is safe to
rely on and cheap to be wrong about.

The guaranteed alternative is bundling the font files through `expo-font`, which
is a native module and costs a rebuild. Not worth it until the private name is
shown to fail on a device.

| Token | Size | Used on |
| --- | --- | --- |
| `xs` | 12 | Timestamps, tag UIDs, the smallest labels. |
| `sm` | 13 | Secondary lines, meta, hints. |
| `md` | 15 | Body, row names, button labels. |
| `lg` | 17 | Card titles, inputs. |
| `xl` | 22 | Section headings. |
| `display` | 32 | Screen titles. |

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

## What this supersedes

The flat Knowts row, added one update earlier, is gone: no card, no shadow,
hairline dividers, one color rule down the left of each category. It existed to
stop Knowts reading as a copy of Daily. In this direction every list is cards,
so Knowts becomes cards too, and the two screens are told apart by what they
say rather than by having different furniture.

That leaves the original problem open. It is a real one and it needs a different
answer: content, density or layout, not a second card style.
