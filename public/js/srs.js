// SM-2 spaced-repetition scheduling. Pure functions — no I/O, no globals.
// Computed on the client so grading works fully offline.

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

// newCard builds a fresh card with default SRS state. `id` should be a UUID.
export function newCard(id, front, back) {
  const now = new Date().toISOString();
  return {
    id,
    front,
    back,
    due_at: now, // due immediately
    interval_days: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    created_at: now,
    updated_at: now,
  };
}

// schedule returns a NEW card object with updated SRS fields for the given grade.
// grade is one of: "again" | "hard" | "good" | "easy".
export function schedule(card, grade, now = new Date()) {
  let { ease, interval_days, reps, lapses } = card;

  if (grade === "again") {
    reps = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval_days = 10 / (24 * 60); // ~10 minutes, relearn soon
  } else {
    // Adjust ease factor per grade (standard SM-2 tweaks).
    if (grade === "hard") ease = Math.max(MIN_EASE, ease - 0.15);
    if (grade === "easy") ease += 0.15;

    reps += 1;

    if (reps === 1) {
      interval_days = grade === "easy" ? 4 : 1;
    } else if (reps === 2) {
      interval_days = 6;
    } else {
      const factor = grade === "hard" ? 1.2 : ease;
      interval_days = Math.round(interval_days * factor);
    }
    if (grade === "easy") interval_days = Math.round(interval_days * 1.3);
    interval_days = Math.max(interval_days, grade === "again" ? 0 : 1 / (24 * 60));
  }

  const due = new Date(now.getTime() + interval_days * DAY_MS);

  return {
    ...card,
    ease,
    interval_days,
    reps,
    lapses,
    due_at: due.toISOString(),
    updated_at: now.toISOString(),
  };
}

// isDue reports whether a card is due for review at `now`.
export function isDue(card, now = new Date()) {
  return new Date(card.due_at).getTime() <= now.getTime();
}

// humanDue formats when a card is next due, for the manage list.
export function humanDue(card, now = new Date()) {
  const ms = new Date(card.due_at).getTime() - now.getTime();
  if (ms <= 0) return "due now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
