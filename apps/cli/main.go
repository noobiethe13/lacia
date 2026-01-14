package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

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
