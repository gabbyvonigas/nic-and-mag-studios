# MindKnowt marketing site

Static, dependency-free HTML and CSS. It exists for three reasons: to describe
the app, to give App Store Connect the privacy and support URLs it requires,
and to satisfy Apple Developer Program organization verification, which wants a
real company website rather than a parked domain.

Built to mirror the FuelPing site in `gabbyvonigas/fuelping`: same structure,
same hosting, same deploy approach.

## Structure

```
site/
  index.html           hero and three steps, the system row, the kit, the
                       category strip, footer
  privacy/index.html   privacy policy
  terms/index.html     terms of service
  support/index.html   contact and FAQ
  css/style.css        the whole stylesheet, tokens lifted from the app
  assets/
    README.md          every image, what it is, and how to swap it
    knowt-tag.png      the Knowt Tag disc, used eight times from one file
    wordmark.png       copied from assets/brand/wordmark.png, unmodified
    og-image.png       generated from the wordmark, not hand designed
    favicon*.png       derived from assets/icon.png
    fonts/             self-hosted Quicksand, OFL licensed
    nav.js             the menu, the only JavaScript on the site
    screens/           phone screenshots, with a README for replacing them
  robots.txt  sitemap.xml  favicon.ico
  DEPLOY.md            Netlify and DNS setup
```

No build step, no framework, no analytics, no trackers, no cookie banner, no
email capture. The app makes a privacy promise and the site keeps it.

## Drawn, not pasted

The page is HTML and CSS with live text, including the parts that look like
pictures. The phone frames are CSS drawn around a plain screenshot, so a
replacement capture needs no device chrome. The step illustrations, the four
kit features, the seven category marks and the three social links are inline
SVG in one outline style, painted by `currentColor`, which is the rule the app
has for the same reason: a filled glyph beside an outlined one reads as two
sets.

The only raster images are the wordmark, the three screenshots and the Knowt
Tag disc.

Contact everywhere on the site is `hello@mindknowt.com`, a mailbox on the
site's own domain rather than the studio's. It is live and tested, which
matters because Apple checks it during organization verification and it is the
only address the site gives.

## Brand

Taken from the app, not re-picked.

- The wordmark is `assets/brand/wordmark.png` copied over as-is. It is not
  redrawn and not recolored.
- Colors in `css/style.css` are the literal values in the app's
  `src/theme/categoryColors.ts` and `src/theme/palette.ts`: lime `#D9FA3C`,
  and the seven category colors.
- Favicons are resized from the shipped `assets/icon.png`.

Two deliberate differences from the app, both noted in the CSS:

1. **The page is white.** The app's page is `#F4F5F6`, a cool gray, because
   white cards have to read as cards on it. The site uses white, with that gray
   kept for section bands.
2. **The heading font is Quicksand, not the app's.** The app uses SF Pro
   Rounded through the private iOS family `.AppleSystemUIFontRounded`, which
   does not exist on the web. Quicksand is the closest open licensed rounded
   geometric face. Body text is Helvetica Neue, a system font. The wordmark is
   artwork, so the lockup itself is exact either way.

## Before this goes live

1. **Fill in the social links.** The three icons in the footer are TikTok,
   Instagram and Pinterest, and every `href` is `#` because there is no
   MindKnowt profile on any of them yet. Replace the `href` and nothing else
   changes.
2. **Swap the Knowt Tag disc for the real one.** `assets/knowt-tag.png` is
   built from the app's own tag mark on a white circle, standing in for the
   product shot with the sticker on it. One file, eight places on the page.
3. **Have the legal pages reviewed.** Privacy and Terms are first drafts
   written by this session, each marked with an HTML comment at the top of the
   file saying so. The comment is not rendered on the page.
4. **Check the dates.** Both legal pages say October 6, 2026, the date they
   were written. Change them to the date they actually go live.
5. **Add the App Store link when the app ships.** "Coming soon to the App
   Store" is a plain line of text with no badge and no link, on purpose. It is
   the page's call to action and it sits in the two places a button belongs,
   under the hero copy and beside the price in the kit panel. Both are the
   `.cta` class on a `p`, so turning it into a button is one selector and two
   elements.
