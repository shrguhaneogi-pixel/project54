/**
 * PALETTE — Color Theory Generator
 * Tier 1: HSL Engine · URL State · WCAG A11y · Gradient Mode · localStorage
 *
 * Architecture:
 *   appState  — single source of truth
 *   syncState — persists state to localStorage + URL after every mutation
 *   render    — reads appState and updates the DOM (no DOM-writes elsewhere)
 */

'use strict';

/* ─────────────────────────────────────────────────────────
   1.  APP STATE
   ───────────────────────────────────────────────────────── */

const DEFAULT_STATE = {
  colors: ['#E1F5FE', '#B3E5FC', '#81D4FA', '#4FC3F7', '#29B6F6'],
  locks:  [false, false, false, false, false],
  harmony: 'analogous',
  viewMode: 'solid',     // 'solid' | 'gradient'
  a11yOn: false,
};

let appState = deepClone(DEFAULT_STATE);

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ─────────────────────────────────────────────────────────
   2.  HSL COLOR ENGINE
   ───────────────────────────────────────────────────────── */

/**
 * Generate 5 harmonious colors in HEX using the chosen harmony mode.
 * Only regenerates unlocked slots; locked slots keep their current color.
 */
function generateHarmoniousColors() {
  const baseHue = Math.floor(Math.random() * 360);
  const harmony = appState.harmony;
  const newColors = buildHarmony(baseHue, harmony);

  appState.colors = appState.colors.map((existing, i) =>
    appState.locks[i] ? existing : newColors[i]
  );
}

/**
 * Returns 5 HEX colors for a given base hue and harmony mode.
 */
function buildHarmony(h, mode) {
  switch (mode) {
    case 'analogous':
      return [
        hslToHex(h,        satRand(), ligRand()),
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
      const t1 = norm(h + 120);
      const t2 = norm(h + 240);
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
        hslToHex(h, satFixed(85), 25),
        hslToHex(h, satFixed(75), 40),
        hslToHex(h, satFixed(65), 55),
        hslToHex(h, satFixed(55), 70),
        hslToHex(h, satFixed(40), 85),
      ];

    case 'split': {
      const s1 = norm(h + 150);
      const s2 = norm(h + 210);
      return [
        hslToHex(h,  satRand(), ligMid()),
        hslToHex(h,  satRand(), ligHigh()),
        hslToHex(s1, satRand(), ligMid()),
        hslToHex(s2, satRand(), ligMid()),
        hslToHex(s2, satRand(), ligHigh()),
      ];
    }

    default:
      return buildHarmony(h, 'analogous');
  }
}

/* Helpers */
function norm(h) { return ((h % 360) + 360) % 360; }
function satRand()    { return randBetween(45, 85); }
function satFixed(s)  { return s; }
function ligHigh()    { return randBetween(72, 88); }
function ligMid()     { return randBetween(48, 68); }
function ligLow()     { return randBetween(28, 48); }
function ligRand()    {
  const options = [ligHigh, ligMid, ligLow];
  return options[Math.floor(Math.random() * options.length)]();
}
function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * HSL → HEX conversion
 * h: 0–360, s: 0–100, l: 0–100
 */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/**
 * HEX → { h, s, l }
 */
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
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

/**
 * HEX → { r, g, b }
 */
function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/* ─────────────────────────────────────────────────────────
   3.  WCAG ACCESSIBILITY ENGINE
   ───────────────────────────────────────────────────────── */

/**
 * Returns relative luminance of an sRGB colour (WCAG 2.1 formula)
 */
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Returns contrast ratio between two HEX colors (1:1 → 21:1)
 */
function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminance(hex1);
  const L2 = relativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker  = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns WCAG rating: 'AAA' | 'AA' | 'AA_large' | 'fail'
 * Tested against both white (#FFFFFF) and black (#000000);
 * returns the better pairing's rating.
 */
function wcagRating(hex) {
  const vsWhite = contrastRatio(hex, '#FFFFFF');
  const vsBlack = contrastRatio(hex, '#000000');
  const best = Math.max(vsWhite, vsBlack);
  const against = vsWhite > vsBlack ? '#FFFFFF' : '#000000';

  let level = 'fail';
  if (best >= 7)   level = 'AAA';
  else if (best >= 4.5) level = 'AA';
  else if (best >= 3)   level = 'AA_large';

  return {
    ratio: best.toFixed(2),
    level,
    against,
    vsWhite: vsWhite.toFixed(2),
    vsBlack: vsBlack.toFixed(2),
  };
}

/* ─────────────────────────────────────────────────────────
   4.  STATE PERSISTENCE — localStorage + URL
   ───────────────────────────────────────────────────────── */

const STORAGE_KEY = 'palette_app_state';

/**
 * Writes current appState to localStorage AND updates the URL.
 * Called after EVERY state mutation.
 */
function syncState() {
  // ── localStorage ──
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) { /* storage blocked */ }

  // ── URL ──
  const colors = appState.colors.map(c => c.replace('#', '')).join('-');
  const locks  = appState.locks.map(l => l ? '1' : '0').join('');
  const params = new URLSearchParams({
    colors,
    locks,
    mode:    appState.harmony,
    view:    appState.viewMode,
    a11y:    appState.a11yOn ? '1' : '0',
  });
  history.replaceState(null, '', `?${params.toString()}`);
}

/**
 * Loads state from URL params first, then localStorage fallback, then defaults.
 */
function loadState() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('colors')) {
    // URL has explicit palette — parse it
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
    return;
  }

  // Fallback: localStorage
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate minimally
      if (Array.isArray(parsed.colors) && parsed.colors.length === 5) {
        appState = { ...DEFAULT_STATE, ...parsed };
        return;
      }
    }
  } catch (e) { /* corrupt storage */ }

  // Final fallback: defaults (already set)
}

/* ─────────────────────────────────────────────────────────
   5.  RENDER — DOM updates from appState
   ───────────────────────────────────────────────────────── */

function render() {
  renderPalette();
  renderGradient();
  renderHarmonyPills();
  renderViewMode();
  renderA11yToggle();
}

/* ── 5a. Solid palette ── */
function renderPalette() {
  const container = document.getElementById('palette-container');

  // Build boxes if they don't exist yet (first render)
  if (container.children.length !== 5) {
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      container.appendChild(createColorBox(i));
    }
  }

  // Update each box
  appState.colors.forEach((hex, i) => {
    const box   = container.children[i];
    const swatch = box.querySelector('.color-swatch');
    const hexEl  = box.querySelector('.hex-value');
    const lockBtn = box.querySelector('.lock-btn');
    const wcagBadge = box.querySelector('.wcag-badge');
    const contrastRow = box.querySelector('.contrast-row');

    swatch.style.backgroundColor = hex;
    hexEl.textContent = hex.toUpperCase();

    // Lock state
    box.classList.toggle('locked', appState.locks[i]);
    const lockIcon = lockBtn.querySelector('i');
    lockIcon.className = appState.locks[i] ? 'fas fa-lock' : 'fas fa-unlock';

    // WCAG
    const a11y = wcagRating(hex);
    updateWcagDisplay(box, a11y);
  });
}

function createColorBox(index) {
  const box = document.createElement('div');
  box.className = 'color-box';
  box.dataset.index = index;

  box.innerHTML = `
    <div class="color-swatch">
      <button class="lock-btn" title="Lock color" data-index="${index}">
        <i class="fas fa-unlock"></i>
      </button>
      <div class="wcag-badge"></div>
    </div>
    <div class="color-info">
      <div class="color-info-row">
        <span class="hex-value"></span>
        <button class="copy-btn" title="Copy hex" data-index="${index}">
          <i class="far fa-copy"></i>
        </button>
      </div>
      <div class="contrast-row">
        <span class="contrast-ratio"></span>
        <div class="contrast-chips"></div>
      </div>
    </div>
  `;

  return box;
}

function updateWcagDisplay(box, a11y) {
  const wcagBadge   = box.querySelector('.wcag-badge');
  const contrastRow = box.querySelector('.contrast-row');
  const ratioEl     = box.querySelector('.contrast-ratio');
  const chipsEl     = box.querySelector('.contrast-chips');

  if (appState.a11yOn) {
    // Swatch badge
    wcagBadge.classList.add('show');
    wcagBadge.className = 'wcag-badge show ' + (
      a11y.level === 'AAA' ? 'aaa' :
      a11y.level === 'AA'  ? 'aa'  : 'fail'
    );
    wcagBadge.textContent = a11y.level === 'AA_large' ? 'AA*' : a11y.level;

    // Contrast info row
    contrastRow.classList.add('show');
    ratioEl.textContent = `${a11y.ratio}:1`;

    // Chips: show vs white and vs black
    const wRatio = parseFloat(a11y.vsWhite);
    const bRatio = parseFloat(a11y.vsBlack);

    chipsEl.innerHTML = `
      <span class="chip ${chipClass(wRatio)}" title="vs white">${wRatio >= 4.5 ? '✓' : '✗'} W</span>
      <span class="chip ${chipClass(bRatio)}" title="vs black">${bRatio >= 4.5 ? '✓' : '✗'} B</span>
    `;
  } else {
    wcagBadge.classList.remove('show');
    contrastRow.classList.remove('show');
  }
}

function chipClass(ratio) {
  if (ratio >= 7)   return 'pass-aaa';
  if (ratio >= 4.5) return 'pass-aa';
  return 'fail';
}

/* ── 5b. Gradient view ── */
function renderGradient() {
  const preview   = document.getElementById('gradient-preview');
  const stopsEl   = document.getElementById('gradient-stops');
  const cssCode   = document.getElementById('gradient-css-code');

  const hexList = appState.colors.join(', ');
  const gradientCSS = `linear-gradient(90deg, ${hexList})`;

  preview.style.background = gradientCSS;

  // Stop swatches
  stopsEl.innerHTML = appState.colors.map(hex => `
    <div class="gradient-stop-item">
      <div class="gradient-stop-swatch" style="background:${hex}"></div>
      <span class="gradient-stop-label">${hex.toUpperCase()}</span>
    </div>
  `).join('');

  cssCode.textContent = `background: ${gradientCSS};`;
}

/* ── 5c. Harmony pills ── */
function renderHarmonyPills() {
  document.querySelectorAll('.pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.harmony === appState.harmony);
  });
}

/* ── 5d. View mode (solid/gradient) ── */
function renderViewMode() {
  const solidContainer    = document.getElementById('palette-container');
  const gradientContainer = document.getElementById('gradient-container');
  const btnSolid          = document.getElementById('mode-solid');
  const btnGradient       = document.getElementById('mode-gradient');

  const isSolid = appState.viewMode === 'solid';
  solidContainer.classList.toggle('hidden', !isSolid);
  gradientContainer.classList.toggle('hidden', isSolid);

  btnSolid.classList.toggle('active', isSolid);
  btnGradient.classList.toggle('active', !isSolid);
}

/* ── 5e. A11y toggle ── */
function renderA11yToggle() {
  document.getElementById('a11y-toggle').checked = appState.a11yOn;
}

/* ─────────────────────────────────────────────────────────
   6.  EVENT HANDLERS
   ───────────────────────────────────────────────────────── */

/* ── Generate button ── */
document.getElementById('generate-btn').addEventListener('click', handleGenerate);

function handleGenerate() {
  generateHarmoniousColors();
  syncState();
  render();
  animateGenerateBtn();
}

function animateGenerateBtn() {
  const btn = document.getElementById('generate-btn');
  btn.classList.add('spinning');
  btn.addEventListener('transitionend', () => btn.classList.remove('spinning'), { once: true });
}

/* ── Harmony pill clicks ── */
document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => {
    appState.harmony = pill.dataset.harmony;
    syncState();
    renderHarmonyPills();
    // Auto-generate on harmony change (non-locked slots get new colors)
    handleGenerate();
  });
});

/* ── View mode toggle (Solid / Gradient) ── */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    appState.viewMode = btn.dataset.mode;
    syncState();
    renderViewMode();
    // Render gradient when switching to it
    if (appState.viewMode === 'gradient') renderGradient();
  });
});

/* ── A11y toggle ── */
document.getElementById('a11y-toggle').addEventListener('change', function () {
  appState.a11yOn = this.checked;
  syncState();
  renderPalette(); // Re-render badges
});

/* ── Lock / Copy — event delegation on palette container ── */
document.getElementById('palette-container').addEventListener('click', function (e) {
  // Lock button
  const lockBtn = e.target.closest('.lock-btn');
  if (lockBtn) {
    const idx = parseInt(lockBtn.dataset.index, 10);
    appState.locks[idx] = !appState.locks[idx];
    syncState();
    renderPalette();
    showToast(appState.locks[idx] ? 'Color locked 🔒' : 'Color unlocked');
    return;
  }

  // Copy button
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const idx = parseInt(copyBtn.dataset.index, 10);
    copyToClipboard(appState.colors[idx], copyBtn);
    return;
  }

  // Click on swatch → copy hex
  const swatch = e.target.closest('.color-swatch');
  if (swatch) {
    const box = swatch.closest('.color-box');
    const idx = parseInt(box.dataset.index, 10);
    const copyBtn = box.querySelector('.copy-btn');
    copyToClipboard(appState.colors[idx], copyBtn);
  }
});

/* ── Copy gradient CSS ── */
document.getElementById('copy-css-btn').addEventListener('click', () => {
  const cssText = document.getElementById('gradient-css-code').textContent;
  navigator.clipboard.writeText(cssText)
    .then(() => {
      const btn = document.getElementById('copy-css-btn');
      btn.innerHTML = '<i class="fas fa-check"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
      showToast('Gradient CSS copied!');
    })
    .catch(() => {});
});

/* ── Share button: copy URL ── */
document.getElementById('share-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href)
    .then(() => showToast('Share URL copied to clipboard!'))
    .catch(() => {
      // Fallback for browsers without clipboard API in non-HTTPS
      const el = document.createElement('input');
      el.value = window.location.href;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('Share URL copied to clipboard!');
    });
});

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', e => {
  // Ignore if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.code === 'Space') {
    e.preventDefault();
    handleGenerate();
  }
});

/* ─────────────────────────────────────────────────────────
   7.  UTILITIES
   ───────────────────────────────────────────────────────── */

function copyToClipboard(text, triggerEl) {
  navigator.clipboard.writeText(text)
    .then(() => showCopySuccess(triggerEl, text))
    .catch(() => {
      // Fallback
      const el = document.createElement('input');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showCopySuccess(triggerEl, text);
    });
}

function showCopySuccess(btn, text) {
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (!icon) return;
  icon.className = 'fas fa-check';
  btn.style.color = '#22c55e';
  setTimeout(() => {
    icon.className = 'far fa-copy';
    btn.style.color = '';
  }, 1500);
  showToast(`${text} copied!`);
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ─────────────────────────────────────────────────────────
   8.  INIT
   ───────────────────────────────────────────────────────── */

function init() {
  loadState();
  render();
  syncState(); // Write canonical state back (e.g. after URL parse)
}

init();
