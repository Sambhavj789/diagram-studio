'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const core = require('./core.js');
const outline = require('./outline.js');
const raster = require('./raster.js');

const ROOT = __dirname;

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS  ' + name);
  } catch (err) {
    console.error('FAIL  ' + name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

function render(text, theme) {
  const res = core.parse(text);
  assert.strictEqual(res.ok, true, 'parse failed: ' + JSON.stringify(res.errors));
  const lay = core.layout(res.model);
  const svg = core.renderSVG(res.model, lay, { theme: theme || 'light' });
  return { model: res.model, lay, svg };
}

// Gallery: every shipped example must parse, lay out and stay free of overlaps.
const GALLERY = [
  { dir: 'examples', ext: '.txt' },
  { dir: 'docs/assets', ext: '.dsl' }
];

function galleryFiles() {
  const files = [];
  GALLERY.forEach(({ dir, ext }) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs)
      .filter((name) => name.endsWith(ext))
      .sort()
      .forEach((name) => files.push(path.join(dir, name)));
  });
  return files;
}

// Layout boxes expose w/h, which are the node box width and height.
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('parses a flow with shapes, labels, dashed and bidirectional edges', () => {
  const { model } = render(`title: Smoke flow
direction: TB
Start [Start here]
Check {Is it ok?}
Do (Do the work)
Done ((Done))
Start -> Check
Check ->|yes| Do
Check -.-> Done : retry
Do <-> Done
`);
  assert.strictEqual(model.title, 'Smoke flow');
  assert.strictEqual(model.direction, 'TB');
  assert.strictEqual(Object.keys(model.nodes).length, 4);
  assert.strictEqual(model.nodes.Start.shape, 'box');
  assert.strictEqual(model.nodes.Check.shape, 'diamond');
  assert.strictEqual(model.nodes.Do.shape, 'stadium');
  assert.strictEqual(model.nodes.Done.shape, 'circle');
  assert.strictEqual(model.edges.length, 4);
  assert.strictEqual(model.edges[1].label, 'yes');
  assert.strictEqual(model.edges[2].label, 'retry');
  assert.strictEqual(model.edges[2].style, 'dashed');
  assert.strictEqual(model.edges[3].style, 'both');
});

test('supports quoted labels with commas and colons', () => {
  const { model } = render(`A["One, two: three"] -> B
B -> C : next: step
`);
  assert.strictEqual(model.nodes.A.label, 'One, two: three');
  assert.strictEqual(model.edges[1].label, 'next: step');
});

test('builds an indented tree as a left-to-right map', () => {
  const { model, lay } = render(`Learning map
  Books
    Deep Work
    Atomic Habits
  Practice
    Build a tool
`);
  assert.strictEqual(model.direction, 'LR');
  assert.strictEqual(model.edges.length, 5);
  assert.strictEqual(Object.keys(model.nodes).length, 6);
  assert.ok(lay.width > lay.height);
});

test('handles cycles and self loops without NaN geometry', () => {
  const { lay, svg } = render(`A -> B
B -> C
C -> A : back
C -> C
`);
  assert.strictEqual(lay.edges.length, 4);
  assert.ok(isFinite(lay.width) && lay.width > 0);
  assert.ok(isFinite(lay.height) && lay.height > 0);
  lay.edges.forEach((e) => {
    assert.ok(!/NaN|Infinity/.test(e.path), 'bad path: ' + e.path);
    assert.ok(isFinite(e.labelPos.x) && isFinite(e.labelPos.y));
  });
  assert.ok(!/NaN|Infinity/.test(svg));
});

test('keeps same-rank nodes from overlapping', () => {
  const { lay } = render(`A -> C
B -> C
D -> C
A -> E
B -> E
`);
  const byRank = {};
  Object.keys(lay.nodes).forEach((id) => {
    const p = lay.nodes[id];
    (byRank[p.rank] = byRank[p.rank] || []).push({ id, x1: p.x, x2: p.x + p.w });
  });
  Object.keys(byRank).forEach((r) => {
    const list = byRank[r].sort((a, b) => a.x1 - b.x1);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].x1 >= list[i - 1].x2, 'overlap on rank ' + r + ': ' + list[i - 1].id + '/' + list[i].id);
    }
  });
});

test('fits every node inside the canvas', () => {
  const { lay } = render(`title: Fit check
A -> B -> C
A -> D
D -> C
`);
  Object.keys(lay.nodes).forEach((id) => {
    const p = lay.nodes[id];
    assert.ok(p.x >= 0 && p.y >= 0, id + ' starts outside');
    assert.ok(p.x + p.w <= lay.width, id + ' overflows width');
    assert.ok(p.y + p.h <= lay.height, id + ' overflows height');
  });
});

test('compact layout keeps the order but takes less space', () => {
  const model = core.parse(`direction: TB
A -> B
B -> C
C -> D
D -> E
`).model;
  const normal = core.layout(model);
  const tight = core.layout(model, { compact: true });
  assert.ok(tight.height < normal.height, tight.height + ' !< ' + normal.height);
  assert.ok(tight.width <= normal.width);
  assert.deepStrictEqual(model.order, ['A', 'B', 'C', 'D', 'E']);
  assert.strictEqual(tight.nodes.A.y, tight.nodes.A.cy - tight.nodes.A.h / 2);
});

test('a long edge label grows the canvas instead of clipping', () => {
  const { lay } = render(`direction: LR
A -> B
B -> B : a very long self-loop label that used to be cut off
`);
  const loop = lay.edges.find((e) => e.from === 'B' && e.to === 'B' && e.label);
  assert.ok(loop && loop.labelBox, 'label box missing');
  assert.ok(loop.labelBox.x >= 0, 'label starts left of the canvas');
  assert.ok(loop.labelBox.y >= 0, 'label starts above the canvas');
  assert.ok(loop.labelBox.x + loop.labelBox.w <= lay.width, 'label overflows width');
  assert.ok(loop.labelBox.y + loop.labelBox.h <= lay.height, 'label overflows height');
});

test('a self loop on the top node stays inside the canvas', () => {
  const { lay } = render(`A -> A
A -> B
`);
  const p = lay.nodes.A;
  assert.ok(p.x >= 0 && p.y >= 0, 'node moved outside');
  lay.edges.forEach((e) => {
    const pts = e.points;
    [pts.p0, pts.c1, pts.c2, pts.p1].forEach((pt) => {
      assert.ok(pt.x >= 0 && pt.y >= 0, 'self loop point outside: ' + JSON.stringify(pt));
    });
  });
});

test('markdown outline becomes a tree with the heading hierarchy', () => {
  const dsl = outline.markdownToDsl(`---
title: front matter is ignored
---
# Ml Foundations

## Regression

- Linear model
  - Gradient descent
- Ridge

\`\`\`
- not a list item
\`\`\`
`);
  const res = core.parse(dsl);
  assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  assert.strictEqual(res.model.direction, 'LR');
  assert.deepStrictEqual(
    res.model.order.map((id) => res.model.nodes[id].label),
    ['Ml Foundations', 'Regression', 'Linear model', 'Gradient descent', 'Ridge']
  );
  assert.strictEqual(res.model.edges.length, 4);
});

test('a book yaml becomes a book map', () => {
  const dsl = outline.bookYamlToDsl(`title: "Ml Foundations"
chapters:
  - part: "Part 1 - Regression"
    notes:
      - 10-atlas/ml/notes/linear-model.md
      - 10-atlas/ml/notes/ridge.md
  - part: "Part 2 - Trees"
    notes:
      - 10-atlas/ml/notes/decision-tree.md
`);
  const res = core.parse(dsl);
  assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  assert.strictEqual(Object.keys(res.model.nodes).length, 6);
  assert.strictEqual(res.model.nodes.n0.label, 'Ml Foundations');
  assert.deepStrictEqual(
    res.model.order.slice(1).map((id) => res.model.nodes[id].label),
    ['Part 1 - Regression', 'Linear Model', 'Ridge', 'Part 2 - Trees', 'Decision Tree']
  );
  assert.strictEqual(outline.titleCase('ml-introduction'.replace(/-/g, ' ')), 'ML Introduction');
  assert.strictEqual(outline.titleCase('knn'), 'KNN');
  assert.strictEqual(outline.titleCase('gradient descent'), 'Gradient Descent');
});

test('renders group boxes and assigns members', () => {
  const { model, lay, svg } = render(`group Build {
A -> B
}
C -> B
`);
  assert.strictEqual(model.groups.length, 1);
  assert.deepStrictEqual(model.groups[0].members.sort(), ['A', 'B']);
  assert.strictEqual(lay.groups.length, 1);
  assert.ok(svg.includes('BUILD'));
});

test('supports LR chains and direction directive', () => {
  const { lay } = render(`direction: LR
A -> B -> C -> D
`);
  assert.strictEqual(lay.dir, 'LR');
  assert.ok(lay.width > lay.height);
});

test('accepts graph/flowchart directives', () => {
  const a = core.parse('graph LR\nA -> B');
  const b = core.parse('flowchart TB\nA -> B');
  assert.strictEqual(a.model.direction, 'LR');
  assert.strictEqual(b.model.direction, 'TB');
});

test('renders both themes and a valid SVG shell', () => {
  const text = 'title: Theme\nA -> B';
  const light = render(text, 'light').svg;
  const dark = render(text, 'dark').svg;
  assert.ok(light.startsWith('<svg xmlns='));
  assert.ok(light.includes('width="'));
  assert.ok(dark.includes('#0b1220'));
  assert.ok(/marker-end="url\(#ds-arrow-[0-9a-f]{8}\)"/.test(light), 'light marker id');
  assert.ok((light.match(/<g data-node=/g) || []).length === 2);
});

test('marker ids are stable per render and differ across themes', () => {
  const text = 'title: Marker\nA <-> B';
  const idOf = (svg) => (svg.match(/<marker id="(ds-arrow-[0-9a-f]{8})"/) || [])[1];
  const light1 = idOf(render(text, 'light').svg);
  const light2 = idOf(render(text, 'light').svg);
  const dark = idOf(render(text, 'dark').svg);
  assert.ok(light1 && dark);
  assert.strictEqual(light1, light2, 'same input must keep the same id');
  assert.notStrictEqual(light1, dark, 'different themes must not share an id');
});

test('reports a line number for a stray closing brace', () => {
  const res = core.parse('A -> B\n}');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.line, 2);
});

test('rejects an edge with no target', () => {
  const res = core.parse('A -> B\nA ->');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.line, 2);
  assert.ok(/arrow needs a target/.test(res.error.message));
});

test('layout is deterministic for the same model', () => {
  const text = 'title: Stable\nA -> B\nB -> C\nC -> A\nA -> C';
  const first = core.layout(core.parse(text).model);
  const second = core.layout(core.parse(text).model);
  assert.deepStrictEqual(
    first.order.map((id) => [id, first.nodes[id].x, first.nodes[id].y]),
    second.order.map((id) => [id, second.nodes[id].x, second.nodes[id].y])
  );
  assert.deepStrictEqual(first.edges.map((e) => e.path), second.edges.map((e) => e.path));
});

test('empty input returns a usable blank canvas', () => {
  const res = core.parse('');
  assert.strictEqual(res.ok, true);
  const lay = core.layout(res.model);
  assert.ok(lay.width > 0 && lay.height > 0);
});

test('a chain makes one edge per hop and keeps the final label', () => {
  const res = core.parse('A -> B -.-> C : done\nX ->|go| Y -> Z');
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(Object.keys(res.model.nodes).sort(), ['A', 'B', 'C', 'X', 'Y', 'Z']);
  assert.deepStrictEqual(
    res.model.edges.map((e) => [e.from, e.to, e.style, e.label]),
    [['A', 'B', 'solid', null], ['B', 'C', 'dashed', 'done'], ['X', 'Y', 'solid', 'go'], ['Y', 'Z', 'solid', null]]
  );
});

test('an empty box label falls back to the id', () => {
  const res = core.parse('A[] -> B');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.model.nodes.A.label, 'A');
});

test('a nested group is a line-numbered error', () => {
  const res = core.parse('group Outer {\ngroup Inner {\nA -> B\n}\n}\n');
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.errors.length, 1);
  assert.strictEqual(res.error.line, 2);
  assert.strictEqual(res.error.message, 'nested groups are not supported (one level)');
});

test('an unclosed group is an error', () => {
  const res = core.parse('group Money {\nSalary -> Bills');
  assert.strictEqual(res.ok, false);
  assert.ok(/missing its closing/.test(res.error.message));
});

test('gallery files render with no overlapping node boxes', () => {
  const files = galleryFiles();
  assert.ok(files.length > 0, 'found no gallery files in examples/ or docs/assets/');

  const rendered = [];
  const failures = [];

  files.forEach((rel) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const res = core.parse(text);
    if (!res.ok) {
      failures.push(rel + ': parse failed: ' + JSON.stringify(res.errors));
      return;
    }
    const lay = core.layout(res.model);
    rendered.push(rel);

    const ids = Object.keys(lay.nodes);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = lay.nodes[ids[i]];
        const b = lay.nodes[ids[j]];
        if (boxesOverlap(a, b)) {
          failures.push(
            rel +
              ': node boxes overlap: ' +
              ids[i] +
              ' (x=' + a.x + ', y=' + a.y + ', width=' + a.w + ', height=' + a.h + ') and ' +
              ids[j] +
              ' (x=' + b.x + ', y=' + b.y + ', width=' + b.w + ', height=' + b.h + ')'
          );
        }
      }
    }
  });

  assert.strictEqual(
    rendered.length,
    files.length,
    'every gallery file must be rendered; rendered ' + rendered.length + ' of ' + files.length + ': ' + rendered.join(', ')
  );
  assert.strictEqual(failures.length, 0, 'gallery failures:\n  ' + failures.join('\n  '));
});

const OUT_DIR = path.join(ROOT, 'out');
const JSON_SVG_REL = 'out/.json-test.svg';
const JSON_BAD_REL = 'out/.json-bad-input.txt';
const JSON_BAD_SVG_REL = 'out/.json-bad-input.svg';

function runCli(args) {
  return spawnSync(process.execPath, ['cli.js'].concat(args), { cwd: ROOT, encoding: 'utf8' });
}

function removeIfPresent(abs) {
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

function jsonLine(stdout) {
  const lines = (stdout || '').trim().split(/\r?\n/).filter((l) => l.length > 0);
  assert.strictEqual(lines.length, 1, 'expected exactly one line on stdout, got: ' + JSON.stringify(stdout));
  return JSON.parse(lines[0]);
}

test('cli --json prints one JSON line and still writes the SVG', () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try {
    const res = runCli(['examples/report-pipeline.txt', '-o', JSON_SVG_REL, '--json']);
    assert.strictEqual(res.status, 0, 'exit code ' + res.status + ': ' + (res.stderr || '').trim());
    const data = jsonLine(res.stdout);
    assert.strictEqual(data.ok, true);
    assert.ok(data.nodes >= 1, 'nodes should be at least 1, got ' + data.nodes);
    assert.ok(data.edges >= 1, 'edges should be at least 1, got ' + data.edges);
    assert.strictEqual(typeof data.width, 'number');
    assert.strictEqual(typeof data.height, 'number');
    assert.strictEqual(data.out, JSON_SVG_REL);
    assert.ok(fs.existsSync(path.join(ROOT, JSON_SVG_REL)), 'SVG was not written');
  } finally {
    removeIfPresent(path.join(ROOT, JSON_SVG_REL));
  }
});

test('cli --json reports a parse error on stdout and writes no SVG', () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ROOT, JSON_BAD_REL), 'A ->\n', 'utf8');
  try {
    const res = runCli([JSON_BAD_REL, '--json']);
    assert.strictEqual(res.status, 1, 'expected exit 1, got ' + res.status);
    const data = jsonLine(res.stdout);
    assert.strictEqual(data.ok, false);
    assert.ok(Array.isArray(data.errors) && data.errors.length >= 1, 'errors array missing');
    assert.strictEqual(data.errors[0].line, 1);
    assert.strictEqual(typeof data.errors[0].message, 'string');
    assert.ok(!fs.existsSync(path.join(ROOT, JSON_BAD_SVG_REL)), 'no SVG should be written on a parse error');
  } finally {
    removeIfPresent(path.join(ROOT, JSON_BAD_REL));
    removeIfPresent(path.join(ROOT, JSON_BAD_SVG_REL));
  }
});

test('cli --outline turns markdown into a tree SVG', () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const mdRel = 'out/.outline-test.md';
  const svgRel = 'out/.outline-test.svg';
  fs.writeFileSync(path.join(ROOT, mdRel), '# Book\n\n## Chapter\n\n- One\n  - Two\n', 'utf8');
  try {
    const res = runCli([mdRel, '--outline', '-o', svgRel, '--json']);
    assert.strictEqual(res.status, 0, 'exit ' + res.status + ': ' + (res.stderr || '').trim());
    const data = jsonLine(res.stdout);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.nodes, 4);
    const svg = fs.readFileSync(path.join(ROOT, svgRel), 'utf8');
    assert.ok(svg.includes('Book') && svg.includes('Chapter') && svg.includes('Two'));
  } finally {
    removeIfPresent(path.join(ROOT, mdRel));
    removeIfPresent(path.join(ROOT, svgRel));
  }
});

function pngHeader(file, expectedWidth, expectedColor) {
  const bytes = fs.readFileSync(file);
  assert.strictEqual(bytes[0], 0x89);
  assert.strictEqual(bytes.toString('ascii', 1, 4), 'PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.strictEqual(width, expectedWidth, 'PNG width');
  assert.ok(height > 0, 'PNG height');
  assert.strictEqual(bytes[25], expectedColor, 'PNG color type');
}

if (raster.findBrowser()) {
  test('cli --png writes a scaled PNG and --transparent clears the background', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const solidRel = 'out/.png-test.png';
    const clearRel = 'out/.png-test-clear.png';
    try {
      const solid = runCli(['examples/report-pipeline.txt', '-o', solidRel, '--scale', '2', '--json']);
      assert.strictEqual(solid.status, 0, 'exit ' + solid.status + ': ' + (solid.stderr || '').trim());
      const one = jsonLine(solid.stdout);
      assert.strictEqual(one.format, 'png');
      assert.strictEqual(one.scale, 2);
      assert.strictEqual(one.transparent, false);
      pngHeader(path.join(ROOT, solidRel), one.width, 2);

      const clear = runCli(['examples/report-pipeline.txt', '-o', clearRel, '--scale', '1', '--transparent', '--json']);
      assert.strictEqual(clear.status, 0, 'exit ' + clear.status + ': ' + (clear.stderr || '').trim());
      const two = jsonLine(clear.stdout);
      assert.strictEqual(two.transparent, true);
      pngHeader(path.join(ROOT, clearRel), two.width, 6);
    } finally {
      removeIfPresent(path.join(ROOT, solidRel));
      removeIfPresent(path.join(ROOT, clearRel));
    }
  });
} else {
  console.log('SKIP  cli --png (no Edge/Chrome/Chromium found)');
}

console.log('\n' + passed + ' checks passed');
