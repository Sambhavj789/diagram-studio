---
title: Troubleshooting
status: active
updated: 2026-10-27
---

# Troubleshooting

Symptom first. If a workaround becomes a pattern, fix the cause and add a test.

| Symptom | Likely cause | Fix |
|---|---|---|
| Preview says "Cannot draw yet. Line N..." | Parse error on that line | Read the message; check `}`, trailing `->`, quotes. The old diagram stays visible. |
| Nothing renders, no error | Empty source or only comments | Type at least one node or edge. |
| A line became a node instead of an edge | Arrow token typo (`- >`, `=>`, `→`) | Use `->`, `-->`, `-.->`, `<->`. |
| Edge label is part of the target | Colon handling | Use `A -> B : label`; if the id has a colon, use `A ->|label| B`. |
| Diagram is tiny in the preview | Whole canvas fit; wide LR chain | Zoom, switch to TB, or split the diagram. |
| Nodes overlap | Layout bug (should be impossible) | Capture the exact DSL, run `node test-core.js`, add a regression case; check `layout()` packing. |
| Edge passes through a node | Rank-skipping edge or very dense graph | It should use a lane; if not, log `rank` and `path` and add a case. Split dense diagrams. |
| Edge label clipped at canvas edge | Old build, or a browser cache | Bounds now include the full label box and curve points. Re-run `node verify.js`; if it still clips, add the DSL as a test. |
| Arrowheads missing / wrong colour across two diagrams | A strict renderer, or a stale SVG with a fixed id | Marker ids are per render (`ds-arrow-<hash>`); re-export both files. Open each SVG alone to confirm. |
| PNG button does nothing | Canvas rasterization failed (`file://`, memory cap) | Use SVG; open the app over a local server if needed; the longest side is capped at 6000 px. |
| `cli.js -o x.png` says PNG export failed | No Edge/Chrome/Chromium, or the path is wrong | Install a browser, set `DIAGRAM_STUDIO_BROWSER`, or pass `--browser`. SVG output needs none of this. |
| PNG is blank | Browser blocked the SVG blob / old headless profile | Re-export; check the CLI stderr; delete the temp profile (the tool makes its own). |
| PNG has a white box though Clear is on | Viewer adds a background | The PNG itself is RGBA; check in an editor that shows transparency. |
| Text looks different on another machine | System font stack | Export PNG for pixel-stable output, or accept the viewer's system font. |
| Outline is empty or throws | No headings/lists, or a book yaml with no notes | `--outline` needs headings or list items; `--book` needs `- part:` / `- <note>.md`. |
| Outline hierarchy is flat | Markdown uses spaces + bold text instead of headings/lists | Use `#` headings and real list markers, or wrap the text as an indented DSL tree. |
| Autosave lost | `file://` storage per profile, private mode, or cleared data | Download the SVG and keep the `.txt`/DSL source in the project. |
| UI works but CLI output is blank | Wrong input path or unreadable file | Exit code `2` = IO; `1` = parse. Run `node cli.js --help`. |
| `node verify.js` fails on docs | Missing file, broken relative link, missing front matter, or source not in CODEMAP | The message names the file/link. Fix the doc; do not weaken the check. |
| `node verify.js` fails on `require()` | A dependency was added | Remove it; this project is dependency-free by design (builtins only). |
| `msedge --headless` screenshot fails | Profile directory locked | Use a fresh `--user-data-dir`; close other headless runs. |

## Fast diagnostics

```powershell
node verify.js
node -e "const c=require('./core.js');const r=c.parse('A -> B');console.log(JSON.stringify(r,null,2));"
node -e "const c=require('./core.js');const l=c.layout(c.parse('A -> B').model);console.log(l.width,l.height,l.edges[0].path,l.edges[0].labelBox);"
```

If output contains `NaN` or `Infinity`, the bug is in `layout()`. If the SVG text is
wrong but geometry is fine, the bug is in `renderSVG()`. If the model is wrong, the bug is
in `parse()`. If a PNG is wrong but the SVG is right, the bug is in `raster.js`.
