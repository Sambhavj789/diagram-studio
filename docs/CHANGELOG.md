---
title: Changelog
status: active
updated: 2026-10-22
---

# Changelog

User-visible changes, newest first. Format: `## <version> — <date>` then bullets.

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
