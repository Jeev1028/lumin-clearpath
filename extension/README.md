# ClearPath / Lumin AI — Chrome Extension

A Lumin AI chat assistant that lives in your browser toolbar. Sign in with
your existing ClearPath account, then get guided help while working on
Google Docs, Slides, research sources, MLA citations, and more — Lumin
still won't write anything for you (same academic-honesty rules as the
website and app), it just points you in the right direction wherever
you're working.

## What it does

- **Chat with Lumin** from a popup, available on any page.
- **"Read this page"** — grabs the visible text of the page you're on
  (only when you tap the button, never automatically) and drops it into
  the chat as context, so you can ask Lumin about what you're reading
  without copy-pasting it yourself. Works well on articles/regular pages;
  on Google Docs/Slides specifically it's best-effort only, since those
  render through canvas rather than plain readable text.
- **"Cite this source (MLA)"** — grabs the current page's title/URL and
  asks Lumin to walk you through figuring out the MLA citation format
  yourself (Lumin never generates the citation outright — same rule as
  everywhere else).
- Conversations are saved to the same account/database as the website, so
  they also show up at [luminclearpath.ca/chat](https://luminclearpath.ca/chat).

## Development

```sh
cd extension
npm install
npm run build
```

This produces a ready-to-load `dist/` folder (`manifest.json` + built
popup + icons).

### Load it in Chrome

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. Pin the extension (puzzle-piece icon in the toolbar → pin "Lumin AI")

After making changes, run `npm run build` again and click the refresh icon
on the extension's card in `chrome://extensions` to pick up the new build.

### Live-reloading while developing

`npm run dev` runs Vite's dev server for the popup UI in isolation (handy
for fast iteration on styling/layout), but `chrome.*` APIs
(`chrome.tabs`, `chrome.scripting`, `chrome.storage`) only exist inside an
actual loaded extension context — for anything that touches those, build
and reload the unpacked extension instead.

## Publishing to the Chrome Web Store (later step, not done yet)

Not required for personal/testing use (unpacked extensions work fine
indefinitely), but if this should be installable by other students
without "Developer mode":

1. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) — **one-time $5 registration fee**.
2. `npm run build`, then zip the contents of `dist/` (not the `dist`
   folder itself — the zip's root should contain `manifest.json`
   directly).
3. Upload the zip in the developer console, fill in the store listing
   (description, screenshots, privacy practices), and submit for review.
4. Google's review can take anywhere from a few hours to a few days.

## Architecture notes

- Same Supabase project/auth and the same `/api/chat` endpoint as the
  website — no separate backend. The API route was updated to allow
  cross-origin requests from `chrome-extension://` origins specifically
  (see `src/routes/api/chat.ts` in the main project).
- Session storage uses `chrome.storage.local` (not `localStorage`) since
  that's the mechanism designed to survive the popup being closed and
  reopened, rather than a persistent tab.
- One ongoing conversation thread per install (simpler than the website's
  full thread list for a small popup UI), stored as a normal row in the
  same `threads` table.
