// Local persistence: the offline source of truth. Mirrors cards and queues pending
// writes ("outbox") in localStorage. All storage details live here so a future swap
// to IndexedDB would not touch sync.js or app.js.

import { isDue } from "./srs.js";

const CARDS_KEY = "memoeyez.cards";
const OUTBOX_KEY = "memoeyez.outbox";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? [];
  } catch {
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Card mirror ----

export function getAllCards() {
  return read(CARDS_KEY).sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

export function getDueCards(now = new Date()) {
  return getAllCards().filter((c) => isDue(c, now));
}

export function getCard(id) {
  return read(CARDS_KEY).find((c) => c.id === id) || null;
}

// Replace the entire mirror (used by pull()).
export function replaceCards(cards) {
  write(CARDS_KEY, cards);
}

function putCard(card) {
  const cards = read(CARDS_KEY);
  const i = cards.findIndex((c) => c.id === card.id);
  if (i >= 0) cards[i] = card;
  else cards.push(card);
  write(CARDS_KEY, cards);
}

function removeCard(id) {
  write(
    CARDS_KEY,
    read(CARDS_KEY).filter((c) => c.id !== id)
  );
}

// ---- Local mutations (also queue an outbox op) ----

// applyLocal upserts a card locally and queues it for the server.
export function applyLocal(card) {
  putCard(card);
  enqueue({ op: "upsert", card });
}

// deleteLocal removes a card locally and queues a delete for the server.
export function deleteLocal(id) {
  removeCard(id);
  enqueue({ op: "delete", id });
}

// ---- Outbox ----

export function getOutbox() {
  return read(OUTBOX_KEY);
}

function enqueue(item) {
  const box = read(OUTBOX_KEY);
  // Collapse repeated ops on the same card so the queue stays small.
  const id = item.op === "delete" ? item.id : item.card.id;
  const filtered = box.filter((it) => (it.op === "delete" ? it.id : it.card.id) !== id);
  filtered.push(item);
  write(OUTBOX_KEY, filtered);
}

export function setOutbox(box) {
  write(OUTBOX_KEY, box);
}
