// Sync logic: flush the outbox to the server, then replace the local mirror with the
// server's card set. Study/manage always read from the mirror, so the UI never blocks
// on the network — sync just reconciles in the background.

import { deleteCard, fetchCards, upsertCards } from "./api.js";
import { getOutbox, replaceCards, setOutbox } from "./store.js";

let syncing = false;

// flush sends each pending outbox op to the server. Successful ops are dropped from
// the outbox; anything that fails stays queued for the next attempt.
async function flush() {
  const box = getOutbox();
  const remaining = [];
  for (const item of box) {
    try {
      if (item.op === "delete") await deleteCard(item.id);
      else await upsertCards([item.card]);
    } catch (err) {
      remaining.push(item); // keep it for next time
    }
  }
  setOutbox(remaining);
  return remaining;
}

// pull fetches all cards and replaces the mirror. Any still-pending outbox ops are
// re-overlaid so unsynced local changes are never clobbered by the server snapshot.
async function pull() {
  const serverCards = await fetchCards();
  const byId = new Map(serverCards.map((c) => [c.id, c]));

  for (const item of getOutbox()) {
    if (item.op === "delete") byId.delete(item.id);
    else byId.set(item.card.id, item.card);
  }
  replaceCards([...byId.values()]);
}

// sync = flush then pull. Returns true on a full success, false if offline / errored.
export async function sync() {
  if (syncing || !navigator.onLine) return false;
  syncing = true;
  window.dispatchEvent(new Event("memoeyez:syncing"));
  try {
    await flush();
    await pull();
    window.dispatchEvent(new Event("memoeyez:synced"));
    return true;
  } catch (err) {
    console.warn("sync failed:", err);
    return false;
  } finally {
    syncing = false;
  }
}
