# AGENTS.md — diagram-studio

Read this before changing code. It is the AI entry point; humans start at `docs/00-index.md`.

## What this is

Offline text → diagram tool. Zero runtime dependencies, no build step. `core.js` (parser,
layout, SVG renderer) is shared by the browser UI (`app.js` + `index.html`) and the CLI
(`cli.js`).

## Read order (keep it under ~10k tokens)

1. `docs/00-index.md` — map, quick start, current status (1 page)
2. `docs/ARCHITECTURE.md` — pipeline and stage contracts
3. `docs/CODEMAP.md` — only the files/symbols you are about to touch
4. `docs/SPEC.md` — only the section for the behavior you change
5. `docs/DEVELOPMENT.md` — verify command and the add-a-feature recipe

Do not read `out/` (generated samples), `docs/CHANGELOG.md` (history), or the full README
unless the task actually needs them.

## Verify (one command)

```powershell
node verify.js
```

It runs the core tests, a CLI smoke test, required docs, front matter, relative links, and
CODEMAP coverage. `node test-core.js` alone is not "done".

## Non-negotiables

1. No runtime dependencies, no build step, no network. Must work from `file://`.
2. `core.js` must run in Node. DOM use inside `measure()` is optional and guarded.
3. Parser, layout and renderer stay separate: `layout()` never emits strings,
   `renderSVG()` never computes geometry.
4. Same input → same output. No randomness, time, locale-dependent numbers or hash ordering.
5. Exported SVG is self-contained: inline styles, inline markers, no external CSS/JS/font
   files.
6. Preview may be transparent; exports always include the background
   (`opts.background !== false`).
7. Docs are part of the feature. Behavior changed without a docs update is incomplete.

## Where to change what

| Task | Touch |
|---|---|
| DSL / parsing | `core.js` `parse()`, `docs/SPEC.md`, `test-core.js` |
| Layout / geometry | `core.js` `layout()`, `docs/ARCHITECTURE.md`, `test-core.js` |
| SVG look | `core.js` `renderSVG()` + `THEMES` |
| UI behavior | `app.js`, `styles.css` |
| CLI | `cli.js`, `docs/SPEC.md` |
| Docs gate | `verify.js` |
| Architecture picture | `docs/assets/*.dsl` → regenerate SVG (see DEVELOPMENT) |

## Definition of done

- [ ] `node verify.js` passes
- [ ] New behavior has an automated test, or a documented manual row in `docs/DEVELOPMENT.md`
- [ ] `docs/CODEMAP.md` updated if files/symbols changed
- [ ] `docs/SPEC.md` updated if DSL/CLI/UI behavior changed
- [ ] `docs/CURRENT_STATE.md` has a fresh verified date and known limits
- [ ] `docs/CHANGELOG.md` entry for user-visible changes
- [ ] No dependency added, no generated file edited by hand
