// Thin fetch wrappers around the server API. These are the only functions that touch
// the network; everything else reads from the local mirror.

export async function fetchCards() {
  const res = await fetch("/api/cards", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET /api/cards -> ${res.status}`);
  return res.json();
}

export async function upsertCards(cards) {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cards),
  });
  if (!res.ok) throw new Error(`POST /api/cards -> ${res.status}`);
}

export async function deleteCard(id) {
  const res = await fetch(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/cards/${id} -> ${res.status}`);
}
