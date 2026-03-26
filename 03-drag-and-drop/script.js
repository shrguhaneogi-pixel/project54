/**
 * Kanban Board — Tier 4 (Final / Production)
 *
 * Complete feature set across all tiers:
 *
 *  Tier 1: Placeholder, sortable list, multi-container drag,
 *          custom ghost, visual feedback micro-interactions
 *  Tier 2: DragManager state engine, LocalStorage persistence,
 *          mobile touch support, constraint system
 *  Tier 3: Collision detection, Undo/Redo stack, Physics settle
 *          animation, Accessibility keyboard drag + screen-reader
 *  Tier 4: Component architecture (CardComponent, ListComponent),
 *          Snap-to-grid slot overlay, Rich drag preview ghost
 *
 * Architecture:
 *  All state flows through DragManager.
 *  CardComponent / ListComponent are factory functions that
 *  create DOM + wire all event listeners in one call.
 *  All 15 upgrades coexist without interference.
 */


/* ═══════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════ */

/** Monotonically increasing ID generator — collision-safe. */
const uid = (() => {
  let n = Date.now();
  return (prefix = "item") => `${prefix}-${n++}`;
})();

/** Map data-color → hex accent for the rich ghost stripe. */
const COLOR_MAP = {
  purple: "#7c6fc2",
  blue:   "#4a8fd4",
  green:  "#3aaa6e",
  amber:  "#d4920a",
  coral:  "#d45a30",
  teal:   "#1d9e75",
};

const DEFAULT_COLOR = "#5c6ac4"; // fallback = CSS --accent


/* ═══════════════════════════════════════════════════════════════
   HISTORY  —  undo / redo stack
   ═══════════════════════════════════════════════════════════════ */
const History = {

  past:  [],
  future: [],
  MAX:   50,

  /**
   * Full board snapshot:
   *  { listId: { label, color, allowedFrom, cards: [{ id, text }] } }
   * Stores card TEXT so undo also restores dynamically created cards.
   */
  snapshot() {
    const snap = {};
    document.querySelectorAll(".list").forEach(list => {
      snap[list.id] = {
        label:       list.dataset.label,
        color:       list.dataset.color       || "",
        allowedFrom: list.dataset.allowedFrom || "",
        cards: [...list.querySelectorAll(".card")].map(c => ({
          id:   c.id,
          text: c.textContent.trim(),
        })),
      };
    });
    return snap;
  },

  push(snapBefore) {
    this.past.push(snapBefore);
    if (this.past.length > this.MAX) this.past.shift();
    this.future = [];
    UndoBar.update();
  },

  canUndo() { return this.past.length > 0; },
  canRedo() { return this.future.length > 0; },

  /**
   * Restore a snapshot. Because dynamically created cards may not
   * exist in the DOM yet, we create them if missing before moving.
   */
  applySnapshot(snap) {
    for (const [listId, data] of Object.entries(snap)) {
      let area = document.querySelector("#" + listId + " .cards-area");
      if (!area) {
        // List was added after snapshot — recreate it
        ListComponent.create({
          id:          listId,
          label:       data.label,
          color:       data.color,
          allowedFrom: data.allowedFrom,
          animate:     false,
        });
        area = document.querySelector("#" + listId + " .cards-area");
      }
      if (!area) continue;

      for (const { id, text } of data.cards) {
        let card = document.getElementById(id);
        if (!card) {
          // Card was added after snapshot — recreate it
          card = CardComponent.create({ id, text, listId });
        }
        area.appendChild(card);
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
   UNDO BAR
   ═══════════════════════════════════════════════════════════════ */
const UndoBar = {
  el: null, msgEl: null, btnEl: null, timer: null,

  init() {
    this.el    = document.getElementById("undoBar");
    this.msgEl = document.getElementById("undoMsg");
    this.btnEl = document.getElementById("undoBtn");
    this.btnEl.addEventListener("click", () => History.undo());
  },

  flash(msg = "Card moved") {
    if (!this.el) return;
    clearTimeout(this.timer);
    this.msgEl.textContent = msg;
    this.el.classList.add("visible");
    this.timer = setTimeout(() => this.el.classList.remove("visible"), 4000);
  },

  update() {
    if (!this.btnEl) return;
    this.btnEl.disabled = !History.canUndo();
  },
};


/* ═══════════════════════════════════════════════════════════════
   A11Y  —  screen-reader + keyboard drag engine
   ═══════════════════════════════════════════════════════════════ */
const A11y = {

  announceEl:    null,
  kbdCard:       null,
  kbdSourceList: null,

  init() {
    this.announceEl = document.getElementById("a11yAnnounce");

    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); History.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault(); History.redo();
      }
      if (e.key === "Escape" && this.kbdCard) {
        this.cancelKbd();
      }
    });
  },

  announce(msg) {
    if (!this.announceEl) return;
    this.announceEl.textContent = "";
    requestAnimationFrame(() => { this.announceEl.textContent = msg; });
  },

  onCardKeydown(e, card) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (this.kbdCard === card) {
        this.dropKbd();
      } else {
        this.pickupKbd(card);
      }
    }
    if (!this.kbdCard) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const lists = [...document.querySelectorAll(".list")];
      const idx = lists.indexOf(this.kbdCard.closest(".list"));
      const next = e.key === "ArrowRight" ? lists[idx + 1] : lists[idx - 1];
      if (next) this.moveKbdToList(next);
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this.moveKbdWithinList(e.key === "ArrowUp" ? -1 : 1);
    }
  },

  pickupKbd(card) {
    if (this.kbdCard) this.cancelKbd();
    this.kbdCard       = card;
    this.kbdSourceList = card.closest(".list");
    card.classList.add("kbd-picked");
    card.setAttribute("aria-grabbed", "true");
    document.querySelectorAll(".list").forEach(list => {
      const allowed = list.dataset.allowedFrom;
      const ok = !allowed || allowed.split(",").map(s => s.trim())
                              .includes(this.kbdSourceList.id);
      if (ok) list.classList.add("kbd-target");
    });
    const col = this.kbdSourceList.dataset.label || "column";
    this.announce(
      `${card.textContent.trim()} picked up from ${col}. ` +
      `Arrow keys to navigate. Space or Enter to drop. Escape to cancel.`
    );
  },

  moveKbdToList(targetList) {
    if (!this.kbdCard) return;
    const allowed = targetList.dataset.allowedFrom;
    const ok = !allowed || allowed.split(",").map(s => s.trim())
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
    const target = cards[idx + direction];
    if (!target) return;
    direction === -1
      ? area.insertBefore(this.kbdCard, target)
      : area.insertBefore(target, this.kbdCard);
    this.kbdCard.focus();
    this.announce(`Reordered within ${this.kbdCard.closest(".list").dataset.label}.`);
  },

  dropKbd() {
    if (!this.kbdCard) return;
    const card     = this.kbdCard;
    const colLabel = card.closest(".list").dataset.label || "column";
    const snap     = History.snapshot();
    History.push(snap);
    this.clearKbdState();
    Physics.settle(card);
    updateAllCounts();
    Storage.save();
    UndoBar.flash("Card moved  ·  Ctrl+Z to undo");
    this.announce(`Dropped in ${colLabel}.`);
  },

  cancelKbd() {
    if (!this.kbdCard) return;
    const card = this.kbdCard;
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
   ═══════════════════════════════════════════════════════════════ */
const Physics = {
  settle(card) {
    if (!card) return;
    card.classList.remove("settling");
    void card.offsetWidth; // force reflow to re-trigger animation
    card.classList.add("settling");
    card.addEventListener("animationend", () => {
      card.classList.remove("settling");
    }, { once: true });
  },
};


/* ═══════════════════════════════════════════════════════════════
   DRAG MANAGER  —  central state engine
   ═══════════════════════════════════════════════════════════════ */
const DragManager = {

  draggingEl:   null,
  sourceListId: null,
  placeholder:  null,
  touchClone:   null,
  touchOffsetX: 0,
  touchOffsetY: 0,

  isDropAllowed(targetList) {
    const allowed = targetList.dataset.allowedFrom;
    if (!allowed) return true;
    return allowed.split(",").map(s => s.trim()).includes(this.sourceListId);
  },

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

  /* Collision detection — midpoint overlap via getBoundingClientRect */
  getInsertReference(area, clientY) {
    const cards = [...area.querySelectorAll(
      ".card:not(.dragging):not(.touch-dragging)"
    )];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return card;
    }
    return null;
  },

  movePlaceholderTo(area, clientY) {
    this.removePlaceholder();
    const ph = this.createPlaceholder(this.draggingEl.offsetHeight || 54);
    this.placeholder = ph;
    area.insertBefore(ph, this.getInsertReference(area, clientY));
  },

  /* ── Snap-to-grid overlay ────────────────────────────────────
     Activate the CSS grid guide on the target column's cards-area.
     Only one area is active at a time.                           */
  _activeSnapArea: null,

  activateSnap(area) {
    if (this._activeSnapArea === area) return;
    this.deactivateSnap();
    area.classList.add("snap-active");
    this._activeSnapArea = area;
  },

  deactivateSnap() {
    if (this._activeSnapArea) {
      this._activeSnapArea.classList.remove("snap-active");
      this._activeSnapArea = null;
    }
  },

  /* commitDrop — snapshots history, then moves card */
  commitDrop(area) {
    if (!this.draggingEl) return null;
    const snap = History.snapshot();
    const ph   = this.placeholder;
    if (ph && ph.parentNode === area) {
      area.insertBefore(this.draggingEl, ph);
    } else {
      area.appendChild(this.draggingEl);
    }
    this.removePlaceholder();
    History.push(snap);
    return area.closest(".list");
  },

  reset() {
    this.draggingEl   = null;
    this.sourceListId = null;
    this.removePlaceholder();
    this.deactivateSnap();
  },
};


/* ═══════════════════════════════════════════════════════════════
   RICH DRAG GHOST  —  Tier 4 upgrade
   Populates the structured #dragGhost with label, accent stripe,
   and origin-column badge.
   ═══════════════════════════════════════════════════════════════ */
const Ghost = {
  el:     null,
  stripe: null,
  label:  null,
  origin: null,

  init() {
    this.el     = document.getElementById("dragGhost");
    this.stripe = document.getElementById("ghostStripe");
    this.label  = document.getElementById("ghostLabel");
    this.origin = document.getElementById("ghostOrigin");
  },

  populate(card) {
    const list  = card.closest(".list");
    const color = list ? list.dataset.color : "";
    const hex   = COLOR_MAP[color] || DEFAULT_COLOR;

    this.stripe.style.background = hex;
    this.label.textContent       = card.textContent.trim();
    this.origin.textContent      = list ? (list.dataset.label || "") : "";
    this.origin.style.color      = hex;

    // Park off-screen so setDragImage can render it
    this.el.style.top  = "-9999px";
    this.el.style.left = "-9999px";
    document.body.appendChild(this.el);
  },

  detach() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  },
};


/* ═══════════════════════════════════════════════════════════════
   PERSISTENCE
   ═══════════════════════════════════════════════════════════════ */
const Storage = {

  KEY: "kanban_layout_v4",  // bumped — new snapshot format includes dynamic cards

  save() {
    // Use History.snapshot() format — includes card text for dynamic cards
    const snap = History.snapshot();
    try {
      localStorage.setItem(this.KEY, JSON.stringify(snap));
    } catch (e) { /* quota / private browsing */ }
  },

  load() {
    let raw;
    try { raw = localStorage.getItem(this.KEY); } catch (e) { return false; }
    if (!raw) return false;
    let snap;
    try { snap = JSON.parse(raw); } catch (e) { return false; }

    // Determine which list IDs currently exist vs need to be created
    for (const [listId, data] of Object.entries(snap)) {
      const existingArea = document.querySelector("#" + listId + " .cards-area");

      if (!existingArea) {
        // Dynamic list was persisted — recreate it
        ListComponent.create({
          id:          listId,
          label:       data.label,
          color:       data.color,
          allowedFrom: data.allowedFrom,
          animate:     false,
        });
      }

      const area = document.querySelector("#" + listId + " .cards-area");
      if (!area) continue;

      for (const { id, text } of data.cards) {
        let card = document.getElementById(id);
        if (!card) {
          // Dynamic card — recreate it
          card = CardComponent.create({ id, text, listId, bind: false });
        }
        area.appendChild(card);
      }
    }
    return true;
  },
};


/* ═══════════════════════════════════════════════════════════════
   TOAST
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
   CARD COMPONENT  —  factory + binding
   ═══════════════════════════════════════════════════════════════ */
const CardComponent = {

  /**
   * Create a card DOM element and optionally append it to a list.
   * @param {object} opts
   *   id      – card id (auto-generated if omitted)
   *   text    – card label text
   *   listId  – if provided, appends to that list's cards-area
   *   bind    – whether to attach drag/touch/kbd listeners (default true)
   *   animate – whether to add .card--new entrance animation (default true)
   */
  create({ id, text, listId, bind = true, animate = true } = {}) {
    const cardId = id || uid("card");
    const card   = document.createElement("div");

    card.className   = "card";
    card.id          = cardId;
    card.draggable   = true;
    card.tabIndex    = 0;
    card.setAttribute("role",        "listitem");
    card.setAttribute("aria-grabbed","false");
    card.setAttribute("aria-label",  `${text}. Press Space to pick up.`);
    card.setAttribute("data-kbd-hint","Space: pick up");
    card.textContent = text;

    if (bind)    bindCard(card);
    if (animate) card.classList.add("card--new");

    if (listId) {
      const area = document.querySelector("#" + listId + " .cards-area");
      if (area) area.appendChild(card);
    }

    return card;
  },
};


/* ═══════════════════════════════════════════════════════════════
   LIST COMPONENT  —  factory + binding
   ═══════════════════════════════════════════════════════════════ */
const ListComponent = {

  _nextColorIdx: 0,
  _colors:       ["purple", "blue", "green", "amber", "coral", "teal"],

  /**
   * Create a list (column) DOM element and insert it before the
   * "Add column" button.
   * @param {object} opts
   *   id          – list id (auto-generated if omitted)
   *   label       – column heading text
   *   color       – accent color key (cycles through _colors if omitted)
   *   allowedFrom – comma-separated list IDs allowed to drop here
   *   animate     – entrance animation (default true)
   */
  create({ id, label, color, allowedFrom, animate = true } = {}) {
    const listId = id    || uid("list");
    const col    = color || this._colors[this._nextColorIdx++ % this._colors.length];
    const allIds = allowedFrom || this._buildAllowedFrom(listId);

    const list = document.createElement("div");
    list.className = "list";
    list.id        = listId;
    list.setAttribute("role",             "region");
    list.setAttribute("aria-label",       `${label} column`);
    list.setAttribute("data-label",        label);
    list.setAttribute("data-color",        col);
    list.setAttribute("data-allowed-from", allIds);

    list.innerHTML = `
      <div class="list-header">
        <h2>${this._escHtml(label)}</h2>
        <span class="card-count" aria-live="polite">0</span>
      </div>
      <div class="cards-area"></div>
      <button class="add-card-btn" data-list="${listId}" aria-label="Add card to ${this._escHtml(label)}">
        <span aria-hidden="true">+</span> Add card
      </button>
    `;

    if (animate) list.classList.add("list--new");

    // Insert before the "Add column" button
    const addBtn = document.getElementById("addListBtn");
    addBtn.parentNode.insertBefore(list, addBtn);

    // Bind the cards-area as a drop zone
    bindArea(list.querySelector(".cards-area"));

    // Bind the "Add card" button
    bindAddCardBtn(list.querySelector(".add-card-btn"));

    // Update existing columns' allowed-from to include the new list
    this._updateAllowedFrom(listId);

    return list;
  },

  /** Build a comma-separated allowedFrom string containing all existing list IDs + this one. */
  _buildAllowedFrom(newId) {
    const ids = [...document.querySelectorAll(".list")].map(l => l.id);
    ids.push(newId);
    return ids.join(",");
  },

  /** After a new list is created, patch all other lists' data-allowed-from to include it. */
  _updateAllowedFrom(newId) {
    document.querySelectorAll(".list").forEach(list => {
      const current = (list.dataset.allowedFrom || "").split(",").map(s => s.trim());
      if (!current.includes(newId)) {
        current.push(newId);
        list.dataset.allowedFrom = current.join(",");
      }
    });
  },

  _escHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  },
};


/* ═══════════════════════════════════════════════════════════════
   CARD EDITOR  —  inline "Add card" UI
   ═══════════════════════════════════════════════════════════════ */
const CardEditor = {

  el:         null,
  inputEl:    null,
  saveBtn:    null,
  cancelBtn:  null,
  targetList: null,  // list id we're adding to

  init() {
    this.el        = document.getElementById("cardEditor");
    this.inputEl   = document.getElementById("cardEditorInput");
    this.saveBtn   = document.getElementById("cardEditorSave");
    this.cancelBtn = document.getElementById("cardEditorCancel");

    this.saveBtn.addEventListener("click",   () => this.save());
    this.cancelBtn.addEventListener("click", () => this.close());

    this.inputEl.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.save(); }
      if (e.key === "Escape") this.close();
    });

    this.inputEl.addEventListener("input", () => {
      this.saveBtn.disabled = this.inputEl.value.trim().length === 0;
    });
  },

  open(listId) {
    this.targetList = listId;
    this.inputEl.value = "";
    this.saveBtn.disabled = true;

    // Move the editor element into the target list, before the add-card button
    const addBtn = document.querySelector(`[data-list="${listId}"].add-card-btn`);
    if (addBtn) {
      addBtn.parentNode.insertBefore(this.el, addBtn);
    }

    this.el.hidden = false;
    requestAnimationFrame(() => this.inputEl.focus());
  },

  save() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    const snap = History.snapshot();
    History.push(snap);

    const card = CardComponent.create({
      text,
      listId:  this.targetList,
      animate: true,
    });

    this.close();
    updateAllCounts();
    Storage.save();
    UndoBar.flash("Card added  ·  Ctrl+Z to undo");

    // Focus the new card
    requestAnimationFrame(() => card.focus());
  },

  close() {
    this.el.hidden = true;
    this.targetList = null;
    // Return editor element to body so it's not stuck in any list
    document.body.appendChild(this.el);
  },
};


/* ═══════════════════════════════════════════════════════════════
   MOUSE / HTML5 DRAG API
   ═══════════════════════════════════════════════════════════════ */
function onDragStart(e) {
  const card = e.currentTarget;
  DragManager.draggingEl   = card;
  DragManager.sourceListId = card.closest(".list").id;

  e.dataTransfer.setData("text/plain", card.id);
  e.dataTransfer.effectAllowed = "move";

  // Rich ghost
  Ghost.populate(card);
  e.dataTransfer.setDragImage(Ghost.el, 24, 18);

  requestAnimationFrame(() => {
    card.classList.add("dragging");
    card.setAttribute("aria-grabbed", "true");
  });
}

function onDragEnd(e) {
  const card = e.currentTarget;
  card.classList.remove("dragging");
  card.setAttribute("aria-grabbed", "false");
  Ghost.detach();
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
    DragManager.deactivateSnap();
    return;
  }

  e.dataTransfer.dropEffect = "move";
  DragManager.movePlaceholderTo(area, e.clientY);
  DragManager.activateSnap(area);         // snap-to-grid overlay
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
    DragManager.deactivateSnap();
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
    DragManager.deactivateSnap();
    return;
  }

  const card = DragManager.draggingEl;
  DragManager.commitDrop(area);
  DragManager.deactivateSnap();
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
  clone.textContent = card.textContent.trim();
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
    clone.style.left    = (touch.clientX - DragManager.touchOffsetX) + "px";
    clone.style.top     = (touch.clientY - DragManager.touchOffsetY) + "px";
    clone.style.display = "none";
  }

  const elBelow    = document.elementFromPoint(touch.clientX, touch.clientY);
  if (clone) clone.style.display = "";
  if (!elBelow) { DragManager.removePlaceholder(); DragManager.deactivateSnap(); return; }

  const area       = elBelow.closest(".cards-area");
  const targetList = elBelow.closest(".list");

  document.querySelectorAll(".list").forEach(l => l.classList.remove("over", "rejected"));

  if (area && targetList) {
    if (DragManager.isDropAllowed(targetList)) {
      targetList.classList.add("over");
      DragManager.movePlaceholderTo(area, touch.clientY);
      DragManager.activateSnap(area);
    } else {
      targetList.classList.add("rejected");
      DragManager.removePlaceholder();
      DragManager.deactivateSnap();
    }
  } else {
    DragManager.removePlaceholder();
    DragManager.deactivateSnap();
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
   BINDING HELPERS
   ═══════════════════════════════════════════════════════════════ */
function bindCard(card) {
  card.addEventListener("dragstart",  onDragStart);
  card.addEventListener("dragend",    onDragEnd);
  card.addEventListener("touchstart", onTouchStart, { passive: true });
  card.addEventListener("touchmove",  onTouchMove,  { passive: false });
  card.addEventListener("touchend",   onTouchEnd,   { passive: true });
  card.addEventListener("keydown",    e => A11y.onCardKeydown(e, card));
  card.setAttribute("data-kbd-hint",  "Space: pick up");
}

function bindArea(area) {
  area.addEventListener("dragover",  onDragOver);
  area.addEventListener("dragenter", onDragEnter);
  area.addEventListener("dragleave", onDragLeave);
  area.addEventListener("drop",      onDrop);
}

function bindAddCardBtn(btn) {
  btn.addEventListener("click", () => {
    const listId = btn.dataset.list;
    CardEditor.open(listId);
  });
}


/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
function init() {
  Toast.init();
  UndoBar.init();
  A11y.init();
  Ghost.init();
  CardEditor.init();

  // Restore persisted layout BEFORE binding so restored cards get listeners
  const restored = Storage.load();

  // Bind all existing cards (including any restored)
  document.querySelectorAll(".card").forEach(bindCard);

  // Bind all existing drop areas
  document.querySelectorAll(".cards-area").forEach(bindArea);

  // Bind all existing "Add card" buttons
  document.querySelectorAll(".add-card-btn").forEach(bindAddCardBtn);

  // "Add column" button
  document.getElementById("addListBtn").addEventListener("click", () => {
    const label = prompt("Column name:");
    if (!label || !label.trim()) return;
    ListComponent.create({ label: label.trim() });
    updateAllCounts();
    Storage.save();
  });

  updateAllCounts();
  UndoBar.update();

  if (restored) {
    Toast.show("✓ Board restored", "success", 1800);
  }
}

init();
