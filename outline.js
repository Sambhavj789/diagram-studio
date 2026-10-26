'use strict';

// Markdown / book-outline -> DSL (tree mode).
//
// Two inputs, one output: plain DSL text that core.parse() already understands.
// Used by the CLI (--outline / --md / --book) for books, notes and report outlines.
// Pure: no filesystem, no network, no dependency.

function inline(text) {
  return String(text == null ? '' : text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                 // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')              // [text](url)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')        // [[note|alias]]
    .replace(/\[\[([^\]]+)\]\]/g, '$1')                    // [[note]]
    .replace(/`([^`]+)`/g, '$1')                           // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_]/g, '$1$2')
    .replace(/<[^>]+>/g, '')                               // html tags
    .replace(/\s+/g, ' ')
    .trim();
}

// Labels live on one tree line: no arrows (they would switch the parser out of tree
// mode) and no leading comment markers.
function label(text) {
  var s = inline(text)
    .replace(/<->|-\.->|-->|->/g, '\u2192')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^#+\s*$/, '');
  if (/^(#|\/\/)/.test(s)) s = s.replace(/^[#/]+/, '');
  return s.trim();
}

function listItem(line) {
  var m = line.match(/^([ ]*)([-*+]|\d+[.)])\s+(.*)$/);
  if (!m) return null;
  var text = m[3]
    .replace(/^\[[ xX]\]\s+/, '')                         // task list
    .replace(/^\[[ xX]\]$/, '');
  return { indent: m[1].replace(/\t/g, '  ').length, text: text };
}

function markdownToDsl(text, opts) {
  opts = opts || {};
  var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  var items = [];
  var fence = null;
  var inFront = false;
  var headingDepth = -1;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var t = line.trim();

    if (i === 0 && t === '---') { inFront = true; continue; }
    if (inFront) {
      if (t === '---' || t === '...') inFront = false;
      continue;
    }

    var fm = t.match(/^(```+|~~~+)(.*)$/);
    if (fm) {
      if (!fence) { fence = fm[1].charAt(0); continue; }
      if (fm[1].charAt(0) === fence) { fence = null; continue; }
    }
    if (fence) continue;

    if (!t) continue;
    if (/^([-*_])\1{2,}$/.test(t)) continue;              // horizontal rule
    if (/^\|/.test(t)) continue;                           // tables
    if (/^>/.test(t)) continue;                            // quotes

    var hm = t.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      var htext = label(hm[2]);
      if (!htext) continue;
      headingDepth = hm[1].length - 1;
      items.push({ depth: headingDepth, text: htext, line: i + 1 });
      continue;
    }

    var li = listItem(line);
    if (li) {
      var ltext = label(li.text);
      if (!ltext) continue;
      var base = headingDepth < 0 ? 0 : headingDepth + 1;
      items.push({ depth: base + Math.floor(li.indent / 2), text: ltext, line: i + 1 });
    }
  }

  return itemsToDsl(items, opts);
}

function bookYamlToDsl(text, opts) {
  opts = opts || {};
  var meta = {};
  var parts = [];
  var cur = null;

  String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
    var line = raw.replace(/\s+$/, '');
    if (!line.trim() || /^\s*#/.test(line)) return;
    var m;
    if ((m = line.match(/^(\w+):\s*(.+)$/))) {
      meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
      return;
    }
    if ((m = line.match(/^\s*-\s*part:\s*(.+)$/))) {
      cur = { name: m[1].trim().replace(/^["']|["']$/g, ''), notes: [] };
      parts.push(cur);
      return;
    }
    if ((m = line.match(/^\s*-\s*(.+\.md)\s*$/))) {
      if (!cur) { cur = { name: '', notes: [] }; parts.push(cur); }
      cur.notes.push(m[1].trim().replace(/^["']|["']$/g, ''));
    }
  });

  var root = label(opts.title || meta.title || 'Book');
  var items = [{ depth: 0, text: root, line: 1 }];
  var chapters = 0;

  parts.forEach(function (part) {
    var depth = 1;
    if (part.name) {
      var pname = label(part.name);
      if (pname) items.push({ depth: 1, text: pname, line: 1 });
      depth = 2;
    }
    part.notes.forEach(function (note) {
      var base = note.split('/').pop().replace(/\.md$/i, '').replace(/[-_]+/g, ' ');
      var nname = label(base);
      if (!nname) return;
      items.push({ depth: depth, text: nname, line: 1 });
      chapters++;
    });
  });

  if (!chapters) throw new Error('no notes found in the book yaml');
  return itemsToDsl(items, opts);
}

function itemsToDsl(items, opts) {
  opts = opts || {};
  if (!items || items.length === 0) throw new Error('no headings or list items found');

  var depths = items.map(function (it) { return it.depth; });
  var min = Math.min.apply(null, depths);
  var roots = items.filter(function (it) { return it.depth === min; }).length;

  if (min > 0 || roots > 1) {
    items = items.map(function (it) {
      return { depth: it.depth - min + 1, text: it.text, line: it.line };
    });
    items.unshift({ depth: 0, text: label(opts.root || opts.title || 'Outline'), line: 1 });
  } else if (min < 0) {
    items = items.map(function (it) {
      return { depth: it.depth - min, text: it.text, line: it.line };
    });
  }

  var out = [];

  // A tree line is indentation; keep each level to two spaces so the parser's
  // nearest-smaller-indent rule produces the same hierarchy the outline shows.
  // No `direction:` line here: a directive would consume a node index and the CLI
  // applies --direction after parsing anyway.
  var prev = 0;
  items.forEach(function (it) {
    var depth = Math.max(0, Math.min(it.depth, prev + 1));
    prev = depth;
    out.push(new Array(depth + 1).join('  ') + it.text);
  });

  return out.join('\n') + '\n';
}

function toDsl(text, opts) {
  var src = String(text == null ? '' : text);
  var looksLikeBook = /^\s*(chapters|parts|book)\s*:/im.test(src) ||
    /^\s*-\s*part\s*:/im.test(src);
  return looksLikeBook ? bookYamlToDsl(src, opts) : markdownToDsl(src, opts);
}

module.exports = {
  markdownToDsl: markdownToDsl,
  bookYamlToDsl: bookYamlToDsl,
  toDsl: toDsl,
  label: label
};
