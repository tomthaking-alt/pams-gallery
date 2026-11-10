# Pam's Gallery — itsamepameo.com

Pam is an artist; this repo is her portfolio and shop, a walk-through 3D gallery with a Greek, sunlit look.
It's her "dream job" site, so polish matters. She is not a developer: explain things in plain English,
give a time estimate before longer jobs, and send a short progress report when each piece goes live.

## How the repo works

- **Live files (repo root)** are what Vercel serves: `index.html`, `api/app.js` (one serverless function),
  `lib/` (pictures, three.js), `ar/` (3D models for phones' AR viewers), `vercel.json`, `sw.js`, `offline.html`,
  `manifest.webmanifest`, icons, `robots.txt`, `404.html`.
  **Never edit `index.html` or `api/app.js` by hand.** They are build output, and `index.html` carries
  security-policy hashes of its scripts, so any hand edit breaks the page.
- **Source** lives in `dev/` (excluded from the live site by `.vercelignore`):
  - `dev/src/House of Pam.html`: the whole site (markup, styles, gallery code, dashboard). Edit this.
  - `dev/api/app.src.js`: the server (catalogue, enquiries, bids, accounts, emails, analytics, painting pages). Edit this.
  - `dev/api/pages.reference.js`: an older standalone copy of the page-rendering code, for reference only (already merged into app.src.js).
  - `dev/build/`: build steps (`mk3.py` adds three.js and rejects stray raw WebGL calls such as `gl.`; avoid a
    variable named `gl` in the source. `split4.py` moves pictures into `lib/`, adding watermarks and EXIF copyright.
    `fill4.py` puts the built-in catalogue into the server. `webp.py`, `sharecard.py`. `csp.py` script hashes, always last).
  - `dev/test/`: local server, pretend database and tests.

## Build, test, publish

```bash
bash dev/build.sh                                  # rebuilds index.html, api/app.js, new lib/ pictures
python3 dev/test/mockredis.py 8793 &               # pretend Upstash database (in memory)
node dev/test/devserver.js &                       # local site on http://localhost:8794 (same rewrites as vercel.json)
node dev/test/api3.js && node dev/test/demo.js     # once per fresh database: test accounts + demo catalogue
node dev/test/sec5.js; node dev/test/p3api.js; node dev/test/p4api.js; node dev/test/p3mail.js; node dev/test/antest.js
git add -A && git commit -m "…" && git push        # Vercel publishes main automatically
```

- Needs python3 with Pillow, and node 18+. The UI tests in `dev/test/ui/` use Python Playwright with Chromium. They pass a
  token as an argument and take a few minutes each, because the 3D gallery is slow in software rendering.
- The share card and watermarks use the fonts Lora Italic and Inter. Their paths are hard-coded in `dev/build/sharecard.py`
  and `dev/build/wmlib.py` (Linux paths). Point them at local copies if those steps fail.
- Test logins (pretend database only): owner `pts98@hotmail.co.uk` / `testpass123`; member `bob@example.com` / `bobpass123`.
- The tests hit rate limits if run repeatedly. Restart the pretend database, or delete the `rl:*` keys, between runs.
- The page's own scripts run under a strict Content-Security-Policy (meta tag, built by `csp.py`). Inline scripts must be
  in the source before the build. No `eval`, no external scripts except Google sign-in.
- After publishing, check the live site with no console errors, and check that `/works`, `/art/<slug>` and `/sitemap.xml` return 200.

## Settings that live outside the code (Vercel → Project → Settings → Environment Variables; Pam adds these herself)

- `KV_REST_API_URL`, `KV_REST_API_TOKEN`: Upstash Redis (already set).
- `RESEND_API_KEY`, `MAIL_FROM`: email. **Not set yet.** Until it is, the site sends no buyer confirmations,
  sign-up confirmations or members' "new work" emails, and enquiries appear only in the dashboard.
- `STRIPE_SECRET_KEY`: card payment links (not set yet). `GOOGLE_CLIENT_ID`: Google sign-in. `SESSION_SECRET`: optional.
- Never put keys, passwords or tokens in the code or in chat. Pam enters them in Vercel herself.

## Things to keep true

- The owner is `pts98@hotmail.co.uk`. Owner-only actions are checked on the server (`owner(req)`).
- No discounts, loyalty points or charity mentions (Pam removed them). The members' perks are early access to new
  work and a signed print for completing a collection.
- Never invent facts about Pam or her work, such as sizes, prices, exhibitions, press, testimonials or buyer promises.
  Use clearly marked `[PLACEHOLDERS]` and let her fill them in. The buying details (delivery, returns, certificate)
  come from Dashboard → Settings → Buying & delivery.
- Privacy: visitor analytics are cookieless and store nothing on visitors' devices. Keep the Privacy page (`/privacy`,
  rendered in app.src.js) in step with anything new that's collected.
- Accessibility: real buttons and labels, keyboard support, `prefers-reduced-motion` respected, text contrast ≥ 4.5:1.
