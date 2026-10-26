# Diagram Studio

Offline, zero-dependency text → diagram tool. Type a few simple lines, get a clean
SVG you can drop into reports, books, notes or slides, and download it as SVG or PNG.

No install, no account, no internet, no image-generation model. Static files, no build step, straight from disk.

![Diagram Studio](out/preview.png)

## Use it

**Browser (normal way):** double-click `index.html` (Edge/Chrome). Edit on the left,
preview on the right. Drag to pan, scroll to zoom, double-click to fit. PNG scale is
1x/2x/3x; Clear exports without a background.

**CLI (for scripts and books):**

```powershell
node cli.js examples/report-pipeline.txt -o report.svg
node cli.js examples/company-map.txt --theme dark -o company.svg
Get-Content notes.txt | node cli.js - -o notes.svg
node cli.js examples/report-pipeline.txt -o report.svg --json
node cli.js examples/report-pipeline.txt -o report.png --scale 2
node cli.js notes.md --outline -o notes.svg --watch
```

`--watch` keeps the command running and re-renders whenever the input file changes;
`--json` then prints one JSON line per render.

The CLI prints node/edge counts and canvas size. Exit code `1` means a parse error.

`--json` switches the summary to one line of machine-readable JSON and still writes the file:

```json
{"ok":true,"out":"report.svg","format":"svg","nodes":8,"edges":8,"width":1558,"height":252,"dir":"LR"}
```

On a parse error it prints `{"ok":false,"errors":[{"line":2,"message":"..."}]}` on stdout,
exits `1` and writes no file. Usage errors still exit `2`.

**From Markdown or a book yaml:**

```powershell
node cli.js examples/outline.md --outline -o outline.svg
node cli.js ..\..\hq\10-atlas\ml\books\ml-foundations.yaml --book -o book-map.svg
```

`--outline` reads headings + lists; `--book` reads `- part:` / `- <note>.md`. Both produce
ordinary tree DSL, so you can still edit the result.

**PNG:** a `.png` output (or `--png`) uses an installed Edge/Chrome/Chromium headless.
`--scale 1|2|3` (default 2) and `--transparent` are supported; `--browser PATH` or
`DIAGRAM_STUDIO_BROWSER` picks the executable. SVG needs no browser.

`--compact` tightens the gaps between ranks and nodes, which is what a report page or a
book wants (a wide, short figure instead of a tall scroll).

## Syntax

```
title: Report pipeline
direction: LR            # LR or TB (default)

A [Box label]            # rectangle
B (Pill label)           # stadium / start
C {Decision?}            # diamond
D ((End))                # circle

A -> B                   # solid arrow
A -> B : edge label      # labelled arrow
A ->|label| B            # same, mermaid-ish
A -.-> B                 # dashed
A <-> B                  # two-way
A -> A                   # self loop
```

Nodes can be defined on an edge (`A [Start] -> B`), on their own line, or not at all
(the id becomes the label).

**Groups:**

```
group Money {
  Salary -> Bills
  Salary -> Savings
}
```

**Trees / mind maps:** if a block has no arrows and at least one indented line, it
becomes a left-to-right tree. Two spaces per level.

```
Weekly review
  Wins
    Shipped the task
  Lessons
    Read the code first
```

Other rules:

- `\n` inside a label makes a second line.
- Quotes keep commas/colons inside a label: `A["One, two: three"] -> B`.
- Lines starting with `#` or `//` are comments.
- `graph LR` / `flowchart TB` are accepted as direction directives.
- Cycles are allowed; back edges are routed around the side.

## What it produces

- Layered layout: longest-path ranks, median ordering sweeps, no node overlaps.
- Rounded boxes, diamonds, pills, circles, dashed/two-way edges, edge labels,
  group boxes, optional title.
- Bounds include full label boxes and edge curves, so long labels do not clip.
- Light and dark themes. Exports include the background unless Clear is on, so they look
  right in Word/Docs/PDF without extra styling.
- SVG is self-contained (markers and inline styles); marker ids are unique per render, so
  several diagrams can share one page.
- PNG export at 1x/2x/3x, opaque or transparent; the CLI uses the installed browser.

## Files

| File | What |
|---|---|
| `index.html` | app shell |
| `styles.css` | UI styles |
| `core.js` | parser + layout + SVG renderer (pure, works in Node) |
| `app.js` | editor, pan/zoom, theme, export, autosave |
| `cli.js` | headless SVG/PNG generation, outline modes |
| `outline.js` | Markdown/book yaml → tree DSL |
| `raster.js` | SVG → PNG through a headless browser |
| `test-core.js` | 28 parser/layout/render/outline/CLI checks |
| `verify.js` | one-command gate: tests, CLI smoke, docs and links |
| `docs/` | architecture, spec, integrations, code map, decisions, troubleshooting |
| `AGENTS.md` | entry point for AI agents working on the tool |
| `examples/` | sample inputs |

## Docs

Start at `docs/00-index.md` (30-second summary + reading paths). Architecture and module
diagrams are generated from `docs/assets/*.dsl` with this tool. Report/book wiring is in
`docs/INTEGRATIONS.md`. Every change must keep `node verify.js` green.

## Verify

```powershell
node verify.js
```

It runs the 28 core checks, a CLI smoke test, and the docs gate (required files, front
matter, links, CODEMAP coverage, no dependencies).

## Known limits

- `RL` / `BT` are accepted but rendered as `LR` / `TB`.
- Groups are visual clusters (one nesting level); keep members near each other.
- Very wide ranks get wide rather than wrapping; split the diagram or use `direction`.
- PNG needs Edge/Chrome/Chromium; there is no bundled rasterizer.
- Browser autosave lives in `localStorage`; export if the text matters.

## License

MIT, see [LICENSE](LICENSE).
