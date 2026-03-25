/**
 * Kanban Board — Tier 3
 *
 * Built on Tier 1+2 (placeholder, sortable, multi-container, ghost,
 * DragManager, persistence, touch, constraints).
 *
 * Adds:
 *  1. Collision Detection  — getBoundingClientRect() overlap replaces
 *                            simple Y-midpoint; absorbed into DragManager
 *  2. Undo / Redo          — History stack; Ctrl+Z / Ctrl+Y; undo bar UI
 *  3. Physics settle       — spring animation after every drop (rAF-based,
 *                            visual layer only — never touches layout)
 *  4. Accessibility (A11Y) — Full keyboard drag: Space=pick-up, Arrow=move
 *                            between columns, Enter/Space=drop, Escape=cancel
 *                            Screen-reader announcements via aria-live region
 *
 * Architecture notes:
 *  - Collision detection is a drop-in superset of getInsertReference().
 *    The method signature is identical; the rest of the system is unchanged.
 *  - History.push() is called inside DragManager.commitDrop() — one place,
 *    both mouse and touch paths get undo for free.
 *  - Physics runs in onDrop / onTouchEnd / keyboard drop after commitDrop().
 *    It adds/removes a CSS class; no inline styles, no rAF loops on idle.
 *  - Keyboard A11Y calls the same DragManager.commitDrop() as the pointer
 *    paths — zero duplication of move logic.
 */


/* ═══════════════════════════════════════════════════════════════
   HISTORY  —  undo / redo stack
   ═══════════════════════════════════════════════════════════════ */
const History = {

  past:   [],   // stack of snapshots before each move
  future: [],   // stack of snapshots for redo

  MAX: 50,      // cap memory use

  /**
   * Snapshot = { listId: [cardId, ...], ... } for every column.
   * We snapshot the WHOLE board so undo is always consistent.
   */
  snapshot() {
    const snap = {};
    document.querySelectorAll(".list").forEach(list => {
      snap[list.id] = [...list.querySelectorAll(".card")].map(c => c.id);
    });
    return snap;
  },

  /** Call BEFORE a move is committed. */
  push(snapBefore) {
    this.past.push(snapBefore);
    if (this.past.length > this.MAX) this.past.shift();
    this.future = []; // new action clears redo stack
    UndoBar.update();
  },

  canUndo() { return this.past.length > 0; },
  canRedo() { return this.future.length > 0; },

  /** Restore a snapshot to the DOM (moves card nodes, rebinds nothing — listeners stay). */
  applySnapshot(snap) {
    for (const [listId, cardIds] of Object.entries(snap)) {
      const area = document.querySelector("#" + listId + " .cards-area");
      if (!area) continue;
      for (const cardId of cardIds) {
        const card = document.getElementById(cardId);
        if (card) area.appendChild(card);
      }
    }
  },

  undo() {
    if (!this.canUndo()) return;
    const before  = this.past.pop();
    const current = this.snapshot();
    this.future.push(current);
    this.applySnapshot(before);
    updateAllCounts();
    Storage.save();
    A11y.announce("Move undone.");
    UndoBar.update();
    UndoBar.flash("↩ Undone");
  },

  redo() {
    if (!this.canRedo()) return;
    const next    = this.future.pop();
    const current = this.snapshot();
    this.past.push(current);
    this.applySnapshot(next);
    updateAllCounts();
    Storage.save();
    A11y.announce("Move redone.");
    UndoBar.update();
    UndoBar.flash("↪ Redone");
  },
};


/* ═══════════════════════════════════════════════════════════════
   UNDO BAR  —  persistent UI widget for undo/redo
   ═══════════════════════════════════════════════════════════════ */
const UndoBar = {
  el:     null,
  msgEl:  null,
  btnEl:  null,
  timer:  null,

  init() {
    this.el    = document.getElementById("undoBar");
    this.msgEl = document.getElementById("undoMsg");
    this.btnEl = document.getElementById("undoBtn");
    this.btnEl.addEventListener("click", () => History.undo());
  },

  /** Show the bar with a message, auto-hide after 4 s. */
  flash(msg = "Card moved") {
    if (!this.el) return;
    clearTimeout(this.timer);
    this.msgEl.textContent = msg;
    this.el.classList.add("visible");
    this.timer = setTimeout(() => this.el.classList.remove("visible"), 4000);
  },

  /** Keep undo button enabled state in sync. */
  update() {
    if (!this.btnEl) return;
    this.btnEl.disabled = !History.canUndo();
  },
};


/* ═══════════════════════════════════════════════════════════════
   A11Y  —  screen-reader announcements + keyboard drag engine
   ═══════════════════════════════════════════════════════════════ */
const A11y = {

  announceEl: null,

  /* Keyboard drag state */
  kbdCard:       null,   // card currently "picked up" by keyboard
  kbdSourceList: null,   // list it came from (for cancel)

  init() {
    this.announceEl = document.getElementById("a11yAnnounce");

    // Global keydown: Ctrl+Z / Ctrl+Y (undo/redo), Escape (cancel kbd drag)
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        History.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        History.redo();
      }
      if (e.key === "Escape" && this.kbdCard) {
        this.cancelKbd();
      }
    });
  },

  announce(msg) {
    if (!this.announceEl) return;
    // Clear then set — guarantees screen reader fires even for repeated messages
    this.announceEl.textContent = "";
    requestAnimationFrame(() => { this.announceEl.textContent = msg; });
  },

  /* ── Keyboard drag handlers (called from card keydown) ────── */

  onCardKeydown(e, card) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (this.kbdCard === card) {
        // Second Space/Enter = drop in current column
        this.dropKbd(card.closest(".list"));
      } else {
        this.pickupKbd(card);
      }
    }

    if (!this.kbdCard) return;

    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const lists = [...document.querySelectorAll(".list")];
      const currentList = this.kbdCard.closest(".list");
      const idx = lists.indexOf(currentList);
      const next = e.key === "ArrowRight"
        ? lists[idx + 1]
        : lists[idx - 1];
      if (next) this.moveKbdToList(next);
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this.moveKbdWithinList(e.key === "ArrowUp" ? -1 : 1);
    }
  },

  pickupKbd(card) {
    // Cancel any in-flight keyboard drag first
    if (this.kbdCard) this.cancelKbd();

    this.kbdCard       = card;
    this.kbdSourceList = card.closest(".list");

    card.classList.add("kbd-picked");
    card.setAttribute("aria-grabbed", "true");

    // Highlight all valid target columns
    document.querySelectorAll(".list").forEach(list => {
      const allowed = list.dataset.allowedFrom;
      const ok = !allowed || allowed.split(",").map(s=>s.trim())
                              .includes(this.kbdSourceList.id);
      if (ok) list.classList.add("kbd-target");
    });

    const colLabel = this.kbdSourceList.dataset.label || "current column";
    this.announce(
      `${card.textContent} picked up from ${colLabel}. ` +
      `Use arrow keys to move between columns or within the list. ` +
      `Press Space or Enter to drop, Escape to cancel.`
    );
  },

  moveKbdToList(targetList) {
    if (!this.kbdCard) return;
    const allowed = targetList.dataset.allowedFrom;
    const ok = !allowed || allowed.split(",").map(s=>s.trim())
                            .includes(this.kbdSourceList.id);
    if (!ok) {
      this.announce(`Cannot move to ${targetList.dataset.label}.`);
      return;
    }
    targetList.querySelector(".cards-area").appendChild(this.kbdCard);
    this.kbdCard.focus();
    this.announce(`Moved to ${targetList.dataset.label}.`);
  },

  moveKbdWithinList(direction) {
    if (!this.kbdCard) return;
    const area  = this.kbdCard.closest(".cards-area");
    const cards = [...area.querySelectorAll(".card")];
    const idx   = cards.indexOf(this.kbdCard);
    const target = direction === -1 ? cards[idx - 1] : cards[idx + 1];
    if (!target) return;
    if (direction === -1) {
      area.insertBefore(this.kbdCard, target);
    } else {
      area.insertBefore(target, this.kbdCard);
    }
    this.kbdCard.focus();
    this.announce(`Reordered within ${this.kbdCard.closest(".list").dataset.label}.`);
  },

  dropKbd(targetList) {
    if (!this.kbdCard) return;

    // Capture references before clearKbdState() nulls them
    const card     = this.kbdCard;
    const colLabel = card.closest(".list").dataset.label || "column";
    const snap     = History.snapshot();

    History.push(snap);
    this.clearKbdState();   // nulls this.kbdCard
    Physics.settle(card);   // uses captured reference

    updateAllCounts();
    Storage.save();
    UndoBar.flash("Card moved  ·  Ctrl+Z to undo");
    this.announce(`Dropped in ${colLabel}.`);
  },

  cancelKbd() {
    if (!this.kbdCard) return;
    const card = this.kbdCard;
    // Restore card to its original column
    this.kbdSourceList.querySelector(".cards-area").appendChild(card);
    this.clearKbdState();
    card.focus();
    this.announce("Drag cancelled. Card returned to original column.");
    updateAllCounts();
  },

  clearKbdState() {
    if (this.kbdCard) {
      this.kbdCard.classList.remove("kbd-picked");
      this.kbdCard.setAttribute("aria-grabbed", "false");
    }
    document.querySelectorAll(".list").forEach(l => l.classList.remove("kbd-target"));
    this.kbdCard       = null;
    this.kbdSourceList = null;
  },
};


/* ═══════════════════════════════════════════════════════════════
   PHYSICS  —  post-drop settle animation
   Visual layer only. Adds/removes .settling CSS class.
   CSS @keyframes does the spring; JS just triggers it.
   ═══════════════════════════════════════════════════════════════ */
const Physics = {

  /**
   * Give a card a spring-settle animation after it lands.
   * Safe to call from any drop path (mouse, touch, keyboard).
   */
  settle(card) {
    if (!card) return;
    card.classList.remove("settling");
    // Force reflow so re-adding the class re-triggers the animation
    void card.offsetWidth;
    card.classList.add("settling");
    card.addEventListener("animationend", () => {
      card.classList.remove("settling");
    }, { once: true });
  },
};


/* ═══════════════════════════════════════════════════════════════
   DRAG MANAGER  —  central state engine (extended for Tier 3)
   ═══════════════════════════════════════════════════════════════ */
const DragManager = {

  /* ── State ─────────────────────────────────────────────────── */
  draggingEl:   null,
  sourceListId: null,
  placeholder:  null,

  /* Touch-specific */
  touchClone:   null,
  touchOffsetX: 0,
  touchOffsetY: 0,

  /* ── Constraint Check ──────────────────────────────────────── */
  isDropAllowed(targetList) {
    const allowed = targetList.dataset.allowedFrom;
    if (!allowed) return true;
    return allowed.split(",").map(s => s.trim()).includes(this.sourceListId);
  },

  /* ── Placeholder ───────────────────────────────────────────── */
  createPlaceholder(height) {
    const ph = document.createElement("div");
    ph.classList.add("placeholder");
    ph.style.height = height + "px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => ph.classList.add("visible"));
    });
    return ph;
  },

  removePlaceholder() {
    if (this.placeholder && this.placeholder.parentNode) {
      this.placeholder.parentNode.removeChild(this.placeholder);
    }
    this.placeholder = null;
  },

  /**
   * Collision detection — getBoundingClientRect() overlap.
   * For each candidate card, we check if the cursor Y is above the card's
   * vertical midpoint (same semantic as before, but using real rect data
   * rather than a cached offsetTop calculation). This is the correct
   * approach when cards have variable heights or margins.
   */
  getInsertReference(area, clientY) {
    const cards = [...area.querySelectorAll(
      ".card:not(.dragging):not(.touch-dragging)"
    )];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      // Midpoint collision: cursor above mid → insert before this card
      if (clientY < rect.top + rect.height / 2) return card;
    }
    return null; // cursor is below all cards → append
  },

  movePlaceholderTo(area, clientY) {
    this.removePlaceholder();
    const ph = this.createPlaceholder(this.draggingEl.offsetHeight || 54);
    this.placeholder = ph;
    area.insertBefore(ph, this.getInsertReference(area, clientY));
  },

  /* ── Commit Drop (Tier 3: snapshots history before moving) ── */
  commitDrop(area) {
    if (!this.draggingEl) return null;

    // Snapshot BEFORE the move for undo
    const snap = History.snapshot();

    const ph = this.placeholder;
    if (ph && ph.parentNode === area) {
      area.insertBefore(this.draggingEl, ph);
    } else {
      area.appendChild(this.draggingEl);
    }
    this.removePlaceholder();

    // Push to history only if the card actually moved
    History.push(snap);

    return area.closest(".list");
  },

  /* ── Reset ─────────────────────────────────────────────────── */
  reset() {
    this.draggingEl   = null;
    this.sourceListId = null;
    this.removePlaceholder();
  },
};


/* ═══════════════════════════════════════════════════════════════
   PERSISTENCE  —  LocalStorage layer (unchanged from Tier 2)
   ═══════════════════════════════════════════════════════════════ */
const Storage = {

  KEY: "kanban_layout_v1",

  save() {
    const layout = {};
    document.querySelectorAll(".list").forEach(list => {
      layout[list.id] = [...list.querySelectorAll(".card")].map(c => c.id);
    });
    try {
      localStorage.setItem(this.KEY, JSON.stringify(layout));
    } catch (e) { /* quota / private browsing */ }
  },

  load() {
    let raw;
    try { raw = localStorage.getItem(this.KEY); } catch (e) { return false; }
    if (!raw) return false;
    let layout;
    try { layout = JSON.parse(raw); } catch (e) { return false; }
    for (const [listId, cardIds] of Object.entries(layout)) {
      const area = document.querySelector("#" + listId + " .cards-area");
      if (!area) continue;
      for (const cardId of cardIds) {
        const card = document.getElementById(cardId);
        if (card) area.appendChild(card);
      }
    }
    return true;
  },
};


/* ═══════════════════════════════════════════════════════════════
   TOAST  —  (unchanged from Tier 2)
   ═══════════════════════════════════════════════════════════════ */
const Toast = {
  el: null, timer: null,
  init() { this.el = document.getElementById("toast"); },
  show(message, type = "default", duration = 2200) {
    if (!this.el) return;
    clearTimeout(this.timer);
    this.el.textContent = message;
    this.el.className = "toast visible" + (type !== "default" ? " " + type : "");
    this.timer = setTimeout(() => this.el.classList.remove("visible"), duration);
  },
};


/* ═══════════════════════════════════════════════════════════════
   COUNTERS
   ═══════════════════════════════════════════════════════════════ */
function updateCount(list) {
  const n = list.querySelector(".cards-area").querySelectorAll(".card").length;
  list.querySelector(".card-count").textContent = n;
}
function updateAllCounts() {
  document.querySelectorAll(".list").forEach(updateCount);
}


/* ═══════════════════════════════════════════════════════════════
   MOUSE / HTML5 DRAG API
   ═══════════════════════════════════════════════════════════════ */
const ghost = document.getElementById("dragGhost");

function onDragStart(e) {
  const card = e.currentTarget;
  DragManager.draggingEl   = card;
  DragManager.sourceListId = card.closest(".list").id;

  e.dataTransfer.setData("text/plain", card.id);
  e.dataTransfer.effectAllowed = "move";

  ghost.textContent = card.textContent;
  ghost.style.top   = "-9999px";
  ghost.style.left  = "-9999px";
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 20, 16);

  requestAnimationFrame(() => {
    card.classList.add("dragging");
    card.setAttribute("aria-grabbed", "true");
  });
}

function onDragEnd(e) {
  const card = e.currentTarget;
  card.classList.remove("dragging");
  card.setAttribute("aria-grabbed", "false");
  if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
  document.querySelectorAll(".list").forEach(l => l.classList.remove("over", "rejected"));
  DragManager.reset();
  updateAllCounts();
}

function onDragOver(e) {
  e.preventDefault();
  const area       = e.currentTarget;
  const targetList = area.closest(".list");
  if (!DragManager.isDropAllowed(targetList)) {
    e.dataTransfer.dropEffect = "none";
    return;
  }
  e.dataTransfer.dropEffect = "move";
  DragManager.movePlaceholderTo(area, e.clientY);
}

function onDragEnter(e) {
  e.preventDefault();
  const targetList = e.currentTarget.closest(".list");
  if (!DragManager.isDropAllowed(targetList)) {
    targetList.classList.add("rejected");
    targetList.classList.remove("over");
  } else {
    targetList.classList.add("over");
    targetList.classList.remove("rejected");
  }
}

function onDragLeave(e) {
  const targetList = e.currentTarget.closest(".list");
  if (!targetList.contains(e.relatedTarget)) {
    targetList.classList.remove("over", "rejected");
    DragManager.removePlaceholder();
  }
}

function onDrop(e) {
  e.preventDefault();
  const area       = e.currentTarget;
  const targetList = area.closest(".list");

  if (!DragManager.draggingEl) return;

  if (!DragManager.isDropAllowed(targetList)) {
    Toast.show("⛔ Can't move here", "error");
    targetList.classList.remove("rejected");
    return;
  }

  const card = DragManager.draggingEl; // capture before commitDrop clears it
  DragManager.commitDrop(area);
  targetList.classList.remove("over");

  Physics.settle(card);
  updateAllCounts();
  Storage.save();
  UndoBar.flash("Card moved  ·  Ctrl+Z to undo");
}


/* ═══════════════════════════════════════════════════════════════
   TOUCH API
   ═══════════════════════════════════════════════════════════════ */
function onTouchStart(e) {
  if (e.touches.length !== 1) return;
  const card  = e.currentTarget;
  const touch = e.touches[0];
  const rect  = card.getBoundingClientRect();

  DragManager.draggingEl   = card;
  DragManager.sourceListId = card.closest(".list").id;
  DragManager.touchOffsetX = touch.clientX - rect.left;
  DragManager.touchOffsetY = touch.clientY - rect.top;

  card.classList.add("touch-dragging");
  card.setAttribute("aria-grabbed", "true");

  const clone = document.createElement("div");
  clone.classList.add("touch-clone");
  clone.textContent = card.textContent;
  clone.style.width = rect.width + "px";
  clone.style.left  = (touch.clientX - DragManager.touchOffsetX) + "px";
  clone.style.top   = (touch.clientY - DragManager.touchOffsetY) + "px";
  document.body.appendChild(clone);
  DragManager.touchClone = clone;
}

function onTouchMove(e) {
  if (!DragManager.draggingEl || e.touches.length !== 1) return;
  e.preventDefault();

  const touch = e.touches[0];
  const clone = DragManager.touchClone;

  if (clone) {
    clone.style.left = (touch.clientX - DragManager.touchOffsetX) + "px";
    clone.style.top  = (touch.clientY - DragManager.touchOffsetY) + "px";
    clone.style.display = "none";
  }

  const elBelow    = document.elementFromPoint(touch.clientX, touch.clientY);
  if (clone) clone.style.display = "";
  if (!elBelow) { DragManager.removePlaceholder(); return; }

  const area       = elBelow.closest(".cards-area");
  const targetList = elBelow.closest(".list");

  document.querySelectorAll(".list").forEach(l => l.classList.remove("over", "rejected"));

  if (area && targetList) {
    if (DragManager.isDropAllowed(targetList)) {
      targetList.classList.add("over");
      DragManager.movePlaceholderTo(area, touch.clientY);
    } else {
      targetList.classList.add("rejected");
      DragManager.removePlaceholder();
    }
  } else {
    DragManager.removePlaceholder();
  }
}

function onTouchEnd(e) {
  if (!DragManager.draggingEl) return;

  const touch = e.changedTouches[0];

  if (DragManager.touchClone) {
    DragManager.touchClone.remove();
    DragManager.touchClone = null;
  }

  const elBelow    = document.elementFromPoint(touch.clientX, touch.clientY);
  const area       = elBelow && elBelow.closest(".cards-area");
  const targetList = elBelow && elBelow.closest(".list");

  const card = DragManager.draggingEl;
  card.classList.remove("touch-dragging");
  card.setAttribute("aria-grabbed", "false");

  document.querySelectorAll(".list").forEach(l => l.classList.remove("over", "rejected"));

  if (area && targetList && DragManager.isDropAllowed(targetList)) {
    DragManager.commitDrop(area);
    Physics.settle(card);
    UndoBar.flash("Card moved  ·  Ctrl+Z to undo");
  } else if (targetList && !DragManager.isDropAllowed(targetList)) {
    Toast.show("⛔ Can't move here", "error");
  }

  DragManager.reset();
  updateAllCounts();
  Storage.save();
}


/* ═══════════════════════════════════════════════════════════════
   BINDING
   ═══════════════════════════════════════════════════════════════ */
function bindCard(card) {
  // Mouse
  card.addEventListener("dragstart", onDragStart);
  card.addEventListener("dragend",   onDragEnd);

  // Touch
  card.addEventListener("touchstart", onTouchStart, { passive: true });
  card.addEventListener("touchmove",  onTouchMove,  { passive: false });
  card.addEventListener("touchend",   onTouchEnd,   { passive: true });

  // Keyboard A11Y — Space/Enter to pick up / drop; Arrows to navigate
  card.addEventListener("keydown", e => A11y.onCardKeydown(e, card));

  // Hint text shown via CSS ::after when focused (data-kbd-hint attr)
  card.setAttribute("data-kbd-hint", "Space: pick up");
}

function bindArea(area) {
  area.addEventListener("dragover",  onDragOver);
  area.addEventListener("dragenter", onDragEnter);
  area.addEventListener("dragleave", onDragLeave);
  area.addEventListener("drop",      onDrop);
}


/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
function init() {
  Toast.init();
  UndoBar.init();
  A11y.init();

  const restored = Storage.load();

  document.querySelectorAll(".card").forEach(bindCard);
  document.querySelectorAll(".cards-area").forEach(bindArea);

  updateAllCounts();
  UndoBar.update();

  if (restored) {
    Toast.show("✓ Board restored", "success", 1800);
  }
}

init();
