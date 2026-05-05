# Room Mask Painter

Single-file web app for creating colored room masks on top of imported floor-plan PDFs.

## Features

- Import a PDF floor plan directly in the browser.
- Click a room or bounded area to create a paint-bucket style mask.
- Auto-cycle colors for each newly selected room.
- Animated radial wave shader during selection.
- Controls for wall sensitivity, line width, small gap sealing, and dashed boundary bridging.
- Export a composited PNG or mask-only PNG.

## Running Locally

Serve this folder with any static file server, then open `index.html`.

```sh
python3 -m http.server 8765
```

Then visit:

```text
http://127.0.0.1:8765/index.html
```

The app uses PDF.js from CDN, so it needs internet access for PDF rendering unless PDF.js is vendored locally later.
