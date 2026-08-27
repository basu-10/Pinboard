# Pinboard

An infinite, pannable wall for placing individual text-note and image cards on a
dotted grid. Cards are edited in a modal and persist in your browser via
IndexedDB. Supports placing cards via toolbar or clipboard paste. Static, no
build step, no server.

## Run locally

ES modules are blocked over `file://`, so serve the folder over HTTP:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Live site

Served at <https://pinboard.abaxu.workers.dev/> (Cloudflare Workers, static
asset serving — no build step). `index.html` at the root is the entry point.

## Deploy

The site is plain static files with ES modules, so it runs on any static host:

- **Cloudflare Workers / Pages** — no build command, publish the folder as-is.
- **Any static server** — upload the directory; `index.html` is the entry.

IndexedDB storage is per-browser, so each visitor keeps their own wall.

## Pages

- `index.html` — landing page with entry points to the board, library, and the
  About tour.
- `app.html` — the pannable board canvas.
- `library.html` — saved-boards listing (open / delete / backup).
- `about.html` — a scroll-driven presentation that demos the app with animated
  mocks of its interface.
