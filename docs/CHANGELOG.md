---
title: Changelog
status: active
updated: 2026-10-27
---

# Changelog

User-visible changes, newest first. Format: `## <version> — <date>` then bullets.

## 0.3.0 — 2026-10-27

- CLI: `--watch` re-renders whenever the input file changes (`fs.watchFile`, 300 ms poll,
  so atomic-save editors work too). A bad edit prints the error and keeps the last good
  output; `--json` emits one JSON line per pass. `Ctrl+C` stops it.
- CLI: `--compact` shrinks the rank and node gaps, so the same diagram fits a portrait
  report page or book page with readable text.
- CLI `--book`: note labels are Title Cased ("ml-introduction.md" -> "ML Introduction");
  known acronyms (`ml`, `knn`, `api`, ...) stay upper case.
- `make-book.ps1`: `map: true` in a book yaml prints one diagram of the whole book before
  Part 1 (same tool as ```dsl, warns instead of failing when diagram-studio is missing).

## 0.2.0 — 2026-10-27

- CLI: `--outline` / `--md` turns a Markdown outline (headings + lists) into a tree diagram;
  `--book` turns a `templates/book.yaml`-shaped file (parts + notes) into a book map.
- CLI: real PNG output without a dependency. `-o out.png` or `--png` uses Edge/Chrome/
  Chromium headless; `--scale 1|2|3` and `--transparent` (PNG and SVG) are supported.
  `--browser PATH` / `DIAGRAM_STUDIO_BROWSER` pick the browser.
- UI: PNG scale 1x/2x/3x select and a Clear (transparent) checkbox; both are autosaved.
- Marker ids are now `ds-arrow-<hash>`, stable per input+theme, so several diagrams with
  different themes can live on one HTML page.
- Layout bounds include full edge-label boxes and edge curve points; long labels no longer
  clip at the right edge and a self loop on the top node no longer leaves the canvas.
- `--json` also reports `format`, `scale` and `transparent`.
- 28 core checks; new `docs/INTEGRATIONS.md` (report, book, slides recipes).

## 0.1.3 — 2026-10-22

- Fix: a `group` opened inside another group is now a line-numbered parse error
  (`nested groups are not supported (one level)`). It used to drop the outer group
  silently.
- 18 core checks.

## 0.1.2 — 2026-10-22

- Fix: a chain `A -> B -> C` now makes one edge per hop (it used to create a node named `B -> C`).
  A `: label` ends the chain and labels the last hop; `->|label|` labels its own hop.
- Fix: `A[]` uses the id as label instead of a node id `A[]`.
- An unclosed `group X {` is now an error instead of being silently accepted.
- 17 core checks.

## 0.1.1 — 2026-10-22

- Added the project docs kit (`docs/`) and root `AGENTS.md` for humans and AI agents.
- Added `verify.js`: core tests + CLI smoke + docs/links/CODEMAP/dependency gate.
- `A ->` (arrow with no target) is now a line-numbered error instead of a node.
- Added determinism and trailing-arrow tests (14 checks total).

## 0.1.0 — 2026-10-22

- First working version: text DSL → layered diagram → SVG.
- Shapes: box, stadium, diamond, circle; groups; indented tree/mind map.
- Edge styles: solid, dashed, two-way, labels, self loops; back/skip lanes.
- Browser app: live preview, pan/zoom, fit, light/dark, autosave, direction switch.
- Exports: self-contained SVG, 2× PNG.
- CLI: file/stdin input, theme/direction overrides, exit codes.
- Five examples, 12 initial core checks, generated sample outputs.
