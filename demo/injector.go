package main

import (
	"fmt"
	"math/rand"
	"os"
	"time"
)

// Error templates for different languages
type ErrorTemplate struct {
	Language   string
	NormalLogs []string
	ErrorLine  string
	Traceback  []string
}

var errorTemplates = []ErrorTemplate{
	// Python - ZeroDivisionError
	{
		Language: "Python",
		NormalLogs: []string{
			"[INFO] Flask app starting on port 5000...",
			"[INFO] Loading configuration from config.yaml",
			"[INFO] Database connection established",
			"[INFO] Registering routes...",
			"[INFO] Route /api/calculate registered",
			"[DEBUG] Request received: GET /api/calculate",
			"[DEBUG] Processing calculation request...",
		},
		ErrorLine: "ZeroDivisionError: division by zero",
		Traceback: []string{
			"ERROR in app: Exception on /api/calculate [GET]",
			"Traceback (most recent call last):",
			"  File \"python/app.py\", line 45, in calculate",
			"    result = divide(numerator, denominator)",
			"  File \"python/app.py\", line 12, in divide",
			"    return a / b",
			"ZeroDivisionError: division by zero",
		},
	},
	// JavaScript - TypeError
	{
		Language: "JavaScript",
		NormalLogs: []string{
			"[INFO] Server starting on port 3001...",
			"[INFO] Loading environment variables",
			"[INFO] Connecting to MongoDB...",
			"[INFO] MongoDB connected successfully",
			"[DEBUG] Registering middleware...",
			"[DEBUG] Request received: POST /api/users",
			"[DEBUG] Parsing request body...",
		},
		ErrorLine: "TypeError: Cannot read properties of undefined (reading 'email')",
		Traceback: []string{
			"Error: TypeError: Cannot read properties of undefined (reading 'email')",
			"    at processUser (javascript/index.js:34:25)",
			"    at Router.handle (javascript/index.js:18:5)",
			"    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)",
			"    at next (node_modules/express/lib/router/route.js:144:13)",
			"TypeError: Cannot read properties of undefined (reading 'email')",
		},
	},
	// Go - nil pointer dereference
	{
		Language: "Go",
		NormalLogs: []string{
			"INFO: Starting HTTP server on :8080",
			"INFO: Loading configuration from config.json",
			"INFO: Initializing database connection pool",
			"INFO: Database pool initialized with 10 connections",
			"DEBUG: Incoming request: GET /api/profile",
			"DEBUG: Fetching user profile from database",
		},
		ErrorLine: "panic: runtime error: invalid memory address or nil pointer dereference",
		Traceback: []string{
			"panic: runtime error: invalid memory address or nil pointer dereference",
			"[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x4a2f8c]",
			"",
			"goroutine 1 [running]:",
			"main.handleProfile(0xc0000a6000)",
			"        go/main.go:42 +0x1c",
			"main.main()",
			"        go/main.go:28 +0x85",
		},
	},
	// Java - NullPointerException
	{
		Language: "Java",
		NormalLogs: []string{
			"INFO: Application starting with Spring Boot 3.2.0",
			"INFO: Initializing DispatcherServlet 'dispatcherServlet'",
			"INFO: Tomcat started on port 8080",
			"INFO: Started Application in 2.345 seconds",
			"DEBUG: Request received: GET /api/order/123",
			"DEBUG: Fetching order from OrderService",
		},
		ErrorLine: "java.lang.NullPointerException: Cannot invoke method on null object",
		Traceback: []string{
			"ERROR 2024-01-17 12:00:00.000 --- [nio-8080-exec-1] o.a.c.c.C.[.[.[/].[dispatcherServlet]",
			"java.lang.NullPointerException: Cannot invoke method getTotal() on null object",
			"        at com.example.OrderService.calculateTotal(OrderService.java:45)",
			"        at com.example.OrderController.getOrder(OrderController.java:23)",
			"        at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)",
			"        at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)",
		},
	},
	// Rust - unwrap panic
	{
		Language: "Rust",
		NormalLogs: []string{
			"INFO: Starting Rust HTTP server on :8081",
			"INFO: Loading configuration from config.toml",
			"INFO: Database connection pool initialized",
			"DEBUG: Incoming request: GET /api/user?id=999",
			"DEBUG: Fetching user from database",
		},
		ErrorLine: "thread 'main' panicked at 'called `Option::unwrap()` on a `None` value'",
		Traceback: []string{
			"thread 'main' panicked at 'called `Option::unwrap()` on a `None` value', rust/main.rs:35:5",
			"stack backtrace:",
			"   0: rust_begin_unwind",
			"             at /rustc/a28077b28/library/std/src/panicking.rs:597:5",
			"   1: core::panicking::panic_fmt",
			"             at /rustc/a28077b28/library/core/src/panicking.rs:72:14",
			"   2: core::panicking::panic",
			"             at /rustc/a28077b28/library/core/src/panicking.rs:127:5",
			"   3: core::option::Option<T>::unwrap",
			"             at /rustc/a28077b28/library/core/src/option.rs:935:21",
			"   4: main::get_user_email",
			"             at ./rust/main.rs:35:5",
			"   5: main::handle_request",
			"             at ./rust/main.rs:54:25",
		},
	},
	// Dart - null reference
	{
		Language: "Dart",
		NormalLogs: []string{
			"INFO: Starting Dart service...",
			"INFO: Initializing UserService",
			"INFO: Loading user data from cache",
			"DEBUG: Request received: getUserEmail(999)",
			"DEBUG: Looking up user in database",
		},
		ErrorLine: "Null check operator used on a null value",
		Traceback: []string{
			"Unhandled exception:",
			"Null check operator used on a null value",
			"#0      UserService.getUserEmail (package:app/dart/main.dart:38:17)",
			"#1      main (package:app/dart/main.dart:78:42)",
			"#2      _delayEntrypointInvocation.<anonymous closure> (dart:isolate-patch/isolate_patch.dart:295:33)",
			"#3      _RawReceivePort._handleMessage (dart:isolate-patch/isolate_patch.dart:184:12)",
		},
	},
}

func runLogInjector(logPath string) {
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open log file: %v\n", err)
		return
	}
	defer file.Close()

	// Initial normal logs
	writeNormalLogs(file, 25+rand.Intn(10))
	
	// First error after startup
	time.Sleep(5 * time.Second)
	writeError(file)

	// Subsequent errors every 30 minutes
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		// Write some normal logs before the error
		writeNormalLogs(file, 15+rand.Intn(10))
		time.Sleep(2 * time.Second)
		writeError(file)
	}
}

func writeNormalLogs(file *os.File, count int) {
	normalLogs := []string{
		"[INFO] Health check passed",
		"[INFO] Metrics collected successfully",
		"[DEBUG] Cache hit for key: user_session_abc123",
		"[INFO] Request processed in 45ms",
		"[DEBUG] Connection pool: 8/10 active",
		"[INFO] Scheduled job completed: cleanup_temp_files",
		"[DEBUG] Memory usage: 256MB / 512MB",
		"[INFO] Request received: GET /api/status",
		"[INFO] Response sent: 200 OK",
		"[DEBUG] Database query executed in 12ms",
		"[INFO] WebSocket connection established",
		"[DEBUG] Session validated for user: demo_user",
		"[INFO] File uploaded: document.pdf (1.2MB)",
		"[DEBUG] Rate limit check passed",
		"[INFO] Email notification queued",
	}

	for i := 0; i < count; i++ {
		timestamp := time.Now().Format("2006-01-02 15:04:05.000")
		log := normalLogs[rand.Intn(len(normalLogs))]
		line := fmt.Sprintf("%s %s\n", timestamp, log)
		file.WriteString(line)
		time.Sleep(time.Duration(100+rand.Intn(400)) * time.Millisecond)
	}
}

func writeError(file *os.File) {
	template := errorTemplates[rand.Intn(len(errorTemplates))]
	
	fmt.Printf("📍 Injecting %s error...\n", template.Language)
	
	// Write language-specific normal logs leading up to error
	timestamp := time.Now().Format("2006-01-02 15:04:05.000")
	for _, log := range template.NormalLogs {
		line := fmt.Sprintf("%s %s\n", timestamp, log)
		file.WriteString(line)
		time.Sleep(100 * time.Millisecond)
	}
	
	// Write the traceback
	for _, line := range template.Traceback {
		traceLine := fmt.Sprintf("%s %s\n", timestamp, line)
		file.WriteString(traceLine)
		time.Sleep(50 * time.Millisecond)
	}
	
	file.Sync()
}
