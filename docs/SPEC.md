---
title: Spec — DSL, CLI, UI, exports
status: active
updated: 2026-10-27
---

# Spec

Behavior contracts. If the code disagrees, this file is a bug report; fix one and update
the other in the same change.

## 1. DSL

### 1.1 Lines

- One construct per line; leading/trailing whitespace is ignored.
- Blank lines are ignored.
- `#` or `//` at the **start** of a trimmed line is a comment. Inline comments are not
  supported (labels may contain `#`).
- Line order is preserved for node creation and edge order.

### 1.2 Precedence

A line is interpreted in this order:

1. `title:` / `direction:` / `graph` / `flowchart`
2. `group Name {` and `}`
3. Edge (the line contains an arrow token)
4. Node reference
5. Error

A standalone line that looks like a node always becomes one, so unknown syntax usually
renders as a node instead of failing. Only the cases in §1.7 are hard errors.

### 1.3 Directives

```
title: Paisa kahan jaata hai
direction: LR            # LR | TB | RL | BT
graph LR                 # alias
flowchart TB             # alias
```

`RL`/`BT` are normalized to `LR`/`TB`. Last directive wins. In tree mode, `title` and
`direction` are honored; other directives are ignored.

### 1.4 Nodes

```
A                      # label = id
A [Box label]          # rectangle
B (Pill label)         # stadium
C {Decision?}          # diamond
D ((End))              # circle
```

- Id: everything before the opening delimiter, trimmed. Ids may contain spaces; they may
  not contain `[ ] { } ( )`.
- A node can be defined on an edge: `A [Start] -> B`.
- Re-declaring a node merges: a non-empty label replaces the label; an explicit shape
  replaces the shape; group membership is set only if it was empty.
- Labels: surrounding matching quotes (`"..."` or `'...'`) are stripped; the two-character
  sequence `\n` becomes a line break.
- Labels and ids are case-sensitive.

### 1.5 Edges

```
A -> B                 # solid
A --> B                # solid (alias)
A -.-> B               # dashed
A <-> B                # arrows on both ends
A -> B : label         # label after a colon
A ->|label| B          # label in pipes
A -> A                 # self loop
```

- Arrow tokens, longest first: `<->`, `-.->`, `-->`, `->`.
- Label rules: a leading `|...|` immediately after the arrow wins; otherwise the target is
  split at the **first** colon (whitespace around it is optional), so `A -> B: label` and
  `A -> B : label` both work. If the target id itself contains a colon, use the pipe form.
- Duplicate edges are allowed (parallel edges with different labels).
- Edge labels may contain additional `:` characters.

### 1.6 Groups

```
group Money {
  Salary -> Bills
  Salary -> Savings
}
```

- `group <name> {` opens; `}` closes. A stray `}` is an error.
- Same name (slugged) reuses the same group.
- A node joins the innermost open group at **first creation**.
- Rendering: dashed union box with an uppercased label. Groups do not affect ranks.
- One level only: opening a `group` while another group is still open is a line-numbered
  error (`nested groups are not supported (one level)`).

### 1.7 Tree mode

If a document has **no arrows** and **at least one indented non-empty line**, it becomes
a tree:

```
Weekly review
  Wins
    Shipped the task
  Lessons
    Read the code first
```

- Indentation: spaces (tab expands to 2). Each item attaches to the nearest previous item
  with a smaller indent.
- First item: stadium. Others: box.
- Direction defaults to `LR` unless a `direction:` line says otherwise.
- A leading `- ` or `* ` is stripped from each label.

### 1.8 Errors

`parse()` returns `{ ok: false, errors, error, model }`; it never throws.

| Input | Error |
|---|---|
| `}` with no open group | `extra "}"` |
| `group B {` while another group is open | `nested groups are not supported (one level)` |
| `-> B` / `A ->` | `arrow needs a node on both sides` / `arrow needs a target` |
| line that cannot be tokenized | `could not understand: ...` |

The UI shows `Line N: message` and keeps the last valid preview. The CLI prints every
error and exits `1`.

## 2. CLI

```
node cli.js <input.txt> [-o out.svg] [--theme light|dark] [--direction TB|LR] [--json]
node cli.js <input.md> --outline [-o out.svg]
node cli.js <book.yaml> --book [-o out.svg]
node cli.js <input.txt> -o out.png [--png] [--scale 1|2|3] [--transparent]
node cli.js - -o out.svg            # stdin
node cli.js --help
```

- `--theme=dark` and `--out=file` are accepted too.
- Input defaults: none (required). Output defaults: same directory, input basename with
  `.svg` (`diagram.svg` for stdin); `.png` when the format is PNG.
- `--direction` overrides the document. `--outline`/`--md` and `--book` are mutually
  exclusive.
- UTF-8 BOM is stripped.
- Success prints one line: `wrote <file> (<n> nodes, <m> edges, <w>x<h>, <dir>)`.
- Exit codes: `0` success, `1` parse error (including an outline with no headings/lists),
  `2` bad arguments / IO / invalid theme, direction or scale / PNG tooling missing.

### 2.1 JSON

`--json` prints exactly one line on stdout.

- Success: `{ ok, out, format: "svg"|"png", nodes, edges, width, height, dir }` plus
  `scale` and `transparent` for PNG.
- Failure: `{ ok: false, errors: [{ line, message }] }`; no file is written.

### 2.2 Outline input

`--outline` (alias `--md`) reads Markdown and emits tree-mode DSL: `#`-`######` headings
and `-`/`*`/`+`/numbered list items, nested by heading level and indentation. YAML front
matter, fenced code, blockquotes and tables are ignored. The first H1 is the root; if the
document has several roots a synthetic root (the H1 or `Outline`) is added.

`--book` reads a book yaml shaped like `templates/book.yaml` (`title`, `subtitle`,
`chapters`/`parts` with `- part:` and `- <note>.md`): book -> part -> note, where a note
label is its filename without `.md` and with `-`/`_` turned into spaces.

Both modes produce ordinary DSL. `--direction` still applies; without it the tree is `LR`.

### 2.3 PNG

- A `.png` output path (or `--png`) rasterizes through an installed Edge/Chrome/Chromium
  in headless mode. Nothing is installed by this project.
- `--scale 1|2|3` (default `2`) scales the outer SVG dimensions; the drawing stays crisp
  because the SVG is re-rendered at the target size.
- `--transparent` omits the background (PNG alpha channel; SVG without the background rect).
- Browser lookup: `--browser PATH`, then `DIAGRAM_STUDIO_BROWSER`, then the usual install
  paths, then `PATH`. Failure is exit `2` with an actionable message.

## 3. Browser UI

- Live render after 220 ms of no typing; `Ctrl/Cmd+Enter` renders immediately.
- Parse errors: banner with line number; last good diagram stays visible; textarea gets a
  red left edge.
- Theme button toggles the whole app + diagram (`light` default, `dark` optional).
- Flow select rewrites the `direction:` line (inserts at the top if missing).
- Pan: drag anywhere on the stage. Zoom: wheel, pointer-anchored, 0.2–8×. Double-click or
  `Fit` resets. `100%` means the base fit.
- Autosave: `localStorage["diagram-studio-v1"]` stores `{ text, theme, pngScale, transparent }`;
  guarded with try/catch for `file://` and private modes.
- `Ctrl/Cmd+S` downloads SVG.
- Exports always re-render from the model (not the panned DOM).
- PNG scale select: 1x/2x/3x (default 2x). Clear checkbox: export without a background.
  The UI caps the longest PNG side at 6000 px.

## 4. Exports

| Export | Contract |
|---|---|
| SVG | Self-contained; numeric `width`/`height`; background included unless Clear; file `slug(title).svg` (`-clear` suffix when transparent) |
| PNG | Rasterized at the selected scale (1x/2x/3x), capped so the longest side ≤ 6000 px in the UI; file `slug(title)@Nx.png`; `-clear` suffix when transparent |
| Preview | Same SVG with `background:false` so the stage grid shows |

The slug is lowercase, non-alphanumerics collapsed to `-`, fallback `diagram`.

Marker ids are `ds-arrow-<8 hex>` derived from theme, title, size and node order. Two
different diagrams on one page therefore use different arrow markers; identical renders
reuse the same id.

## 5. Compatibility aliases

Accepted for muscle memory: `graph`/`flowchart`, `-->`, quoted labels, `\n` in labels,
`|label|` edges, `<->`, comments with `#` or `//`.

## 6. Non-goals

- Markdown is not parsed as a diagram in the DSL path; `--outline`/`--book` is an explicit
  conversion step that emits tree-mode DSL.
- No sequence, class, ER or Gantt semantics.
- No subgraph ranks, no port selection, no obstacle-avoiding routing.
- No remote fonts or images; nothing is fetched at runtime.
- No bundled rasterizer: PNG uses an installed Chromium browser.
