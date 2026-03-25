/**
 * PALETTE — Color Theory Generator
 * Tier 2 adds: Dark Mode · Drag & Drop · Full Keyboard Nav
 *              Touch Gestures · Micro-animations
 *
 * Architecture carried forward:
 *   appState  — single source of truth
 *   syncState — localStorage + URL after every mutation
 *   render    — pure read from appState → DOM
 *
 * New state fields:
 *   theme: 'light' | 'dark'
 *
 * New coordination flags (not persisted):
 *   panelOpen  — gates keyboard shortcuts when a modal is open (Tier 3 ready)
 *   isDragging — suppresses hover-lift during drag
 */

'use strict';

/* ─────────────────────────────────────────────────────────
   1.  APP STATE
   ───────────────────────────────────────────────────────── */

const DEFAULT_STATE = {
  colors:  ['#E1F5FE', '#B3E5FC', '#81D4FA', '#4FC3F7', '#29B6F6'],
  locks:   [false, false, false, false, false],
  harmony: 'analogous',
  viewMode: 'solid',
  a11yOn:  false,
  theme:   'light',   // NEW — Tier 2
};

let appState = deepClone(DEFAULT_STATE);

// Runtime-only flags — never persisted
let panelOpen  = false;   // Tier 3 hook: set true when detail panel is open
let isDragging = false;
let kbFocusIdx = -1;      // which card has keyboard focus (-1 = none)

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ─────────────────────────────────────────────────────────
   2.  HSL COLOR ENGINE  (unchanged from Tier 1)
   ───────────────────────────────────────────────────────── */

function generateHarmoniousColors() {
  const baseHue  = Math.floor(Math.random() * 360);
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

function norm(h)        { return ((h % 360) + 360) % 360; }
function satRand()      { return randBetween(45, 85); }
function ligHigh()      { return randBetween(72, 88); }
function ligMid()       { return randBetween(48, 68); }
function ligLow()       { return randBetween(28, 48); }
function ligRand()      { return [ligHigh, ligMid, ligLow][Math.floor(Math.random() * 3)](); }
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
   3.  WCAG ENGINE  (unchanged from Tier 1)
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
  const best = Math.max(vsWhite, vsBlack);
  const level = best >= 7 ? 'AAA' : best >= 4.5 ? 'AA' : best >= 3 ? 'AA_large' : 'fail';
  return { ratio: best.toFixed(2), level, vsWhite: vsWhite.toFixed(2), vsBlack: vsBlack.toFixed(2) };
}

/* ─────────────────────────────────────────────────────────
   4.  STATE PERSISTENCE  (extended with theme)
   ───────────────────────────────────────────────────────── */

const STORAGE_KEY = 'palette_app_state';

function syncState() {
  // localStorage
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } catch (e) {}

  // URL
  const colors = appState.colors.map(c => c.replace('#', '')).join('-');
  const locks  = appState.locks.map(l => l ? '1' : '0').join('');
  const params = new URLSearchParams({
    colors, locks,
    mode:  appState.harmony,
    view:  appState.viewMode,
    a11y:  appState.a11yOn ? '1' : '0',
    theme: appState.theme,         // NEW
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

    // Theme from URL
    const themeParam = params.get('theme');
    if (['light','dark'].includes(themeParam)) appState.theme = themeParam;
    return;
  }

  // localStorage fallback
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
  // Defaults remain
}

/* ─────────────────────────────────────────────────────────
   5.  RENDER
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

/* ── 5a. Theme ── */
function renderTheme() {
  document.documentElement.dataset.theme = appState.theme;
  const icon = document.getElementById('theme-icon');
  icon.className = appState.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/* ── 5b. Solid palette ── */
function renderPalette(opts = {}) {
  const container = document.getElementById('palette-container');
  const isFirstRender = container.children.length !== 5;

  if (isFirstRender) {
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const box = createColorBox(i);
      box.style.setProperty('--i', i);  // stagger delay
      container.appendChild(box);
    }
  }

  appState.colors.forEach((hex, i) => {
    const box      = container.children[i];
    const swatch   = box.querySelector('.color-swatch');
    const hexEl    = box.querySelector('.hex-value');
    const lockBtn  = box.querySelector('.lock-btn');

    // Suppress entrance animation on updates (not first load)
    if (!isFirstRender) box.classList.add('no-animate');

    swatch.style.backgroundColor = hex;
    hexEl.textContent = hex.toUpperCase();

    box.classList.toggle('locked', appState.locks[i]);
    lockBtn.querySelector('i').className = appState.locks[i] ? 'fas fa-lock' : 'fas fa-unlock';

    // Lock animation on state change
    if (opts.lockAnim === i) {
      box.classList.remove('lock-anim');
      void box.offsetWidth; // reflow to restart animation
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
  box.setAttribute('tabindex', '-1');  // focusable but not in tab order (keyboard nav uses arrow keys)

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

/* ── 5c. Gradient ── */
function renderGradient() {
  const preview  = document.getElementById('gradient-preview');
  const stopsEl  = document.getElementById('gradient-stops');
  const cssCode  = document.getElementById('gradient-css-code');
  const hexList  = appState.colors.join(', ');
  const css      = `linear-gradient(90deg, ${hexList})`;

  preview.style.background = css;
  stopsEl.innerHTML = appState.colors.map(hex => `
    <div class="gradient-stop-item">
      <div class="gradient-stop-swatch" style="background:${hex}"></div>
      <span class="gradient-stop-label">${hex.toUpperCase()}</span>
    </div>
  `).join('');
  cssCode.textContent = `background: ${css};`;
}

/* ── 5d. Harmony pills ── */
function renderHarmonyPills() {
  document.querySelectorAll('.pill').forEach(p =>
    p.classList.toggle('active', p.dataset.harmony === appState.harmony)
  );
}

/* ── 5e. View mode ── */
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

/* ── 5f. A11y toggle ── */
function renderA11yToggle() {
  document.getElementById('a11y-toggle').checked = appState.a11yOn;
}

/* ── 5g. Keyboard focus ring ── */
function renderKbFocus() {
  const boxes = document.querySelectorAll('.color-box');
  boxes.forEach((box, i) => {
    box.classList.toggle('kb-focused', i === kbFocusIdx);
  });
}

/* ─────────────────────────────────────────────────────────
   6.  EVENT HANDLERS
   ───────────────────────────────────────────────────────── */

/* ── Generate ── */
document.getElementById('generate-btn').addEventListener('click', handleGenerate);

function handleGenerate() {
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
  const btn  = document.getElementById('theme-btn');
  const icon = document.getElementById('theme-icon');

  // Quick fade-rotate swap
  btn.classList.add('switching');
  setTimeout(() => {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    syncState();
    renderTheme();
    btn.classList.remove('switching');
  }, 200);

  showToast(appState.theme === 'dark' ? 'Switching to light mode' : 'Switching to dark mode');
}

/* ── Palette container: lock, copy, swatch-click ── */
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

  const swatch = e.target.closest('.color-swatch');
  if (swatch) {
    const box = swatch.closest('.color-box');
    const idx = parseInt(box.dataset.index, 10);
    copyToClipboard(appState.colors[idx], box.querySelector('.copy-btn'));
  }
});

function toggleLock(idx) {
  appState.locks[idx] = !appState.locks[idx];
  syncState();
  renderPalette({ lockAnim: idx });
  showToast(appState.locks[idx] ? 'Color locked 🔒' : 'Color unlocked');
}

/* ── Copy gradient CSS ── */
document.getElementById('copy-css-btn').addEventListener('click', () => {
  const text = document.getElementById('gradient-css-code').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-css-btn');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
    showToast('Gradient CSS copied!');
  }).catch(() => {});
});

/* ── Share button ── */
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

/* ─────────────────────────────────────────────────────────
   7.  KEYBOARD SHORTCUTS  (Full — Tier 2 Upgrade 7)
   ───────────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  // Always respect panelOpen flag (Tier 3 readiness)
  if (panelOpen) {
    if (e.code === 'Escape') {
      panelOpen = false; // Tier 3 will override this with its own close fn
    }
    return;
  }

  // Don't fire if user is typing
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Reveal legend on first keypress
  document.body.classList.add('kb-active');

  const boxes = document.querySelectorAll('.color-box');

  switch (e.code) {

    case 'Space':
      e.preventDefault();
      handleGenerate();
      break;

    case 'ArrowRight':
      e.preventDefault();
      kbFocusIdx = Math.min(kbFocusIdx + 1, 4);
      if (kbFocusIdx === -1) kbFocusIdx = 0;
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

    case 'KeyL':
      if (kbFocusIdx >= 0) {
        e.preventDefault();
        toggleLock(kbFocusIdx);
      }
      break;

    case 'KeyC':
      if (kbFocusIdx >= 0) {
        e.preventDefault();
        const btn = boxes[kbFocusIdx] && boxes[kbFocusIdx].querySelector('.copy-btn');
        copyToClipboard(appState.colors[kbFocusIdx], btn);
      }
      break;

    case 'KeyD':
      e.preventDefault();
      toggleTheme();
      break;
  }
});

/* ─────────────────────────────────────────────────────────
   8.  DRAG & DROP REORDERING  (Tier 2 Upgrade 8)
   ───────────────────────────────────────────────────────── */

let dragSrcIdx = null;

/**
 * Attach DnD listeners to a color-box element.
 * Called once per box on creation; no re-attachment needed because
 * we reuse the same DOM nodes and update them in-place.
 */
function attachDragListeners(box) {
  box.addEventListener('dragstart', onDragStart);
  box.addEventListener('dragend',   onDragEnd);
  box.addEventListener('dragover',  onDragOver);
  box.addEventListener('dragleave', onDragLeave);
  box.addEventListener('drop',      onDrop);
}

function onDragStart(e) {
  // Disable drag in gradient mode
  if (appState.viewMode === 'gradient') { e.preventDefault(); return; }

  dragSrcIdx = parseInt(this.dataset.index, 10);
  isDragging = true;
  document.body.classList.add('is-dragging');

  this.classList.add('drag-source');

  // Ghost image: use the swatch color as a small square
  const ghost = document.createElement('div');
  ghost.style.cssText = `
    width:60px; height:60px; border-radius:8px;
    background:${appState.colors[dragSrcIdx]};
    position:fixed; top:-100px; left:-100px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  `;
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 30, 30);
  setTimeout(() => document.body.removeChild(ghost), 0);

  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
  isDragging = false;
  dragSrcIdx = null;
  document.body.classList.remove('is-dragging');
  document.querySelectorAll('.color-box').forEach(b => {
    b.classList.remove('drag-source', 'drag-over');
  });
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

function onDragLeave() {
  this.classList.remove('drag-over');
}

function onDrop(e) {
  if (appState.viewMode === 'gradient') return;
  e.preventDefault();
  const targetIdx = parseInt(this.dataset.index, 10);
  if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

  // Reorder colors and locks arrays
  const newColors = [...appState.colors];
  const newLocks  = [...appState.locks];

  // Swap
  [newColors[dragSrcIdx], newColors[targetIdx]] = [newColors[targetIdx], newColors[dragSrcIdx]];
  [newLocks[dragSrcIdx],  newLocks[targetIdx]]  = [newLocks[targetIdx],  newLocks[dragSrcIdx]];

  appState.colors = newColors;
  appState.locks  = newLocks;

  syncState();   // ← writes URL + localStorage with new order
  renderPalette();
  renderGradient();

  showToast('Colors reordered');
}

/* ─────────────────────────────────────────────────────────
   9.  TOUCH GESTURES  (Tier 2 Upgrade 9)
   ───────────────────────────────────────────────────────── */

(function initTouchGestures() {
  const wrapper = document.getElementById('palette-wrapper');

  // ── Swipe on palette-wrapper to generate ──
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const SWIPE_THRESHOLD = 60;   // px horizontal distance
  const SWIPE_MAX_Y     = 80;   // max vertical drift (so vertical scroll isn't caught)
  const SWIPE_MAX_TIME  = 400;  // ms

  // Swipe indicator elements (created once)
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
    touchStartX    = e.touches[0].clientX;
    touchStartY    = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  wrapper.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;

    const isHorizontalSwipe =
      Math.abs(dx) > SWIPE_THRESHOLD &&
      Math.abs(dy) < SWIPE_MAX_Y &&
      dt < SWIPE_MAX_TIME;

    if (isHorizontalSwipe) {
      flashIndicator(dx < 0 ? rightIndicator : leftIndicator);
      handleGenerate();
    }
  }, { passive: true });

  // ── Tap-hold on a swatch to toggle lock ──
  // Timer: < 300ms movement → regular tap, ≥ 300ms held without move → lock
  let holdTimer   = null;
  let holdTarget  = null;
  let holdMoved   = false;

  wrapper.addEventListener('touchstart', e => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch) return;
    holdMoved  = false;
    holdTarget = swatch;

    holdTimer = setTimeout(() => {
      if (!holdMoved && holdTarget) {
        const box = holdTarget.closest('.color-box');
        const idx = parseInt(box.dataset.index, 10);
        // Visual feedback before locking
        holdTarget.classList.add('tap-hold');
        setTimeout(() => holdTarget.classList.remove('tap-hold'), 300);
        toggleLock(idx);
      }
    }, 300);
  }, { passive: true });

  wrapper.addEventListener('touchmove', () => {
    holdMoved = true;
    clearTimeout(holdTimer);
  }, { passive: true });

  wrapper.addEventListener('touchend', () => {
    clearTimeout(holdTimer);
    holdTarget = null;
  }, { passive: true });
})();

/* ─────────────────────────────────────────────────────────
   10.  UTILITIES
   ───────────────────────────────────────────────────────── */

function copyToClipboard(text, triggerEl) {
  const doSuccess = () => showCopySuccess(triggerEl, text);
  navigator.clipboard.writeText(text).then(doSuccess).catch(() => {
    try {
      const el = document.createElement('input');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      doSuccess();
    } catch (_) {}
  });
}

function showCopySuccess(btn, text) {
  if (!btn) { showToast(`${text} copied!`); return; }
  const icon = btn.querySelector('i');
  if (icon) icon.className = 'fas fa-check';
  btn.style.color = '#22c55e';

  // Ripple animation
  btn.classList.remove('copied');
  void btn.offsetWidth;
  btn.classList.add('copied');

  setTimeout(() => {
    if (icon) icon.className = 'far fa-copy';
    btn.style.color = '';
    btn.classList.remove('copied');
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
   11.  POST-RENDER SETUP: attach DnD + DnD hint
   ───────────────────────────────────────────────────────── */

/**
 * After the palette-container's boxes are created, attach drag listeners.
 * We patch renderPalette to call this after first render.
 */
function attachAllDragListeners() {
  document.querySelectorAll('.color-box').forEach(attachDragListeners);
}

// Show DnD hint once on first load (desktop only)
function showDndHintOnce() {
  const hint    = document.getElementById('dnd-hint');
  const seen    = localStorage.getItem('palette_dnd_hint_seen');
  const isTouch = 'ontouchstart' in window;
  if (!seen && !isTouch) {
    hint.classList.remove('hidden');
    localStorage.setItem('palette_dnd_hint_seen', '1');
    // Auto-hide after animation completes (3s)
    setTimeout(() => hint.classList.add('hidden'), 3100);
  }
}

/* ─────────────────────────────────────────────────────────
   12.  INIT
   ───────────────────────────────────────────────────────── */

function init() {
  loadState();
  render();
  syncState();
  attachAllDragListeners();
  showDndHintOnce();
}

init();
