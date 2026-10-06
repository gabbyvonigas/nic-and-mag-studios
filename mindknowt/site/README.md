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
  index.html           hero, three phone vignettes, how it works, footer
  privacy/index.html   privacy policy
  terms/index.html     terms of service
  support/index.html   contact and FAQ
  css/style.css        the whole stylesheet, tokens lifted from the app
  assets/
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

1. **Replace the phone screenshots.** `assets/screens/` holds placeholders.
   Keep the filenames and the 402 by 874 aspect ratio and nothing else changes.
   See the README in that folder.
2. **Have the legal pages reviewed.** Privacy and Terms are first drafts
   written by this session, each marked with an HTML comment at the top of the
   file saying so. The comment is not rendered on the page.
3. **Check the dates.** Both legal pages say October 6, 2026, the date they
   were written. Change them to the date they actually go live.
4. **Confirm the email routes.** Every page shows `hello@mindknowt.com`, which
   is a mailbox on the site's own domain rather than the studio's. It needs to
   be receiving mail before Apple checks it.
5. **Add the App Store link when the app ships.** The hero says "Coming soon to
   the App Store" as a plain line of text with no badge and no link, on
   purpose. Replace that one element in `index.html`.
