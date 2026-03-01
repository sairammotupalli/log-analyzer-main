# SOC Log Analyzer - Development Guide

> Personal reference document for building the application phase by phase.

---

## Project Overview

A full-stack web application that allows SOC analysts to upload ZScaler Web Proxy log files, parse them, run AI-powered threat detection and anomaly analysis, and view results in a human-consumable dashboard format.

**Repository root:** `tenex/`
**Frontend:** `packages/frontend/` - runs on `http://localhost:3000`
**Backend:** `packages/backend/` - runs on `http://localhost:4000`
**Database:** PostgreSQL - runs on `localhost:5432`

---

## Tech Stack Quick Reference

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js (App Router) | 16+ |
| Frontend Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Charts | Recharts | 3.x |
| Auth Library | NextAuth.js (Auth.js v5 beta) | 5.0.0-beta |
| Backend Framework | Express | 4.x |
| Backend Language | TypeScript | 5.x |
| ORM | Prisma | 6.x |
| Database | PostgreSQL | 16 |
| Primary AI Model | Claude claude-sonnet-4-6 (Anthropic) | Latest |
| AI SDK | @anthropic-ai/sdk | 0.39+ |
| Local AI | Ollama (llama3.2 default) | Latest |
| File Upload | Multer | 1.x |
| CSV Parsing | csv-parse | 5.x |
| Password Hashing | bcryptjs | 2.x |
| JWT | jsonwebtoken | 9.x |
| Validation | Zod | 3.x |
| Containerization | Docker + Docker Compose | - |
| Package Manager | pnpm (workspaces) | 10.x |

---

## Environment Variables

### Root `.env` file (copy from `.env.example`)

```bash
# PostgreSQL
DATABASE_URL=postgresql://socuser:socpassword@localhost:5432/socanalyzer

# Backend (Express)
PORT=4000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=<long-random-string>

# Encryption (for API key storage)
ENCRYPTION_KEY=<32-char-hex-string>

# Anthropic (optional if using Ollama)
ANTHROPIC_API_KEY=sk-ant-...

# NextAuth (Frontend)
NEXTAUTH_SECRET=<another-long-random-string>
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (optional)
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50

# LLM override (optional - users configure per-account in Settings)
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_MODEL=
LLM_BASE_URL=
```

---

## Project Folder Structure

```
tenex/
+-- .env                          <- Create from .env.example (never commit)
+-- .env.example
+-- .gitignore
+-- .npmrc
+-- docker-compose.yml            <- Postgres + Backend + Frontend + Ollama services
+-- README.md
+-- docs/
|   +-- DEVELOPMENT_GUIDE.md     <- This file
|   +-- TECHNICAL_DOCS.md        <- API + technical reference
+-- sample_logs/
|   +-- zscaler_sample.log       <- 800-row realistic test file
+-- scripts/
|   +-- generate-sample-log.js   <- Generates zscaler_sample.log
+-- packages/
    +-- frontend/                 <- Next.js App
    |   +-- app/
    |   |   +-- (auth)/login/page.tsx
    |   |   +-- (auth)/register/page.tsx
    |   |   +-- dashboard/page.tsx           <- Upload list
    |   |   +-- dashboard/[id]/page.tsx      <- SOC analysis view
    |   |   +-- settings/page.tsx            <- LLM settings
    |   |   +-- api/auth/[...nextauth]/route.ts
    |   +-- components/
    |   |   +-- auth/LoginForm.tsx
    |   |   +-- auth/RegisterForm.tsx
    |   |   +-- upload/FileUploader.tsx
    |   |   +-- dashboard/
    |   |   |   +-- AnalysisView.tsx         <- Client component, polls for results
    |   |   |   +-- UploadsTable.tsx         <- Table with inline history per row
    |   |   |   +-- StatsCards.tsx
    |   |   |   +-- AiSummary.tsx
    |   |   |   +-- Timeline.tsx
    |   |   |   +-- AnomalyPanel.tsx
    |   |   |   +-- Charts.tsx
    |   |   |   +-- LogTable.tsx
    |   |   |   +-- IpRiskTable.tsx
    |   |   |   +-- BlockedDestinations.tsx
    |   |   |   +-- SocRecommendations.tsx
    |   |   |   +-- StatusBadge.tsx
    |   |   +-- settings/LlmSettingsForm.tsx <- LLM provider config form
    |   +-- lib/api.ts
    |   +-- lib/auth.ts
    |   +-- types/index.ts
    +-- backend/
        +-- prisma/schema.prisma
        +-- src/
            +-- index.ts
            +-- routes/
            |   +-- auth.ts          <- /api/auth/*
            |   +-- uploads.ts       <- /api/uploads/*
            |   +-- analysis.ts      <- /api/analysis/*
            |   +-- llmConfig.ts     <- /api/llm-config/*
            +-- services/
            |   +-- logParser.ts     <- ZScaler CSV parser
            |   +-- anomalyDetection.ts <- Rule-based detection
            |   +-- aiAnalysis.ts    <- LLM summary generation
            +-- middleware/
            |   +-- auth.ts
            |   +-- errorHandler.ts
            +-- lib/
                +-- prisma.ts
                +-- llm.ts           <- Multi-provider LLM client
                +-- userLlmConfig.ts <- Per-user LLM config (DB-backed)
                +-- crypto.ts        <- AES encryption for stored API keys
```

---

## Phase-by-Phase Reference

### PHASE 1 - Project Scaffolding (COMPLETE)
- pnpm monorepo with `pnpm-workspace.yaml`
- Next.js 16 frontend + Express backend
- Docker Compose for PostgreSQL
- `.env.example`, `.gitignore`, `.npmrc`

### PHASE 2 - Database (COMPLETE)
- Prisma schema with core tables
- Tables: `users`, `accounts`, `sessions`, `verification_tokens`, `log_uploads`, `log_entries`, `analysis_results`, `anomalies`
- Cascade deletes configured

### PHASE 3 - Backend Auth (COMPLETE)
- `POST /api/auth/register` - bcrypt password hash, JWT sign
- `POST /api/auth/login` - compare, JWT
- `GET /api/auth/me` - verify JWT, return user

### PHASE 4 - File Upload + Parser (COMPLETE)
- Multer upload to `/uploads/{uuid}.log`
- 34-field ZScaler NSS CSV parser
- Batch insert 500 rows/call
- Status: PENDING -> PARSING -> ANALYZING -> COMPLETE/FAILED

### PHASE 5 - Anomaly Detection + AI Analysis (COMPLETE, UPDATED)

**Anomaly Detection - Rule-Based Only (LLM removed for speed):**

| Rule | Name | Trigger | Severity |
|---|---|---|---|
| R1 | HIGH_REQUEST_RATE | Same IP > 100 reqs in 5-min window | HIGH |
| R2 | REPEATED_BLOCK | Same IP > 10 blocked requests | HIGH |
| R3 | THREAT_DETECTED | threatname != "None" | CRITICAL |
| R4 | HIGH_RISK_SCORE | riskscore > 75 | HIGH |
| R5 | SUSPICIOUS_UA | ua contains curl/python/wget/scrapy | MEDIUM |
| R6 | OFF_HOURS_ACCESS | timestamp outside 07:00-20:00 + high volume | MEDIUM |
| R7 | LARGE_TRANSFER | respdatasize > 50MB | HIGH |
| R8 | MALICIOUS_CATEGORY | urlsupercat = "Security" + action = "Blocked" | CRITICAL |

All anomalies now use `fallbackFlagReason()` and `fallbackActions()` (rule-based text, no LLM enrichment per anomaly). This makes analysis much faster.

**AI Summary Generation:**
- One LLM call per upload after anomaly detection
- Cloud LLMs (Anthropic/OpenAI/DeepSeek): full prompt, 2048 max tokens, includes timeline + topThreats + socRecommendations
- Local LLM (Llama/Ollama): compact prompt, 600 max tokens, timeline set to [] to prevent JSON truncation, topThreats + socRecommendations only

**Multi-LLM Support:**
- `packages/backend/src/lib/llm.ts` - unified `llmText()` function
- Supported providers: `anthropic`, `openai`, `deepseek`, `llama`, `custom`
- Per-user config stored in `user_llm_configs` table (encrypted API key)
- User's `activeProvider` field tracks which config is active
- `getEffectiveProvider(userId)` resolves: user DB config > env var fallback

### PHASE 6 - Frontend Auth (COMPLETE)
- NextAuth v5 Credentials + Google provider
- `backendToken` (JWT) stored in session
- Route protection via `proxy.ts`

### PHASE 7 - Frontend Dashboard (COMPLETE, UPDATED)

**Dashboard page (`/dashboard`):**
- FileUploader with same-file re-upload fix (input value reset after each upload)
- UploadsTable with inline per-row analysis history (lazy-loaded on expand)
- Each history row shows: provider badge, timestamp, key stats, executive summary snippet

**Analysis page (`/dashboard/[id]`):**
- Provider badge in file header showing which LLM generated the analysis
- Stats cards (totalRequests, blockedRequests, blockRate, anomalies, users, IPs)
- AI Executive Summary
- Charts (bar chart top IPs, pie chart URL categories)
- IP Risk Summary table
- Top Blocked Destinations table
- Event Timeline (cloud LLMs only - Llama returns empty timeline)
- Anomaly Panel
- SOC Recommendations
- Full log table (paginated, filterable, anomaly rows highlighted)

**Analysis History:** moved from analysis page to dashboard UploadsTable (inline per row).
**Re-analyze button:** removed. To re-analyze with a different LLM, upload the file again.

### PHASE 8 - Sample Log Generation (COMPLETE)
- `scripts/generate-sample-log.js` generates `sample_logs/zscaler_sample.log`
- 800 rows with all 8 anomaly types embedded

### PHASE 9 - README + Cleanup (COMPLETE, UPDATED)
- Root `README.md` with full setup, Docker, API reference, LLM config docs

### POST-PHASE - LLM Settings UI (COMPLETE)
- `packages/frontend/app/settings/page.tsx`
- `packages/frontend/components/settings/LlmSettingsForm.tsx`
- `packages/backend/src/routes/llmConfig.ts`
- `packages/backend/src/lib/userLlmConfig.ts`
- `packages/backend/src/lib/crypto.ts`

**Settings flow:**
1. User picks provider (Anthropic/OpenAI/DeepSeek/Llama/Custom)
2. Enters model name, base URL, API key
3. PUT saves config, encrypts API key with AES-256-GCM
4. Test connection button sends a minimal ping to verify credentials
5. `activeProvider` on User model updated to reflect chosen provider
6. All subsequent analyses use that provider's config

### POST-PHASE - Docker Ollama Integration (COMPLETE)

```yaml
# docker-compose.yml services:
# - postgres
# - ollama          (ollama/ollama:latest, port 11434, ollama_data volume)
# - ollama-init     (pulls OLLAMA_MODEL on first start, then exits)
# - backend         (depends on ollama-init completing)
# - frontend

# To change the model, edit x-ollama-model at top of docker-compose.yml:
x-ollama-model: &ollama-model
  OLLAMA_MODEL: llama3.2
```

**In LLM Settings, use:**
- Provider: Llama / Ollama
- Base URL: `http://ollama:11434` (Docker) or `http://localhost:11434` (local)
- Model: `llama3.2` (or whatever OLLAMA_MODEL is set to)

---

## Running the App

### Docker (Recommended)
```bash
cp .env.example .env
# Edit .env (JWT_SECRET, NEXTAUTH_SECRET, ANTHROPIC_API_KEY)
docker compose up --build
# First time: wait ~2 min for ollama-init to pull the model
open http://localhost:3000
```

### Manual (Dev Mode)
```bash
# Terminal 1: PostgreSQL
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

---

## Common Commands

```bash
pnpm install                        # Install all deps from root
pnpm dev                            # Run frontend + backend concurrently

# Database (from packages/backend/)
export DATABASE_URL="postgresql://socuser:socpassword@localhost:5432/socanalyzer"
./node_modules/.bin/prisma db push
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma studio

# Docker
docker compose up --build           # Full stack
docker compose up postgres -d       # DB only
docker exec soc_ollama ollama list  # Check pulled models
docker exec soc_ollama ollama pull llama3.2  # Pull model manually
docker logs soc_backend -f          # Stream backend logs

# Sample log
node scripts/generate-sample-log.js
```

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Monorepo | pnpm workspaces | Shared deps, single install |
| Auth | NextAuth.js v5 | Handles OAuth + credentials, integrates with Next.js |
| Primary AI | claude-sonnet-4-6 | Best text analysis, structured JSON output |
| Local AI | Ollama/Llama | Free, runs on user hardware, good privacy |
| Anomaly detection | Rule-based only (LLM removed) | 15x faster analysis, deterministic results |
| AI summary | One LLM call per upload | Cost-effective, single coherent narrative |
| Llama timeline | Disabled (empty []) | 600 token limit not enough for timeline + other fields |
| File storage | Local disk (/uploads) | Simple for current scope |
| API polling | Client polls every 3s | Avoids WebSocket complexity |
| DB | PostgreSQL + Prisma | Required by spec, type-safe ORM |
| API key storage | AES-256-GCM encrypted in DB | Security best practice, never plaintext |
| History | analysisHistory table (append) | Every run preserved, analysisResult = latest only |

---

## Known Issues / Limitations

- Ollama models (Llama) do not generate timeline events (token budget too small)
- Vercel deployment requires Railway/Supabase for DB; file uploads go to /tmp (ephemeral)
- File upload limit: 50MB (configurable via MAX_FILE_SIZE_MB env var)
- Only ZScaler NSS Web Log Feed format (34-field CSV) is supported
- OAuth account linking (same email, different provider) not implemented
