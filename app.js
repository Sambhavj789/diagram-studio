(function () {
  'use strict';

  var core = window.DiagramCore;

  var EXAMPLES = [
    {
      name: 'Report pipeline',
      text: [
        'title: Report banane ka flow',
        'direction: LR',
        'Idea [Idea / question] -> Research (Research)',
        'Research -> Notes (Notes in HQ)',
        'Notes -> Draft (Draft the report)',
        'Draft -> Charts {Need a diagram?}',
        'Charts ->|yes| Studio (Diagram Studio)',
        'Charts ->|no| Review (Review)',
        'Studio -> Review',
        'Review -> Done ((Publish))'
      ].join('\n')
    },
    {
      name: 'Decision flow',
      text: [
        'title: Shipping decision',
        'direction: TB',
        'Start [New change] -> Tests {Tests green?}',
        'Tests ->|yes| Scope {Scope is small?}',
        'Tests ->|no| Fix (Fix it)',
        'Fix -> Tests',
        'Scope ->|yes| Ship ((Ship))',
        'Scope ->|no| Split (Split the task)',
        'Split -> Ship'
      ].join('\n')
    },
    {
      name: 'Weekly review (tree)',
      text: [
        'Weekly review',
        '  Wins',
        '    Shipped the task',
        '    Closed BUG-051',
        '  Lessons',
        '    Read the code first',
        '    Keep commits small',
        '  Next week',
        '    Device QA',
        '    Tool polish'
      ].join('\n')
    },
    {
      name: 'Company map (groups)',
      text: [
        'title: Sambhav-OS map',
        'direction: LR',
        'group Brain {',
        '  HQ [HQ vault] -> Notes (Notes & decisions)',
        '}',
        'group Build {',
        '  Projects (Projects) -> Code (Code)',
        '  Projects -> Agents (AI agents)',
        '}',
        'group Output {',
        '  Ships ((Shipped))',
        '}',
        'HQ -> Projects : dispatch',
        'Notes -> Projects : context',
        'Code -> Ships',
        'Agents -> Code : PRs'
      ].join('\n')
    },
    {
      name: 'Money flow (Hinglish)',
      text: [
        'title: Paisa kahan jaata hai',
        'direction: LR',
        'Income (Salary) -> Split {Split}',
        'Split ->|50%| Needs (Needs)',
        'Split ->|30%| Wants (Wants)',
        'Split ->|20%| Invest (Invest)',
        'Needs -> Track (Track)',
        'Wants -> Track',
        'Invest -> NetWorth ((Net worth))',
        'Track -> NetWorth'
      ].join('\n')
    }
  ];

  var KEY = 'diagram-studio-v1';

  var els = {
    source: document.getElementById('source'),
    examples: document.getElementById('examples'),
    dir: document.getElementById('dir'),
    themeBtn: document.getElementById('themeBtn'),
    svgBtn: document.getElementById('svgBtn'),
    pngBtn: document.getElementById('pngBtn'),
    pngScale: document.getElementById('pngScale'),
    transparent: document.getElementById('transparent'),
    stage: document.getElementById('stage'),
    canvas: document.getElementById('canvas'),
    zoomIn: document.getElementById('zoomIn'),
    zoomOut: document.getElementById('zoomOut'),
    zoomLabel: document.getElementById('zoomLabel'),
    fitBtn: document.getElementById('fitBtn'),
    error: document.getElementById('error'),
    stats: document.getElementById('stats')
  };

  var state = {
    model: null,
    layout: null,
    theme: 'light',
    view: { k: 1, tx: 0, ty: 0 }
  };

  var saveTimer = null;
  var renderTimer = null;

  function loadSettings() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && typeof data.text === 'string') return data;
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveSettings() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        text: els.source.value,
        theme: state.theme,
        pngScale: parseInt(els.pngScale.value, 10) || 2,
        transparent: els.transparent.checked
      }));
    } catch (e) { /* ignore */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 400);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    els.themeBtn.textContent = state.theme === 'light' ? 'Dark' : 'Light';
    els.themeBtn.setAttribute('aria-pressed', String(state.theme === 'dark'));
  }

  function showError(message) {
    els.error.innerHTML = '<strong>Cannot draw yet.</strong> ' + message;
    els.error.hidden = false;
    els.source.setAttribute('aria-invalid', 'true');
  }

  function hideError() {
    els.error.hidden = true;
    els.source.removeAttribute('aria-invalid');
  }

  function applyView() {
    var svg = els.canvas.querySelector('svg');
    if (!svg) return;
    var v = state.view;
    svg.style.transform = 'translate(' + v.tx + 'px, ' + v.ty + 'px) scale(' + v.k + ')';
    els.zoomLabel.textContent = Math.round(v.k * 100) + '%';
  }

  function renderNow() {
    var text = els.source.value;
    var res = core.parse(text);

    if (!res.ok) {
      var err = res.error || { line: 0, message: 'Unknown parse error.' };
      showError((err.line ? 'Line ' + err.line + ': ' : '') + err.message);
      els.stats.textContent = 'error';
      scheduleSave();
      return;
    }

    hideError();
    state.model = res.model;
    state.layout = core.layout(res.model);

    var svg = core.renderSVG(res.model, state.layout, { theme: state.theme, background: false });
    els.canvas.innerHTML = svg;
    applyView();

    var n = Object.keys(res.model.nodes).length;
    var e = res.model.edges.length;
    els.stats.textContent = n + ' nodes · ' + e + ' edges · ' + state.layout.dir;

    if (els.dir.value !== state.layout.dir) els.dir.value = state.layout.dir;
    scheduleSave();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderNow, 220);
  }

  function setDirection(dir) {
    var text = els.source.value;
    if (/^direction\s*:/im.test(text)) {
      text = text.replace(/^direction\s*:.*$/im, 'direction: ' + dir);
    } else {
      text = 'direction: ' + dir + '\n' + text;
    }
    els.source.value = text;
    renderNow();
  }

  function fit() {
    state.view = { k: 1, tx: 0, ty: 0 };
    applyView();
  }

  function zoomAt(px, py, factor) {
    var v = state.view;
    var next = Math.min(8, Math.max(0.2, v.k * factor));
    var ratio = next / v.k;
    v.tx = px - (px - v.tx) * ratio;
    v.ty = py - (py - v.ty) * ratio;
    v.k = next;
    applyView();
  }

  function zoomCenter(factor) {
    var rect = els.stage.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  function slug(s) {
    return String(s || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';
  }

  function download(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function exportSVG() {
    if (!state.model) return;
    var clear = els.transparent.checked;
    var svg = core.renderSVG(state.model, state.layout, { theme: state.theme, background: !clear });
    download(slug(state.model.title) + (clear ? '-clear' : '') + '.svg', new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  }

  function exportPNG() {
    if (!state.model) return;
    var wanted = Math.min(3, Math.max(1, parseInt(els.pngScale.value, 10) || 2));
    var clear = els.transparent.checked;
    var svg = core.renderSVG(state.model, state.layout, { theme: state.theme, background: !clear });
    var m = svg.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
    if (!m) { showError('PNG export failed. Use SVG instead.'); return; }
    var w = parseInt(m[1], 10);
    var h = parseInt(m[2], 10);
    var scale = Math.min(wanted, 6000 / Math.max(w, h));
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));

    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        var ctx = c.getContext('2d');
        if (!clear) {
          ctx.fillStyle = (core.THEMES[state.theme] || core.THEMES.light).bg;
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          if (blob) download(slug(state.model.title) + '@' + wanted + 'x' + (clear ? '-clear' : '') + '.png', blob);
          else showError('PNG export failed. Use SVG instead.');
        }, 'image/png');
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      showError('PNG export failed. Use SVG instead.');
    };

    img.src = url;
  }

  function populateExamples() {
    EXAMPLES.forEach(function (ex, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = ex.name;
      els.examples.appendChild(opt);
    });
  }

  function loadExample(index) {
    var ex = EXAMPLES[index];
    if (!ex) return;
    els.source.value = ex.text;
    state.view = { k: 1, tx: 0, ty: 0 };
    renderNow();
  }

  function bind() {
    els.source.addEventListener('input', scheduleRender);
    els.source.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        var s = els.source.selectionStart;
        var t = els.source.selectionEnd;
        els.source.value = els.source.value.slice(0, s) + '  ' + els.source.value.slice(t);
        els.source.selectionStart = els.source.selectionEnd = s + 2;
        scheduleRender();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        renderNow();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportSVG();
      }
    });

    els.examples.addEventListener('change', function () {
      loadExample(parseInt(els.examples.value, 10));
    });

    els.dir.addEventListener('change', function () { setDirection(els.dir.value); });

    els.themeBtn.addEventListener('click', function () {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme();
      renderNow();
      saveSettings();
    });

    els.svgBtn.addEventListener('click', exportSVG);
    els.pngBtn.addEventListener('click', exportPNG);
    els.pngScale.addEventListener('change', saveSettings);
    els.transparent.addEventListener('change', saveSettings);
    els.fitBtn.addEventListener('click', fit);
    els.zoomLabel.addEventListener('click', fit);
    els.zoomIn.addEventListener('click', function () { zoomCenter(1.2); });
    els.zoomOut.addEventListener('click', function () { zoomCenter(1 / 1.2); });

    els.stage.addEventListener('wheel', function (e) {
      if (e.target.closest('.zoombar')) return;
      e.preventDefault();
      var rect = els.stage.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    var drag = null;

    els.stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.zoombar') || e.target.closest('.error')) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      els.stage.classList.add('dragging');
      els.stage.setPointerCapture(e.pointerId);
    });

    els.stage.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      state.view.tx += e.clientX - drag.x;
      state.view.ty += e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      applyView();
    });

    function endDrag(e) {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      els.stage.classList.remove('dragging');
      if (els.stage.hasPointerCapture(e.pointerId)) els.stage.releasePointerCapture(e.pointerId);
    }

    els.stage.addEventListener('pointerup', endDrag);
    els.stage.addEventListener('pointercancel', endDrag);
    els.stage.addEventListener('dblclick', function (e) {
      if (!e.target.closest('.zoombar') && !e.target.closest('.error')) fit();
    });
  }

  function boot() {
    populateExamples();
    var saved = loadSettings();

    if (saved) {
      state.theme = saved.theme === 'dark' ? 'dark' : 'light';
      els.source.value = saved.text;
      els.source.setAttribute('data-restored', '1');
      if (saved.pngScale === 1 || saved.pngScale === 3) els.pngScale.value = String(saved.pngScale);
      els.transparent.checked = saved.transparent === true;
    } else {
      els.source.value = EXAMPLES[0].text;
      els.examples.value = '0';
    }

    applyTheme();
    bind();
    renderNow();
  }

  boot();
})();
