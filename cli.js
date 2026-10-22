#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./core.js');

function usage() {
  console.log([
    'Diagram Studio CLI',
    '',
    'Usage:',
    '  node cli.js <input.txt> [-o out.svg] [--theme light|dark] [--direction TB|LR]',
    '  type input.txt | node cli.js - -o out.svg',
    '',
    'Examples:',
    '  node cli.js examples/report-pipeline.txt -o report.svg',
    '  node cli.js notes.md --theme dark -o dark.svg'
  ].join('\n'));
}

function parseArgs(argv) {
  const opts = { input: null, out: null, theme: 'light', direction: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { opts.help = true; continue; }
    if (a === '-o' || a === '--out') { opts.out = argv[++i]; continue; }
    if (a === '--theme') { opts.theme = argv[++i] || 'light'; continue; }
    if (a === '--direction') { opts.direction = (argv[++i] || '').toUpperCase(); continue; }
    if (a.startsWith('--theme=')) { opts.theme = a.slice(8); continue; }
    if (a.startsWith('--out=')) { opts.out = a.slice(6); continue; }
    if (!opts.input) { opts.input = a; continue; }
    throw new Error('Unexpected argument: ' + a);
  }
  return opts;
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

  if (opts.theme !== 'light' && opts.theme !== 'dark') {
    console.error('Theme must be "light" or "dark".');
    process.exit(2);
  }

  let text;
  try {
    text = opts.input === '-'
      ? fs.readFileSync(0, 'utf8')
      : fs.readFileSync(opts.input, 'utf8');
  } catch (err) {
    console.error('Cannot read input: ' + err.message);
    process.exit(2);
  }

  text = text.replace(/^\uFEFF/, '');

  const res = core.parse(text);
  if (!res.ok) {
    res.errors.forEach((e) => console.error('Line ' + e.line + ': ' + e.message));
    process.exit(1);
  }

  if (opts.direction === 'TB' || opts.direction === 'LR') {
    res.model.direction = opts.direction;
  } else if (opts.direction) {
    console.error('Direction must be "TB" or "LR".');
    process.exit(2);
  }

  const lay = core.layout(res.model);
  const svg = core.renderSVG(res.model, lay, { theme: opts.theme });

  const out = opts.out || (opts.input === '-'
    ? 'diagram.svg'
    : path.join(path.dirname(opts.input), path.basename(opts.input).replace(/\.[^.]+$/, '') + '.svg'));

  fs.writeFileSync(out, svg, 'utf8');

  const n = Object.keys(res.model.nodes).length;
  console.log('wrote ' + out + ' (' + n + ' nodes, ' + res.model.edges.length + ' edges, ' + lay.width + 'x' + lay.height + ', ' + lay.dir + ')');
}

main();
