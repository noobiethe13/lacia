# Lacia 🛡️

**Autonomous SRE Agent powered by Google Gemini 3.**

Lacia is a self-hosted agent that watches your production logs, reproduces crashes in a sandbox, fixes bugs, and opens tested pull requests — automatically.

---

## 🚀 One-Command Demo

Want to see it in action instantly? **Demo Mode** spins up the entire stack, a simulated buggy app, and a real-time log injector.

### Mode 1: Dry-Run (Default, Safe)
Great for trying it out immediately. Lacia will fix the bug and run tests, but **will skip creating the actual Pull Request** (since it doesn't have write access to the repo).

1. **Create .env:**
   ```bash
   GEMINI_API_KEY=your_key
   # No GIT_TOKEN needed
   ```

2. **Run:**
   ```bash
   cd demo
   go run . start
   ```
   *Dashboard handles the rest at http://localhost:3000*

### Mode 2: Full Experience (With PR)
To see the actual PR being created, you need write access.

1. **Fork the demo repo:** [lacia-demo-repo](https://github.com/noobiethe13/lacia-demo-repo)
2. **Update `.env`:**
   ```bash
   GEMINI_API_KEY=your_key
   GIT_TOKEN=your_personal_access_token
   ```
   > **Permissions Required:** If using a Fine-grained PAT, it needs **Repository permissions**:
   > - **Contents**: `Read and write` (to push branches)
   > - **Pull requests**: `Read and write` (to open PRs)
   > - **Metadata**: `Read-only` (default)

3. **Run:** `go run . start` (Lacia will auto-detect your fork if you update the config, or defaults to dry-run if connection fails).

---

## 🛠️ Manual Setup (For Production)

For real projects, you run the **Executor** (server) once, and deploy **Watchers** (CLI) to your app servers.

### 1. The Executor (Control Plane)
The Executor receives error reports and runs the AI agent.

**Option A: Docker (Recommended)**
```bash
# 1. Configure .env
GEMINI_API_KEY=your_key
GIT_TOKEN=your_github_pat
DATABASE_PATH=/app/data/lacia.db

# 2. Start Services
docker-compose up -d --build
```
- Dashboard: `http://localhost:3000`
- Webhook URL: `http://localhost:3000/api/webhook`

**Option B: Local Development**
```bash
cd apps/web
npm install
npm run dev
```

### 2. The Watcher (Deploy to App Server)
The Watcher is a 5MB static Go binary that tails your log file.

**Build:**
```bash
cd apps/cli
go build -o lacia-watcher .
```

**Configure:**
Create a `lacia.config` file next to the binary:
```json
{
  "log_path": "/var/log/myapp/error.log",
  "server_url": "http://YOUR_EXECUTOR_IP:3000/api/webhook",
  "repo_url": "https://github.com/your-org/your-repo.git"
}
```

**Run:**
```bash
./lacia-watcher
```
The Watcher will now monitor your log file. When a stack trace appears, it sends it to Lacia for analysis.

---

## 🏗️ Architecture

```text
┌──────────────────┐           ┌────────────────────────────┐
│ Lacia Watcher    │           │ Lacia Executor             │
│ (Go CLI)         │ ────────► │ (Next.js / Docker)         │
│                  │   POST    │                            │
│ • Tails logs     │  Webhook  │ • Gemini 3 Agent           │
│ • Filters dupes  │           │ • SQLite (sql.js)          │
│                  │           │ • PR Automation            │
└──────────────────┘           └────────────────────────────┘
```

## Tech Stack
- **AI Model:** Google Gemini 3 Pro
- **Backend:** Next.js (App Router), Node.js
- **Database:** SQLite (via sql.js, with persistent storage)
- **CLI:** Go (Standard Library)

## 🧠 Powered by Gemini 3 Pro

Lacia leverages the cutting-edge capabilities of **Google Gemini 3 Pro** to deliver autonomous SRE agent performance:

- **1 Million Context Window**: Lacia injects entire codebase hierarchy and necessary file contents into the context, allowing for deep understanding of complex dependencies and architectural patterns without hallucination.
- **Advanced Reasoning**: Capable of multi-step problem solving, from root cause analysis of stack traces to navigating through function calls across multiple files.
- **Advanced Tool Calling**: Utilizes a robust suite of tools to read files, run tests, and search the codebase, mimicking a senior engineer's debugging workflow.
- **Expert Coding**: Expert-level code generation and refactoring capabilities across multiple languages, ensuring fixes match your project's style and best practices.

## License
MIT
