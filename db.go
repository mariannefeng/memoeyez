package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// schema is created on startup. Idempotent so it's safe to run every boot.
const schema = `
CREATE TABLE IF NOT EXISTS cards (
	id            uuid PRIMARY KEY,
	front         text        NOT NULL,
	back          text        NOT NULL,
	due_at        timestamptz NOT NULL DEFAULT now(),
	interval_days real        NOT NULL DEFAULT 0,
	ease          real        NOT NULL DEFAULT 2.5,
	reps          int         NOT NULL DEFAULT 0,
	lapses        int         NOT NULL DEFAULT 0,
	created_at    timestamptz NOT NULL DEFAULT now(),
	updated_at    timestamptz NOT NULL DEFAULT now()
);
`

// openDB connects to Postgres using the given URL and ensures the schema exists.
func openDB(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("create schema: %w", err)
	}
	return pool, nil
}
