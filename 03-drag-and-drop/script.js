/**
 * Kanban Board — Tier 1
 *
 * Implements:
 *  1. Custom drag ghost (setDragImage)
 *  2. Drop placeholder (animated slot preview)
 *  3. Sortable list (reorder within & across columns)
 *  4. Multi-container drag (move cards between all lists)
 *  5. Visual feedback micro-interactions (.dragging, .over classes)
 *
 * Architecture note:
 *  A lightweight `state` object centralises drag metadata.
 *  This is the seed for the full DragManager introduced in Tier 2.
 */

/* ─── State (seed — will grow in Tier 2) ──────────────────── */
const state = {
  draggingEl: null,     // the card DOM element being dragged
  sourceList: null,     // the cards-area the card came from
  placeholder: null,    // the placeholder div currently in DOM
};

/* ─── DOM References ───────────────────────────────────────── */
const ghost = document.getElementById("dragGhost");
const board = document.querySelector(".board");

/* ─── Bootstrap ────────────────────────────────────────────── */
function init() {
  // Bind events to all existing cards
  document.querySelectorAll(".card").forEach(bindCard);

  // Bind events to all drop areas
  document.querySelectorAll(".cards-area").forEach(bindArea);

  // Update all column counters once on load
  updateAllCounts();
}

/* ─── Card Binding ─────────────────────────────────────────── */
function bindCard(card) {
  card.addEventListener("dragstart", onDragStart);
  card.addEventListener("dragend",   onDragEnd);
}

/* ─── Area (Drop Zone) Binding ─────────────────────────────── */
function bindArea(area) {
  area.addEventListener("dragover",  onDragOver);
  area.addEventListener("dragenter", onDragEnter);
  area.addEventListener("dragleave", onDragLeave);
  area.addEventListener("drop",      onDrop);
}

/* ─── Placeholder Helpers ──────────────────────────────────── */
function createPlaceholder(height) {
  const ph = document.createElement("div");
  ph.classList.add("placeholder");
  ph.style.height = height + "px";
  // Trigger CSS animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ph.classList.add("visible"));
  });
  return ph;
}

function removePlaceholder() {
  if (state.placeholder && state.placeholder.parentNode) {
    state.placeholder.parentNode.removeChild(state.placeholder);
  }
  state.placeholder = null;
}

/**
 * Insert the placeholder above the card closest to the cursor's Y position.
 * Returns the reference node (insertBefore target), or null (append).
 */
function getInsertReference(area, clientY) {
  const draggableCards = [...area.querySelectorAll(".card:not(.dragging)")];
  if (draggableCards.length === 0) return null;

  for (const card of draggableCards) {
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return card;
  }
  return null; // append to end
}

function movePlaceholderTo(area, clientY) {
  removePlaceholder();

  const ph = createPlaceholder(state.draggingEl.offsetHeight || 54);
  state.placeholder = ph;

  const ref = getInsertReference(area, clientY);
  area.insertBefore(ph, ref); // ref=null → appends
}

/* ─── Counter Update ───────────────────────────────────────── */
function updateCount(list) {
  const count = list.querySelector(".cards-area").querySelectorAll(".card").length;
  list.querySelector(".card-count").textContent = count;
}

function updateAllCounts() {
  document.querySelectorAll(".list").forEach(updateCount);
}

/* ─── Drag Event Handlers ──────────────────────────────────── */
function onDragStart(e) {
  const card = e.currentTarget;
  state.draggingEl = card;
  state.sourceList = card.closest(".cards-area");

  // Transfer the card's ID so drop handler can identify it
  e.dataTransfer.setData("text/plain", card.id);
  e.dataTransfer.effectAllowed = "move";

  // ── Custom ghost image ──────────────────────────────────────
  ghost.textContent = card.textContent;
  // Position off-screen, append to body so it's renderable
  ghost.style.top  = "-9999px";
  ghost.style.left = "-9999px";
  document.body.appendChild(ghost);
  // Offset so cursor sits near the top-left of the ghost
  e.dataTransfer.setDragImage(ghost, 20, 16);

  // Delay adding .dragging so the ghost captures the pre-fade state
  requestAnimationFrame(() => {
    card.classList.add("dragging");
    card.setAttribute("aria-grabbed", "true");
  });
}

function onDragEnd(e) {
  const card = e.currentTarget;
  card.classList.remove("dragging");
  card.setAttribute("aria-grabbed", "false");
  removePlaceholder();

  // Remove ghost from DOM
  if (ghost.parentNode) ghost.parentNode.removeChild(ghost);

  // Clear state
  state.draggingEl = null;
  state.sourceList = null;

  updateAllCounts();
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  // Throttle placeholder updates to avoid jank
  const area = e.currentTarget;
  movePlaceholderTo(area, e.clientY);
}

function onDragEnter(e) {
  e.preventDefault();
  const area = e.currentTarget;
  area.closest(".list").classList.add("over");
}

function onDragLeave(e) {
  const area = e.currentTarget;
  const list = area.closest(".list");

  // relatedTarget is where the cursor is going.
  // Only remove .over / placeholder if the cursor has left the entire list.
  // This prevents flicker when the cursor moves over child cards or the placeholder.
  const leavingTo = e.relatedTarget;
  if (!list.contains(leavingTo)) {
    list.classList.remove("over");
    removePlaceholder();
  }
}

function onDrop(e) {
  e.preventDefault();
  const area = e.currentTarget;
  const list = area.closest(".list");

  if (!state.draggingEl) return;

  const ph = state.placeholder;
  if (ph && ph.parentNode === area) {
    // Insert the card exactly where the placeholder is
    area.insertBefore(state.draggingEl, ph);
  } else {
    // Fallback: append
    area.appendChild(state.draggingEl);
  }

  removePlaceholder();
  list.classList.remove("over");
  updateAllCounts();
}

/* ─── Run ───────────────────────────────────────────────────── */
init();
