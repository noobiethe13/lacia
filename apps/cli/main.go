package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Duplicate prevention
var (
	lastErrorHash    string
	lastErrorTime    time.Time
	cooldownDuration = 30 * time.Second
)

func hashError(event LogEvent) string {
	// Hash the error line and first few context lines
	data := event.Line
	if len(event.Context) > 3 {
		for i := 0; i < 3; i++ {
			data += event.Context[i]
		}
	}
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:8]) // First 8 bytes for shorter hash
}

func isDuplicate(event LogEvent) bool {
	hash := hashError(event)
	now := time.Now()

	if hash == lastErrorHash && now.Sub(lastErrorTime) < cooldownDuration {
		fmt.Printf("Skipping duplicate error (same error within %v)\n", cooldownDuration)
		return true
	}

	lastErrorHash = hash
	lastErrorTime = now
	return false
}

func main() {
	var cfg *Config
	var err error

	if !ConfigExists() {
		cfg, err = RunSetup()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Setup failed: %v\n", err)
			os.Exit(1)
		}
	} else {
		cfg, err = LoadConfig()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
			os.Exit(1)
		}
	}

	watcher, err := NewWatcher(cfg.LogPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open log file: %v\n", err)
		os.Exit(1)
	}
	defer watcher.Close()

	client := NewClient(cfg.ServerURL, cfg.RepoURL)
	events := make(chan LogEvent, 100)
	done := make(chan struct{})

	go func() {
		if err := watcher.Watch(events, done); err != nil {
			fmt.Fprintf(os.Stderr, "Watcher error: %v\n", err)
		}
	}()

	go func() {
		for event := range events {
			// Duplicate prevention - skip if same error within cooldown
			if isDuplicate(event) {
				continue
			}

			if err := client.Send(event); err != nil {
				fmt.Fprintf(os.Stderr, "Send failed: %v\n", err)
			}
		}
	}()

	fmt.Printf("Watching: %s\n", cfg.LogPath)
	fmt.Printf("Server:   %s\n", cfg.ServerURL)
	fmt.Println("Press Ctrl+C to stop\n")

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	close(done)
	fmt.Println("\nShutdown complete")
}
