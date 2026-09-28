# Sketch to UI

Draw a wireframe on an infinite canvas and watch Claude turn it into a working, responsive HTML prototype, streamed live into a sandboxed preview.

## Features

- **Canvas editor built from scratch in SVG.** No canvas library. It has boxes, buttons, inputs, image placeholders, nav bars, circles, text, arrows and freehand pen. You can select, marquee-select, move, resize single shapes or groups (handles flip past the opposite edge), duplicate, reorder and nudge. Zoom stays anchored to the cursor, and you can pan with space-drag or the wheel. Everything snaps to a grid.
- **Undo/redo.** A pure reducer over immutable snapshots. Drags render as a transient draft and commit once on pointer-up, so one gesture is one undo step.
- **One renderer, two outputs.** The same pure SVG markup function draws the on-screen canvas and the PNG sent to the vision model, so the model sees exactly what you drew.
- **Vision plus structure.** Claude receives the PNG and an inferred layout tree (containment and row/column grouping) with roles and labels.
- **Streaming.** The API route streams NDJSON events (status, delta, done, error). The client reassembles lines split across network chunks, throttles re-renders of the preview iframe, and can cancel mid-stream.
- **Secure preview.** Generated code runs in `sandbox="allow-scripts allow-forms"` with an opaque origin, so it can't read the app's storage or cookies. An injected bridge reports runtime errors through `postMessage`, and the parent verifies the sender by window reference.
- **Versions and refinement.** Every generation is saved as a version. "Refine" sends the previous HTML plus your instruction as a follow-up turn. Versions and the sketch persist in localStorage, validated with Zod on load.
- **Works without a key.** Without `ANTHROPIC_API_KEY`, a deterministic layout-inference compiler turns the sketch into semantic HTML: containment tree, then rows, then columns.
- **Hardening.** Zod-validated request bodies with size caps, a best-effort rate limit, and a 300-second function limit for long generations.
- **24 unit tests** covering geometry, history, layout inference, the compiler, stream parsing, the bridge and the rate limiter.

## Run

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY to use Claude
npm run dev
npm test
```

## Shortcuts

| Key | Action |
| --- | --- |
| V / H | Select / pan |
| R B I M N | Box, button, input, image, nav |
| O T A P | Circle, text, arrow, pen |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+D, Ctrl+A | Duplicate, select all |
| Arrows (Shift) | Nudge 1px (16px) |
| Enter / double-click | Edit text |
| Space-drag, Ctrl+wheel | Pan, zoom |

## Structure

```
src/editor/        Editor (SVG canvas), geometry, history, render, schema, toolbar, inspector
src/lib/layout.ts  containment tree + row/column inference, sketch description for the model
src/lib/compile.ts offline sketch -> HTML compiler
src/lib/aiGenerate.ts  Claude streaming (vision + refine turns)
src/lib/stream.ts  NDJSON encode/decode, HTML extraction
src/lib/bridge.ts  sandboxed iframe <-> app messaging
src/app/api/generate/route.ts
```
