# Deploying the MindKnowt site

Same approach as the FuelPing site: **Netlify**, deployed straight from this
GitHub repo. Base directory blank, publish directory `site`, no build command,
because it is plain HTML and CSS.

Netlify rather than GitHub Pages for the same reason FuelPing chose it: this
repo is private, and GitHub Pages needs either a public repo or a paid GitHub
plan to serve one. Netlify's free tier deploys from a private repo with no
extra cost.

There is no GitHub Actions workflow involved. Netlify's own GitHub integration
watches the repo, so pushing to `main` republishes within seconds.

## Before the first deploy: set the domain

Every absolute URL on the site is currently the literal string
`REPLACE-WITH-DOMAIN`. That is deliberate, so a placeholder cannot be mistaken
for a real address. One pass replaces them:

```bash
cd site
grep -rl 'REPLACE-WITH-DOMAIN' . | xargs sed -i '' 's/REPLACE-WITH-DOMAIN/yourdomain.com/g'
# on Linux, drop the '' after -i
grep -rn 'REPLACE-WITH-DOMAIN' .   # must return nothing
```

It appears in `index.html`, `privacy/index.html`, `terms/index.html`,
`support/index.html`, `robots.txt` and `sitemap.xml`, in canonical links, the
Open Graph tags and the organization JSON-LD.

Relative links are used everywhere else, so the site works correctly on the
Netlify preview address before the domain is pointed at it.

## Setting it up on Netlify

1. Netlify, **Add new site**, **Import an existing project**, pick GitHub, then
   this repo.
2. Build settings: base directory blank, build command blank, **publish
   directory `site`**.
3. Deploy. The site is live immediately on a `*.netlify.app` address, which
   keeps working forever even after a custom domain is added.
4. **Domain management**, **Add a domain**, enter the domain.

## DNS at the registrar

Netlify will show the records to add. For a GoDaddy-registered domain they are
the same two FuelPing uses:

| Type | Name / Host | Value |
|---|---|---|
| A | @ | 75.2.60.5 |
| CNAME | www | your-site-name.netlify.app |

Worth knowing, from doing this for FuelPing:

- GoDaddy usually leaves a placeholder record sitting on `@` or `www` from
  registration. Delete it first or the new record fails to save with a
  "conflicts with another record" error.
- Propagation is typically 15 minutes to a few hours, occasionally up to 48.
- Netlify's free Let's Encrypt certificate issues automatically once it sees
  the DNS pointing at it, usually within an hour of propagation. Nothing to
  click beyond adding the domain once.

## Ongoing deploys

Push a change under `site/` to `main` and Netlify republishes. Deploy history
is under Netlify, your site, **Deploys**.

## Local preview

No build step.

```bash
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

Use a server rather than opening `index.html` from disk. Every path on the site
is root-relative, so `file://` loads the pages without their CSS.
