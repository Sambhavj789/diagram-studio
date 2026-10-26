'use strict';

// Headless PNG export without a dependency.
//
// SVG stays canonical. For PNG we ask an installed Chromium browser (Edge on Windows,
// Chrome/Chromium elsewhere) for a screenshot. No npm package, no network, and the same
// command works from scripts, CI and the report/book pipelines.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const WIN = [
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'Google/Chrome/Application/chrome.exe'),
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
  process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Google/Chrome/Application/chrome.exe')
];

const MAC = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];

const NAMES = ['msedge', 'msedge.exe', 'chrome', 'chrome.exe', 'chromium', 'chromium-browser', 'google-chrome'];

function onPath(name) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [name], { encoding: 'utf8' })
    : spawnSync('which', [name], { encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const first = String(probe.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  return first && fs.existsSync(first) ? first : null;
}

function findBrowser(explicit) {
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  const env = process.env.DIAGRAM_STUDIO_BROWSER;
  if (env && fs.existsSync(env)) return env;

  const candidates = (process.platform === 'win32' ? WIN : process.platform === 'darwin' ? MAC : [])
    .filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const name of NAMES) {
    const found = onPath(name);
    if (found) return found;
  }
  return null;
}

function svgSize(svg) {
  const open = String(svg).match(/<svg[^>]*>/);
  if (!open) throw new Error('not an SVG document');
  const w = open[0].match(/\swidth="([\d.]+)"/);
  const h = open[0].match(/\sheight="([\d.]+)"/);
  if (!w || !h) throw new Error('SVG has no numeric width/height');
  return { open: open[0], width: Number(w[1]), height: Number(h[1]) };
}

// Scale the outer SVG only; the viewBox keeps the drawing proportional.
function scaledSvg(svg, scale) {
  const { open, width, height } = svgSize(svg);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const bigger = open
    .replace(/\swidth="[\d.]+"/, ' width="' + w + '"')
    .replace(/\sheight="[\d.]+"/, ' height="' + h + '"');
  return { svg: String(svg).replace(open, bigger), width: w, height: h };
}

function renderPng(svg, outPath, opts) {
  opts = opts || {};
  const scale = Math.min(3, Math.max(1, Number(opts.scale) || 2));
  const transparent = opts.transparent === true;
  const browser = findBrowser(opts.browser);

  if (!browser) {
    throw new Error(
      'PNG export needs Edge, Chrome or Chromium. Install one, or set DIAGRAM_STUDIO_BROWSER ' +
      'to the browser executable. SVG export has no such requirement.'
    );
  }

  const art = scaledSvg(svg, scale);
  const out = path.resolve(outPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-png-'));
  const profile = path.join(tmp, 'profile');
  const htmlPath = path.join(tmp, 'index.html');
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0;padding:0;overflow:hidden;background:transparent}' +
    'svg{display:block}</style></head><body>' + art.svg + '</body></html>';

  try {
    fs.writeFileSync(htmlPath, html, 'utf8');
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=2000',
      '--window-size=' + art.width + ',' + art.height,
      '--screenshot=' + out,
      '--user-data-dir=' + profile,
      '--default-background-color=' + (transparent ? '00000000' : 'ffffffff'),
      pathToFileURL(htmlPath).href
    ];

    const run = spawnSync(browser, args, { encoding: 'utf8', timeout: 60000 });
    const err = String((run.stderr || '') + (run.stdout || '')).trim();

    if (!fs.existsSync(out)) {
      throw new Error('browser could not write the PNG' + (err ? ': ' + err.split(/\r?\n/).slice(-3).join(' ') : ''));
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }

  return { path: outPath, width: art.width, height: art.height, scale: scale, transparent: transparent, browser: browser };
}

module.exports = {
  findBrowser: findBrowser,
  renderPng: renderPng
};
