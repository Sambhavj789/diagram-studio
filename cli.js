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
    '  node cli.js <input.txt> -o out.svg --watch',
    '  type input.txt | node cli.js - -o out.svg',
    '',
    'Options:',
    '  --outline / --md  treat input as a Markdown outline (headings + lists -> tree)',
    '  --book            treat input as a book yaml (parts + notes -> tree)',
    '  -o, --out         output file; a .png name (or --png) rasterizes',
    '  --png             force PNG output (needs Edge, Chrome or Chromium)',
    '  --scale N         PNG scale 1-3 (default 2)',
    '  --transparent     no background (PNG or SVG)',
    '  --compact         tighter gaps, for a report page or a book',
    '  --browser PATH    browser executable for PNG',
    '  --watch           re-render every time the input file changes (Ctrl+C to stop)',
    '  --json            print one line of JSON (ok, out, nodes, edges, width, height, dir, format)',
    '',
    'Examples:',
    '  node cli.js examples/report-pipeline.txt -o report.svg',
    '  node cli.js notes.md --outline --theme dark -o notes.svg',
    '  node cli.js ../../hq/10-atlas/dsa/books/dsa-basics.yaml --book -o book-map.svg',
    '  node cli.js examples/report-pipeline.txt -o report.png --scale 3',
    '  node cli.js notes.md --outline -o notes.svg --watch'
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
    compact: false,
    browser: null,
    watch: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { opts.help = true; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--outline' || a === '--md') { opts.outline = true; continue; }
    if (a === '--book') { opts.book = true; continue; }
    if (a === '--png') { opts.png = true; continue; }
    if (a === '--transparent') { opts.transparent = true; continue; }
    if (a === '--compact') { opts.compact = true; continue; }
    if (a === '--watch') { opts.watch = true; continue; }
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

// One full pass: read -> (outline) -> parse -> layout -> write. Throws CliError; the
// caller decides whether that error ends the process (one-shot) or only the pass (--watch).
function CliError(message, code) {
  const err = new Error(message);
  err.name = 'CliError';
  err.code = code || 1;
  return err;
}

function build(opts) {
  let text;
  try {
    text = opts.input === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(opts.input, 'utf8');
  } catch (err) {
    throw CliError('Cannot read input: ' + err.message, 2);
  }

  text = text.replace(/^\uFEFF/, '');

  if (opts.outline || opts.book) {
    try {
      const mode = opts.book ? outline.bookYamlToDsl : outline.markdownToDsl;
      text = mode(text, { direction: opts.direction || 'LR' });
    } catch (err) {
      throw CliError('Outline: ' + err.message, 1);
    }
  }

  const res = core.parse(text);
  if (!res.ok) {
    const err = CliError('', 1);
    err.parseErrors = res.errors || [];
    throw err;
  }

  if (opts.direction === 'TB' || opts.direction === 'LR') {
    res.model.direction = opts.direction;
  }

  const lay = core.layout(res.model, { compact: opts.compact });
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

  const nodes = Object.keys(res.model.nodes).length;
  const edges = res.model.edges.length;

  if (wantsPng) {
    let png;
    try {
      png = raster.renderPng(svg, out, {
        scale: opts.scale,
        transparent: opts.transparent,
        browser: opts.browser
      });
    } catch (err) {
      throw CliError('PNG export failed: ' + err.message, 2);
    }
    return {
      format: 'png', out: out, nodes: nodes, edges: edges,
      width: png.width, height: png.height, dir: lay.dir,
      scale: png.scale, transparent: png.transparent
    };
  }

  try {
    fs.writeFileSync(out, svg, 'utf8');
  } catch (err) {
    throw CliError('Cannot write output: ' + err.message, 2);
  }

  return {
    format: 'svg', out: out, nodes: nodes, edges: edges,
    width: lay.width, height: lay.height, dir: lay.dir
  };
}

function summaryLine(s) {
  if (s.format === 'png') {
    return 'wrote ' + s.out + ' (' + s.nodes + ' nodes, ' + s.edges + ' edges, ' +
      s.width + 'x' + s.height + ', ' + s.dir + ', ' + s.scale + 'x PNG' +
      (s.transparent ? ', transparent' : '') + ')';
  }
  return 'wrote ' + s.out + ' (' + s.nodes + ' nodes, ' + s.edges + ' edges, ' +
    s.width + 'x' + s.height + ', ' + s.dir + ')';
}

function printSummary(opts, s) {
  if (opts.json) {
    const data = {
      ok: true, out: s.out, format: s.format, nodes: s.nodes, edges: s.edges,
      width: s.width, height: s.height, dir: s.dir
    };
    if (s.format === 'png') {
      data.scale = s.scale;
      data.transparent = s.transparent;
    }
    console.log(JSON.stringify(data));
    return;
  }
  console.log(summaryLine(s));
}

function reportError(opts, err) {
  const code = err.code || 1;
  if (opts.json) {
    const errors = err.parseErrors
      ? err.parseErrors.map((e) => ({ line: e.line, message: e.message }))
      : [{ line: 0, message: err.message }];
    console.log(JSON.stringify({ ok: false, errors: errors }));
  } else if (err.parseErrors) {
    err.parseErrors.forEach((e) => console.error('Line ' + e.line + ': ' + e.message));
  } else {
    console.error(err.message);
  }
  return code;
}

function watch(opts) {
  const stamp = () => new Date().toTimeString().slice(0, 8);
  let out = null;

  const tick = () => {
    try {
      const s = build(opts);
      out = s.out;
      printSummary(opts, s);
      if (!opts.json) console.log('[' + stamp() + '] ' + path.basename(s.out) + ' updated');
    } catch (err) {
      reportError(opts, err);
      if (!opts.json) {
        console.error('[' + stamp() + '] kept the last good output' + (out ? ' (' + path.basename(out) + ')' : ''));
      }
    }
  };

  // watchFile polls; editors that replace the file (atomic save) still trigger it.
  fs.watchFile(opts.input, { interval: 300 }, (cur, prev) => {
    if (cur.mtimeMs !== prev.mtimeMs) tick();
  });

  process.on('SIGINT', () => {
    fs.unwatchFile(opts.input);
    console.log('\nstopped watching');
    process.exit(0);
  });

  tick();
  if (!opts.json) console.log('watching ' + opts.input + ' (Ctrl+C to stop)');
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
  if (opts.watch && opts.input === '-') {
    failOut(opts, '--watch needs a file, not stdin.', 2);
  }

  if (opts.watch) {
    watch(opts);
    return;
  }

  try {
    printSummary(opts, build(opts));
  } catch (err) {
    process.exit(reportError(opts, err));
  }
}

main();
