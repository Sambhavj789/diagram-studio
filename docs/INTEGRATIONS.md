---
title: Integrations - reports, books, notes, decks
status: active
updated: 2026-10-27
---

# Integrations

One rule: **SVG is canonical, PNG is derived.** Keep the `.dsl` or the Markdown/book
source next to the output so the diagram can be regenerated and reviewed.

| Consumer | Format | Why |
|---|---|---|
| `ai-report` (python-docx) | PNG 2x | python-docx cannot embed SVG |
| `make-book.ps1` (Pandoc + Typst) | SVG | Typst renders SVG natively; text stays crisp |
| Notes / Obsidian | SVG | opens inline, no extra asset pipeline |
| Slides / one HTML page | SVG | per-render marker ids prevent colour leaks |

## 1. AI report generator (`personal/ai-report`)

`src/docx_writer.py` collects image lines (`![]` + the file path), so the report needs a
raster file. Call the CLI once per figure and keep the JSON line for widths/logging.

Python helper (no extra package; adjust the tool path once). A runnable version lives at
`examples/python_figure.py` in this repo:

```python
import json
import os
import subprocess

STUDIO = os.environ.get("DIAGRAM_STUDIO", r"C:\Sambhav-OS\tools\diagram-studio")

def render_figure(dsl: str, out_png: str, theme: str = "light", scale: int = 2) -> str:
    """Write DSL -> PNG through diagram-studio; returns the path in markdown form."""
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    src = os.path.splitext(out_png)[0] + ".dsl"
    with open(src, "w", encoding="utf-8") as fh:
        fh.write(dsl)
    run = subprocess.run(
        [os.environ.get("NODE", "node"), os.path.join(STUDIO, "cli.js"), src,
         "-o", out_png, "--theme", theme, "--scale", str(scale), "--json"],
        capture_output=True, text=True, check=False,
    )
    data = json.loads(run.stdout.strip().splitlines()[-1])
    if run.returncode != 0 or not data.get("ok"):
        raise RuntimeError(f"diagram-studio failed: {data or run.stderr}")
    return out_png.replace("\\", "/")
```

Then in the markdown assembly:

```python
path = render_figure(architecture_dsl, "figures/architecture_studio.png")
body += "\n![](" + path + ")\n\n**Figure: System architecture**\n"
```

Tips:

- `--scale 2` matches the current matplotlib DPI; 1x is enough for screen-only PDFs.
- A diagram that is too wide for A4 usually wants `direction: TB` or a shorter label.
- Keep the generated `.dsl` beside the PNG: the next run (or a human) can edit the source.
- Do not give the tool the report's `.env` or any client data; it only reads the DSL file.

## 2. Book pipeline (`hq/ops/scripts/make-book.ps1`)

The book builder renders a fenced block whose info string is `dsl` (or `diagram`) and
replaces it with an SVG image. Nothing else in the note changes.

````markdown
```dsl
title: Regression pipeline
direction: LR
Data (Training data) -> Fit (Fit model)
Fit -> Check {Error ok?}
Check ->|yes| Ship ((Publish))
Check ->|no| Tune (Tune)
Tune -> Fit
```
````

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ops\scripts\make-book.ps1 ops\book\sample\sample.yaml
```

- Output assets: `ops/book/out/assets/<book>/dsl-NN.svg` (gitignored with the PDF).
- A parse error stops the build with the note name and the line, so a bad diagram cannot
  slip into a book.
- The tool path is `DIAGRAM_STUDIO` if set, otherwise `..\tools\diagram-studio` next to
  the HQ folder.
- A book map (parts + notes) can be generated from the same yaml:

```powershell
node cli.js 10-atlas\ml\books\ml-foundations.yaml --book -o ops\book\out\ml-foundations-map.svg
```

## 3. Notes / Obsidian

Export next to the note (or into an `assets/` folder) and embed:

```powershell
node cli.js notes\report-flow.txt -o 10-atlas\ml\assets\report-flow.svg
```

```markdown
![[report-flow.svg]]
```

`make-book.ps1` already resolves `![[...]]` images, so the same note works in the vault and
in a PDF.

## 4. Slides or one HTML page

Embed the SVG files inline (not as `<img>`) only when you need CSS to reach inside. Each
render carries its own marker id (`ds-arrow-<hash>`), so a dark diagram next to a light one
keeps the correct arrow colour.

## 5. Agent / script contract

- `--json` prints exactly one line: `{ ok, out, format, nodes, edges, width, height, dir }`
  (plus `scale`/`transparent` for PNG). Parse the last stdout line.
- Exit codes: `0` ok, `1` parse/outline error, `2` bad arguments/IO/missing browser.
- PNG needs one of Edge/Chrome/Chromium. Set `DIAGRAM_STUDIO_BROWSER` on machines where
  the browser is not in a standard path.
- Never edit the generated SVG by hand; edit the `.dsl` (or the note's fenced block) and
  re-run.
