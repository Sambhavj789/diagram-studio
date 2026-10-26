(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiagramCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var THEMES = {
    light: {
      bg: '#ffffff',
      ink: '#0f172a',
      muted: '#64748b',
      node: '#f8fafc',
      nodeStroke: '#475569',
      edge: '#475569',
      labelBg: '#ffffff',
      start: '#ecfdf5',
      startStroke: '#047857',
      end: '#fef2f2',
      endStroke: '#b91c1c',
      decision: '#fffbeb',
      decisionStroke: '#b45309',
      groupFill: '#f1f5f9',
      groupStroke: '#94a3b8',
      accent: '#2563eb'
    },
    dark: {
      bg: '#0b1220',
      ink: '#e2e8f0',
      muted: '#94a3b8',
      node: '#16233a',
      nodeStroke: '#64748b',
      edge: '#94a3b8',
      labelBg: '#0b1220',
      start: '#052e24',
      startStroke: '#34d399',
      end: '#3b0a0a',
      endStroke: '#f87171',
      decision: '#3a2a06',
      decisionStroke: '#fbbf24',
      groupFill: '#111c30',
      groupStroke: '#475569',
      accent: '#60a5fa'
    }
  };

  var FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
  }

  // Stable 8-hex digest. Used to give every rendered SVG its own marker id, so two
  // diagrams with different themes can live on the same HTML page without leaking
  // arrow colours (D-010). No crypto, no dependency, same input -> same id.
  function digest(s) {
    var h = 2166136261;
    var str = String(s == null ? '' : s);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h = (h >>> 0).toString(16);
    return '00000000'.slice(h.length) + h;
  }

  var _ctx = null;
  function measure(text, font) {
    var s = String(text == null ? '' : text);
    if (typeof document !== 'undefined' && document.createElement) {
      try {
        if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
        _ctx.font = font || ('600 13px ' + FONT_STACK);
        return _ctx.measureText(s).width;
      } catch (e) { /* fall through */ }
    }
    return s.length * 7.1;
  }

  function labelText(s) {
    s = String(s == null ? '' : s).trim();
    if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') || (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) s = s.slice(1, -1);
    return s.replace(/\\n/g, '\n');
  }

  var ARROW_RE = /^(.*?)\s*(<->|-\.->|-->|->)\s*(.+)$/;

  function nodeToken(tok) {
    tok = String(tok || '').trim();
    var m;
    if ((m = tok.match(/^([^\[\]{}()]+?)\s*\[(.*)\]$/))) return { id: m[1].trim(), label: labelText(m[2]), shape: 'box' };
    if ((m = tok.match(/^([^\[\]{}()]+?)\s*\(\((.+)\)\)$/))) return { id: m[1].trim(), label: labelText(m[2]), shape: 'circle' };
    if ((m = tok.match(/^([^\[\]{}()]+?)\s*\((.+)\)$/))) return { id: m[1].trim(), label: labelText(m[2]), shape: 'stadium' };
    if ((m = tok.match(/^([^\[\]{}()]+?)\s*\{(.+)\}$/))) return { id: m[1].trim(), label: labelText(m[2]), shape: 'diamond' };
    return { id: tok, label: null, shape: null };
  }

  function parse(text) {
    var src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    var raw = src.split('\n');
    var nodes = Object.create(null);
    var order = [];
    var edges = [];
    var groups = [];
    var groupById = Object.create(null);
    var stack = [];
    var title = '';
    var direction = 'TB';
    var dirExplicit = false;
    var errors = [];

    function fail(line, message) { errors.push({ line: line, message: message }); }

    function touch(id, label, shape, line) {
      id = String(id || '').trim().replace(/^["']|["']$/g, '');
      if (!id) return null;
      if (!nodes[id]) {
        nodes[id] = {
          id: id,
          label: label ? label : id,
          shape: shape || 'box',
          group: stack.length ? stack[stack.length - 1].id : null,
          order: order.length
        };
        order.push(id);
      } else {
        if (label) nodes[id].label = label;
        if (shape) nodes[id].shape = shape;
        if (!nodes[id].group && stack.length) nodes[id].group = stack[stack.length - 1].id;
      }
      return nodes[id];
    }

    function finishModel() {
      edges.forEach(function (e) {
        if (!nodes[e.from]) touch(e.from, null, null, 0);
        if (!nodes[e.to]) touch(e.to, null, null, 0);
      });
      groups.forEach(function (g) {
        g.members = order.filter(function (id) { return nodes[id].group === g.id; });
      });
      groups = groups.filter(function (g) { return g.members.length > 0; });
      return {
        title: title,
        direction: direction === 'LR' || direction === 'RL' ? 'LR' : 'TB',
        nodes: nodes,
        order: order,
        edges: edges,
        groups: groups
      };
    }

    var hasArrow = false;
    var hasIndent = false;
    raw.forEach(function (line) {
      var s = line.trim();
      if (!s || /^#/.test(s) || /^\/\//.test(s)) return;
      if (/^(title|direction)\s*:/i.test(s)) return;
      if (/^(graph|flowchart)\s+/i.test(s)) return;
      if (/^group\s+/i.test(s) || s === '}') return;
      if (ARROW_RE.test(s)) hasArrow = true;
      if (/^[ \t]+/.test(line)) hasIndent = true;
    });

    if (!hasArrow && hasIndent) {
      var items = [];
      raw.forEach(function (line, i) {
        var s = line.replace(/\t/g, '  ');
        var m = s.match(/^([ ]*)(.*)$/);
        var t = m[2].trim();
        if (!t || /^#/.test(t) || /^\/\//.test(t)) return;
        items.push({ indent: m[1].length, text: t, line: i + 1 });
      });
      var tstack = [];
      items.forEach(function (it, idx) {
        var dm;
        if ((dm = it.text.match(/^title\s*:\s*(.+)$/i))) { title = labelText(dm[1]); return; }
        if ((dm = it.text.match(/^direction\s*:\s*(LR|TB)\s*$/i))) { direction = dm[1].toUpperCase(); dirExplicit = true; return; }
        var id = 'n' + idx;
        var label = labelText(it.text.replace(/^[-*]\s+/, ''));
        touch(id, label, idx === 0 ? 'stadium' : 'box', it.line);
        while (tstack.length && tstack[tstack.length - 1].indent >= it.indent) tstack.pop();
        if (tstack.length) edges.push({ from: tstack[tstack.length - 1].id, to: id, label: null, style: 'solid', order: edges.length });
        tstack.push({ indent: it.indent, id: id });
      });
      if (!dirExplicit) direction = 'LR';
      return { ok: errors.length === 0, errors: errors, error: errors[0] || null, model: finishModel() };
    }

    raw.forEach(function (rawLine, i) {
      var lineNo = i + 1;
      var line = rawLine.replace(/\s+$/, '');
      var t = line.trim();
      if (!t || /^#/.test(t) || /^\/\//.test(t)) return;

      var dm;
      if ((dm = t.match(/^title\s*:\s*(.+)$/i))) { title = labelText(dm[1]); return; }
      if ((dm = t.match(/^direction\s*:\s*(LR|TB|RL|BT)\s*$/i))) { direction = dm[1].toUpperCase(); dirExplicit = true; return; }
      if ((dm = t.match(/^(graph|flowchart)\s+(LR|TB|RL|BT)\s*$/i))) { direction = dm[2].toUpperCase(); dirExplicit = true; return; }
      if (t === '}') {
        if (!stack.length) { fail(lineNo, 'extra "}"'); return; }
        stack.pop();
        return;
      }
      if ((dm = t.match(/^group\s+(.+?)\s*\{$/i))) {
        // The inner group is still pushed so its closing "}" matches and the line
        // produces exactly one error instead of a cascade of stray-brace errors.
        if (stack.length) fail(lineNo, 'nested groups are not supported (one level)');
        var gname = labelText(dm[1]);
        var gid = slug(gname);
        if (!groupById[gid]) {
          groupById[gid] = { id: gid, label: gname, members: [] };
          groups.push(groupById[gid]);
        }
        stack.push(groupById[gid]);
        return;
      }

      var em = t.match(ARROW_RE);
      if (em) {
        var left = em[1].trim();
        var arrow = em[2];
        var right = em[3].trim();
        if (!left || !right) { fail(lineNo, 'arrow needs a node on both sides'); return; }
        // A chain "A -> B -> C" is one edge per hop; a ": label" only ends the chain.
        while (true) {
          var lbl = null, lm, next;
          if ((lm = right.match(/^\|([^|]*)\|\s*(.+)$/))) {
            lbl = lm[1].trim() || null;
            right = lm[2].trim();
          }
          var target = right;
          next = right.match(ARROW_RE);
          if (next && next[1].trim() && !(next[1].indexOf(':') >= 0 && !nodeToken(next[1]).label)) {
            target = next[1].trim();
          } else {
            next = null;
            if (!lbl && (lm = right.match(/^(.+?)\s*:\s*(.+)$/))) {
              target = lm[1].trim();
              lbl = lm[2].trim();
            }
          }
          var a = nodeToken(left);
          var b = nodeToken(target);
          if (!a.id || !b.id) { fail(lineNo, 'empty node id'); return; }
          touch(a.id, a.label, a.shape, lineNo);
          touch(b.id, b.label, b.shape, lineNo);
          edges.push({
            from: a.id,
            to: b.id,
            label: lbl ? labelText(lbl) : null,
            style: arrow === '<->' ? 'both' : (arrow === '-.->' ? 'dashed' : 'solid'),
            order: edges.length
          });
          if (!next) return;
          left = target;
          arrow = next[2];
          right = next[3].trim();
        }
      }

      if (/(<->|-\.->|-->|->)\s*$/.test(t)) { fail(lineNo, 'arrow needs a target'); return; }

      var nt = nodeToken(t);
      if (nt && nt.id) { touch(nt.id, nt.label, nt.shape, lineNo); return; }
      fail(lineNo, 'could not understand: ' + t);
    });

    if (stack.length) fail(raw.length, 'group "' + stack[stack.length - 1].label + '" is missing its closing "}"');

    return { ok: errors.length === 0, errors: errors, error: errors[0] || null, model: finishModel() };
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function median(list) {
    if (!list.length) return null;
    var s = list.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function layout(model, opts) {
    opts = opts || {};
    var dir = model.direction === 'LR' ? 'LR' : 'TB';
    var nodes = model.nodes;
    var ids = model.order.filter(function (id) { return !!nodes[id]; });
    var edges = model.edges.filter(function (e) { return nodes[e.from] && nodes[e.to]; });
    var pos = Object.create(null);
    var empty = {
      dir: dir,
      title: model.title || '',
      order: [],
      nodes: pos,
      edges: [],
      groups: [],
      width: 360,
      height: 200
    };
    if (!ids.length) return empty;

    var out = Object.create(null);
    var inc = Object.create(null);
    ids.forEach(function (id) { out[id] = []; inc[id] = []; });
    edges.forEach(function (e, i) {
      out[e.from].push({ v: e.to, i: i });
      inc[e.to].push({ v: e.from, i: i });
    });

    var color = Object.create(null);
    var back = Object.create(null);
    function dfs(u) {
      color[u] = 1;
      out[u].forEach(function (oe) {
        if (color[oe.v] === undefined) dfs(oe.v);
        else if (color[oe.v] === 1) back[oe.i] = true;
      });
      color[u] = 2;
    }
    ids.forEach(function (id) { if (color[id] === undefined) dfs(id); });

    var rank = Object.create(null);
    ids.forEach(function (id) { rank[id] = 0; });
    for (var pass = 0; pass < ids.length; pass++) {
      var changed = false;
      edges.forEach(function (e, i) {
        if (back[i]) return;
        if (rank[e.to] < rank[e.from] + 1) {
          rank[e.to] = rank[e.from] + 1;
          changed = true;
        }
      });
      if (!changed) break;
    }

    var maxRank = 0;
    ids.forEach(function (id) { if (rank[id] > maxRank) maxRank = rank[id]; });
    var buckets = [];
    for (var r = 0; r <= maxRank; r++) buckets.push([]);
    ids.forEach(function (id) { buckets[rank[id]].push(id); });

    function positionsIn(bucket) {
      var m = Object.create(null);
      bucket.forEach(function (id, idx) { m[id] = idx; });
      return m;
    }

    for (var sweep = 0; sweep < 6; sweep++) {
      if (sweep % 2 === 0) {
        for (var rr = 1; rr <= maxRank; rr++) {
          var prev = positionsIn(buckets[rr - 1]);
          var cur = positionsIn(buckets[rr]);
          buckets[rr].sort(function (a, b) {
            var ma = median(inc[a].map(function (o) { return prev[o.v]; }).filter(isNum));
            var mb = median(inc[b].map(function (o) { return prev[o.v]; }).filter(isNum));
            if (ma === null && mb === null) return cur[a] - cur[b];
            if (ma === null) return 1;
            if (mb === null) return -1;
            return (ma - mb) || (cur[a] - cur[b]);
          });
        }
      } else {
        for (var rr2 = maxRank - 1; rr2 >= 0; rr2--) {
          var next = positionsIn(buckets[rr2 + 1]);
          var cur2 = positionsIn(buckets[rr2]);
          buckets[rr2].sort(function (a, b) {
            var ma = median(out[a].map(function (o) { return next[o.v]; }).filter(isNum));
            var mb = median(out[b].map(function (o) { return next[o.v]; }).filter(isNum));
            if (ma === null && mb === null) return cur2[a] - cur2[b];
            if (ma === null) return 1;
            if (mb === null) return -1;
            return (ma - mb) || (cur2[a] - cur2[b]);
          });
        }
      }
    }

    var sizes = Object.create(null);
    ids.forEach(function (id) {
      var n = nodes[id];
      var lines = String(n.label == null ? id : n.label).split('\n');
      var w = 0;
      lines.forEach(function (ln) {
        w = Math.max(w, measure(ln, '600 13px ' + FONT_STACK));
      });
      w = Math.max(56, Math.ceil(w) + 30);
      var h = 34 + (lines.length - 1) * 17;
      if (n.shape === 'diamond') {
        w = Math.max(84, Math.round(w * 1.4));
        h = Math.max(54, h + 20);
      } else if (n.shape === 'circle') {
        var d = Math.max(52, w, h + 18);
        w = d;
        h = d;
      } else if (n.shape === 'stadium') {
        h = Math.max(38, h + 4);
      }
      sizes[id] = { w: w, h: h, lines: lines };
    });

    // `compact` tightens the gaps for print (a report page, a book); the drawing keeps
    // the same order and geometry, it just wastes less vertical space.
    var rankGap = opts.compact ? 44 : 78;
    var nodeGap = opts.compact ? 18 : 30;

    if (dir === 'TB') {
      var y = 0;
      buckets.forEach(function (b) {
        var maxH = 0;
        b.forEach(function (id) { maxH = Math.max(maxH, sizes[id].h); });
        var total = b.reduce(function (s, id) { return s + sizes[id].w; }, 0) + nodeGap * Math.max(0, b.length - 1);
        var x = -total / 2;
        b.forEach(function (id) {
          var sz = sizes[id];
          pos[id] = {
            x: x,
            y: y + (maxH - sz.h) / 2,
            w: sz.w,
            h: sz.h,
            lines: sz.lines,
            rank: rank[id],
            cx: x + sz.w / 2,
            cy: y + maxH / 2
          };
          x += sz.w + nodeGap;
        });
        y += maxH + rankGap;
      });
    } else {
      var x2 = 0;
      buckets.forEach(function (b) {
        var maxW = 0;
        b.forEach(function (id) { maxW = Math.max(maxW, sizes[id].w); });
        var totalH = b.reduce(function (s, id) { return s + sizes[id].h; }, 0) + nodeGap * Math.max(0, b.length - 1);
        var y2 = -totalH / 2;
        b.forEach(function (id) {
          var sz = sizes[id];
          pos[id] = {
            x: x2 + (maxW - sz.w) / 2,
            y: y2,
            w: sz.w,
            h: sz.h,
            lines: sz.lines,
            rank: rank[id],
            cx: x2 + maxW / 2,
            cy: y2 + sz.h / 2
          };
          y2 += sz.h + nodeGap;
        });
        x2 += maxW + rankGap;
      });
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(function (id) {
      var p = pos[id];
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    });

    var PAD = 30;
    var titleH = model.title ? 40 : 0;
    var dx = PAD - minX;
    var dy = PAD + titleH - minY;
    ids.forEach(function (id) {
      var p = pos[id];
      p.x += dx;
      p.y += dy;
      p.cx += dx;
      p.cy += dy;
    });
    maxX += dx;
    maxY += dy;

    var groupBoxes = [];
    model.groups.forEach(function (g) {
      var members = g.members.filter(function (id) { return pos[id]; });
      if (!members.length) return;
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      members.forEach(function (id) {
        var p = pos[id];
        x1 = Math.min(x1, p.x);
        y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x + p.w);
        y2 = Math.max(y2, p.y + p.h);
      });
      groupBoxes.push({
        id: g.id,
        label: g.label,
        x: x1 - 16,
        y: y1 - 26,
        w: (x2 - x1) + 32,
        h: (y2 - y1) + 42
      });
    });

    var contentRight = Math.max(maxX, maxX);
    var contentBottom = Math.max(maxY, maxY);
    groupBoxes.forEach(function (g) {
      contentRight = Math.max(contentRight, g.x + g.w);
      contentBottom = Math.max(contentBottom, g.y + g.h);
    });

    var backCount = 0;
    var outEdges = [];

    function cubicMid(p0, c1, c2, p1) {
      var t = 0.5, mt = 0.5;
      return {
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y
      };
    }

    edges.forEach(function (e) {
      var s = pos[e.from];
      var t = pos[e.to];
      var mid, p0, c1, c2, p1;

      if (e.from === e.to) {
        if (dir === 'TB') {
          p0 = { x: s.cx - 9, y: s.y };
          c1 = { x: s.cx - 44, y: s.y - 52 };
          c2 = { x: s.cx + 44, y: s.y - 52 };
          p1 = { x: s.cx + 9, y: s.y };
          mid = { x: s.cx, y: s.y - 58 };
        } else {
          p0 = { x: s.x + s.w, y: s.cy - 9 };
          c1 = { x: s.x + s.w + 52, y: s.cy - 38 };
          c2 = { x: s.x + s.w + 52, y: s.cy + 38 };
          p1 = { x: s.x + s.w, y: s.cy + 9 };
          mid = { x: s.x + s.w + 56, y: s.cy };
        }
      } else if (dir === 'TB') {
        var skipTb = rank[e.to] - rank[e.from] > 1;
        var isBackTb = rank[e.to] <= rank[e.from] || skipTb;
        if (!isBackTb) {
          p0 = { x: s.cx, y: s.y + s.h };
          p1 = { x: t.cx, y: t.y };
          var gapTb = Math.max(30, (p1.y - p0.y) * 0.45);
          c1 = { x: p0.x, y: p0.y + gapTb };
          c2 = { x: p1.x, y: p1.y - gapTb };
        } else {
          backCount++;
          var rb = contentRight + 54 + (backCount % 5) * 18;
          p0 = { x: s.x + s.w, y: s.cy };
          p1 = { x: t.x + t.w, y: t.cy };
          c1 = { x: rb, y: p0.y };
          c2 = { x: rb, y: p1.y };
        }
        mid = cubicMid(p0, c1, c2, p1);
      } else {
        var skipLr = rank[e.to] - rank[e.from] > 1;
        var isBackLr = rank[e.to] <= rank[e.from] || skipLr;
        if (!isBackLr) {
          p0 = { x: s.x + s.w, y: s.cy };
          p1 = { x: t.x, y: t.cy };
          var gapLr = Math.max(30, (p1.x - p0.x) * 0.45);
          c1 = { x: p0.x + gapLr, y: p0.y };
          c2 = { x: p1.x - gapLr, y: p1.y };
        } else {
          backCount++;
          var bb = contentBottom + 54 + (backCount % 5) * 18;
          p0 = { x: s.cx, y: s.y + s.h };
          p1 = { x: t.cx, y: t.y + t.h };
          c1 = { x: p0.x, y: bb };
          c2 = { x: p1.x, y: bb };
        }
        mid = cubicMid(p0, c1, c2, p1);
      }

      outEdges.push({
        from: e.from,
        to: e.to,
        label: e.label,
        style: e.style,
        points: { p0: p0, c1: c1, c2: c2, p1: p1 },
        labelPos: mid
      });
    });

    // Bounds include every label box and every curve point, not only the node boxes.
    // Without this a long label on the right-most edge was clipped by the canvas.
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    function grow(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    ids.forEach(function (id) {
      var p = pos[id];
      grow(p.x, p.y);
      grow(p.x + p.w, p.y + p.h);
    });
    groupBoxes.forEach(function (g) {
      grow(g.x, g.y);
      grow(g.x + g.w, g.y + g.h);
    });
    outEdges.forEach(function (e) {
      e.labelBox = null;
      if (e.label) {
        var txt = String(e.label).replace(/\s*\n\s*/g, ' ');
        var lw = Math.ceil(measure(txt, '500 11px ' + FONT_STACK)) + 14;
        e.labelBox = { x: e.labelPos.x - lw / 2, y: e.labelPos.y - 9, w: lw, h: 18 };
      }
      [e.points.p0, e.points.c1, e.points.c2, e.points.p1].forEach(function (p) { grow(p.x, p.y); });
      if (e.labelBox) {
        grow(e.labelBox.x, e.labelBox.y);
        grow(e.labelBox.x + e.labelBox.w, e.labelBox.y + e.labelBox.h);
      }
    });

    // A self loop or a label can reach past the left/top padding; shift the whole
    // drawing instead of clipping it. Everything (nodes, groups, curves, labels)
    // moves by the same delta so the layout stays coherent.
    var shiftX = minX < PAD ? PAD - minX : 0;
    var shiftY = minY < PAD ? PAD - minY : 0;
    if (shiftX || shiftY) {
      function move(p) { p.x += shiftX; p.y += shiftY; }
      ids.forEach(function (id) {
        var p = pos[id];
        move(p);
        p.cx += shiftX;
        p.cy += shiftY;
      });
      groupBoxes.forEach(move);
      outEdges.forEach(function (e) {
        [e.points.p0, e.points.c1, e.points.c2, e.points.p1].forEach(move);
        move(e.labelPos);
        if (e.labelBox) move(e.labelBox);
      });
      maxX += shiftX;
      maxY += shiftY;
    }

    outEdges.forEach(function (e) {
      var p = e.points;
      e.path = 'M ' + p.p0.x + ' ' + p.p0.y + ' C ' + p.c1.x + ' ' + p.c1.y + ', ' + p.c2.x + ' ' + p.c2.y + ', ' + p.p1.x + ' ' + p.p1.y;
    });

    var width = Math.max(maxX, 0) + PAD;
    var height = Math.max(maxY, 0) + PAD;
    var titleWidth = model.title ? measure(model.title, '700 16px ' + FONT_STACK) + 60 : 0;
    width = Math.max(width, titleWidth, 200);
    height = Math.max(height, 140);

    return {
      dir: dir,
      title: model.title || '',
      order: ids,
      nodes: pos,
      edges: outEdges,
      groups: groupBoxes,
      width: Math.ceil(width),
      height: Math.ceil(height)
    };
  }

  function renderSVG(model, lay, opts) {
    opts = opts || {};
    var theme = THEMES[opts.theme] || THEMES.light;
    var w = Math.max(1, Math.ceil(lay.width));
    var h = Math.max(1, Math.ceil(lay.height));
    var themeName = THEMES[opts.theme] ? opts.theme : 'light';
    var arrowId = opts.arrowId ||
      ('ds-arrow-' + digest([themeName, model.title || '', w, h, (lay.order || []).join(',')].join('|')));
    var parts = [];

    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(model.title || 'Diagram') + '">');
    parts.push('<defs>');
    parts.push('<marker id="' + arrowId + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="' + theme.edge + '"/></marker>');
    parts.push('</defs>');
    if (opts.background !== false) {
      parts.push('<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + theme.bg + '"/>');
    }

    if (model.title) {
      parts.push('<text x="' + (w / 2) + '" y="24" text-anchor="middle" font-family="' + esc(FONT_STACK) + '" font-size="16" font-weight="700" fill="' + theme.ink + '">' + esc(model.title) + '</text>');
    }

    lay.groups.forEach(function (g) {
      parts.push('<rect x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="' + g.h + '" rx="12" fill="' + theme.groupFill + '" fill-opacity="0.55" stroke="' + theme.groupStroke + '" stroke-width="1.2" stroke-dasharray="5 4"/>');
      parts.push('<text x="' + (g.x + 14) + '" y="' + (g.y + 19) + '" font-family="' + esc(FONT_STACK) + '" font-size="10.5" font-weight="700" letter-spacing="1.2" fill="' + theme.muted + '">' + esc(String(g.label).toUpperCase()) + '</text>');
    });

    lay.edges.forEach(function (e) {
      var dash = e.style === 'dashed' ? ' stroke-dasharray="6 5"' : '';
      var start = e.style === 'both' ? ' marker-start="url(#' + arrowId + ')"' : '';
      parts.push('<path d="' + e.path + '" fill="none" stroke="' + theme.edge + '" stroke-width="1.7" stroke-linecap="round"' + dash + ' marker-end="url(#' + arrowId + ')"' + start + '/>');
      if (e.label) {
        var txt = String(e.label).replace(/\s*\n\s*/g, ' ');
        var box = e.labelBox;
        if (!box) {
          var lw = Math.ceil(measure(txt, '500 11px ' + FONT_STACK)) + 14;
          box = { x: e.labelPos.x - lw / 2, y: e.labelPos.y - 9, w: lw, h: 18 };
        }
        parts.push('<rect x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h + '" rx="5" fill="' + theme.labelBg + '" stroke="' + theme.edge + '" stroke-opacity="0.22"/>');
        parts.push('<text x="' + e.labelPos.x + '" y="' + (e.labelPos.y + 4) + '" text-anchor="middle" font-family="' + esc(FONT_STACK) + '" font-size="11" font-weight="500" fill="' + theme.muted + '">' + esc(txt) + '</text>');
      }
    });

    lay.order.forEach(function (id) {
      var p = lay.nodes[id];
      var n = model.nodes[id];
      if (!p || !n) return;
      var shape = n.shape;
      var fill = theme.node, stroke = theme.nodeStroke;
      if (shape === 'diamond') { fill = theme.decision; stroke = theme.decisionStroke; }
      else if (shape === 'circle') { fill = theme.end; stroke = theme.endStroke; }
      else if (shape === 'stadium') { fill = theme.start; stroke = theme.startStroke; }

      parts.push('<g data-node="' + esc(id) + '">');
      if (shape === 'diamond') {
        var cx = p.x + p.w / 2;
        var cy = p.y + p.h / 2;
        parts.push('<polygon points="' + cx + ',' + p.y + ' ' + (p.x + p.w) + ',' + cy + ' ' + cx + ',' + (p.y + p.h) + ' ' + p.x + ',' + cy + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>');
      } else if (shape === 'circle') {
        parts.push('<circle cx="' + (p.x + p.w / 2) + '" cy="' + (p.y + p.h / 2) + '" r="' + (Math.min(p.w, p.h) / 2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>');
      } else {
        parts.push('<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + (shape === 'stadium' ? p.h / 2 : 9) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>');
      }

      var lines = p.lines || [n.label];
      var lh = 17;
      var startY = p.y + p.h / 2 - (lines.length - 1) * lh / 2;
      var fs = shape === 'diamond' ? 12.5 : 13;
      parts.push('<text x="' + (p.x + p.w / 2) + '" y="' + startY + '" text-anchor="middle" font-family="' + esc(FONT_STACK) + '" font-size="' + fs + '" font-weight="600" fill="' + theme.ink + '">');
      lines.forEach(function (ln, li) {
        parts.push('<tspan x="' + (p.x + p.w / 2) + '" y="' + (startY + li * lh) + '">' + esc(ln) + '</tspan>');
      });
      parts.push('</text>');
      parts.push('</g>');
    });

    parts.push('</svg>');
    return parts.join('\n');
  }

  return {
    THEMES: THEMES,
    parse: parse,
    layout: layout,
    renderSVG: renderSVG,
    measure: measure
  };
});
