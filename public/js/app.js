// UI wiring: view switching, the study loop, and the manage view. Reads/writes go
// through store.js (local mirror); sync.js reconciles with the server in the background.

import { humanDue, newCard, schedule } from "./srs.js";
import {
  applyLocal,
  deleteLocal,
  getAllCards,
  getDueCards,
} from "./store.js";
import { sync } from "./sync.js";

const $ = (sel) => document.querySelector(sel);

// ---- Views ----

function showView(name) {
  for (const el of document.querySelectorAll(".view")) {
    el.hidden = el.id !== `view-${name}`;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    tab.setAttribute("aria-current", tab.dataset.view === name ? "true" : "false");
  }
  if (name === "study") renderStudy();
  else renderManage();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

// ---- Study loop ----
//
// Two modes:
//   "due" — real spaced repetition: only cards that are due, graded, rescheduled.
//   "all" — practice every card, shuffled, without touching the schedule.

let studyMode = "all";
let queue = []; // cards remaining in this session
let current = null;
let revealed = false;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderStudy() {
  queue = studyMode === "due" ? getDueCards() : shuffle(getAllCards());
  nextCard();
}

function nextCard() {
  current = queue.shift() || null;
  revealed = false;

  const empty = $("#study-empty");
  const card = $("#study-card");

  if (!current) {
    $("#study-empty-text").textContent =
      studyMode === "due"
        ? "Nothing due right now."
        : "No cards yet — add some in Manage.";
    empty.hidden = false;
    card.hidden = true;
    return;
  }

  empty.hidden = true;
  card.hidden = false;

  $("#card-front").textContent = current.front;
  $("#card-back").textContent = current.back;
  $("#card-back").hidden = true;
  $("#btn-reveal").hidden = false;
  $("#grade-buttons").hidden = true;
  $("#btn-next").hidden = true;
}

function reveal() {
  if (!current || revealed) return;
  revealed = true;
  $("#card-back").hidden = false;
  $("#btn-reveal").hidden = true;
  // Due mode grades + reschedules; All mode is pure practice (just "Next").
  $("#grade-buttons").hidden = studyMode !== "due";
  $("#btn-next").hidden = studyMode === "due";
}

function grade(g) {
  if (!current || !revealed || studyMode !== "due") return;
  const updated = schedule(current, g);
  applyLocal(updated);
  // If still due soon (e.g. "again"), requeue within this session so short relearn
  // intervals repeat before the session ends.
  if (new Date(updated.due_at).getTime() - Date.now() <= 10 * 60 * 1000) {
    queue.push(updated);
  }
  nextCard();
  syncSoon();
}

// practiceNext advances in "all" mode without changing any schedule. The card is
// pushed back so you can keep looping the pile as long as you like.
function practiceNext() {
  if (!current || !revealed) return;
  queue.push(current);
  nextCard();
}

function setStudyMode(mode) {
  studyMode = mode;
  for (const btn of document.querySelectorAll(".mode-btn")) {
    btn.setAttribute("aria-current", btn.dataset.mode === mode ? "true" : "false");
  }
  renderStudy();
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setStudyMode(btn.dataset.mode));
});

$("#btn-reveal").addEventListener("click", reveal);
$("#btn-next").addEventListener("click", practiceNext);
$("#grade-buttons").addEventListener("click", (e) => {
  const btn = e.target.closest(".grade");
  if (btn) grade(btn.dataset.grade);
});

// Keyboard: space/enter reveals; then 1-4 grades (Due) or space/enter advances (All).
document.addEventListener("keydown", (e) => {
  if ($("#view-study").hidden) return;
  if (e.target.matches("input, textarea")) return;
  if (!revealed && (e.code === "Space" || e.code === "Enter")) {
    e.preventDefault();
    reveal();
  } else if (revealed && studyMode === "due" && ["1", "2", "3", "4"].includes(e.key)) {
    grade(["again", "hard", "good", "easy"][Number(e.key) - 1]);
  } else if (revealed && studyMode === "all" && (e.code === "Space" || e.code === "Enter")) {
    e.preventDefault();
    practiceNext();
  }
});

// ---- Manage view ----

let editingId = null; // id of the card currently being edited inline, or null

function renderManage() {
  const cards = getAllCards();
  $("#manage-count").textContent = cards.length
    ? `${cards.length} card${cards.length === 1 ? "" : "s"}`
    : "No cards yet — add your first below.";

  const list = $("#card-list");
  list.innerHTML = "";
  for (const c of cards) {
    list.appendChild(c.id === editingId ? editRow(c) : displayRow(c));
  }
}

// displayRow renders a card in read mode with edit + delete buttons.
function displayRow(c) {
  const li = document.createElement("li");
  li.className = "card-item";
  li.innerHTML = `
    <div class="texts">
      <div class="front"></div>
      <div class="back"></div>
    </div>
    <span class="due"></span>
    <button class="icon-btn edit" title="Edit" aria-label="Edit card">✎</button>
    <button class="icon-btn delete" title="Delete" aria-label="Delete card">✕</button>`;
  li.querySelector(".front").textContent = c.front;
  li.querySelector(".back").textContent = c.back;
  li.querySelector(".due").textContent = humanDue(c);
  li.querySelector(".edit").addEventListener("click", () => {
    editingId = c.id;
    renderManage();
  });
  li.querySelector(".delete").addEventListener("click", () => {
    if (confirm(`Delete this card?\n\n${c.front}`)) {
      deleteLocal(c.id);
      renderManage();
      syncSoon();
    }
  });
  return li;
}

// editRow renders inline front/back inputs with Save/Cancel. Saving keeps the card's
// spaced-repetition schedule and only changes the text (plus updated_at).
function editRow(c) {
  const li = document.createElement("li");
  li.className = "card-item editing";
  li.innerHTML = `
    <div class="texts edit-fields">
      <textarea class="input edit-front" rows="2"></textarea>
      <textarea class="input edit-back" rows="2"></textarea>
    </div>
    <button class="icon-btn save" title="Save" aria-label="Save card">✓</button>
    <button class="icon-btn cancel" title="Cancel" aria-label="Cancel edit">✕</button>`;
  const front = li.querySelector(".edit-front");
  const back = li.querySelector(".edit-back");
  front.value = c.front;
  back.value = c.back;

  const save = () => {
    const f = front.value.trim();
    const b = back.value.trim();
    if (!f || !b) return;
    applyLocal({ ...c, front: f, back: b, updated_at: new Date().toISOString() });
    editingId = null;
    renderManage();
    syncSoon();
  };
  const cancel = () => {
    editingId = null;
    renderManage();
  };

  li.querySelector(".save").addEventListener("click", save);
  li.querySelector(".cancel").addEventListener("click", cancel);
  li.addEventListener("keydown", (e) => {
    // Plain Enter inserts a newline in the textareas; Cmd/Ctrl+Enter saves.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancel();
    }
  });
  // Focus the front field once the row is in the DOM.
  queueMicrotask(() => front.focus());
  return li;
}

$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const front = $("#add-front").value.trim();
  const back = $("#add-back").value.trim();
  if (!front || !back) return;
  applyLocal(newCard(crypto.randomUUID(), front, back));
  e.target.reset();
  $("#add-front").focus();
  renderManage();
  syncSoon();
});

// Plain Enter inserts a newline in the textareas; Cmd/Ctrl+Enter submits.
$("#add-form").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    $("#add-form").requestSubmit();
  }
});

// ---- Sync status indicator ----

const statusEl = $("#sync-status");
function setStatus(cls) {
  statusEl.className = "sync " + cls;
}

let syncTimer = null;
function syncSoon() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, 400); // debounce bursts of edits
}

async function runSync() {
  if (!navigator.onLine) {
    setStatus("offline");
    return;
  }
  const ok = await sync();
  setStatus(ok ? "online" : "offline");
  // Refresh with freshly-pulled data — but never reset an in-progress study session.
  // Only re-render study when it's idle (no card on screen), e.g. at boot or on the
  // empty state; the manage view is always safe to refresh.
  if ($("#view-study").hidden) renderManage();
  else if (current === null) renderStudy();
}

window.addEventListener("memoeyez:syncing", () => setStatus("syncing"));
window.addEventListener("online", runSync);
window.addEventListener("offline", () => setStatus("offline"));

// ---- Pull to refresh (mobile / PWA) ----
//
// A drag downward while scrolled to the very top reveals a spinner; releasing past
// the threshold runs a sync. The browser's native pull-to-refresh is disabled in CSS
// (overscroll-behavior) so this is the only refresh gesture.

const ptrEl = $("#ptr");
const appEl = $("#app");
const PTR_THRESHOLD = 64; // px of pull needed to trigger a refresh
const PTR_MAX = 100; // px the page can travel
let ptrStartY = 0;
let ptrDist = 0;
let ptrPulling = false;
let ptrBusy = false;

function docScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

// Slide the whole page down by `dist` and reveal the spinner in the gap above it.
function setPtr(dist, animate) {
  const t = animate ? "" : "none";
  appEl.style.transition = t;
  ptrEl.style.transition = t;
  appEl.style.transform = dist ? `translateY(${dist}px)` : "";
  ptrEl.style.transform = dist ? `translateY(${dist - 44}px)` : "";
  ptrEl.style.opacity = dist ? String(Math.min(1, dist / PTR_THRESHOLD)) : "";
}

function resetPtr() {
  ptrPulling = false;
  ptrDist = 0;
  setPtr(0, true); // animate back up
  ptrEl.classList.remove("ready");
}

window.addEventListener(
  "touchstart",
  (e) => {
    if (ptrBusy || e.touches.length !== 1 || docScrollTop() > 0) return;
    ptrStartY = e.touches[0].clientY;
    ptrPulling = true;
    ptrDist = 0;
  },
  { passive: true }
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (!ptrPulling) return;
    const dy = e.touches[0].clientY - ptrStartY;
    if (dy <= 0 || docScrollTop() > 0) {
      resetPtr();
      return;
    }
    ptrDist = Math.min(PTR_MAX, dy * 0.5); // resistance
    setPtr(ptrDist, false); // follow the finger, no transition lag
    ptrEl.classList.toggle("ready", ptrDist >= PTR_THRESHOLD);
    if (ptrDist > 4) e.preventDefault(); // suppress native scroll while pulling
  },
  { passive: false }
);

window.addEventListener("touchend", async () => {
  if (!ptrPulling) return;
  const trigger = ptrDist >= PTR_THRESHOLD;
  if (!trigger) {
    resetPtr();
    return;
  }
  // Hold the page open at the threshold and spin while syncing.
  ptrBusy = true;
  ptrPulling = false;
  ptrEl.classList.add("refreshing");
  ptrEl.classList.remove("ready");
  setPtr(PTR_THRESHOLD, true);
  try {
    await runSync();
  } finally {
    ptrEl.classList.remove("refreshing");
    ptrBusy = false;
    resetPtr();
  }
});

// ---- Boot ----

showView("study");
setStatus(navigator.onLine ? "online" : "offline");
runSync();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) =>
      console.warn("SW registration failed:", err)
    );
  });
}
