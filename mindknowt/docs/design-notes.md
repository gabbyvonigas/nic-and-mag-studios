# Design notes

Running file for direction that is decided but not yet built. Nothing here is
a commitment to a date. Code should not be written from this file alone.

## Navigation shape

Reference: `reference/nav-capsule-reference.jpg`. Third-party app screenshot,
kept for feel only. Not to be copied.

What is worth taking from it:

- **A floating capsule tab bar**, inset from the bottom edge with room around
  it, rather than a full-width bar welded to the screen edge. Icon above
  label, both in the accent color when active, and the active item sits in its
  own softer pill inside the capsule.
- **A separate round add button** floating to the right of the capsule, outside
  it. In MindKnowt that becomes Add a knowt, which today is a full-width button
  living at the bottom of the Today screen. Moving it into the nav frees the
  bottom of every screen and makes adding a knowt reachable from anywhere.
- **A segmented switcher above the content**, changing scope within a screen
  rather than changing screen. Useful for the dashboard (for example a period
  or grouping switch) and for History (month against all time).

Words: **Daily** and **Log** read better than the alternatives on that
reference. Daily is a candidate name for the dashboard tab. Log is a candidate
for History, and it is shorter and more honest about what the screen is.

Not taking from it:

- The dark glass treatment. MindKnowt is white or cool off-white with color
  coming from the category tint. The capsule translates as a light frosted
  surface with a soft shadow and a hairline, not dark translucency.
- The lime accent.
- Four tabs of that particular kind. Trends and Coach have no counterpart here.

Open question to settle when this gets built: whether the floating capsule
leaves enough safe area under the dashboard cards on the smallest supported
phone. Content will need bottom padding equal to the capsule height plus its
inset, not just the safe area inset.
