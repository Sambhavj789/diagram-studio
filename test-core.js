'use strict';

const assert = require('assert');
const core = require('./core.js');

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
  assert.ok(light.includes('marker-end="url(#ds-arrow)"'));
  assert.ok((light.match(/<g data-node=/g) || []).length === 2);
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

console.log('\n' + passed + ' checks passed');
