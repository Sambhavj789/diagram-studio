---
title: Example outline
note: Input for `node cli.js examples/outline.md --outline -o out/outline.svg`
---

# Diagram Studio

## Outputs

- SVG
  - Self-contained
  - Includes background
- PNG
  - 1x / 2x / 3x
  - Transparent option
- Print
  - Books (Pandoc + Typst)
  - Reports (Word/PDF)

## Inputs

- Hand-written DSL
- Markdown outline (`--outline`)
- Book yaml (`--book`)

## Checks

- Parser tests
- Layout tests
- CLI smoke
