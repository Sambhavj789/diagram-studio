#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./core.js');
const outline = require('./outline.js');
const raster = require('./raster.js');

function usage() {
  console.log([
    'Diagram Studio CLI',
    '',
    'Usage:',
    '  node cli.js <input.txt> [-o out.svg] [--theme light|dark] [--direction TB|LR] [--json]',
    '  node cli.js <input.md> --outline [-o out.svg]',
    '  node cli.js <book.yaml> --book [-o out.svg]',
    '  node cli.js <input.txt> -o out.png [--png] [--scale 1|2|3] [--transparent]',
    '  type input.txt | node cli.js - -o out.svg',
    '',
    'Options:',
    '  --outline / --md  treat input as a Markdown outline (headings + lists -> tree)',
    '  --book            treat input as a book yaml (parts + notes -> tree)',
    '  -o, --out         output file; a .png name (or --png) rasterizes',
    '  --png             force PNG output (needs Edge, Chrome or Chromium)',
    '  --scale N         PNG scale 1-3 (default 2)',
    '  --transparent     no background (PNG or SVG)',
    '  --browser PATH    browser executable for PNG',
    '  --json            print one line of JSON (ok, out, nodes, edges, width, height, dir, format)',
    '',
    'Examples:',
    '  node cli.js examples/report-pipeline.txt -o report.svg',
    '  node cli.js notes.md --outline --theme dark -o notes.svg',
    '  node cli.js ../../hq/10-atlas/dsa/books/dsa-basics.yaml --book -o book-map.svg',
    '  node cli.js examples/report-pipeline.txt -o report.png --scale 3'
  ].join('\n'));
}

function parseArgs(argv) {
  const opts = {
    input: null,
    out: null,
    theme: 'light',
    direction: null,
    json: false,
    outline: false,
    book: false,
    png: false,
    scale: 2,
    transparent: false,
    browser: null
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { opts.help = true; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--outline' || a === '--md') { opts.outline = true; continue; }
    if (a === '--book') { opts.book = true; continue; }
    if (a === '--png') { opts.png = true; continue; }
    if (a === '--transparent') { opts.transparent = true; continue; }
    if (a === '-o' || a === '--out') { opts.out = argv[++i]; continue; }
    if (a === '--theme') { opts.theme = argv[++i] || 'light'; continue; }
    if (a === '--direction') { opts.direction = (argv[++i] || '').toUpperCase(); continue; }
    if (a === '--scale') { opts.scale = Number(argv[++i]); continue; }
    if (a === '--browser') { opts.browser = argv[++i] || null; continue; }
    if (a.startsWith('--theme=')) { opts.theme = a.slice(8); continue; }
    if (a.startsWith('--out=')) { opts.out = a.slice(6); continue; }
    if (a.startsWith('--scale=')) { opts.scale = Number(a.slice(8)); continue; }
    if (a.startsWith('--browser=')) { opts.browser = a.slice(10) || null; continue; }
    if (!opts.input) { opts.input = a; continue; }
    throw new Error('Unexpected argument: ' + a);
  }
  return opts;
}

function failOut(opts, message, code) {
  if (opts && opts.json) console.log(JSON.stringify({ ok: false, errors: [{ line: 0, message: message }] }));
  else console.error(message);
  process.exit(code);
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    usage();
    process.exit(2);
  }

  if (opts.help || !opts.input) {
    usage();
    process.exit(opts.help ? 0 : 2);
  }

  if (opts.outline && opts.book) {
    failOut(opts, 'Use either --outline/--md or --book, not both.', 2);
  }
  if (opts.theme !== 'light' && opts.theme !== 'dark') {
    failOut(opts, 'Theme must be "light" or "dark".', 2);
  }
  if (!(opts.scale === 1 || opts.scale === 2 || opts.scale === 3)) {
    failOut(opts, 'Scale must be 1, 2 or 3.', 2);
  }
  if (opts.direction && opts.direction !== 'TB' && opts.direction !== 'LR') {
    failOut(opts, 'Direction must be "TB" or "LR".', 2);
  }

  let text;
  try {
    text = opts.input === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(opts.input, 'utf8');
  } catch (err) {
    failOut(opts, 'Cannot read input: ' + err.message, 2);
  }

  text = text.replace(/^\uFEFF/, '');

  if (opts.outline || opts.book) {
    try {
      const mode = opts.book ? outline.bookYamlToDsl : outline.markdownToDsl;
      text = mode(text, { direction: opts.direction || 'LR' });
    } catch (err) {
      failOut(opts, 'Outline: ' + err.message, 1);
    }
  }

  const res = core.parse(text);
  if (!res.ok) {
    if (opts.json) {
      const errors = (res.errors || []).map((e) => ({ line: e.line, message: e.message }));
      console.log(JSON.stringify({ ok: false, errors: errors }));
    } else {
      res.errors.forEach((e) => console.error('Line ' + e.line + ': ' + e.message));
    }
    process.exit(1);
  }

  if (opts.direction === 'TB' || opts.direction === 'LR') {
    res.model.direction = opts.direction;
  }

  const lay = core.layout(res.model);
  const svg = core.renderSVG(res.model, lay, { theme: opts.theme, background: opts.transparent ? false : true });

  const wantsPng = opts.png || (opts.out ? /\.png$/i.test(opts.out) : false);
  let out = opts.out;
  if (!out) {
    const base = opts.input === '-'
      ? 'diagram'
      : path.join(path.dirname(opts.input), path.basename(opts.input).replace(/\.[^.]+$/, ''));
    out = base + (wantsPng ? '.png' : '.svg');
  } else if (wantsPng && !/\.png$/i.test(out)) {
    out = out.replace(/\.[^./\\]+$/, '') + '.png';
  }

  const n = Object.keys(res.model.nodes).length;

  if (wantsPng) {
    let png;
    try {
      png = raster.renderPng(svg, out, {
        scale: opts.scale,
        transparent: opts.transparent,
        browser: opts.browser
      });
    } catch (err) {
      failOut(opts, 'PNG export failed: ' + err.message, 2);
    }
    if (opts.json) {
      console.log(JSON.stringify({
        ok: true,
        out: out,
        format: 'png',
        nodes: n,
        edges: res.model.edges.length,
        width: png.width,
        height: png.height,
        dir: lay.dir,
        scale: png.scale,
        transparent: png.transparent
      }));
      return;
    }
    console.log('wrote ' + out + ' (' + n + ' nodes, ' + res.model.edges.length + ' edges, ' +
      png.width + 'x' + png.height + ', ' + lay.dir + ', ' + png.scale + 'x PNG' +
      (png.transparent ? ', transparent' : '') + ')');
    return;
  }

  try {
    fs.writeFileSync(out, svg, 'utf8');
  } catch (err) {
    failOut(opts, 'Cannot write output: ' + err.message, 2);
  }

  if (opts.json) {
    console.log(JSON.stringify({
      ok: true,
      out: out,
      format: 'svg',
      nodes: n,
      edges: res.model.edges.length,
      width: lay.width,
      height: lay.height,
      dir: lay.dir
    }));
    return;
  }

  console.log('wrote ' + out + ' (' + n + ' nodes, ' + res.model.edges.length + ' edges, ' + lay.width + 'x' + lay.height + ', ' + lay.dir + ')');
}

main();
