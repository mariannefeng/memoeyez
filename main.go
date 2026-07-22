package main

import (
	"context"
	"log"
	"mime"
	"net/http"
	"os"
)

func main() {
	// Load .env for local development. Real environment variables take
	// precedence, so this is a no-op in production where they're set directly.
	if err := loadEnvFile(".env"); err != nil {
		log.Fatalf("loading .env: %v", err)
	}

	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL is not set (e.g. export DATABASE_URL=postgres://user:pass@host:5432/db)")
	}

	ctx := context.Background()
	pool, err := openDB(ctx, url)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	// Go's default MIME table doesn't know .webmanifest; register it so browsers
	// reliably treat the PWA manifest as JSON.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")

	mux := http.NewServeMux()

	api := &cardsAPI{db: pool}
	api.registerRoutes(mux)

	// Serve the PWA (static assets) from ./public. Registered last so /api/* wins.
	mux.Handle("/", http.FileServer(http.Dir("public")))

	addr := ":" + port()
	log.Printf("memoeyez listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func port() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return "3000"
}
