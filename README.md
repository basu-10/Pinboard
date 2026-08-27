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

## Deploy to Cloudflare Pages

Set **build command** empty and **output directory** to `.`. Upload the folder
as-is; `index.html` at the root is the entry. IndexedDB storage is per-browser,
so each visitor keeps their own wall.
