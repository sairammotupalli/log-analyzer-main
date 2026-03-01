**Live Demo:** <link>
**Video Explanation**:<link>

# SOC Log Analyzer

A full-stack web application for SOC analysts to upload ZScaler Web Proxy log files, detect threats and anomalies, and view AI-generated security summaries in a human-readable dashboard.

---

## Features

- **Upload ZScaler NSS logs** (.log, .csv, .txt up to 50MB) via drag-and-drop
- **Automatic anomaly detection** using 8 rule-based detectors (high request rate, repeated blocks, threat names, suspicious user agents, off-hours access, large transfers, malicious categories)
- **AI-powered security summary** with executive overview, top threats, timeline, and SOC recommendations
- **Multi-LLM support**: Anthropic Claude, OpenAI GPT, DeepSeek, Llama (Ollama), or any OpenAI-compatible API
- **Per-user LLM settings** with encrypted API key storage - each user configures their own AI model
- **Analysis history** per upload - every run is saved and viewable inline from the dashboard
- **Interactive dashboard**: stats cards, charts, IP risk table, blocked destinations, anomaly panel, full log table
- **Google OAuth + email/password** authentication
- **Docker-first**: one command to start everything including Ollama for local AI

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, Recharts |
| Backend | Express 4, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | NextAuth.js v5 (Credentials + Google OAuth) |
| AI | Anthropic Claude / OpenAI / DeepSeek / Ollama (Llama) |
| Container | Docker + Docker Compose |
| Package Manager | pnpm workspaces |

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker | 24+ | Required for database + Ollama |
| Node.js | 20+ | For local dev only |
| pnpm | 10+ | `npm install -g pnpm` |
| Anthropic API key | - | Optional if using Ollama |
| Google OAuth credentials | - | Optional, for Google login |

---

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/log-analyzer.git
cd log-analyzer

# 2. Create environment file
cp .env.example .env
# Edit .env: set JWT_SECRET and NEXTAUTH_SECRET at minimum

# 3. Start all services (Postgres, Ollama, Backend, Frontend)
docker compose up --build

# 4. First run: wait ~2 minutes for Ollama to pull the llama3.2 model
#    Monitor with: docker logs soc_ollama_init -f

# 5. Open the app
open http://localhost:3000
```

Then in the app:
1. Register an account
2. Go to **Settings -> LLM Settings** and configure your AI provider
3. Upload a sample log file which is in the sample_logs -> zscaler_sample.log
4. Watch the analysis run and explore results

---

## Local Development (without Docker)

```bash
# Terminal 1: Start PostgreSQL only
docker compose up postgres -d

# Terminal 2: Backend
cd packages/backend
export DATABASE_URL="postgresql://socuser:socpassword@localhost:5432/socanalyzer"
./node_modules/.bin/prisma db push
pnpm dev

# Terminal 3: Frontend
cd packages/frontend
pnpm dev
```

Or run both from root:
```bash
pnpm install
pnpm dev
```

---

## Environment Variables (Mandatory)

Copy `.env.example` to `.env` and fill in the values.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Long random string for JWT signing (32+ chars) |
| `NEXTAUTH_SECRET` | Long random string for NextAuth session signing |

### LLM (configure at least one, or use Ollama via Settings)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (best quality results) |
| `OPENAI_API_KEY` | OpenAI API key |
| `DEEPSEEK_API_KEY` | DeepSeek API key |

### Optional

| Variable | Default | Description |
|---|---|---|
| `ENCRYPTION_KEY` | auto | AES-256 key for API key encryption (32-byte hex) |
| `GOOGLE_CLIENT_ID` | - | Google OAuth (optional) |
| `GOOGLE_CLIENT_SECRET` | - | Google OAuth (optional) |
| `MAX_FILE_SIZE_MB` | 50 | Max upload size |
| `OLLAMA_MODEL` | llama3.2 | Model pulled by Docker on first start |

---

## LLM Configuration

Each user configures their own AI provider in **Settings -> LLM Settings**. Settings are stored per-user with API keys encrypted at rest.

### Supported Providers

| Provider | Model Example | Notes |
|---|---|---|
| Anthropic | claude-sonnet-4-6 | Best quality, requires API key |
| OpenAI | gpt-4o-mini | Requires API key |
| DeepSeek | deepseek-chat | Requires API key; temperature disabled for R1 |
| Llama (Ollama) | llama3.2 | Free, runs locally - private but slower |
| Custom | any | Any OpenAI-compatible endpoint |

### Using Ollama in Docker

In LLM Settings use:
- **Provider**: Llama / Ollama
- **Base URL**: `http://ollama:11434`
- **Model**: `llama3.2`

### Using Ollama in localhost

In LLM Settings use:
- **Provider**: Llama / Ollama
- **Base URL**: `http://localhost:11434/api`
- **Model**: `llama3.2`
---

**Analysis take upto 1-2 minutes(use API responses for fast response)** 

## Project Structure

```
tenex/
+-- docker-compose.yml         <- Full stack + Ollama auto-pull
+-- .env.example               <- Environment variable template
+-- README.md
+-- docs/
|   +-- DEVELOPMENT_GUIDE.md  <- Phase-by-phase dev notes + design decisions
|   +-- TECHNICAL_DOCS.md     <- Full API, schema, and architecture reference
+-- sample_logs/
|   +-- zscaler_sample.log    <- 800-row test file with all 8 anomaly types
+-- scripts/
|   +-- generate-sample-log.js <- Regenerate the sample log
+-- packages/
    +-- frontend/              <- Next.js 16 app (port 3000)
    |   +-- app/               <- App Router pages
    |   +-- components/        <- React components
    |   +-- lib/               <- API client, auth config, utils
    |   +-- types/             <- Shared TypeScript types
    +-- backend/               <- Express API (port 4000)
        +-- prisma/            <- Schema + migrations
        +-- src/
            +-- routes/        <- API route handlers
            +-- services/      <- Log parser, anomaly detection, AI analysis
            +-- lib/           <- Prisma client, LLM client, crypto
            +-- middleware/    <- Auth, error handler
```

---

## How to Use

1. **Register / Login** at `http://localhost:3000`
2. **Configure LLM** in Settings - pick your AI provider and enter credentials; click **Test** to verify
3. **Upload a log file** - drag and drop your ZScaler `.log` or `.csv` file onto the dashboard upload zone
4. **Watch analysis run** - status progresses PENDING -> PARSING -> ANALYZING -> COMPLETE (30-90 seconds for cloud LLMs, 2-5 minutes for Ollama)
5. **Explore results**:
   - Stats cards (request totals, block rate, threat count, anomaly count)
   - AI executive summary with provider badge showing which model was used
   - Charts (top source IPs, URL categories breakdown)
   - IP risk table (per-IP breakdown of requests, blocks, threats, anomaly types)
   - Blocked destinations table (top domains blocked)
   - Event timeline (cloud LLMs only)
   - Anomaly panel sorted by severity with recommended actions per anomaly
   - SOC recommendations checklist
   - Full paginated log table with anomalous rows highlighted
6. **View run history** - click the History arrow on any row in the dashboard table to see all previous analysis runs inline
7. **Analyze with a different LLM** - change provider in Settings, then re-upload the file to trigger a fresh analysis run

---

## Sample Log File

A realistic 800-row test log with all anomaly types embedded:

```bash
# Upload sample_logs/zscaler_sample.log to test the app
# Embedded patterns:
#   IP 172.17.3.49 - 210 requests in 5-min window  -> HIGH_REQUEST_RATE
#   IP 10.0.0.5    - 15+ blocked malware requests  -> REPEATED_BLOCK
#   EICAR test file from 3 IPs                      -> THREAT_DETECTED
#   Multiple IPs with riskscore 82-100              -> HIGH_RISK_SCORE
#   curl / python-requests / wget UAs               -> SUSPICIOUS_UA
#   IP 10.0.1.250  - requests at 02:xx UTC          -> OFF_HOURS_ACCESS
#   78MB + 100MB downloads                          -> LARGE_TRANSFER
#   Phishing / C2 / Security category blocks        -> MALICIOUS_CATEGORY

# Regenerate the sample file:
node scripts/generate-sample-log.js
```

---

## Deployment

### Vercel + Railway (cloud)

1. **Database**: Create PostgreSQL on [Railway](https://railway.app) or [Supabase](https://supabase.com)
2. **Backend**: Deploy to Railway, set env vars (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY)
3. **Frontend**: Deploy to [Vercel](https://vercel.com), set BACKEND_URL, NEXT_PUBLIC_BACKEND_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, JWT_SECRET

### Self-Hosted (VPS)

```bash
git clone https://github.com/YOUR_USERNAME/soc-log-analyzer.git
cd soc-log-analyzer
cp .env.example .env
nano .env   # fill in secrets
docker compose up -d --build
```

---

## Known Limitations

- Only ZScaler NSS Web Log Feed format (34-field CSV) is supported
- Ollama/Llama: no timeline events generated (compact prompt to fit 600-token local limit)
- Vercel file uploads go to `/tmp` (ephemeral - lost on cold start); use Railway for persistence
- Analysis polls every 3 seconds (no WebSocket real-time)
- Max 50MB per file (configurable via MAX_FILE_SIZE_MB)
- Max 15 anomalies detected per upload

---

## License

MIT
