package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

const (
	defaultLogPath    = "lacia-demo.log"
	dockerComposeFile = "../docker-compose.yml"
	cliBinaryName     = "lacia-cli"
	demoRepoURL       = "https://github.com/noobiethe13/lacia-demo-repo"
)

var (
	projectRoot string
	logFilePath string
	cliProcess  *os.Process
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	// Determine project root (parent of demo directory)
	exe, _ := os.Executable()
	projectRoot = filepath.Dir(filepath.Dir(exe))

	// If running with `go run`, use current working directory's parent
	if cwd, err := os.Getwd(); err == nil {
		if filepath.Base(cwd) == "demo" {
			projectRoot = filepath.Dir(cwd)
		} else {
			projectRoot = cwd
		}
	}

	switch os.Args[1] {
	case "start":
		startDemo()
	case "stop":
		stopDemo()
	default:
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`
╭─────────────────────────────────────╮
│         LACIA DEMO MODE             │
╰─────────────────────────────────────╯

Usage:
  lacia-demo start    Start the demo (Docker + CLI + Log Injector)
  lacia-demo stop     Stop and cleanup

Setup:
  Create a .env file at the project root (same directory as docker-compose.yml):
    GEMINI_API_KEY=your_api_key_here
    GIT_TOKEN=your_token_here  (optional, for PR creation)

Requirements:
  - Docker and docker-compose installed

Demo Repository:
  ` + demoRepoURL + `
`)
}

func startDemo() {
	fmt.Println("\n🚀 Starting Lacia Demo...\n")

	// Step 1: Build CLI binary
	fmt.Println("📦 Building CLI binary...")
	if err := buildCLI(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to build CLI: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("   ✓ CLI built successfully")

	// Step 2: Start Docker
	fmt.Println("\n🐳 Starting Docker containers...")
	if err := startDocker(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to start Docker: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("   ✓ Docker containers started")

	// Step 3: Wait for server to be ready
	fmt.Println("\n⏳ Waiting for server to be ready...")
	if err := waitForServer("http://localhost:3000/api/health", 60*time.Second); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Server failed to start: %v\n", err)
		gracefulStopDocker()
		os.Exit(1)
	}
	fmt.Println("   ✓ Server is ready")

	// Step 4: Create temp log file
	logFilePath = filepath.Join(os.TempDir(), defaultLogPath)
	if err := os.WriteFile(logFilePath, []byte(""), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to create log file: %v\n", err)
		gracefulStopDocker()
		os.Exit(1)
	}
	fmt.Printf("   ✓ Log file created: %s\n", logFilePath)

	// Step 5: Start CLI watcher
	fmt.Println("\n👁️  Starting CLI watcher...")
	if err := startCLI(); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Failed to start CLI: %v\n", err)
		gracefulStopDocker()
		os.Exit(1)
	}
	fmt.Println("   ✓ CLI watcher started")

	// Step 6: Start log injector
	fmt.Println("\n📝 Starting log injector...")
	go runLogInjector(logFilePath)
	fmt.Println("   ✓ Log injector started")

	fmt.Println(`
╭─────────────────────────────────────────────────────────╮
│                  DEMO IS RUNNING                        │
├─────────────────────────────────────────────────────────┤
│  Dashboard:  http://localhost:3000                      │
│  Log File:   ` + logFilePath + `
│                                                         │
│  The injector will generate errors periodically.        │
│  Watch the dashboard to see Lacia in action!            │
│                                                         │
│  Press Ctrl+C to stop the demo.                         │
╰─────────────────────────────────────────────────────────╯
`)

	// Handle shutdown (Ctrl+C = graceful, keeps images/volumes)
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	fmt.Println("\n\n🛑 Shutting down demo (graceful)...")
	gracefulShutdown()
	fmt.Println("✓ Demo stopped (use 'lacia-demo stop' for full cleanup)")
}

func stopDemo() {
	fmt.Println("\n🛑 Stopping Lacia Demo (full cleanup)...")
	fullCleanup()
	fmt.Println("✓ Demo stopped and cleaned up successfully")
}

// gracefulShutdown - for Ctrl+C, just stops containers (keeps images/volumes for faster restart)
func gracefulShutdown() {
	// Kill CLI process
	if cliProcess != nil {
		cliProcess.Kill()
		cliProcess.Wait()
	}

	// Stop Docker containers only (no cleanup)
	gracefulStopDocker()
}

// fullCleanup - for 'demo stop', removes everything for fresh state
func fullCleanup() {
	// Kill CLI process
	if cliProcess != nil {
		cliProcess.Kill()
		cliProcess.Wait()
	}

	// Full Docker cleanup
	fullStopDocker()

	// Remove temp log file
	logPath := filepath.Join(os.TempDir(), defaultLogPath)
	if err := os.Remove(logPath); err == nil {
		fmt.Printf("   Removed log file: %s\n", logPath)
	}

	// Remove CLI config file
	cliConfigPath := filepath.Join(projectRoot, "demo", "lacia.config")
	if err := os.Remove(cliConfigPath); err == nil {
		fmt.Println("   Removed CLI config file")
	}

	// Remove CLI binary
	cliBinaryPath := filepath.Join(projectRoot, "demo", cliBinaryName)
	if runtime.GOOS == "windows" {
		cliBinaryPath += ".exe"
	}
	if err := os.Remove(cliBinaryPath); err == nil {
		fmt.Println("   Removed CLI binary")
	}
}

func buildCLI() error {
	cliDir := filepath.Join(projectRoot, "apps", "cli")

	outputName := cliBinaryName
	if runtime.GOOS == "windows" {
		outputName += ".exe"
	}

	outputPath := filepath.Join(projectRoot, "demo", outputName)

	cmd := exec.Command("go", "build", "-o", outputPath, ".")
	cmd.Dir = cliDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

func startDocker() error {
	composeFile := filepath.Join(projectRoot, "docker-compose.yml")

	// Always build fresh with --no-cache to ensure code changes are applied
	fmt.Println("   Building fresh Docker image (this may take a minute)...")
	cmd := exec.Command("docker", "compose", "-f", composeFile, "build", "--no-cache")
	cmd.Dir = projectRoot
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker build failed: %w", err)
	}

	// Start containers
	fmt.Println("   Starting containers...")
	cmd = exec.Command("docker", "compose", "-f", composeFile, "up", "-d")
	cmd.Dir = projectRoot
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

// gracefulStopDocker - just stops containers (for Ctrl+C)
func gracefulStopDocker() {
	composeFile := filepath.Join(projectRoot, "docker-compose.yml")

	fmt.Println("   Stopping containers...")
	cmd := exec.Command("docker", "compose", "-f", composeFile, "stop")
	cmd.Dir = projectRoot
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()
}

// fullStopDocker - removes containers, volumes, images (for demo stop)
func fullStopDocker() {
	composeFile := filepath.Join(projectRoot, "docker-compose.yml")

	// Stop and remove containers + volumes
	fmt.Println("   Stopping containers and removing volumes...")
	cmd := exec.Command("docker", "compose", "-f", composeFile, "down", "-v", "--remove-orphans")
	cmd.Dir = projectRoot
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()

	// Remove the lacia-web image to ensure fresh build next time
	fmt.Println("   Removing lacia-web image...")
	cmd = exec.Command("docker", "rmi", "lacia-web", "-f")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()

	// Prune dangling images (build cache)
	fmt.Println("   Cleaning up build cache...")
	cmd = exec.Command("docker", "image", "prune", "-f")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()
}

func waitForServer(url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		resp, err := exec.Command("curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", url).Output()
		if err == nil && string(resp) == "200" {
			return nil
		}
		time.Sleep(2 * time.Second)
	}

	return fmt.Errorf("server did not respond within %v", timeout)
}

func startCLI() error {
	cliPath := filepath.Join(projectRoot, "demo", cliBinaryName)
	if runtime.GOOS == "windows" {
		cliPath += ".exe"
	}

	// Create config for CLI using proper JSON marshaling
	config := map[string]string{
		"log_path":   logFilePath,
		"server_url": "http://localhost:3000/api/webhook",
		"repo_url":   demoRepoURL,
	}

	configJSON, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	configPath := filepath.Join(filepath.Dir(cliPath), "lacia.config")
	if err := os.WriteFile(configPath, configJSON, 0644); err != nil {
		return err
	}

	cmd := exec.Command(cliPath)
	cmd.Dir = filepath.Dir(cliPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return err
	}

	cliProcess = cmd.Process
	return nil
}
