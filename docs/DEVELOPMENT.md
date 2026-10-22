---
title: Development
status: active
updated: 2026-10-22
---

# Development

## Prerequisites

- Node 18+ (verified on Node 24). No `npm install`, no packages.
- A Chromium browser (Edge/Chrome) for the UI. `file://` is supported.
- Optional: Playwright if it is already available in another project; otherwise use the
  headless screenshot recipe below.

## Run

```powershell
start index.html
```

There is no dev server and no build. Edit a file and reload.

CLI:

```powershell
node cli.js examples/report-pipeline.txt -o out/report.svg
node cli.js examples/company-map.txt --theme dark -o out/company.svg
```

## Verify

```powershell
node verify.js
```

The gate checks:

1. All required docs exist, are non-trivial, and have front matter.
2. Every relative link inside `docs/*.md` resolves.
3. Every source file appears in `docs/CODEMAP.md`.
4. Core tests pass (`node test-core.js`, 17 checks).
5. The CLI produces an SVG for a real example, with a background rect.
6. No unexpected `require()` calls (no dependencies).

To debug the gate itself, run the pieces:

```powershell
node test-core.js
node cli.js examples/report-pipeline.txt -o out/report.svg
```

## Test matrix

| Behavior | Automated | Manual |
|---|---|---|
| DSL parsing, shapes, labels, edge styles | `test-core.js` | — |
| Tree mode | `test-core.js` | — |
| Cycle / self-loop / skip-edge routing | `test-core.js` | — |
| No same-rank overlap, canvas bounds | `test-core.js` | — |
| Groups | `test-core.js` | — |
| Determinism | `test-core.js` | — |
| Error line numbers | `test-core.js` | — |
| Theme tokens / SVG shell / escaping | `test-core.js` | visual check |
| Browser render, pan/zoom, autosave | — | checklist below |
| SVG download | CLI smoke | click + open the file |
| PNG 2× download | — | checklist below |

### Browser checklist (2 minutes)

1. Open `index.html`; the default example renders and the stats show nodes/edges.
2. Toggle Dark; the diagram and app both change.
3. Scroll to zoom, drag to pan, double-click to fit; `100%` resets.
4. Break the DSL (type a lone `A ->`); a line-numbered error appears and the old diagram
   stays. Fix it.
5. Download SVG; open it in the browser (it must have a background and no missing fonts).
6. Download PNG; check it is 2× the SVG's dimensions and not blank.
7. Reload; the text and theme are restored.

### Headless screenshot (no Playwright)

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& $edge --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 `
  --virtual-time-budget=2500 --user-data-dir="$env:TEMP\ds-edge" `
  --screenshot="out\ui.png" "file:///$((Resolve-Path index.html).Path -replace '\\','/')"
```

If the profile directory is locked, use a fresh one. This verifies rendering, not clicks.

## Debugging

Dump a parse and a layout in Node:

```powershell
node -e "const c=require('./core.js'),f=require('fs');const r=c.parse(f.readFileSync('examples/company-map.txt','utf8'));console.log(r.ok,r.errors,r.model.edges.length);const l=c.layout(r.model);console.log(l.width,l.height,Object.keys(l.nodes));"
```

- Wrong node/label: log `res.model.nodes`.
- Overlap/bounds: log `lay.nodes` (x/y/w/h) and `lay.width/height`.
- Bad path: log `lay.edges[].path` and search for `NaN`.
- UI state: `state.view`, `localStorage["diagram-studio-v1"]` in DevTools.

## Add a feature (worked recipe)

Example: add a `hexagon` shape.

1. `core.js` `nodeToken()`: recognize the delimiter (pick one not used by labels).
2. `layout()` sizing: decide width/height multipliers.
3. `renderSVG()`: draw the polygon; keep text centered with the existing code.
4. `docs/SPEC.md`: add the delimiter to §1.4 and shape list.
5. `test-core.js`: assert the parsed shape and that the SVG contains the polygon.
6. `node verify.js`.

For an edge style, directive, or export, see the recipes in [CODEMAP.md](CODEMAP.md).

## Regenerate the architecture diagrams

The docs diagrams are dogfooded through the CLI:

```powershell
node cli.js docs/assets/pipeline.dsl -o docs/assets/pipeline.svg
node cli.js docs/assets/modules.dsl -o docs/assets/modules.svg
```

Edit the `.dsl` source, never the SVG by hand.

## Docs maintenance

- Update `CODEMAP.md` when files/symbols move.
- Update `SPEC.md` when behavior changes.
- Update `CURRENT_STATE.md` with a new verified date and any new limit.
- Add a `CHANGELOG.md` line for user-visible changes.
- Supersede, don't delete: mark `status: superseded` and link the replacement.
- `verify.js` catches missing docs, broken links and unmapped files — not stale prose.
  Freshness is a review responsibility.

## Release / handoff

1. `node verify.js` green.
2. Browser checklist green.
3. `CURRENT_STATE.md` verified date + evidence.
4. `CHANGELOG.md` entry.
5. Copy the folder as-is (no build artifacts); `out/` is optional.

There is no version file; use `CHANGELOG.md` headings (`0.1.0`) and the verified date.
