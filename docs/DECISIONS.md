---
title: Decisions
status: active
updated: 2026-10-27
---

# Decisions

Append-only, ADR-lite. Add `D-0NN` at the top of the list with date, context, decision and
consequences. Never delete a decision: mark it superseded and link the new one. After ~10
entries, promote each to `docs/adr/NNN-title.md` and leave one-line stubs here.

## D-013 — Bounds include labels, not only boxes (2026-10-27)

**Context:** The canvas was sized from node/group boxes and edge anchors. A long label on a
right-most lane could be cut off, and a self loop above the top node went negative.
**Decision:** `layout()` grows bounds from every curve point and every full label box, then
shifts the whole drawing when the minimum is below the padding.
**Consequences:** No clipped labels and no negative geometry; some diagrams get a few pixels
wider/taller. A regression test covers both cases.

## D-012 — PNG comes from the installed browser (2026-10-27)

**Context:** Reports (`ai-report`, python-docx) and books need a raster image; the old PNG
path existed only in the browser UI, so a script could not produce one.
**Decision:** `cli.js` writes PNG by asking Edge/Chrome/Chromium headless for a screenshot
of a one-page HTML wrapper. No npm dependency, no bundled rasterizer. `--scale 1-3` and
`--transparent` are CLI flags; the UI exposes the same two options.
**Consequences:** PNG works offline on the founder's machines and in the book pipeline;
a machine without a Chromium browser can still produce SVG, and the error says exactly
what to install or which env var (`DIAGRAM_STUDIO_BROWSER`) to set.

## D-011 — Outline input is a separate, pure converter (2026-10-27)

**Context:** Books and notes are Markdown; retyping a tree by hand loses the source of truth.
**Decision:** `outline.js` converts Markdown headings/lists or a book yaml into the existing
tree-mode DSL. The parser and layout do not learn Markdown.
**Consequences:** One small module and two CLI flags; headings, lists, front matter and code
fences are handled, paragraphs/tables/quotes are ignored. The DSL stays the only diagram
format, so a generated outline can still be hand-edited.

## D-010 — Marker ids are derived from the render (2026-10-27)

**Context:** Two SVGs on one page shared `#ds-arrow`; a dark diagram could pick up a light
arrow colour.
**Decision:** `renderSVG()` derives `ds-arrow-<8 hex>` from theme, title, size and node
order. Same input gives the same id; different themes get different ids.
**Consequences:** Multiple diagrams per page are safe without callers passing an id; the
id is stable across runs, so diffs stay clean.

## D-009 — Outside lanes for back, equal-rank and rank-skipping edges (2026-10-22)

**Context:** A straight Bézier for `Charts -> Review` (skips a rank) passed through the
intermediate node and its labels.
**Decision:** Edges that cannot be drawn between adjacent ranks take an outside lane:
right side for TB, below the content for LR, with `+18 px` per lane. Self loops stay local.
**Consequences:** No edge crosses a node in the common case; canvas grows to the right or
bottom; very long diagrams get a wider margin. This is not obstacle-avoiding routing.

## D-008 — Documentation is part of the definition of done (2026-10-22)

**Context:** The tool worked, but a new contributor or AI had to reverse-engineer it. The
company also had no single standard for new tools/projects.
**Decision:** Every new tool/project ships the docs kit
(`00-index`, `ARCHITECTURE`, `CODEMAP`, `SPEC`, `DEVELOPMENT`, `CURRENT_STATE`,
`DECISIONS`, `CHANGELOG`, `TROUBLESHOOTING`) plus a root `AGENTS.md`, and one verify
command. Company standard: `11-library/playbooks/docs-standard.md`; template:
`templates/project-docs/`.
**Consequences:** Slightly slower first hour; much cheaper onboarding, review and handoff.
`verify.js` enforces presence/links/coverage, not prose freshness.

## D-007 — Accept familiar syntax aliases (2026-10-22)

**Context:** Users arrive with Mermaid/flowchart habits.
**Decision:** Accept `graph`/`flowchart`, `-->` as a solid arrow, `|label|` edge labels,
quoted labels and `\n` line breaks. Do not implement Mermaid features beyond that.
**Consequences:** Lower friction, a slightly larger parser, and a documented compatibility
surface that must stay tested.

## D-006 — Transparent preview, opaque export (2026-10-22)

**Context:** A white background rect in the preview hid the dotted stage and produced a
visible band around narrow diagrams.
**Decision:** `renderSVG()` takes `background` (default `true`); the app passes `false`.
Exports always keep the background.
**Consequences:** Preview looks like a canvas; exported SVG/PNG look correct in documents
without CSS. One option to remember.

## D-005 — Layout owns geometry, renderer is pure (2026-10-22)

**Context:** Early code risked computing positions while string-building SVG.
**Decision:** `layout()` returns all geometry (rects, paths, label anchors, bounds);
`renderSVG()` only maps geometry + theme to markup.
**Consequences:** Layout is testable in Node; theming and export changes cannot move nodes;
new renderers are possible without touching layout.

## D-004 — SVG is canonical, PNG is derived (2026-10-22)

**Context:** Diagrams need to go into PDFs, Word/Docs and chat screenshots.
**Decision:** Generate SVG strings; download SVG directly; rasterize at 2× for PNG.
**Consequences:** Crisp vectors by default; PNG needs browser canvas; no server or native
library. PNG is capped at 6000 px per side.

## D-003 — Text DSL first, no drag editor (2026-10-22)

**Context:** The main use is AI/human generated docs; image models cannot draw diagrams.
**Decision:** The source of truth is text. No canvas text boxes, no mouse editing.
**Consequences:** Token-cheap for agents, diffable and reviewable; users who want direct
manipulation are out of scope (export to a drawing tool instead).

## D-002 — Custom layered layout instead of Mermaid/D2/Graphviz (2026-10-22)

**Context:** Mermaid/D2 need a bundle/CDN or a service; Graphviz is a native dependency.
The target is small-to-medium report diagrams, offline.
**Decision:** Implement a compact Sugiyama-style pipeline: cycle marking, longest-path
ranks, median ordering, Bézier edges.
**Consequences:** Full control, no dependencies, predictable output; layout quality is
below Graphviz for dense/cyclic graphs. Limits are documented.

## D-001 — Zero dependencies, offline, no build (2026-10-22)

**Context:** The tool must run on the founder's laptop and in AI sandboxes without
installing anything, often from `file://`.
**Decision:** Plain HTML/CSS/JS, UMD core, Node CLI, no package manager, no network.
**Consequences:** Copy the folder and it works; no supply-chain risk; no framework
conveniences; all primitives (measurement, export, layout) are ours to maintain.
