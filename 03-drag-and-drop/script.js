/**
 * Kanban Board — Tier 2
 *
 * Built on Tier 1 (placeholder, sortable, multi-container, ghost, visual feedback).
 * Adds:
 *  1. DragManager — central state engine (single source of truth)
 *  2. LocalStorage persistence — board layout survives page refresh
 *  3. Mobile touch support — touchstart/touchmove/touchend with floating clone
 *  4. Constraint system — data-allowed-from controls which columns accept drops
 *
 * Architecture:
 *  DragManager owns ALL drag state. Every handler reads/writes through it.
 *  Mouse (HTML5 drag API) and Touch events call the same DragManager methods,
 *  so the rest of the system is entirely input-agnostic.
 */

/* ═══════════════════════════════════════════════════════════════
   DRAG MANAGER  —  central state engine
   ═══════════════════════════════════════════════════════════════ */
const DragManager = {

  /* ── State ─────────────────────────────────────────────────── */
  draggingEl:   null,   // card DOM element in flight
  sourceListId: null,   // id of the list the card came from
  placeholder:  null,   // placeholder div currently in the DOM

  /* Touch-specific */
  touchClone:   null,   // floating clone that follows the finger
  touchOffsetX: 0,      // finger offset inside the card rect
  touchOffsetY: 0,

  /* ── Constraint Check ──────────────────────────────────────── */
  /**
   * Returns true if dropping draggingEl into targetList is allowed.
   * Reads data-allowed-from="list1,list2,list3" on the target list element.
   */
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

  /* ── Commit Drop ───────────────────────────────────────────── */
  commitDrop(area) {
    if (!this.draggingEl) return null;
    const ph = this.placeholder;
    if (ph && ph.parentNode === area) {
      area.insertBefore(this.draggingEl, ph);
    } else {
      area.appendChild(this.draggingEl);
    }
    this.removePlaceholder();
    return area.closest(".list");
  },

  /* ── Reset ─────────────────────────────────────────────────── */
  reset() {
    this.draggingEl   = null;
    this.sourceListId = null;
    this.removePlaceholder();
    // Touch clone cleanup is handled in onTouchEnd
  },
};


/* ═══════════════════════════════════════════════════════════════
   PERSISTENCE  —  LocalStorage layer
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
    } catch (e) {
      /* quota exceeded or private browsing — fail silently */
    }
  },

  /**
   * Restore saved layout by moving card DOM nodes into their persisted columns.
   * Returns true if a saved layout was found and applied.
   */
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
   TOAST  —  lightweight feedback notifications
   ═══════════════════════════════════════════════════════════════ */
const Toast = {
  el: null,
  timer: null,

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

  DragManager.commitDrop(area);
  targetList.classList.remove("over");
  updateAllCounts();
  Storage.save();
}


/* ═══════════════════════════════════════════════════════════════
   TOUCH API  —  mobile drag support
   
   Strategy:
     touchstart  → record card, create floating clone
     touchmove   → move clone with finger; hit-test drop zone
     touchend    → hit-test final position; commitDrop or reject
   
   Uses the same DragManager.isDropAllowed() and commitDrop() as
   the mouse path — zero duplication of business logic.
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
  e.preventDefault(); // prevent page scroll while card is in flight

  const touch = e.touches[0];
  const clone = DragManager.touchClone;

  if (clone) {
    clone.style.left = (touch.clientX - DragManager.touchOffsetX) + "px";
    clone.style.top  = (touch.clientY - DragManager.touchOffsetY) + "px";
    // Hide clone momentarily so elementFromPoint finds elements beneath it
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
  } else if (targetList && !DragManager.isDropAllowed(targetList)) {
    Toast.show("⛔ Can't move here", "error");
  }
  // Dropped outside any list → card stays in place (placeholder removed by reset)

  DragManager.reset();
  updateAllCounts();
  Storage.save();
}


/* ═══════════════════════════════════════════════════════════════
   BINDING
   ═══════════════════════════════════════════════════════════════ */
function bindCard(card) {
  card.addEventListener("dragstart",  onDragStart);
  card.addEventListener("dragend",    onDragEnd);
  card.addEventListener("touchstart", onTouchStart, { passive: true });
  card.addEventListener("touchmove",  onTouchMove,  { passive: false });
  card.addEventListener("touchend",   onTouchEnd,   { passive: true });
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

  // Restore persisted layout BEFORE binding, so restored cards get listeners too
  const restored = Storage.load();

  document.querySelectorAll(".card").forEach(bindCard);
  document.querySelectorAll(".cards-area").forEach(bindArea);

  updateAllCounts();

  if (restored) {
    Toast.show("✓ Board restored", "success", 1800);
  }
}

init();
