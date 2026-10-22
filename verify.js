'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
let passed = 0;
let failed = 0;

function ok(cond, label, detail) {
  if (cond) {
    passed++;
    console.log('PASS  ' + label);
  } else {
    failed++;
    console.error('FAIL  ' + label + (detail ? '\n      ' + detail : ''));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const DOCS = [
  'docs/00-index.md',
  'docs/ARCHITECTURE.md',
  'docs/CODEMAP.md',
  'docs/SPEC.md',
  'docs/DEVELOPMENT.md',
  'docs/DECISIONS.md',
  'docs/TROUBLESHOOTING.md',
  'docs/CURRENT_STATE.md',
  'docs/CHANGELOG.md'
];

const SOURCES = [
  'core.js',
  'app.js',
  'cli.js',
  'index.html',
  'styles.css',
  'test-core.js',
  'verify.js',
  'README.md',
  'AGENTS.md'
];

console.log('diagram-studio verify\n');

const index = exists('docs/00-index.md') ? read('docs/00-index.md') : '';

DOCS.forEach((rel) => {
  const present = exists(rel);
  ok(present, 'doc exists: ' + rel);
  if (!present) return;

  const text = read(rel);
  ok(text.length > 300, 'doc is non-trivial: ' + rel, 'only ' + text.length + ' bytes');
  ok(/^---\r?\n/.test(text), 'front matter opens: ' + rel);
  ok(/\ntitle\s*:\s*\S+/.test(text), 'front matter title: ' + rel);
  ok(/\nstatus\s*:\s*(draft|active|superseded)\b/.test(text), 'front matter status: ' + rel);
  ok(/\nupdated\s*:\s*\d{4}-\d{2}-\d{2}\b/.test(text), 'front matter updated: ' + rel);

  if (rel !== 'docs/00-index.md') {
    ok(index.includes(path.basename(rel)), 'index links: ' + path.basename(rel));
  }
});

ok(exists('AGENTS.md') && read('AGENTS.md').length > 500, 'root AGENTS.md is present');
ok(exists('README.md') && read('README.md').length > 300, 'root README.md is present');
ok(exists('docs/assets/pipeline.svg'), 'architecture diagram exists');
ok(exists('docs/assets/modules.svg'), 'module diagram exists');

const linkSources = [['README.md', ROOT]].concat(DOCS.map((d) => [d, path.join(ROOT, 'docs')]));
let linkCount = 0;
let broken = [];

linkSources.forEach(([rel, base]) => {
  if (!exists(rel)) return;
  const text = read(rel);
  const re = /\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue;
    linkCount++;
    const target = path.resolve(base, clean);
    if (!fs.existsSync(target)) broken.push(rel + ' -> ' + href);
  }
});

ok(broken.length === 0, 'relative links resolve (' + linkCount + ' checked)', broken.join('\n      '));

const codemap = exists('docs/CODEMAP.md') ? read('docs/CODEMAP.md') : '';
const unmapped = SOURCES.filter((f) => !codemap.includes('`' + f + '`'));
ok(unmapped.length === 0, 'every source file is in CODEMAP', 'missing: ' + unmapped.join(', '));

const jsFiles = ['core.js', 'app.js', 'cli.js', 'test-core.js', 'verify.js'];
const allowed = new Set(['fs', 'path', 'child_process', 'assert', './core.js']);
const badRequires = [];

jsFiles.forEach((rel) => {
  const text = read(rel);
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    if (!allowed.has(m[1])) badRequires.push(rel + ' -> ' + m[1]);
  }
});

ok(badRequires.length === 0, 'no runtime dependencies', badRequires.join('\n      '));

const tests = spawnSync(process.execPath, ['test-core.js'], { cwd: ROOT, encoding: 'utf8' });
ok(tests.status === 0, 'core tests pass');
ok(/checks passed/.test(tests.stdout || ''), 'test summary present', (tests.stdout || '').trim());

const outDir = path.join(ROOT, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
const smokeOut = path.join(outDir, '.verify.svg');
const cli = spawnSync(process.execPath, ['cli.js', 'examples/report-pipeline.txt', '-o', smokeOut], {
  cwd: ROOT,
  encoding: 'utf8'
});

const svg = fs.existsSync(smokeOut) ? fs.readFileSync(smokeOut, 'utf8') : '';
ok(cli.status === 0, 'CLI smoke exits 0', (cli.stderr || '').trim());
ok(svg.includes('<svg') && svg.includes('data-node'), 'CLI produced an SVG with nodes');
ok(/<rect[^>]+fill="#(?:ffffff|0b1220)"/.test(svg), 'CLI SVG has an opaque background');
ok(!/NaN|Infinity/.test(svg), 'CLI SVG has finite geometry');

if (fs.existsSync(smokeOut)) fs.unlinkSync(smokeOut);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
