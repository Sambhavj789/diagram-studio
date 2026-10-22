---
title: Diagram Studio — docs index
status: active
updated: 2026-10-22
---

# Diagram Studio docs

**30 seconds:** an offline text → diagram tool. You write a small DSL, it produces a
layered SVG you can download (and a 2× PNG). `core.js` is pure and shared by the browser
app and the CLI. No dependencies, no build, no network.

```powershell
start index.html                      # browser app
node cli.js examples/company-map.txt -o company.svg
node verify.js                        # the only "done" gate
```

![Pipeline](assets/pipeline.svg)

## Doc map

| Doc | Read when |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | You need the pipeline, data shapes, layout algorithm or boundaries |
| [CODEMAP.md](CODEMAP.md) | You need to find a function or know which file to change |
| [SPEC.md](SPEC.md) | You change DSL behavior, CLI arguments, UI behavior or exports |
| [DEVELOPMENT.md](DEVELOPMENT.md) | You run, test, debug or add a feature |
| [DECISIONS.md](DECISIONS.md) | You wonder why it is built this way, or you add a big decision |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Something renders wrong, an export fails, or verify is red |
| [CURRENT_STATE.md](CURRENT_STATE.md) | You need what is verified, what is limited, what is next |
| [CHANGELOG.md](CHANGELOG.md) | You need user-visible history |

Root entry points: [`AGENTS.md`](../AGENTS.md) for AI agents,
[`README.md`](../README.md) for people, `out/preview.png` for a screenshot.

## Reading paths

- **New contributor:** this page → `README.md` → `ARCHITECTURE.md` → `DEVELOPMENT.md`.
- **AI with a small task:** `AGENTS.md` → this page → the one section of `CODEMAP.md` →
  the symbol in `core.js` → the matching test.
- **Debug a bad render:** `TROUBLESHOOTING.md` → `ARCHITECTURE.md` layout section →
  dump `parse()` / `layout()` in Node.
- **Release / handoff:** `CURRENT_STATE.md` → `CHANGELOG.md` → verify.

## Current truth

- Last verified: **2026-10-22** with `node verify.js` (17 core checks + CLI + docs gate).
- Status: **v0.1, usable**. Browser app, CLI, light/dark, SVG/PNG export.
- Known limits are listed in [CURRENT_STATE.md](CURRENT_STATE.md); do not "fix" them by
  guessing — add a test first.

## Ground rules

1. **This index is the map.** Every doc is linked here; no orphan docs. New doc → add a
   row above.
2. Every doc starts with `title`, `status` (`draft`/`active`/`superseded`), `updated`.
   Update the date on every edit.
3. **Supersede, don't silently rewrite.** Mark old truth `superseded` and link the new
   source. Keep history in `CHANGELOG.md` or git.
4. **One fact, one place.** Details live in the owning doc; everything else links.
5. Relative links only. `verify.js` fails on broken links and missing docs.
6. Behavior changes ship with docs + a test in the same change. See the checklist in
   [`AGENTS.md`](../AGENTS.md).
