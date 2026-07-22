# Memoeyez

A super-simple flashcard app with spaced repetition. Works as a webapp and installs as a
PWA for offline study on mobile. Plain HTML/CSS/JS frontend, small Go backend, your
Postgres for storage.

## How it works

- **One flat pile** of cards (front/back). No decks.
- **Spaced repetition** (SM-2) is computed on the client, so studying and grading work
  fully offline.
- The Go server is a **dumb store** over Postgres. The browser keeps a mirror of your
  cards (plus a queue of unsynced changes) in `localStorage`; changes flush to Postgres
  when you're online.
- The server both serves the frontend (`public/`) and exposes the JSON API — one process,
  one origin, no CORS.

## Run it locally

Requires Go 1.24+ and a reachable Postgres.

```sh
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
go run .
```

Then open http://localhost:3000. The `cards` table is created automatically on first run.

Set `PORT` to use a different port (defaults to `3000`).

## Install as a PWA

Open the site in Chrome/Safari and use "Install app" / "Add to Home Screen". Once
installed, the app shell is cached and your cards are read from local storage, so it keeps
working with no connection. New cards and grades made offline sync the next time you're
online.

## API

- `GET /api/cards` — all cards (JSON array).
- `POST /api/cards` — upsert one card or an array of cards (last-write-wins on
  `updated_at`). Handles create, edit, and review.
- `DELETE /api/cards/{id}` — delete a card.

## Layout

```
main.go / db.go / cards.go   Go server (package main)
public/                      the frontend the server hosts
  index.html, styles.css
  js/  srs.js store.js api.js sync.js app.js
  sw.js, manifest.webmanifest, icons/
```

## Not built yet (easy to add later)

Decks/tags, multi-user/auth, images on cards, import/export, cloud deploy.
