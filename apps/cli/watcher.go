package main

import (
	"bufio"
	"io"
	"os"
	"strings"
	"time"
)

var errorPatterns = []string{
	// Severity levels
	"ERROR", "FATAL", "CRITICAL", "SEVERE", "EMERGENCY",

	// Generic exceptions
	"Exception", "panic", "Traceback", "Uncaught",

	// Stack trace indicators
	"Caused by:", "Stack trace:", "Stacktrace:",
	"at com.", "at org.", "at java.", "at sun.",
	"goroutine", "runtime error:",

	// Python
	"raise ", "AssertionError", "AttributeError", "ImportError",
	"KeyError", "ValueError", "IndentationError",

	// JavaScript/Node.js
	"TypeError", "ReferenceError", "SyntaxError", "RangeError",
	"UnhandledPromiseRejection", "ECONNREFUSED", "ENOTFOUND",

	// Java/Kotlin/JVM
	"NullPointerException", "ClassNotFoundException",
	"OutOfMemoryError", "StackOverflowError",

	// Ruby
	"RuntimeError", "NoMethodError", "undefined method",

	// Rust
	"thread 'main' panicked", "thread 'tokio' panicked",

	// PHP
	"Fatal error:", "Parse error:", "Warning:",

	// C#/.NET
	"Unhandled exception", "System.Exception", "System.NullReferenceException",

	// System/OS level
	"Segmentation fault", "core dumped", "SIGSEGV", "SIGABRT",
	"killed", "OOM",

	// HTTP/API failures
	"500 Internal Server Error", "502 Bad Gateway",
	"503 Service Unavailable", "504 Gateway Timeout",

	// Database
	"deadlock", "connection refused", "connection timed out",
}

var traceStartMarkers = []string{
	"Traceback", "Exception in thread", "goroutine",
	"panic:", "Error:", "ERROR:", "FATAL:",
	"Caused by:", "Stack trace:", "Stacktrace:",
	"Unhandled", "Thread", "Process",
}

var traceContMarkers = []string{
	"at ", "    at ", "\tat ",
	"File \"", "  File \"",
	"    ", "\t",
	"^",
	"...",
}

type LogEvent struct {
	Line      string
	Timestamp time.Time
	Context   []string
}

type Watcher struct {
	path             string
	file             *os.File
	reader           *bufio.Reader
	lineBuffer       []string
	bufferSize       int
	collectingTrace  bool
	traceLines       []string
	traceTimeout     time.Time
	traceDuration    time.Duration
}

func NewWatcher(path string) (*Watcher, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}

	if _, err := file.Seek(0, io.SeekEnd); err != nil {
		file.Close()
		return nil, err
	}

	return &Watcher{
		path:          path,
		file:          file,
		reader:        bufio.NewReader(file),
		lineBuffer:    make([]string, 0, 50),
		bufferSize:    50,
		traceDuration: 300 * time.Millisecond,
	}, nil
}

func (w *Watcher) Close() {
	if w.file != nil {
		w.file.Close()
	}
}

func (w *Watcher) Watch(events chan<- LogEvent, done <-chan struct{}) error {
	for {
		select {
		case <-done:
			return nil
		default:
			line, err := w.reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					if w.collectingTrace && time.Now().After(w.traceTimeout) {
						w.emitTrace(events)
					}
					time.Sleep(50 * time.Millisecond)
					continue
				}
				return err
			}

			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			w.pushToBuffer(line)

			if w.collectingTrace {
				w.traceLines = append(w.traceLines, line)
				if isTraceContinuation(line) {
					w.traceTimeout = time.Now().Add(w.traceDuration)
				} else if !isErrorLine(line) {
					w.emitTrace(events)
				}
				continue
			}

			if isErrorLine(line) {
				w.startTrace(line)
			}
		}
	}
}

func (w *Watcher) startTrace(triggerLine string) {
	startIdx := w.findTraceStart()
	w.traceLines = make([]string, 0, 20)

	for i := startIdx; i < len(w.lineBuffer); i++ {
		w.traceLines = append(w.traceLines, w.lineBuffer[i])
	}

	w.collectingTrace = true
	w.traceTimeout = time.Now().Add(w.traceDuration)
}

func (w *Watcher) findTraceStart() int {
	for i := len(w.lineBuffer) - 1; i >= 0; i-- {
		line := w.lineBuffer[i]
		if isTraceStart(line) {
			return i
		}
		if i < len(w.lineBuffer)-10 {
			break
		}
	}
	start := len(w.lineBuffer) - 10
	if start < 0 {
		start = 0
	}
	return start
}

func (w *Watcher) emitTrace(events chan<- LogEvent) {
	if len(w.traceLines) == 0 {
		w.collectingTrace = false
		return
	}

	events <- LogEvent{
		Line:      w.traceLines[len(w.traceLines)-1],
		Timestamp: time.Now().UTC(),
		Context:   w.traceLines,
	}

	w.traceLines = nil
	w.collectingTrace = false
}

func (w *Watcher) pushToBuffer(line string) {
	if len(w.lineBuffer) >= w.bufferSize {
		w.lineBuffer = w.lineBuffer[1:]
	}
	w.lineBuffer = append(w.lineBuffer, line)
}

func isErrorLine(line string) bool {
	upper := strings.ToUpper(line)
	for _, pattern := range errorPatterns {
		if strings.Contains(upper, strings.ToUpper(pattern)) {
			return true
		}
	}
	return false
}

func isTraceStart(line string) bool {
	for _, marker := range traceStartMarkers {
		if strings.Contains(line, marker) {
			return true
		}
	}
	return false
}

func isTraceContinuation(line string) bool {
	for _, marker := range traceContMarkers {
		if strings.HasPrefix(line, marker) {
			return true
		}
	}
	return isErrorLine(line)
}
