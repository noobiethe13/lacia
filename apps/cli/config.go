package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const configFileName = "lacia.config"

type Config struct {
	LogPath   string `json:"log_path"`
	ServerURL string `json:"server_url"`
	RepoURL   string `json:"repo_url"`
}

func (c *Config) Validate() error {
	if c.LogPath == "" {
		return errors.New("log_path is required")
	}
	if c.ServerURL == "" {
		return errors.New("server_url is required")
	}
	if c.RepoURL == "" {
		return errors.New("repo_url is required")
	}
	return nil
}

func ConfigPath() string {
	exe, err := os.Executable()
	if err != nil {
		return configFileName
	}
	return filepath.Join(filepath.Dir(exe), configFileName)
}

func LoadConfig() (*Config, error) {
	path := ConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func SaveConfig(cfg *Config) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigPath(), data, 0644)
}

func ConfigExists() bool {
	_, err := os.Stat(ConfigPath())
	return err == nil
}

func RunSetup() (*Config, error) {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("\n╭─────────────────────────────────────╮")
	fmt.Println("│       LACIA WATCHER SETUP           │")
	fmt.Println("╰─────────────────────────────────────╯\n")

	logPath := promptRequired(reader, "Log file path")
	serverURL := promptRequired(reader, "Next.js server URL")
	repoURL := promptRequired(reader, "GitHub repository URL")

	if !strings.HasSuffix(serverURL, "/api/webhook") {
		serverURL = strings.TrimSuffix(serverURL, "/") + "/api/webhook"
	}

	cfg := &Config{
		LogPath:   logPath,
		ServerURL: serverURL,
		RepoURL:   repoURL,
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	if err := SaveConfig(cfg); err != nil {
		return nil, fmt.Errorf("failed to save config: %w", err)
	}

	fmt.Printf("\n✓ Configuration saved to %s\n\n", ConfigPath())
	return cfg, nil
}

func promptRequired(reader *bufio.Reader, label string) string {
	for {
		fmt.Printf("  %s: ", label)
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)
		if input != "" {
			return input
		}
		fmt.Println("    ✗ This field is required")
	}
}
