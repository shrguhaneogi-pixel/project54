/**
 * PALETTE — Color Theory Generator
 * Tier 3 adds: Export (PNG/CSS/JSON) · Palette History + Undo
 *              Color Detail Panel · HSL Fine-Tune Sliders · AI Color Naming
 *
 * Architecture carried forward:
 *   appState  — single source of truth
 *   syncState — localStorage + URL after every mutation
 *   render    — pure read from appState → DOM
 *   panelOpen — runtime flag, gates keyboard shortcuts
 *
 * New state fields: (none — Tier 3 features are runtime-only or use sessionStorage)
 * New runtime state:
 *   historyStack — array of past color arrays (session-scoped)
 *   activePanel  — { index, hex } of currently open detail panel
 */

'use strict';

/* ─────────────────────────────────────────────────────────
   1.  APP STATE
   ───────────────────────────────────────────────────────── */

const DEFAULT_STATE = {
  colors:   ['#E1F5FE', '#B3E5FC', '#81D4FA', '#4FC3F7', '#29B6F6'],
  locks:    [false, false, false, false, false],
  harmony:  'analogous',
  viewMode: 'solid',
  a11yOn:   false,
  theme:    'light',
};

let appState = deepClone(DEFAULT_STATE);

// Runtime-only — never persisted to localStorage/URL
let panelOpen    = false;
let isDragging   = false;
let kbFocusIdx   = -1;
let activePanel  = null;   // { index, hex } when panel is open
let historyStack = [];     // array of color arrays (max 20)

const HISTORY_MAX = 20;

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

/* ─────────────────────────────────────────────────────────
   2.  HSL COLOR ENGINE
   ───────────────────────────────────────────────────────── */

function generateHarmoniousColors() {
  const baseHue   = Math.floor(Math.random() * 360);
  const newColors = buildHarmony(baseHue, appState.harmony);
  appState.colors = appState.colors.map((existing, i) =>
    appState.locks[i] ? existing : newColors[i]
  );
}

function buildHarmony(h, mode) {
  switch (mode) {
    case 'analogous':
      return [
        hslToHex(h,            satRand(), ligRand()),
        hslToHex(norm(h + 20), satRand(), ligRand()),
        hslToHex(norm(h + 40), satRand(), ligRand()),
        hslToHex(norm(h - 20), satRand(), ligRand()),
        hslToHex(norm(h - 40), satRand(), ligRand()),
      ];
    case 'complementary': {
      const comp = norm(h + 180);
      return [
        hslToHex(h,    satRand(), ligHigh()),
        hslToHex(h,    satRand(), ligMid()),
        hslToHex(h,    satRand(), ligLow()),
        hslToHex(comp, satRand(), ligMid()),
        hslToHex(comp, satRand(), ligHigh()),
      ];
    }
    case 'triadic': {
      const t1 = norm(h + 120), t2 = norm(h + 240);
      return [
        hslToHex(h,  satRand(), ligMid()),
        hslToHex(h,  satRand(), ligHigh()),
        hslToHex(t1, satRand(), ligMid()),
        hslToHex(t1, satRand(), ligHigh()),
        hslToHex(t2, satRand(), ligMid()),
      ];
    }
    case 'monochromatic':
      return [
        hslToHex(h, 85, 25), hslToHex(h, 75, 40),
        hslToHex(h, 65, 55), hslToHex(h, 55, 70), hslToHex(h, 40, 85),
      ];
    case 'split': {
      const s1 = norm(h + 150), s2 = norm(h + 210);
      return [
        hslToHex(h,  satRand(), ligMid()),
        hslToHex(h,  satRand(), ligHigh()),
        hslToHex(s1, satRand(), ligMid()),
        hslToHex(s2, satRand(), ligMid()),
        hslToHex(s2, satRand(), ligHigh()),
      ];
    }
    default: return buildHarmony(h, 'analogous');
  }
}

function norm(h)           { return ((h % 360) + 360) % 360; }
function satRand()         { return randBetween(45, 85); }
function ligHigh()         { return randBetween(72, 88); }
function ligMid()          { return randBetween(48, 68); }
function ligLow()          { return randBetween(28, 48); }
function ligRand()         { return [ligHigh, ligMid, ligLow][Math.floor(Math.random() * 3)](); }
function randBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/* ─────────────────────────────────────────────────────────
   3.  WCAG ENGINE
   ───────────────────────────────────────────────────────── */

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(h1, h2) {
  const L1 = relativeLuminance(h1), L2 = relativeLuminance(h2);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

function wcagRating(hex) {
  const vsWhite = contrastRatio(hex, '#FFFFFF');
  const vsBlack = contrastRatio(hex, '#000000');
  const best    = Math.max(vsWhite, vsBlack);
  const level   = best >= 7 ? 'AAA' : best >= 4.5 ? 'AA' : best >= 3 ? 'AA_large' : 'fail';
  return { ratio: best.toFixed(2), level, vsWhite: vsWhite.toFixed(2), vsBlack: vsBlack.toFixed(2) };
}

/* ─────────────────────────────────────────────────────────
   4.  AI COLOR NAMING  (Upgrade 14)
   ───────────────────────────────────────────────────────── */

const COLOR_NAMES = {
  // hue ranges → [adjectives, nouns]
  red:    [['Crimson','Scarlet','Ruby','Rose','Blush','Brick','Garnet'],      ['Dusk','Ember','Dawn','Bloom','Heat','Flare','Poppy']],
  orange: [['Amber','Copper','Rust','Terracotta','Harvest','Burnt','Clay'],   ['Haze','Glow','Mesa','Creek','Grove','Ridge','Sunset']],
  yellow: [['Golden','Flaxen','Lemon','Straw','Honey','Mellow','Warm'],       ['Grain','Ray','Field','Shore','Noon','Light','Mist']],
  lime:   [['Fresh','Spring','Lime','Chartreuse','Vivid','Crisp','Young'],    ['Meadow','Leaf','Canopy','Sprout','Moss','Fern','Petal']],
  green:  [['Forest','Sage','Olive','Jade','Mint','Emerald','Deep'],          ['Pine','Glen','Hollow','Bayou','Trail','Knoll','Cove']],
  teal:   [['Ocean','Teal','Aqua','Seafoam','Lagoon','Calm','Clear'],         ['Tide','Bay','Reef','Mist','Crest','Shore','Pool']],
  blue:   [['Sky','Navy','Cobalt','Cerulean','Slate','Midnight','Steel'],     ['Wave','Drift','Veil','Haze','Abyss','Horizon','Vault']],
  purple: [['Violet','Mauve','Plum','Lavender','Indigo','Royal','Deep'],      ['Dusk','Haze','Nebula','Vale','Bloom','Twilight','Reign']],
  pink:   [['Blush','Rosy','Coral','Peach','Flamingo','Dusty','Soft'],        ['Petal','Bloom','Veil','Mist','Cloud','Blossom','Dawn']],
};

/**
 * Maps hue (0–360) to a colour family name.
 */
function hueFamily(h) {
  if (h < 15  || h >= 345) return 'red';
  if (h < 45)  return 'orange';
  if (h < 70)  return 'yellow';
  if (h < 85)  return 'lime';
  if (h < 165) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 285) return 'purple';
  if (h < 345) return 'pink';
  return 'red';
}

/**
 * Generates a two-word name for a hex colour.
 * Deterministic: same hex → same name (uses hash for index selection).
 */
function colorName(hex) {
  const { h, s, l } = hexToHsl(hex);
  const family = hueFamily(h);
  const [adjs, nouns] = COLOR_NAMES[family];

  // Light colours get softer adjectives (last quarter of the list)
  // Dark colours get deeper adjectives (first quarter)
  // Use a simple hash for determinism
  const hash = (hex.slice(1).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));

  let adjIdx;
  if (l >= 75)      adjIdx = (hash % 3) + 4;   // soft end
  else if (l <= 35) adjIdx = hash % 3;           // deep end
  else              adjIdx = (hash % 5) + 1;     // mid range

  const nounIdx = (hash * 3) % nouns.length;

  const adj  = adjs[adjIdx  % adjs.length];
  const noun = nouns[nounIdx % nouns.length];
  return `${adj} ${noun}`;
}

/* ─────────────────────────────────────────────────────────
   5.  STATE PERSISTENCE
   ───────────────────────────────────────────────────────── */

const STORAGE_KEY = 'palette_app_state';

function syncState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}

  const colors = appState.colors.map(c => c.replace('#', '')).join('-');
  const locks  = appState.locks.map(l => l ? '1' : '0').join('');
  const params = new URLSearchParams({
    colors, locks,
    mode:  appState.harmony,
    view:  appState.viewMode,
    a11y:  appState.a11yOn  ? '1' : '0',
    theme: appState.theme,
  });
  history.replaceState(null, '', `?${params.toString()}`);
}

function loadState() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('colors')) {
    const rawColors = params.get('colors').split('-');
    if (rawColors.length === 5) {
      const parsed = rawColors.map(c => {
        const hex = `#${c.toUpperCase()}`;
        return /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
      });
      if (parsed.every(Boolean)) appState.colors = parsed;
    }
    const rawLocks = params.get('locks') || '00000';
    appState.locks = rawLocks.split('').slice(0, 5).map(c => c === '1');

    const modeParam = params.get('mode');
    if (['analogous','complementary','triadic','monochromatic','split'].includes(modeParam)) {
      appState.harmony = modeParam;
    }
    const viewParam = params.get('view');
    if (['solid','gradient'].includes(viewParam)) appState.viewMode = viewParam;

    appState.a11yOn = params.get('a11y') === '1';

    const themeParam = params.get('theme');
    if (['light','dark'].includes(themeParam)) appState.theme = themeParam;
    return;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.colors) && parsed.colors.length === 5) {
        appState = { ...DEFAULT_STATE, ...parsed };
        return;
      }
    }
  } catch (e) {}
}

/* ─────────────────────────────────────────────────────────
   6.  PALETTE HISTORY + UNDO  (Upgrade 12)
   ───────────────────────────────────────────────────────── */

/**
 * Pushes the current palette onto the history stack before generating.
 * Must be called BEFORE mutating appState.colors.
 */
function pushHistory() {
  historyStack.push([...appState.colors]);
  if (historyStack.length > HISTORY_MAX) historyStack.shift();
  renderUndoBtn();
}

/**
 * Pops the last palette from history and restores it.
 */
function undo() {
  if (historyStack.length === 0) return;
  appState.colors = historyStack.pop();
  syncState();
  render();
  renderUndoBtn();
  showToast('Undone');
}

function renderUndoBtn() {
  const btn   = document.getElementById('undo-btn');
  const hasBadge = btn.querySelector('.undo-count');
  if (historyStack.length > 0) {
    btn.classList.remove('hidden');
    // Update or create badge
    if (hasBadge) {
      hasBadge.textContent = historyStack.length;
    } else {
      const badge = document.createElement('span');
      badge.className = 'undo-count';
      badge.textContent = historyStack.length;
      btn.appendChild(badge);
    }
  } else {
    btn.classList.add('hidden');
    if (hasBadge) hasBadge.remove();
  }
}

/* ─────────────────────────────────────────────────────────
   7.  EXPORT SYSTEM  (Upgrade 11)
   ───────────────────────────────────────────────────────── */

/**
 * Central serializer — shared foundation for Tier 4's Design System Generator (#17).
 * format: 'png' | 'css' | 'json'
 */
function serializePalette(format) {
  const colors = appState.colors;
  const names  = colors.map(colorName);

  switch (format) {

    case 'css': {
      const lines = colors.map((hex, i) => {
        const { r, g, b } = hexToRgb(hex);
        const { h, s, l } = hexToHsl(hex);
        const varName = names[i].toLowerCase().replace(/\s+/g, '-');
        return [
          `  /* ${names[i]} */`,
          `  --color-${i + 1}: ${hex};`,
          `  --color-${i + 1}-rgb: ${r}, ${g}, ${b};`,
          `  --color-${i + 1}-hsl: ${h}, ${s}%, ${l}%;`,
          `  --color-${i + 1}-name: "${varName}";`,
        ].join('\n');
      });
      return `:root {\n${lines.join('\n\n')}\n}`;
    }

    case 'json': {
      const data = {
        generated: new Date().toISOString(),
        harmony: appState.harmony,
        colors: colors.map((hex, i) => {
          const { r, g, b } = hexToRgb(hex);
          const { h, s, l } = hexToHsl(hex);
          const wcag = wcagRating(hex);
          return {
            index: i,
            name: names[i],
            hex,
            rgb: { r, g, b },
            hsl: { h, s, l },
            locked: appState.locks[i],
            wcag: { ratio: wcag.ratio, level: wcag.level },
          };
        }),
      };
      return JSON.stringify(data, null, 2);
    }

    case 'png':
      return null; // PNG is handled separately via Canvas

    default:
      return null;
  }
}

/**
 * Exports palette as a PNG using Canvas.
 * Reads current theme for background colour.
 */
function exportPNG() {
  const W = 1000, H = 300;
  const colW = W / 5;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const isDark = appState.theme === 'dark';

  appState.colors.forEach((hex, i) => {
    const x = i * colW;

    // Swatch
    ctx.fillStyle = hex;
    ctx.fillRect(x, 0, colW, H - 60);

    // Info strip
    ctx.fillStyle = isDark ? '#1c1c1a' : '#ffffff';
    ctx.fillRect(x, H - 60, colW, 60);

    // Hex label
    ctx.fillStyle = isDark ? '#f0ede8' : '#1a1a1a';
    ctx.font = '500 14px "DM Mono", monospace';
    ctx.fillText(hex.toUpperCase(), x + 12, H - 36);

    // Color name
    ctx.fillStyle = isDark ? '#666660' : '#a0a0a0';
    ctx.font = '400 11px "DM Sans", sans-serif';
    ctx.fillText(colorName(hex), x + 12, H - 18);

    // Thin divider between swatches
    if (i > 0) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, 0, 1, H);
    }
  });

  // Subtle border on whole image
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Download
  canvas.toBlob(blob => {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `palette-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Downloads a text file.
 */
function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────
   8.  RENDER
   ───────────────────────────────────────────────────────── */

function render(opts = {}) {
  renderTheme();
  renderPalette(opts);
  renderGradient();
  renderHarmonyPills();
  renderViewMode();
  renderA11yToggle();
  renderKbFocus();
}

/* ── 8a. Theme ── */
function renderTheme() {
  document.documentElement.dataset.theme = appState.theme;
  const icon = document.getElementById('theme-icon');
  icon.className = appState.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/* ── 8b. Solid palette ── */
function renderPalette(opts = {}) {
  const container      = document.getElementById('palette-container');
  const isFirstRender  = container.children.length !== 5;

  if (isFirstRender) {
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const box = createColorBox(i);
      box.style.setProperty('--i', i);
      container.appendChild(box);
    }
  }

  appState.colors.forEach((hex, i) => {
    const box     = container.children[i];
    const swatch  = box.querySelector('.color-swatch');
    const hexEl   = box.querySelector('.hex-value');
    const nameEl  = box.querySelector('.color-name');
    const lockBtn = box.querySelector('.lock-btn');

    if (!isFirstRender) box.classList.add('no-animate');

    swatch.style.backgroundColor = hex;
    hexEl.textContent  = hex.toUpperCase();
    nameEl.textContent = colorName(hex);   // AI name

    box.classList.toggle('locked', appState.locks[i]);
    lockBtn.querySelector('i').className = appState.locks[i] ? 'fas fa-lock' : 'fas fa-unlock';

    if (opts.lockAnim === i) {
      box.classList.remove('lock-anim');
      void box.offsetWidth;
      box.classList.add('lock-anim');
    }

    updateWcagDisplay(box, wcagRating(hex));
  });
}

function createColorBox(index) {
  const box = document.createElement('div');
  box.className = 'color-box';
  box.dataset.index = index;
  box.setAttribute('draggable', 'true');
  box.setAttribute('tabindex', '-1');

  box.innerHTML = `
    <div class="color-swatch">
      <div class="drag-handle" aria-hidden="true">
        <span></span><span></span>
        <span></span><span></span>
      </div>
      <button class="lock-btn" title="Lock / unlock color (L)" data-index="${index}">
        <i class="fas fa-unlock"></i>
      </button>
      <div class="wcag-badge"></div>
    </div>
    <div class="color-info">
      <div class="color-info-row">
        <span class="hex-value"></span>
        <button class="copy-btn" title="Copy hex (C)" data-index="${index}">
          <i class="far fa-copy"></i>
        </button>
      </div>
      <p class="color-name"></p>
      <div class="contrast-row">
        <span class="contrast-ratio"></span>
        <div class="contrast-chips"></div>
      </div>
    </div>
  `;
  return box;
}

function updateWcagDisplay(box, a11y) {
  const badge       = box.querySelector('.wcag-badge');
  const contrastRow = box.querySelector('.contrast-row');
  const ratioEl     = box.querySelector('.contrast-ratio');
  const chipsEl     = box.querySelector('.contrast-chips');

  if (appState.a11yOn) {
    badge.classList.add('show');
    badge.className = 'wcag-badge show ' + (a11y.level === 'AAA' ? 'aaa' : a11y.level === 'AA' ? 'aa' : 'fail');
    badge.textContent = a11y.level === 'AA_large' ? 'AA*' : a11y.level;
    contrastRow.classList.add('show');
    ratioEl.textContent = `${a11y.ratio}:1`;
    const wR = parseFloat(a11y.vsWhite), bR = parseFloat(a11y.vsBlack);
    chipsEl.innerHTML = `
      <span class="chip ${chipClass(wR)}" title="vs white">${wR >= 4.5 ? '✓' : '✗'} W</span>
      <span class="chip ${chipClass(bR)}" title="vs black">${bR >= 4.5 ? '✓' : '✗'} B</span>
    `;
  } else {
    badge.classList.remove('show');
    contrastRow.classList.remove('show');
  }
}

function chipClass(r) { return r >= 7 ? 'pass-aaa' : r >= 4.5 ? 'pass-aa' : 'fail'; }

/* ── 8c. Gradient ── */
function renderGradient() {
  const preview = document.getElementById('gradient-preview');
  const stopsEl = document.getElementById('gradient-stops');
  const cssCode = document.getElementById('gradient-css-code');
  const hexList = appState.colors.join(', ');
  const css     = `linear-gradient(90deg, ${hexList})`;

  preview.style.background = css;
  stopsEl.innerHTML = appState.colors.map(hex => `
    <div class="gradient-stop-item">
      <div class="gradient-stop-swatch" style="background:${hex}"></div>
      <span class="gradient-stop-label">${hex.toUpperCase()}</span>
    </div>
  `).join('');
  cssCode.textContent = `background: ${css};`;
}

/* ── 8d. Harmony pills ── */
function renderHarmonyPills() {
  document.querySelectorAll('.pill').forEach(p =>
    p.classList.toggle('active', p.dataset.harmony === appState.harmony)
  );
}

/* ── 8e. View mode ── */
function renderViewMode() {
  const solid    = document.getElementById('palette-container');
  const gradient = document.getElementById('gradient-container');
  const btnS     = document.getElementById('mode-solid');
  const btnG     = document.getElementById('mode-gradient');
  const isSolid  = appState.viewMode === 'solid';
  solid.classList.toggle('hidden', !isSolid);
  gradient.classList.toggle('hidden', isSolid);
  btnS.classList.toggle('active', isSolid);
  btnG.classList.toggle('active', !isSolid);
}

/* ── 8f. A11y toggle ── */
function renderA11yToggle() {
  document.getElementById('a11y-toggle').checked = appState.a11yOn;
}

/* ── 8g. Keyboard focus ── */
function renderKbFocus() {
  document.querySelectorAll('.color-box').forEach((box, i) => {
    box.classList.toggle('kb-focused', i === kbFocusIdx);
  });
}

/* ─────────────────────────────────────────────────────────
   9.  COLOR DETAIL PANEL  (Upgrades 13 + 16)
   ───────────────────────────────────────────────────────── */

/**
 * Opens the detail panel for color at `index`.
 */
function openPanel(index) {
  activePanel = { index, hex: appState.colors[index] };
  panelOpen   = true;

  document.getElementById('panel-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';  // prevent scroll behind overlay

  renderPanel();
}

/**
 * Closes the detail panel.
 */
function closePanel() {
  panelOpen   = false;
  activePanel = null;

  document.getElementById('panel-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/**
 * Renders all panel content from activePanel.hex.
 */
function renderPanel() {
  if (!activePanel) return;
  const { index, hex } = activePanel;
  const { r, g, b }    = hexToRgb(hex);
  const { h, s, l }    = hexToHsl(hex);
  const compHex        = hslToHex(norm(h + 180), s, l);
  const a11y           = wcagRating(hex);
  const name           = colorName(hex);

  // Header
  document.getElementById('panel-swatch').style.backgroundColor = hex;
  document.getElementById('panel-color-name').textContent = name;
  document.getElementById('panel-hex').textContent = hex.toUpperCase();

  // Values
  document.getElementById('pv-hex-val').textContent = hex.toUpperCase();
  document.getElementById('pv-rgb-val').textContent = `rgb(${r}, ${g}, ${b})`;
  document.getElementById('pv-hsl-val').textContent = `hsl(${h}, ${s}%, ${l}%)`;

  // Sliders
  const slH = document.getElementById('sl-h');
  const slS = document.getElementById('sl-s');
  const slL = document.getElementById('sl-l');
  slH.value = h;
  slS.value = s;
  slL.value = l;
  document.getElementById('sl-h-val').textContent = `${h}°`;
  document.getElementById('sl-s-val').textContent = `${s}%`;
  document.getElementById('sl-l-val').textContent = `${l}%`;

  // Update saturation slider track to show the actual hue
  slS.style.setProperty('--slider-sat-bg',
    `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`
  );
  slS.style.background =
    `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`;

  // Shades & tints — 7 stops from dark to light
  const shadesEl = document.getElementById('panel-shades');
  const stops = [15, 25, 35, 50, 65, 78, 88];
  shadesEl.innerHTML = stops.map(lVal => {
    const shadeHex = hslToHex(h, Math.max(s - 5, 20), lVal);
    const isActive = Math.abs(lVal - l) < 8;
    return `<div class="shade-swatch${isActive ? ' active-shade' : ''}"
      style="background:${shadeHex}"
      title="${shadeHex}"
      data-hex="${shadeHex}">
    </div>`;
  }).join('');

  // Complementary
  document.getElementById('panel-comp-swatch').style.backgroundColor = compHex;
  document.getElementById('panel-comp-hex').textContent = compHex.toUpperCase();

  // WCAG detail
  const wcagEl = document.getElementById('panel-wcag');
  const vsW    = parseFloat(a11y.vsWhite), vsB = parseFloat(a11y.vsBlack);

  wcagEl.innerHTML = `
    <div class="wcag-row">
      <span class="wcag-row-label">vs White</span>
      <div class="wcag-row-right">
        <span class="wcag-ratio">${vsW.toFixed(2)}:1</span>
        <span class="wcag-badge-pill ${wcagPillClass(vsW)}">${wcagLevelLabel(vsW)}</span>
      </div>
    </div>
    <div class="wcag-row">
      <span class="wcag-row-label">vs Black</span>
      <div class="wcag-row-right">
        <span class="wcag-ratio">${vsB.toFixed(2)}:1</span>
        <span class="wcag-badge-pill ${wcagPillClass(vsB)}">${wcagLevelLabel(vsB)}</span>
      </div>
    </div>
    <div class="wcag-row">
      <span class="wcag-row-label">Best pairing</span>
      <div class="wcag-row-right">
        <span class="wcag-ratio">${a11y.ratio}:1</span>
        <span class="wcag-badge-pill ${wcagPillClass(parseFloat(a11y.ratio))}">${wcagLevelLabel(parseFloat(a11y.ratio))}</span>
      </div>
    </div>
  `;
}

function wcagPillClass(ratio) {
  return ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : 'fail';
}

function wcagLevelLabel(ratio) {
  return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail';
}

/**
 * Called by HSL sliders — updates the active color in appState and re-renders.
 */
function applySliderChange() {
  if (!activePanel) return;
  const h = parseInt(document.getElementById('sl-h').value, 10);
  const s = parseInt(document.getElementById('sl-s').value, 10);
  const l = parseInt(document.getElementById('sl-l').value, 10);

  const newHex = hslToHex(h, s, l);
  appState.colors[activePanel.index] = newHex;
  activePanel.hex = newHex;

  syncState();
  renderPalette();
  renderGradient();
  renderPanel();  // refreshes all panel content with new hex
}

/* ─────────────────────────────────────────────────────────
   10.  EVENT HANDLERS
   ───────────────────────────────────────────────────────── */

/* ── Generate ── */
document.getElementById('generate-btn').addEventListener('click', handleGenerate);

function handleGenerate() {
  pushHistory();                  // ← save before mutating
  generateHarmoniousColors();
  syncState();
  render();
  spinGenerateBtn();
}

function spinGenerateBtn() {
  const btn = document.getElementById('generate-btn');
  btn.classList.remove('spinning');
  void btn.offsetWidth;
  btn.classList.add('spinning');
  btn.addEventListener('transitionend', () => btn.classList.remove('spinning'), { once: true });
}

/* ── Harmony pills ── */
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    appState.harmony = pill.dataset.harmony;
    handleGenerate();
  });
});

/* ── View mode ── */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    appState.viewMode = btn.dataset.mode;
    syncState();
    renderViewMode();
    if (appState.viewMode === 'gradient') renderGradient();
  });
});

/* ── A11y toggle ── */
document.getElementById('a11y-toggle').addEventListener('change', function () {
  appState.a11yOn = this.checked;
  syncState();
  renderPalette();
});

/* ── Theme toggle ── */
document.getElementById('theme-btn').addEventListener('click', toggleTheme);

function toggleTheme() {
  const btn = document.getElementById('theme-btn');
  btn.classList.add('switching');
  setTimeout(() => {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    syncState();
    renderTheme();
    btn.classList.remove('switching');
  }, 200);
}

/* ── Undo button ── */
document.getElementById('undo-btn').addEventListener('click', undo);

/* ── Export dropdown ── */
document.getElementById('export-btn').addEventListener('click', e => {
  e.stopPropagation();
  const dropdown = document.getElementById('export-dropdown');
  dropdown.classList.toggle('hidden');
});

document.querySelectorAll('.export-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const format = item.dataset.format;
    document.getElementById('export-dropdown').classList.add('hidden');

    if (format === 'png') {
      exportPNG();
      showToast('Exporting PNG…');
    } else if (format === 'css') {
      downloadText(serializePalette('css'), `palette-${Date.now()}.css`);
      showToast('CSS variables exported!');
    } else if (format === 'json') {
      downloadText(serializePalette('json'), `palette-${Date.now()}.json`);
      showToast('JSON exported!');
    }
  });
});

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('export-wrap').contains(e.target)) {
    document.getElementById('export-dropdown').classList.add('hidden');
  }
});

/* ── Palette container — lock, copy, swatch open panel ── */
document.getElementById('palette-container').addEventListener('click', function (e) {
  if (panelOpen) return;

  const lockBtn = e.target.closest('.lock-btn');
  if (lockBtn) {
    const idx = parseInt(lockBtn.dataset.index, 10);
    toggleLock(idx);
    return;
  }

  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const idx = parseInt(copyBtn.dataset.index, 10);
    copyToClipboard(appState.colors[idx], copyBtn);
    return;
  }

  // Click on swatch → open detail panel (not copy — copy is the button only)
  const swatch = e.target.closest('.color-swatch');
  if (swatch) {
    const box = swatch.closest('.color-box');
    const idx = parseInt(box.dataset.index, 10);
    openPanel(idx);
  }
});

function toggleLock(idx) {
  appState.locks[idx] = !appState.locks[idx];
  syncState();
  renderPalette({ lockAnim: idx });
  showToast(appState.locks[idx] ? 'Color locked 🔒' : 'Color unlocked');
}

/* ── Gradient CSS copy ── */
document.getElementById('copy-css-btn').addEventListener('click', () => {
  const text = document.getElementById('gradient-css-code').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-css-btn');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
    showToast('Gradient CSS copied!');
  }).catch(() => {});
});

/* ── Share ── */
document.getElementById('share-btn').addEventListener('click', () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url)
    .then(() => showToast('Share URL copied!'))
    .catch(() => {
      const el = document.createElement('input');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('Share URL copied!');
    });
});

/* ── Detail Panel events ── */

// Close button
document.getElementById('panel-close').addEventListener('click', closePanel);

// Click outside panel card
document.getElementById('panel-overlay').addEventListener('click', function (e) {
  if (e.target === this) closePanel();
});

// Copy value buttons inside panel
document.getElementById('detail-panel').addEventListener('click', function (e) {
  const copyBtn = e.target.closest('.pv-copy');
  if (!copyBtn) return;

  const field = copyBtn.dataset.field;
  if (field && activePanel) {
    const { r, g, b } = hexToRgb(activePanel.hex);
    const { h, s, l } = hexToHsl(activePanel.hex);
    const textMap = {
      hex: activePanel.hex.toUpperCase(),
      rgb: `rgb(${r}, ${g}, ${b})`,
      hsl: `hsl(${h}, ${s}%, ${l}%)`,
    };
    const text = textMap[field] || activePanel.hex;
    copyToClipboard(text, copyBtn);
    return;
  }

  // Complementary copy
  if (copyBtn.id === 'panel-comp-copy' && activePanel) {
    const { h, s, l } = hexToHsl(activePanel.hex);
    const compHex = hslToHex(norm(h + 180), s, l);
    copyToClipboard(compHex.toUpperCase(), copyBtn);
  }
});

// Shade swatch click → apply to palette slot
document.getElementById('panel-shades').addEventListener('click', function (e) {
  const swatch = e.target.closest('.shade-swatch');
  if (!swatch || !activePanel) return;
  const newHex = swatch.dataset.hex;
  appState.colors[activePanel.index] = newHex;
  activePanel.hex = newHex;
  syncState();
  renderPalette();
  renderGradient();
  renderPanel();
  showToast(`Applied ${newHex}`);
});

// HSL sliders — live update
['sl-h', 'sl-s', 'sl-l'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    // Update displayed value label immediately for responsiveness
    const label = document.getElementById(`${id}-val`);
    label.textContent = id === 'sl-h' ? `${this.value}°` : `${this.value}%`;
    applySliderChange();
  });
});

/* ─────────────────────────────────────────────────────────
   11.  KEYBOARD SHORTCUTS
   ───────────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (panelOpen) {
    if (e.code === 'Escape') closePanel();
    return;
  }

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  document.body.classList.add('kb-active');

  switch (e.code) {

    case 'Space':
      e.preventDefault();
      handleGenerate();
      break;

    case 'ArrowRight':
      e.preventDefault();
      kbFocusIdx = Math.min(kbFocusIdx + 1, 4);
      if (kbFocusIdx < 0) kbFocusIdx = 0;
      renderKbFocus();
      break;

    case 'ArrowLeft':
      e.preventDefault();
      if (kbFocusIdx <= 0) { kbFocusIdx = -1; renderKbFocus(); break; }
      kbFocusIdx = Math.max(kbFocusIdx - 1, 0);
      renderKbFocus();
      break;

    case 'Escape':
      kbFocusIdx = -1;
      renderKbFocus();
      break;

    case 'Enter':
      if (kbFocusIdx >= 0) {
        e.preventDefault();
        openPanel(kbFocusIdx);
      }
      break;

    case 'KeyL':
      if (kbFocusIdx >= 0) { e.preventDefault(); toggleLock(kbFocusIdx); }
      break;

    case 'KeyC':
      if (kbFocusIdx >= 0) {
        e.preventDefault();
        const boxes = document.querySelectorAll('.color-box');
        const btn   = boxes[kbFocusIdx] && boxes[kbFocusIdx].querySelector('.copy-btn');
        copyToClipboard(appState.colors[kbFocusIdx], btn);
      }
      break;

    case 'KeyZ':
      e.preventDefault();
      undo();
      break;

    case 'KeyD':
      e.preventDefault();
      toggleTheme();
      break;
  }
});

/* ─────────────────────────────────────────────────────────
   12.  DRAG & DROP
   ───────────────────────────────────────────────────────── */

let dragSrcIdx = null;

function attachDragListeners(box) {
  box.addEventListener('dragstart', onDragStart);
  box.addEventListener('dragend',   onDragEnd);
  box.addEventListener('dragover',  onDragOver);
  box.addEventListener('dragleave', onDragLeave);
  box.addEventListener('drop',      onDrop);
}

function onDragStart(e) {
  if (appState.viewMode === 'gradient') { e.preventDefault(); return; }
  dragSrcIdx = parseInt(this.dataset.index, 10);
  isDragging = true;
  document.body.classList.add('is-dragging');
  this.classList.add('drag-source');
  const ghost = document.createElement('div');
  ghost.style.cssText = `width:60px;height:60px;border-radius:8px;background:${appState.colors[dragSrcIdx]};position:fixed;top:-100px;left:-100px;box-shadow:0 4px 12px rgba(0,0,0,0.25);`;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 30, 30);
  setTimeout(() => document.body.removeChild(ghost), 0);
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
  isDragging = false; dragSrcIdx = null;
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.color-box').forEach(b => b.classList.remove('drag-source', 'drag-over'));
}

function onDragOver(e) {
  if (appState.viewMode === 'gradient') return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const targetIdx = parseInt(this.dataset.index, 10);
  if (targetIdx !== dragSrcIdx) {
    document.querySelectorAll('.color-box').forEach(b => b.classList.remove('drag-over'));
    this.classList.add('drag-over');
  }
}

function onDragLeave() { this.classList.remove('drag-over'); }

function onDrop(e) {
  if (appState.viewMode === 'gradient') return;
  e.preventDefault();
  const targetIdx = parseInt(this.dataset.index, 10);
  if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

  const newColors = [...appState.colors];
  const newLocks  = [...appState.locks];
  [newColors[dragSrcIdx], newColors[targetIdx]] = [newColors[targetIdx], newColors[dragSrcIdx]];
  [newLocks[dragSrcIdx],  newLocks[targetIdx]]  = [newLocks[targetIdx],  newLocks[dragSrcIdx]];
  appState.colors = newColors;
  appState.locks  = newLocks;

  syncState();
  renderPalette();
  renderGradient();
  showToast('Colors reordered');
}

/* ─────────────────────────────────────────────────────────
   13.  TOUCH GESTURES
   ───────────────────────────────────────────────────────── */

(function initTouchGestures() {
  const wrapper = document.getElementById('palette-wrapper');
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const SWIPE_THRESHOLD = 60, SWIPE_MAX_Y = 80, SWIPE_MAX_TIME = 400;

  const leftIndicator  = createSwipeIndicator('left',  '←');
  const rightIndicator = createSwipeIndicator('right', '→');
  wrapper.appendChild(leftIndicator);
  wrapper.appendChild(rightIndicator);

  function createSwipeIndicator(side, char) {
    const el = document.createElement('div');
    el.className = `swipe-indicator ${side}`;
    el.textContent = char;
    return el;
  }

  function flashIndicator(el) {
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 350);
  }

  wrapper.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  wrapper.addEventListener('touchend', e => {
    if (panelOpen) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_MAX_Y && dt < SWIPE_MAX_TIME) {
      flashIndicator(dx < 0 ? rightIndicator : leftIndicator);
      handleGenerate();
    }
  }, { passive: true });

  let holdTimer = null, holdTarget = null, holdMoved = false;

  wrapper.addEventListener('touchstart', e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    holdMoved = false; holdTarget = swatch;
    holdTimer = setTimeout(() => {
      if (!holdMoved && holdTarget) {
        const box = holdTarget.closest('.color-box');
        const idx = parseInt(box.dataset.index, 10);
        holdTarget.classList.add('tap-hold');
        setTimeout(() => holdTarget.classList.remove('tap-hold'), 300);
        toggleLock(idx);
      }
    }, 300);
  }, { passive: true });

  wrapper.addEventListener('touchmove', () => { holdMoved = true; clearTimeout(holdTimer); }, { passive: true });
  wrapper.addEventListener('touchend',  () => { clearTimeout(holdTimer); holdTarget = null; }, { passive: true });
})();

/* ─────────────────────────────────────────────────────────
   14.  UTILITIES
   ───────────────────────────────────────────────────────── */

function copyToClipboard(text, triggerEl) {
  const doSuccess = () => showCopySuccess(triggerEl, text);
  navigator.clipboard.writeText(text).then(doSuccess).catch(() => {
    try {
      const el = document.createElement('input');
      el.value = text; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el); doSuccess();
    } catch (_) {}
  });
}

function showCopySuccess(btn, text) {
  if (!btn) { showToast(`${text} copied!`); return; }
  const icon = btn.querySelector('i');
  if (icon) icon.className = 'fas fa-check';
  btn.style.color = '#22c55e';
  btn.classList.remove('copied'); void btn.offsetWidth; btn.classList.add('copied');
  setTimeout(() => {
    if (icon) icon.className = 'far fa-copy';
    btn.style.color = ''; btn.classList.remove('copied');
  }, 1500);
  showToast(`${text} copied!`);
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ─────────────────────────────────────────────────────────
   15.  INIT
   ───────────────────────────────────────────────────────── */

function attachAllDragListeners() {
  document.querySelectorAll('.color-box').forEach(attachDragListeners);
}

function showDndHintOnce() {
  const hint  = document.getElementById('dnd-hint');
  const seen  = localStorage.getItem('palette_dnd_hint_seen');
  const isTouch = 'ontouchstart' in window;
  if (!seen && !isTouch) {
    hint.classList.remove('hidden');
    localStorage.setItem('palette_dnd_hint_seen', '1');
    setTimeout(() => hint.classList.add('hidden'), 3100);
  }
}

function init() {
  loadState();
  render();
  syncState();
  attachAllDragListeners();
  renderUndoBtn();
  showDndHintOnce();
}

init();
