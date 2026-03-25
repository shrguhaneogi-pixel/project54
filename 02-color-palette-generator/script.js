/**
 * PALETTE — Color Theory Generator  (Complete — All 4 Tiers)
 * Tier 4 adds: Image-to-Palette Extraction · Design System Generator
 *              Explore Mode · Favorites Shelf
 *
 * Architecture:
 *   appState      — single source of truth (colors, locks, harmony, viewMode, a11yOn, theme)
 *   syncState     — localStorage + URL after every mutation
 *   render        — pure read from appState → DOM
 *   panelOpen     — runtime flag, gates keyboard shortcuts
 *   historyStack  — session-scoped undo stack
 *   favorites     — saved palettes, persisted to localStorage separately
 *   fromImage     — runtime flag, true when palette came from image extraction
 *   exploreMode   — runtime flag, shows favorites shelf
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

// Runtime-only flags — never persisted to URL/localStorage
let panelOpen   = false;
let isDragging  = false;
let kbFocusIdx  = -1;
let activePanel = null;
let historyStack = [];
const HISTORY_MAX = 20;

// Tier 4 runtime flags
let fromImage   = false;   // true when palette came from image extraction
let exploreMode = false;   // true when favorites shelf is visible

// Favorites — persisted separately in localStorage
const FAV_KEY     = 'palette_favorites';
const FAV_MAX     = 24;
let favorites     = loadFavorites();

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
  fromImage = false; // clear image mode on new generation
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
   4.  AI COLOR NAMING
   ───────────────────────────────────────────────────────── */

const COLOR_NAMES = {
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

function hueFamily(h) {
  if (h < 15  || h >= 345) return 'red';
  if (h < 45)  return 'orange';
  if (h < 70)  return 'yellow';
  if (h < 85)  return 'lime';
  if (h < 165) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 285) return 'purple';
  return 'pink';
}

function colorName(hex) {
  const { h, s, l } = hexToHsl(hex);
  const family = hueFamily(h);
  const [adjs, nouns] = COLOR_NAMES[family];
  const hash = hex.slice(1).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  let adjIdx;
  if (l >= 75)      adjIdx = (hash % 3) + 4;
  else if (l <= 35) adjIdx = hash % 3;
  else              adjIdx = (hash % 5) + 1;
  const nounIdx = (hash * 3) % nouns.length;
  return `${adjs[adjIdx % adjs.length]} ${nouns[nounIdx % nouns.length]}`;
}

/* ─────────────────────────────────────────────────────────
   5.  IMAGE-TO-PALETTE EXTRACTION  (Upgrade 15)
   ───────────────────────────────────────────────────────── */

/**
 * Extracts 5 dominant colors from an image file using canvas pixel sampling.
 * Strategy: divide image into a grid, sample average color per cell,
 * then deduplicate similar colors to get 5 visually distinct results.
 */
function extractColorsFromImage(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById('extract-canvas');
      // Sample at a manageable resolution
      const maxDim = 200;
      const scale  = Math.min(maxDim / img.width, maxDim / img.height, 1);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const dominant  = sampleDominantColors(imageData, canvas.width, canvas.height, 5);

      if (dominant.length < 5) {
        showToast('Could not extract enough colors from this image.');
        return;
      }

      // Push history before replacing palette
      pushHistory();

      // Apply extracted colors — bypasses harmony engine
      appState.colors = dominant;
      appState.locks  = [false, false, false, false, false];
      fromImage       = true;

      syncState();
      render();
      renderImageSourceBar();
      showToast('Palette extracted from image!');
    };
    img.onerror = () => showToast('Could not load image. Try another file.');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Samples dominant colors from raw RGBA pixel data.
 * Divides image into a grid of cells, averages each cell's color,
 * then removes near-duplicates using Euclidean RGB distance.
 */
function sampleDominantColors(data, width, height, count) {
  const GRID = 8; // 8×8 = 64 cells
  const cells = [];
  const cellW = width  / GRID;
  const cellH = height / GRID;

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      let rSum = 0, gSum = 0, bSum = 0, n = 0;
      const x0 = Math.round(col * cellW);
      const y0 = Math.round(row * cellH);
      const x1 = Math.round(x0 + cellW);
      const y1 = Math.round(y0 + cellH);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          // Skip near-transparent pixels
          if (data[idx + 3] < 128) continue;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          n++;
        }
      }

      if (n > 0) {
        cells.push({
          r: Math.round(rSum / n),
          g: Math.round(gSum / n),
          b: Math.round(bSum / n),
        });
      }
    }
  }

  // Sort cells by perceived brightness variance (prefer colorful over gray)
  cells.sort((a, b) => colorfulness(b) - colorfulness(a));

  // Deduplicate: keep cells that are sufficiently different from already-picked ones
  const DISTANCE_THRESHOLD = 60; // Euclidean RGB distance
  const picked = [];

  for (const cell of cells) {
    if (picked.length >= count) break;
    const tooClose = picked.some(p => rgbDistance(cell, p) < DISTANCE_THRESHOLD);
    if (!tooClose) picked.push(cell);
  }

  // Pad with less-distinct colors if we didn't get enough
  if (picked.length < count) {
    for (const cell of cells) {
      if (picked.length >= count) break;
      const tooClose = picked.some(p => rgbDistance(cell, p) < DISTANCE_THRESHOLD / 2);
      if (!tooClose) picked.push(cell);
    }
  }

  return picked.slice(0, count).map(({ r, g, b }) =>
    `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase()
  );
}

function rgbDistance(a, b) {
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
}

function colorfulness({ r, g, b }) {
  // Max - min of RGB channels — high = colorful, low = gray
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function renderImageSourceBar() {
  const bar = document.getElementById('image-source-bar');
  const ctrlBar = document.getElementById('controls-bar');
  const imgBtn  = document.getElementById('image-btn');
  if (fromImage) {
    bar.classList.remove('hidden');
    ctrlBar.classList.add('image-mode');
    imgBtn.classList.add('image-active');
  } else {
    bar.classList.add('hidden');
    ctrlBar.classList.remove('image-mode');
    imgBtn.classList.remove('image-active');
  }
}

/* ─────────────────────────────────────────────────────────
   6.  DESIGN SYSTEM GENERATOR  (Upgrade 17)
   Extends serializePalette() from Tier 3 with 'tailwind' format.
   ───────────────────────────────────────────────────────── */

/**
 * Central serializer — shared by Export System and Design System Generator.
 * format: 'png' | 'css' | 'json' | 'tailwind'
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
        source: fromImage ? 'image' : 'generated',
        colors: colors.map((hex, i) => {
          const { r, g, b } = hexToRgb(hex);
          const { h, s, l } = hexToHsl(hex);
          const wcag = wcagRating(hex);
          return {
            index: i, name: names[i], hex,
            rgb: { r, g, b }, hsl: { h, s, l },
            locked: appState.locks[i],
            wcag: { ratio: wcag.ratio, level: wcag.level },
          };
        }),
      };
      return JSON.stringify(data, null, 2);
    }

    case 'tailwind': {
      // Generates a tailwind.config.js colors extension block + matching CSS vars
      const twColors = colors.reduce((obj, hex, i) => {
        const varName = names[i].toLowerCase().replace(/\s+/g, '-');
        obj[varName] = hex;
        return obj;
      }, {});

      const twBlock = `// tailwind.config.js — generated by Palette
// Paste this into your theme.extend.colors object

module.exports = {
  theme: {
    extend: {
      colors: {
${colors.map((hex, i) => {
        const varName = names[i].toLowerCase().replace(/\s+/g, '-');
        // Generate a 9-step scale from dark to light
        const { h, s } = hexToHsl(hex);
        const scale = {
          50:  hslToHex(h, Math.max(s - 20, 10), 95),
          100: hslToHex(h, Math.max(s - 15, 15), 90),
          200: hslToHex(h, Math.max(s - 10, 20), 80),
          300: hslToHex(h, s, 70),
          400: hslToHex(h, s, 60),
          500: hex,
          600: hslToHex(h, Math.min(s + 5, 100), 40),
          700: hslToHex(h, Math.min(s + 8, 100), 30),
          800: hslToHex(h, Math.min(s + 10, 100), 20),
          900: hslToHex(h, Math.min(s + 12, 100), 12),
          950: hslToHex(h, Math.min(s + 14, 100), 7),
        };
        const scaleEntries = Object.entries(scale)
          .map(([k, v]) => `          ${k}: '${v}',`)
          .join('\n');
        return `        /* ${names[i]} */\n        '${varName}': {\n${scaleEntries}\n        },`;
      }).join('\n')}
      },
    },
  },
};

/* ── Matching CSS custom properties ── */
:root {
${colors.map((hex, i) => {
  const varName = names[i].toLowerCase().replace(/\s+/g, '-');
  return `  --${varName}: ${hex};`;
}).join('\n')}
}`;
      return twBlock;
    }

    case 'png':
      return null;

    default:
      return null;
  }
}

/**
 * Exports palette as PNG — respects current theme.
 */
function exportPNG() {
  const W = 1000, H = 300, colW = W / 5;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const isDark = appState.theme === 'dark';

  appState.colors.forEach((hex, i) => {
    const x = i * colW;
    ctx.fillStyle = hex;
    ctx.fillRect(x, 0, colW, H - 60);
    ctx.fillStyle = isDark ? '#1c1c1a' : '#ffffff';
    ctx.fillRect(x, H - 60, colW, 60);
    ctx.fillStyle = isDark ? '#f0ede8' : '#1a1a1a';
    ctx.font = '500 14px "DM Mono", monospace';
    ctx.fillText(hex.toUpperCase(), x + 12, H - 36);
    ctx.fillStyle = isDark ? '#666660' : '#a0a0a0';
    ctx.font = '400 11px "DM Sans", sans-serif';
    ctx.fillText(colorName(hex), x + 12, H - 18);
    if (i > 0) {
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, 0, 1, H);
    }
  });
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  canvas.toBlob(blob => {
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `palette-${Date.now()}.png`;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link); URL.revokeObjectURL(url);
  }, 'image/png');
}

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click();
  document.body.removeChild(link); URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────
   7.  FAVORITES  (Upgrade 18)
   ───────────────────────────────────────────────────────── */

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function saveFavoritesToStorage() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch (e) {}
}

/**
 * Adds the current palette to favorites (if not already saved).
 */
function addFavorite() {
  const key = appState.colors.join(',');
  const already = favorites.some(f => f.colors.join(',') === key);
  if (already) {
    showToast('Already in favorites!');
    return;
  }
  if (favorites.length >= FAV_MAX) favorites.shift(); // evict oldest
  favorites.push({
    id:     Date.now(),
    colors: [...appState.colors],
    name:   colorName(appState.colors[2]), // name from middle color
  });
  saveFavoritesToStorage();
  renderFavBtn(true);
  renderShelf();
  showToast('Saved to favorites ♥');
}

function removeFavorite(id) {
  favorites = favorites.filter(f => f.id !== id);
  saveFavoritesToStorage();
  renderShelf();
  renderFavBtn(false);
}

function clearFavorites() {
  favorites = [];
  saveFavoritesToStorage();
  renderShelf();
  renderFavBtn(false);
}

function restoreFavorite(id) {
  const fav = favorites.find(f => f.id === id);
  if (!fav) return;
  pushHistory();
  appState.colors = [...fav.colors];
  appState.locks  = [false, false, false, false, false];
  fromImage = false;
  syncState();
  render();
  renderImageSourceBar();
  showToast(`Restored: ${fav.name}`);
}

function isCurrentPaletteFavorited() {
  const key = appState.colors.join(',');
  return favorites.some(f => f.colors.join(',') === key);
}

function renderFavBtn(active) {
  const btn = document.getElementById('fav-btn');
  const icon = btn.querySelector('i');
  if (active !== undefined) {
    btn.classList.toggle('fav-active', active);
    icon.className = active ? 'fas fa-heart' : 'far fa-heart';
  } else {
    const isFav = isCurrentPaletteFavorited();
    btn.classList.toggle('fav-active', isFav);
    icon.className = isFav ? 'fas fa-heart' : 'far fa-heart';
  }
}

function renderShelf() {
  const shelf    = document.getElementById('favorites-shelf');
  const list     = document.getElementById('shelf-list');
  const emptyMsg = document.getElementById('shelf-empty');

  if (!exploreMode) { shelf.classList.add('hidden'); return; }
  shelf.classList.remove('hidden');

  if (favorites.length === 0) {
    list.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';

  list.innerHTML = favorites.map(fav => `
    <div class="shelf-item" data-id="${fav.id}" title="Click to restore: ${fav.name}">
      ${fav.colors.map(hex => `<span class="shelf-item-swatch" style="background:${hex}"></span>`).join('')}
      <button class="shelf-item-remove" data-remove="${fav.id}" title="Remove">×</button>
    </div>
  `).join('');
}

function toggleExploreMode() {
  exploreMode = !exploreMode;
  const btn = document.getElementById('explore-btn');
  btn.classList.toggle('explore-active', exploreMode);
  renderShelf();
  if (exploreMode) showToast('Explore mode on — save palettes with F');
}

/* ─────────────────────────────────────────────────────────
   8.  STATE PERSISTENCE
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
    if (['analogous','complementary','triadic','monochromatic','split'].includes(modeParam)) appState.harmony = modeParam;
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
   9.  PALETTE HISTORY + UNDO
   ───────────────────────────────────────────────────────── */

function pushHistory() {
  historyStack.push([...appState.colors]);
  if (historyStack.length > HISTORY_MAX) historyStack.shift();
  renderUndoBtn();
}

function undo() {
  if (historyStack.length === 0) return;
  appState.colors = historyStack.pop();
  fromImage = false;
  syncState();
  render();
  renderUndoBtn();
  renderImageSourceBar();
  renderFavBtn();
  showToast('Undone');
}

function renderUndoBtn() {
  const btn      = document.getElementById('undo-btn');
  const hasBadge = btn.querySelector('.undo-count');
  if (historyStack.length > 0) {
    btn.classList.remove('hidden');
    if (hasBadge) { hasBadge.textContent = historyStack.length; }
    else {
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
   10.  RENDER
   ───────────────────────────────────────────────────────── */

function render(opts = {}) {
  renderTheme();
  renderPalette(opts);
  renderGradient();
  renderHarmonyPills();
  renderViewMode();
  renderA11yToggle();
  renderKbFocus();
  renderFavBtn();
}

function renderTheme() {
  document.documentElement.dataset.theme = appState.theme;
  const icon = document.getElementById('theme-icon');
  icon.className = appState.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function renderPalette(opts = {}) {
  const container     = document.getElementById('palette-container');
  const isFirstRender = container.children.length !== 5;

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
    nameEl.textContent = colorName(hex);

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
        <span></span><span></span><span></span><span></span>
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

function renderHarmonyPills() {
  document.querySelectorAll('.pill').forEach(p =>
    p.classList.toggle('active', p.dataset.harmony === appState.harmony)
  );
}

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

function renderA11yToggle() {
  document.getElementById('a11y-toggle').checked = appState.a11yOn;
}

function renderKbFocus() {
  document.querySelectorAll('.color-box').forEach((box, i) =>
    box.classList.toggle('kb-focused', i === kbFocusIdx)
  );
}

/* ─────────────────────────────────────────────────────────
   11.  COLOR DETAIL PANEL
   ───────────────────────────────────────────────────────── */

function openPanel(index) {
  activePanel = { index, hex: appState.colors[index] };
  panelOpen   = true;
  document.getElementById('panel-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderPanel();
}

function closePanel() {
  panelOpen   = false;
  activePanel = null;
  document.getElementById('panel-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderPanel() {
  if (!activePanel) return;
  const { index, hex } = activePanel;
  const { r, g, b }    = hexToRgb(hex);
  const { h, s, l }    = hexToHsl(hex);
  const compHex        = hslToHex(norm(h + 180), s, l);
  const a11y           = wcagRating(hex);
  const name           = colorName(hex);

  document.getElementById('panel-swatch').style.backgroundColor = hex;
  document.getElementById('panel-color-name').textContent = name;
  document.getElementById('panel-hex').textContent = hex.toUpperCase();
  document.getElementById('pv-hex-val').textContent = hex.toUpperCase();
  document.getElementById('pv-rgb-val').textContent = `rgb(${r}, ${g}, ${b})`;
  document.getElementById('pv-hsl-val').textContent = `hsl(${h}, ${s}%, ${l}%)`;

  const slH = document.getElementById('sl-h');
  const slS = document.getElementById('sl-s');
  const slL = document.getElementById('sl-l');
  slH.value = h; slS.value = s; slL.value = l;
  document.getElementById('sl-h-val').textContent = `${h}°`;
  document.getElementById('sl-s-val').textContent = `${s}%`;
  document.getElementById('sl-l-val').textContent = `${l}%`;
  slS.style.background =
    `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`;

  const shadesEl = document.getElementById('panel-shades');
  const stops = [15, 25, 35, 50, 65, 78, 88];
  shadesEl.innerHTML = stops.map(lVal => {
    const shadeHex = hslToHex(h, Math.max(s - 5, 20), lVal);
    const isActive = Math.abs(lVal - l) < 8;
    return `<div class="shade-swatch${isActive ? ' active-shade' : ''}" style="background:${shadeHex}" title="${shadeHex}" data-hex="${shadeHex}"></div>`;
  }).join('');

  document.getElementById('panel-comp-swatch').style.backgroundColor = compHex;
  document.getElementById('panel-comp-hex').textContent = compHex.toUpperCase();

  const vsW = parseFloat(a11y.vsWhite), vsB = parseFloat(a11y.vsBlack);
  document.getElementById('panel-wcag').innerHTML = `
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

function wcagPillClass(r) { return r >= 7 ? 'aaa' : r >= 4.5 ? 'aa' : 'fail'; }
function wcagLevelLabel(r) { return r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA Large' : 'Fail'; }

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
  renderPanel();
  renderFavBtn();
}

/* ─────────────────────────────────────────────────────────
   12.  EVENT HANDLERS
   ───────────────────────────────────────────────────────── */

document.getElementById('generate-btn').addEventListener('click', handleGenerate);

function handleGenerate() {
  pushHistory();
  generateHarmoniousColors();
  syncState();
  render();
  renderImageSourceBar();
  spinGenerateBtn();
}

function spinGenerateBtn() {
  const btn = document.getElementById('generate-btn');
  btn.classList.remove('spinning'); void btn.offsetWidth; btn.classList.add('spinning');
  btn.addEventListener('transitionend', () => btn.classList.remove('spinning'), { once: true });
}

document.querySelectorAll('.pill').forEach(pill => {
  pill.addEventListener('click', () => { appState.harmony = pill.dataset.harmony; handleGenerate(); });
});

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    appState.viewMode = btn.dataset.mode;
    syncState(); renderViewMode();
    if (appState.viewMode === 'gradient') renderGradient();
  });
});

document.getElementById('a11y-toggle').addEventListener('change', function () {
  appState.a11yOn = this.checked; syncState(); renderPalette();
});

document.getElementById('theme-btn').addEventListener('click', toggleTheme);
function toggleTheme() {
  const btn = document.getElementById('theme-btn');
  btn.classList.add('switching');
  setTimeout(() => {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    syncState(); renderTheme(); btn.classList.remove('switching');
  }, 200);
}

document.getElementById('undo-btn').addEventListener('click', undo);

/* ── Image extraction (Upgrade 15) ── */
document.getElementById('image-btn').addEventListener('click', () => {
  document.getElementById('image-input').click();
});

document.getElementById('image-input').addEventListener('change', function () {
  if (this.files && this.files[0]) {
    extractColorsFromImage(this.files[0]);
    this.value = ''; // reset so same file can be re-selected
  }
});

document.getElementById('image-source-clear').addEventListener('click', () => {
  fromImage = false;
  renderImageSourceBar();
  showToast('Image palette cleared');
});

/* ── Export dropdown ── */
document.getElementById('export-btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('export-dropdown').classList.toggle('hidden');
});

document.querySelectorAll('.export-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('export-dropdown').classList.add('hidden');
    const format = item.dataset.format;
    if (format === 'png') {
      exportPNG(); showToast('Exporting PNG…');
    } else if (format === 'css') {
      downloadText(serializePalette('css'), `palette-${Date.now()}.css`);
      showToast('CSS variables exported!');
    } else if (format === 'json') {
      downloadText(serializePalette('json'), `palette-${Date.now()}.json`);
      showToast('JSON exported!');
    } else if (format === 'tailwind') {
      downloadText(serializePalette('tailwind'), `tailwind-palette-${Date.now()}.js`);
      showToast('Tailwind config exported!');
    }
  });
});

document.addEventListener('click', e => {
  if (!document.getElementById('export-wrap').contains(e.target)) {
    document.getElementById('export-dropdown').classList.add('hidden');
  }
});

/* ── Explore / Favorites (Upgrade 18) ── */
document.getElementById('explore-btn').addEventListener('click', toggleExploreMode);

document.getElementById('fav-btn').addEventListener('click', () => {
  if (isCurrentPaletteFavorited()) {
    const key = appState.colors.join(',');
    const fav = favorites.find(f => f.colors.join(',') === key);
    if (fav) removeFavorite(fav.id);
    showToast('Removed from favorites');
  } else {
    addFavorite();
  }
});

document.getElementById('shelf-clear-btn').addEventListener('click', () => {
  if (favorites.length === 0) return;
  clearFavorites();
  showToast('Favorites cleared');
});

// Shelf list — delegated: click to restore, remove button to delete
document.getElementById('shelf-list').addEventListener('click', e => {
  const removeBtn = e.target.closest('.shelf-item-remove');
  if (removeBtn) {
    e.stopPropagation();
    const id = parseInt(removeBtn.dataset.remove, 10);
    removeFavorite(id);
    return;
  }
  const item = e.target.closest('.shelf-item');
  if (item) {
    const id = parseInt(item.dataset.id, 10);
    restoreFavorite(id);
  }
});

/* ── Palette container ── */
document.getElementById('palette-container').addEventListener('click', function (e) {
  if (panelOpen) return;
  const lockBtn = e.target.closest('.lock-btn');
  if (lockBtn) { toggleLock(parseInt(lockBtn.dataset.index, 10)); return; }
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) { copyToClipboard(appState.colors[parseInt(copyBtn.dataset.index, 10)], copyBtn); return; }
  const swatch = e.target.closest('.color-swatch');
  if (swatch) { openPanel(parseInt(swatch.closest('.color-box').dataset.index, 10)); }
});

function toggleLock(idx) {
  appState.locks[idx] = !appState.locks[idx];
  syncState(); renderPalette({ lockAnim: idx });
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
  navigator.clipboard.writeText(url).then(() => showToast('Share URL copied!')).catch(() => {
    const el = document.createElement('input');
    el.value = url; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    showToast('Share URL copied!');
  });
});

/* ── Detail panel events ── */
document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('panel-overlay').addEventListener('click', function (e) {
  if (e.target === this) closePanel();
});

document.getElementById('detail-panel').addEventListener('click', function (e) {
  const copyBtn = e.target.closest('.pv-copy');
  if (!copyBtn) return;
  const field = copyBtn.dataset.field;
  if (field && activePanel) {
    const { r, g, b } = hexToRgb(activePanel.hex);
    const { h, s, l } = hexToHsl(activePanel.hex);
    const textMap = { hex: activePanel.hex.toUpperCase(), rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${h}, ${s}%, ${l}%)` };
    copyToClipboard(textMap[field] || activePanel.hex, copyBtn); return;
  }
  if (copyBtn.id === 'panel-comp-copy' && activePanel) {
    const { h, s, l } = hexToHsl(activePanel.hex);
    copyToClipboard(hslToHex(norm(h + 180), s, l).toUpperCase(), copyBtn);
  }
});

document.getElementById('panel-shades').addEventListener('click', function (e) {
  const swatch = e.target.closest('.shade-swatch');
  if (!swatch || !activePanel) return;
  const newHex = swatch.dataset.hex;
  appState.colors[activePanel.index] = newHex;
  activePanel.hex = newHex;
  syncState(); renderPalette(); renderGradient(); renderPanel(); renderFavBtn();
  showToast(`Applied ${newHex}`);
});

['sl-h', 'sl-s', 'sl-l'].forEach(id => {
  document.getElementById(id).addEventListener('input', function () {
    document.getElementById(`${id}-val`).textContent = id === 'sl-h' ? `${this.value}°` : `${this.value}%`;
    applySliderChange();
  });
});

/* ─────────────────────────────────────────────────────────
   13.  KEYBOARD SHORTCUTS
   ───────────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (panelOpen) { if (e.code === 'Escape') closePanel(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  document.body.classList.add('kb-active');

  switch (e.code) {
    case 'Space':      e.preventDefault(); handleGenerate(); break;
    case 'ArrowRight': e.preventDefault(); kbFocusIdx = Math.min((kbFocusIdx < 0 ? -1 : kbFocusIdx) + 1, 4); if (kbFocusIdx < 0) kbFocusIdx = 0; renderKbFocus(); break;
    case 'ArrowLeft':  e.preventDefault(); if (kbFocusIdx <= 0) { kbFocusIdx = -1; renderKbFocus(); break; } kbFocusIdx = Math.max(kbFocusIdx - 1, 0); renderKbFocus(); break;
    case 'Escape':     kbFocusIdx = -1; renderKbFocus(); break;
    case 'Enter':      if (kbFocusIdx >= 0) { e.preventDefault(); openPanel(kbFocusIdx); } break;
    case 'KeyL':       if (kbFocusIdx >= 0) { e.preventDefault(); toggleLock(kbFocusIdx); } break;
    case 'KeyC':       if (kbFocusIdx >= 0) { e.preventDefault(); const b = document.querySelectorAll('.color-box')[kbFocusIdx]?.querySelector('.copy-btn'); copyToClipboard(appState.colors[kbFocusIdx], b); } break;
    case 'KeyF':       e.preventDefault(); isCurrentPaletteFavorited() ? (() => { const k=appState.colors.join(','); const f=favorites.find(x=>x.colors.join(',')=== k); if(f)removeFavorite(f.id); showToast('Removed from favorites'); })() : addFavorite(); break;
    case 'KeyE':       e.preventDefault(); toggleExploreMode(); break;
    case 'KeyZ':       e.preventDefault(); undo(); break;
    case 'KeyD':       e.preventDefault(); toggleTheme(); break;
  }
});

/* ─────────────────────────────────────────────────────────
   14.  DRAG & DROP
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
  isDragging = true; document.body.classList.add('is-dragging');
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
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
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
  const nc = [...appState.colors], nl = [...appState.locks];
  [nc[dragSrcIdx], nc[targetIdx]] = [nc[targetIdx], nc[dragSrcIdx]];
  [nl[dragSrcIdx], nl[targetIdx]] = [nl[targetIdx], nl[dragSrcIdx]];
  appState.colors = nc; appState.locks = nl;
  syncState(); renderPalette(); renderGradient(); renderFavBtn();
  showToast('Colors reordered');
}

/* ─────────────────────────────────────────────────────────
   15.  TOUCH GESTURES
   ───────────────────────────────────────────────────────── */

(function initTouchGestures() {
  const wrapper = document.getElementById('palette-wrapper');
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  const SWIPE_THRESHOLD = 60, SWIPE_MAX_Y = 80, SWIPE_MAX_TIME = 400;

  const li = createSwipeIndicator('left', '←');
  const ri = createSwipeIndicator('right', '→');
  wrapper.appendChild(li); wrapper.appendChild(ri);

  function createSwipeIndicator(side, char) {
    const el = document.createElement('div');
    el.className = `swipe-indicator ${side}`; el.textContent = char; return el;
  }
  function flash(el) { el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 350); }

  wrapper.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; touchStartTime = Date.now();
  }, { passive: true });

  wrapper.addEventListener('touchend', e => {
    if (panelOpen) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_MAX_Y && dt < SWIPE_MAX_TIME) {
      flash(dx < 0 ? ri : li); handleGenerate();
    }
  }, { passive: true });

  let holdTimer = null, holdTarget = null, holdMoved = false;
  wrapper.addEventListener('touchstart', e => {
    const swatch = e.target.closest('.color-swatch'); if (!swatch) return;
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
   16.  UTILITIES
   ───────────────────────────────────────────────────────── */

function copyToClipboard(text, triggerEl) {
  const doSuccess = () => showCopySuccess(triggerEl, text);
  navigator.clipboard.writeText(text).then(doSuccess).catch(() => {
    try { const el = document.createElement('input'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); doSuccess(); } catch (_) {}
  });
}

function showCopySuccess(btn, text) {
  if (!btn) { showToast(`${text} copied!`); return; }
  const icon = btn.querySelector('i');
  if (icon) icon.className = 'fas fa-check';
  btn.style.color = '#22c55e';
  btn.classList.remove('copied'); void btn.offsetWidth; btn.classList.add('copied');
  setTimeout(() => { if (icon) icon.className = 'far fa-copy'; btn.style.color = ''; btn.classList.remove('copied'); }, 1500);
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
   17.  INIT
   ───────────────────────────────────────────────────────── */

function attachAllDragListeners() {
  document.querySelectorAll('.color-box').forEach(attachDragListeners);
}

function showDndHintOnce() {
  const hint    = document.getElementById('dnd-hint');
  const seen    = localStorage.getItem('palette_dnd_hint_seen');
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
  renderImageSourceBar();
  renderShelf();
  showDndHintOnce();
}

init();
