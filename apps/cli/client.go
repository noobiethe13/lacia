package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

type IncidentPayload struct {
	ErrorLine string   `json:"error_line"`
	Timestamp string   `json:"timestamp"`
	Hostname  string   `json:"hostname"`
	RepoURL   string   `json:"repo_url,omitempty"`
	Context   []string `json:"context,omitempty"`
}

type Client struct {
	serverURL  string
	repoURL    string
	hostname   string
	httpClient *http.Client
}

func NewClient(serverURL, repoURL string) *Client {
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}

	return &Client{
		serverURL: serverURL,
		repoURL:   repoURL,
		hostname:  hostname,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (c *Client) Send(event LogEvent) error {
	payload := IncidentPayload{
		ErrorLine: event.Line,
		Timestamp: event.Timestamp.Format(time.RFC3339),
		Hostname:  c.hostname,
		RepoURL:   c.repoURL,
		Context:   event.Context,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal failed: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.serverURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("server returned %d", resp.StatusCode)
	}

	return nil
}
