package main

import (
	"bufio"
	"os"
	"strings"
)

// loadEnvFile reads KEY=VALUE pairs from the file at path and sets any that
// aren't already present in the process environment. A missing file is not an
// error: real environment variables (or platform config) take precedence, so
// .env is only a convenience for local development.
//
// Supported syntax, one entry per line:
//   - blank lines and lines beginning with '#' are ignored
//   - an optional leading "export " is stripped
//   - values may be wrapped in single or double quotes; surrounding quotes are
//     removed. Unquoted values have surrounding whitespace trimmed and an
//     inline '#' comment stripped.
func loadEnvFile(path string) error {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}

		value = parseEnvValue(value)

		// Don't clobber a value already set in the real environment.
		if _, exists := os.LookupEnv(key); !exists {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	return scanner.Err()
}

func parseEnvValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		if (value[0] == '"' && value[len(value)-1] == '"') ||
			(value[0] == '\'' && value[len(value)-1] == '\'') {
			return value[1 : len(value)-1]
		}
	}
	// Strip an inline comment from unquoted values.
	if i := strings.Index(value, " #"); i >= 0 {
		value = strings.TrimSpace(value[:i])
	}
	return value
}
