package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Card mirrors the cards table. All spaced-repetition fields are computed on the
// client; the server just stores whatever it's given.
type Card struct {
	ID           string    `json:"id"`
	Front        string    `json:"front"`
	Back         string    `json:"back"`
	DueAt        time.Time `json:"due_at"`
	IntervalDays float64   `json:"interval_days"`
	Ease         float64   `json:"ease"`
	Reps         int       `json:"reps"`
	Lapses       int       `json:"lapses"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type cardsAPI struct {
	db *pgxpool.Pool
}

// registerRoutes wires the card endpoints onto the mux.
func (a *cardsAPI) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/cards", a.list)
	mux.HandleFunc("POST /api/cards", a.upsert)
	mux.HandleFunc("DELETE /api/cards/{id}", a.delete)
}

func (a *cardsAPI) list(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `
		SELECT id, front, back, due_at, interval_days, ease, reps, lapses, created_at, updated_at
		FROM cards ORDER BY created_at`)
	if err != nil {
		httpError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()

	cards := []Card{}
	for rows.Next() {
		var c Card
		if err := rows.Scan(&c.ID, &c.Front, &c.Back, &c.DueAt, &c.IntervalDays,
			&c.Ease, &c.Reps, &c.Lapses, &c.CreatedAt, &c.UpdatedAt); err != nil {
			httpError(w, http.StatusInternalServerError, err)
			return
		}
		cards = append(cards, c)
	}
	if err := rows.Err(); err != nil {
		httpError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, cards)
}

// upsert accepts either a single card object or an array of cards, and writes them
// with last-write-wins semantics keyed on updated_at.
func (a *cardsAPI) upsert(w http.ResponseWriter, r *http.Request) {
	cards, err := decodeCards(r)
	if err != nil {
		httpError(w, http.StatusBadRequest, err)
		return
	}

	const q = `
		INSERT INTO cards
			(id, front, back, due_at, interval_days, ease, reps, lapses, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (id) DO UPDATE SET
			front         = EXCLUDED.front,
			back          = EXCLUDED.back,
			due_at        = EXCLUDED.due_at,
			interval_days = EXCLUDED.interval_days,
			ease          = EXCLUDED.ease,
			reps          = EXCLUDED.reps,
			lapses        = EXCLUDED.lapses,
			updated_at    = EXCLUDED.updated_at
		WHERE EXCLUDED.updated_at >= cards.updated_at`

	err = pgx.BeginFunc(r.Context(), a.db, func(tx pgx.Tx) error {
		for _, c := range cards {
			if _, err := tx.Exec(r.Context(), q,
				c.ID, c.Front, c.Back, c.DueAt, c.IntervalDays,
				c.Ease, c.Reps, c.Lapses, c.CreatedAt, c.UpdatedAt); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *cardsAPI) delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := a.db.Exec(r.Context(), `DELETE FROM cards WHERE id = $1`, id); err != nil {
		httpError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeCards parses a request body that is either one card object or an array of them.
func decodeCards(r *http.Request) ([]Card, error) {
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		return nil, err
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		var cards []Card
		if err := json.Unmarshal(trimmed, &cards); err != nil {
			return nil, err
		}
		return cards, nil
	}
	var c Card
	if err := json.Unmarshal(trimmed, &c); err != nil {
		return nil, err
	}
	return []Card{c}, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
