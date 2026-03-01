# SOC Log Analyzer - Technical Documentation

**Version:** 2.0.0
**Last Updated:** 2026-02-28

---

## Build Status

| Phase | Status | Notes |
|---|---|---|
| Phase 1 - Project Scaffolding | Complete | Monorepo, Next.js, Express, Docker |
| Phase 2 - Database | Complete | Schema pushed, Prisma client generated |
| Phase 3 - Backend Auth | Complete | register, login, GET /me |
| Phase 4 - File Upload + Parser | Complete | Multer, 34-field ZScaler parser |
| Phase 5 - AI Analysis + Anomaly Detection | Complete | 8 rules, rule-based enrichment, LLM summary |
| Phase 6 - Frontend Auth | Complete | NextAuth v5, Credentials + Google |
| Phase 7 - Frontend Dashboard | Complete | Upload list, drag-drop, full analysis view |
| Phase 8 - Sample Log Generation | Complete | 800-row ZScaler log with all 8 anomaly types |
| Phase 9 - README + Cleanup | Complete | Root README with setup, API ref, LLM config |
| Post - Multi-LLM Settings | Complete | Anthropic, OpenAI, DeepSeek, Llama, Custom |
| Post - Docker Ollama Integration | Complete | Ollama runs in Docker, auto-pulls model |
| Post - Analysis History | Complete | Every run stored in analysisHistory table |
| Post - UX Refinements | Complete | Inline history in table, provider badge in analysis |

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Database Schema](#2-database-schema)
3. [API Reference](#3-api-reference)
4. [Authentication and Authorization](#4-authentication-and-authorization)
5. [File Upload Specification](#5-file-upload-specification)
6. [Log Parsing Specification](#6-log-parsing-specification)
7. [Anomaly Detection Engine](#7-anomaly-detection-engine)
8. [AI Integration](#8-ai-integration)
9. [LLM Provider System](#9-llm-provider-system)
10. [Error Handling](#10-error-handling)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Environment Configuration](#12-environment-configuration)

---

## 1. System Architecture

```
Browser
  |
  | HTTPS/HTTP
  v
Next.js Frontend (port 3000)
  |-- /api/auth/*   --> NextAuth.js (JWT session)
  |-- pages         --> Server Components (SSR)
  |-- components    --> Client Components (React)
  |
  | REST API calls (Bearer JWT)
  v
Express Backend (port 4000)
  |-- /api/auth/*        --> User registration/login
  |-- /api/uploads/*     --> File upload + polling
  |-- /api/analysis/*    --> Log entry queries
  |-- /api/llm-config/*  --> Per-user LLM settings
  |
  +-- PostgreSQL (port 5432)   <- Prisma ORM
  +-- Local disk /uploads      <- Uploaded log files
  +-- LLM Provider             <- Anthropic / OpenAI / DeepSeek / Ollama
```

### Docker Compose Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| postgres | postgres:16-alpine | 5432 | PostgreSQL database |
| ollama | ollama/ollama:latest | 11434 | Local LLM inference |
| ollama-init | ollama/ollama:latest | - | One-time model pull on startup |
| backend | ./packages/backend/Dockerfile | 4000 | Express API |
| frontend | ./packages/frontend/Dockerfile | 3000 | Next.js app |

---

## 2. Database Schema

### Core Tables

#### users
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | String | Unique |
| name | String | |
| passwordHash | String? | Null for OAuth-only users |
| activeProvider | String? | Currently selected LLM provider |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### user_llm_configs
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| userId | String | FK -> users.id |
| provider | String | anthropic/openai/deepseek/llama/custom |
| model | String? | Model name (e.g. claude-sonnet-4-6) |
| baseUrl | String? | API base URL |
| apiKeyEnc | String? | AES-256-GCM encrypted API key |
| createdAt | DateTime | |
| updatedAt | DateTime | |

Unique constraint: `(userId, provider)` - one config per provider per user.

#### log_uploads
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| userId | String | FK -> users.id |
| filename | String | UUID-named file on disk |
| originalName | String | User's original filename |
| fileSize | Int | Bytes |
| status | UploadStatus | PENDING/PARSING/ANALYZING/COMPLETE/FAILED |
| totalEntries | Int | Parsed row count |
| errorMessage | String? | Set on FAILED |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### log_entries
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| uploadId | String | FK -> log_uploads.id |
| timestamp | DateTime | Parsed from ZScaler time field |
| login | String? | User login |
| cip | String? | Client IP |
| sip | String? | Server IP |
| url | String? | Requested URL |
| action | String? | Allowed/Blocked |
| urlsupercat | String? | URL super category |
| urlcat | String? | URL category |
| threatname | String? | Threat name if detected |
| riskscore | Int? | 0-100 |
| isAnomalous | Boolean | Marked true if any anomaly references this entry |
| rawData | Json | Original CSV row |
| ... | | (34 total fields from ZScaler NSS spec) |

Indexes: `(uploadId, timestamp)`, `(uploadId, cip)`, `(uploadId, isAnomalous)`, `(uploadId, action)`

#### analysis_results
One record per upload - the LATEST analysis run.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| uploadId | String | FK -> log_uploads.id, Unique |
| provider | String | LLM provider used |
| executiveSummary | String | AI-generated summary |
| timeline | Json | Array of {time, event} |
| stats | Json | AggregatedStats object |
| topThreats | Json | Array of {name, count, severity, description} |
| socRecommendations | Json | String array |
| totalRequests | Int | |
| blockedRequests | Int | |
| threatCount | Int | |
| anomalyCount | Int | |
| uniqueUsers | Int | |
| uniqueIPs | Int | |
| timeRangeStart | DateTime? | |
| timeRangeEnd | DateTime? | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### analysis_history
One record per analysis RUN (appended, never updated).

Same columns as `analysis_results` minus `uploadId` uniqueness constraint.
Ordered `DESC` by `createdAt` for history display.

#### anomalies
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| uploadId | String | FK -> log_uploads.id |
| logEntryId | String? | FK -> log_entries.id (SetNull on delete) |
| type | AnomalyType | Enum (8 types) |
| severity | Severity | LOW/MEDIUM/HIGH/CRITICAL |
| description | String | Human-readable description |
| confidenceScore | Float | 0.0 - 1.0 |
| affectedIp | String? | |
| affectedUser | String? | |
| details | Json | Rule-specific details + flag reason + recommendations |
| createdAt | DateTime | |

### Enums

```prisma
enum UploadStatus { PENDING PARSING ANALYZING COMPLETE FAILED }
enum AnomalyType {
  HIGH_REQUEST_RATE REPEATED_BLOCK THREAT_DETECTED HIGH_RISK_SCORE
  SUSPICIOUS_UA OFF_HOURS_ACCESS LARGE_TRANSFER MALICIOUS_CATEGORY
}
enum Severity { LOW MEDIUM HIGH CRITICAL }
```

---

## 3. API Reference

All endpoints require `Authorization: Bearer <jwt>` unless noted as public.

### Auth Routes (`/api/auth`)

#### POST /api/auth/register (public)
```json
Request:  { "name": "string", "email": "string", "password": "string (min 8)" }
Response: 201 { "success": true, "data": { "token": "jwt", "user": {...} } }
Errors:   409 EMAIL_EXISTS, 400 VALIDATION_ERROR
```

#### POST /api/auth/login (public)
```json
Request:  { "email": "string", "password": "string" }
Response: 200 { "success": true, "data": { "token": "jwt", "user": {...} } }
Errors:   401 INVALID_CREDENTIALS
```

#### GET /api/auth/me
```json
Response: 200 { "success": true, "data": { "id": "...", "email": "...", "name": "..." } }
```

#### POST /api/auth/oauth (public)
Used by NextAuth Google provider callback to sync OAuth user with backend DB.
```json
Request:  { "email": "string", "name": "string", "provider": "google", "providerAccountId": "..." }
Response: 200 { "success": true, "data": { "token": "jwt", "user": {...} } }
```

---

### Upload Routes (`/api/uploads`)

#### POST /api/uploads
Accepts `multipart/form-data` with field `file`.
Accepted types: `.log`, `.txt`, `.csv`. Max size: 50MB (configurable).

```json
Response: 202 { "success": true, "data": { "id": "upload-uuid", "status": "PENDING" } }
```

Processing pipeline runs asynchronously (fire-and-forget on non-Vercel):
`parseLogFile -> runAnomalyDetection -> runAiAnalysis -> COMPLETE`

#### GET /api/uploads
Returns paginated upload list for authenticated user.
```
Query: ?page=1&limit=20
Response: 200 { "success": true, "data": { "uploads": [...], "pagination": {...} } }
```

#### GET /api/uploads/:id
Returns full upload detail including current analysis, history, and anomalies.
```json
Response: 200 {
  "success": true,
  "data": {
    "upload": { "id", "originalName", "fileSize", "status", "totalEntries", "createdAt" },
    "analysis": { ...AnalysisResult } | null,
    "history": [ ...AnalysisHistoryEntry[] ],
    "anomalies": [ ...Anomaly[] ]
  }
}
```

#### DELETE /api/uploads/:id
Deletes upload record (cascades to log_entries, analysis_result, anomalies) and removes file from disk.
```
Response: 204 No Content
```

#### POST /api/uploads/:id/reanalyze
Re-runs AI analysis for a completed upload using the user's current LLM provider.
```json
Response: 200 { "success": true, "data": { "message": "Re-analysis started." } }
```

---

### Analysis Routes (`/api/analysis`)

#### GET /api/analysis/:uploadId
Returns analysis result and anomalies (legacy endpoint, prefer GET /api/uploads/:id).

#### GET /api/analysis/:uploadId/entries
Returns paginated log entries for an upload.
```
Query: ?page=1&limit=50&anomalous=true
Response: 200 { "success": true, "data": { "entries": [...], "pagination": {...} } }
```

---

### LLM Config Routes (`/api/llm-config`)

#### GET /api/llm-config
Returns the user's currently active LLM config (no API key, just metadata).
```json
Response: 200 { "success": true, "data": { "provider": "anthropic", "model": "claude-sonnet-4-6", "baseUrl": null, "hasApiKey": true } }
```

#### PUT /api/llm-config
Saves or updates LLM config for specified provider. Updates user's activeProvider.
```json
Request:  { "provider": "anthropic", "model": "claude-sonnet-4-6", "baseUrl": null, "apiKey": "sk-ant-..." }
Response: 200 { "success": true, "data": { "provider": "...", "model": "...", "baseUrl": "...", "hasApiKey": true } }
```

#### DELETE /api/llm-config/key
Removes stored API key for the active provider (keeps model/baseUrl).
```json
Response: 200 { "success": true, "data": { "provider": "...", "hasApiKey": false } }
```

#### POST /api/llm-config/test
Tests connectivity with the user's saved LLM config by sending a minimal prompt.
```json
Response: 200 { "success": true, "reply": "OK" }
         200 { "success": false, "error": "LLM request failed..." }
```

#### GET /api/llm-config/ollama-models
Proxies to Ollama `/api/tags` to list locally pulled models.
```
Query: ?baseUrl=http://ollama:11434
Response: 200 { "models": ["llama3.2", "mistral", ...] }
```

---

## 4. Authentication and Authorization

### JWT Flow
```
Backend signs JWT on register/login:
  jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' })

Frontend (NextAuth) stores JWT in session as backendToken.
All API calls include: Authorization: Bearer <jwt>

Backend middleware verifies:
  jwt.verify(token, JWT_SECRET) -> attach { userId, email } to req.user
```

### NextAuth Session
NextAuth uses JWT strategy. Session object:
```typescript
{
  user: { name, email, image },
  backendToken: string  // JWT from Express backend
}
```

### Route Protection
`packages/frontend/proxy.ts` (Next.js middleware file):
- Unauthenticated requests to `/dashboard/*` and `/settings/*` redirect to `/login`
- Public routes: `/login`, `/register`, `/api/auth/*`

---

## 5. File Upload Specification

- Max size: 50MB (env `MAX_FILE_SIZE_MB`)
- Accepted MIME/extensions: `.log`, `.txt`, `.csv`
- Storage: local disk at `UPLOAD_DIR` (default `./uploads/`)
- Filename: `{uuid}{ext}` (original name preserved in DB as `originalName`)
- Vercel: writes to `/tmp/uploads` (ephemeral, lost on cold start)
- Multer handles multipart, converts errors to AppError format

---

## 6. Log Parsing Specification

ZScaler NSS Web Log Feed format, 34 comma-separated fields per row.

| Index | Field | Type |
|---|---|---|
| 0 | time | DateTime (e.g. "Mon Jun 20 09:15:22 2024") |
| 1 | login | String |
| 2 | proto | String |
| 3 | url | String |
| 4 | action | "Allowed" or "Blocked" |
| 5 | appname | String |
| 6 | appclass | String |
| 7 | reqsize | Integer (bytes) |
| 8 | respsize | Integer (bytes) |
| 9 | reqdatasize | Integer |
| 10 | respdatasize | Integer |
| 11 | urlsupercat | String |
| 12 | urlcat | String |
| 13 | urlsubcat | String |
| 14 | threatname | String ("None" if clean) |
| 15 | malwarecat | String |
| 16 | riskscore | Integer (0-100) |
| 17 | dlpeng | String |
| 18 | dlpdict | String |
| 19 | location | String |
| 20 | dept | String |
| 21 | cip | String (client IP) |
| 22 | sip | String (server IP) |
| 23 | reqmethod | GET/POST/etc. |
| 24 | respcode | HTTP status code |
| 25 | ua | User agent string |
| 26 | keyprotectiontype | String |
| 27 | ruletype | String |
| 28 | rulelabel | String |
| 29 | unscannabletype | String |
| 30 | ssldecrypted | Yes/No |
| 31 | reason | String |
| 32 | threatseverity | String |
| 33 | contenttype | String |

Parser rules:
- Skip header row (detected by: first cell not starting with day-of-week abbreviation)
- Treat "None", "N/A", "NA", "--", "" as null
- Batch insert 500 rows per Prisma createMany call

---

## 7. Anomaly Detection Engine

`packages/backend/src/services/anomalyDetection.ts`

All 8 rules are purely rule-based. No LLM enrichment per anomaly (removed for performance).
Each anomaly's `details` JSON contains:
- `flagReason`: text explanation from `fallbackFlagReason(anomaly)`
- `recommendedActions`: string array from `fallbackActions(anomaly, sampleEntries)`

### Rule Implementations

**R1 - HIGH_REQUEST_RATE**
- Groups entries by `cip`, builds 5-minute sliding windows
- Triggers if any window has >= 100 requests from same IP
- Stores `windowEntryIds` in details; marks all those entries as `isAnomalous = true`

**R2 - REPEATED_BLOCK**
- Counts blocked requests per IP
- Triggers if `blocked >= 10` for same IP
- One anomaly per IP; stores `blockedEntryIds`

**R3 - THREAT_DETECTED**
- Finds entries where `threatname != null`
- Groups by `ip:threatname` pair, one anomaly per pair
- Confidence varies by `threatseverity`

**R4 - HIGH_RISK_SCORE**
- Finds entries where `riskscore > 75`
- One anomaly per IP (highest risk score wins)

**R5 - SUSPICIOUS_UA**
- Matches user agents against `/curl|python|wget|scrapy|libwww|go-http/i`
- One anomaly per `ip:ua_prefix` pair

**R6 - OFF_HOURS_ACCESS**
- Finds entries outside 07:00-20:00 local time
- Groups by IP, triggers if off-hours count >= 5
- Stores `offHoursEntryIds`

**R7 - LARGE_TRANSFER**
- Detects `respdatasize > 52428800` (50MB) per entry
- One anomaly per IP

**R8 - MALICIOUS_CATEGORY**
- Detects blocked requests to `urlsupercat` matching security threat categories
- Categories: "Security", "Malicious Content", "Phishing", "Botnet", "Command and Control"
- One anomaly per IP

### Processing Limit
Max 15 anomalies created per upload (`MAX_ANOMALIES = 15`) to avoid DB bloat.

---

## 8. AI Integration

`packages/backend/src/services/aiAnalysis.ts`

### Processing Flow
1. `buildStats(uploadId)` - aggregates data from log_entries and anomalies:
   - totalRequests, blockedRequests, threatCount, anomalyCount, uniqueUsers, uniqueIPs
   - topIPs (top 10 by volume), topCategories (top 10 URL super categories)
   - ipRiskSummary (top 10 IPs by risk score with anomaly types)
   - topBlockedDests (top 10 blocked destination domains)
2. `generateSummary()` - one LLM call with aggregated stats:
   - Cloud LLMs: full prompt (~500 tokens input), 2048 max output tokens
   - Llama: compact prompt (~150 tokens input), 600 max output tokens, timeline = []
3. Parse JSON from response (handles ` ```json ``` ` code block wrapping)
4. Fallback if JSON parse fails: rule-based summary from `buildLogSpecificFallbackRecommendations()`
5. Upsert `analysis_results` (latest run for display) and append `analysis_history`

### Cloud LLM Prompt Output Format
```json
{
  "executiveSummary": "2-3 paragraph executive summary",
  "timeline": [{ "time": "ISO timestamp", "event": "what happened" }],
  "topThreats": [{ "name": "...", "count": 1, "severity": "HIGH", "description": "..." }],
  "socRecommendations": ["concrete action with specific IP/URL/threat"]
}
```

### Llama Prompt Output Format
```json
{
  "executiveSummary": "2-3 sentences",
  "timeline": [],
  "topThreats": [{ "name": "...", "count": 1, "severity": "HIGH", "description": "..." }],
  "socRecommendations": ["action"]
}
```

---

## 9. LLM Provider System

`packages/backend/src/lib/llm.ts`

### Provider Resolution Order
For each analysis request, the effective provider is determined:
1. If `userId` provided: look up `user.activeProvider` -> fetch `user_llm_configs` for that provider
2. Decrypt stored API key (AES-256-GCM)
3. Merge with env var defaults (env var is fallback, user config takes precedence)
4. If no user config: use env vars (`LLM_PROVIDER`, `LLM_API_KEY`, etc.)

### Supported Providers

| Provider | Default Model | Base URL | Notes |
|---|---|---|---|
| anthropic | claude-sonnet-4-6 | (SDK default) | Uses @anthropic-ai/sdk |
| openai | gpt-4o-mini | https://api.openai.com | OpenAI-compatible REST |
| deepseek | deepseek-reasoner | https://api.deepseek.com | Temperature skipped for R1 models |
| llama | llama3.1 | http://localhost:11434 | Ollama native or OpenAI-compat mode |
| custom | (user set) | (user set) | OpenAI-compatible REST |

### Timeouts
- Cloud providers: 120 seconds
- Llama (local): 300 seconds (5 minutes)

### API Key Encryption
`packages/backend/src/lib/crypto.ts`
- Algorithm: AES-256-GCM
- Key: `ENCRYPTION_KEY` env var (32-byte hex string)
- IV: random 12 bytes per encryption
- Stored format: `iv:authTag:ciphertext` (hex-encoded, colon-separated)

---

## 10. Error Handling

### Backend Error Format
```json
{
  "success": false,
  "error": {
    "message": "Human-readable message",
    "code": "MACHINE_READABLE_CODE",
    "statusCode": 400
  }
}
```

### Error Codes
| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Zod validation failed |
| NO_FILE | 400 | Upload request missing file |
| INVALID_FILE_TYPE | 415 | Not .log/.txt/.csv |
| FILE_TOO_LARGE | 413 | Exceeds MAX_FILE_SIZE_MB |
| UNAUTHORIZED | 401 | Missing or invalid JWT |
| FORBIDDEN | 403 | Resource belongs to another user |
| NOT_FOUND | 404 | Resource not found |
| EMAIL_EXISTS | 409 | Email already registered |
| INVALID_CREDENTIALS | 401 | Wrong email/password |
| NOT_READY | 400 | Upload not COMPLETE yet |

---

## 11. Data Flow Diagrams

### Upload and Analysis Flow
```
Browser                      Backend                       DB / LLM
  |                             |                              |
  |-- POST /api/uploads ------->|                              |
  |                             |-- create LogUpload (PENDING)->|
  |<-- 202 { id } -------------|                              |
  |                             |                              |
  |                       [async background]                  |
  |                             |-- status PARSING ----------->|
  |                             |-- parseLogFile() ----------->| (batch insert LogEntry rows)
  |                             |-- status ANALYZING ---------->|
  |                             |-- runAnomalyDetection() ---->| (insert Anomaly rows)
  |                             |-- runAiAnalysis() ---------->| -> LLM API
  |                             |-- upsert AnalysisResult ----->|
  |                             |-- append AnalysisHistory ---->|
  |                             |-- status COMPLETE ----------->|
  |                             |                              |
  |-- GET /api/uploads/:id ---->|                              |
  |   (polls every 3s)          |-- findUnique LogUpload ------>|
  |                             |-- findUnique AnalysisResult ->|
  |                             |-- findMany AnalysisHistory -->|
  |                             |-- findMany Anomaly ---------->|
  |<-- { upload, analysis, ----|                              |
  |     history, anomalies }    |                              |
```

### LLM Config Flow
```
Browser (Settings page)      Backend                       DB
  |                             |                              |
  |-- PUT /api/llm-config ----->|                              |
  |   { provider, model,        |-- encryptSecret(apiKey) ---->|
  |     baseUrl, apiKey }       |-- upsert UserLlmConfig ----->|
  |                             |-- update User.activeProvider->|
  |<-- { hasApiKey: true } -----|                              |
  |                             |                              |
  |-- POST /api/llm-config/test>|                              |
  |                             |-- getUserLlmConfigResolved -->|
  |                             |-- decryptSecret(apiKeyEnc) --|
  |                             |-- llmText("Reply: OK") ------>| -> LLM API
  |<-- { success, reply } ------|                              |
```

---

## 12. Environment Configuration

### Backend Environment Variables

| Variable | Default | Description |
|---|---|---|
| DATABASE_URL | - | PostgreSQL connection string |
| PORT | 4000 | HTTP port |
| FRONTEND_URL | http://localhost:3000 | CORS allowed origin |
| JWT_SECRET | - | JWT signing secret (min 32 chars) |
| ENCRYPTION_KEY | - | AES key for API key encryption (32-byte hex) |
| UPLOAD_DIR | ./uploads | File storage path |
| MAX_FILE_SIZE_MB | 50 | Max upload size |
| LLM_PROVIDER | anthropic | Default provider if no user config |
| LLM_API_KEY | - | Generic API key (overrides provider-specific) |
| LLM_MODEL | - | Generic model override |
| LLM_BASE_URL | - | Generic base URL override |
| ANTHROPIC_API_KEY | - | Anthropic-specific key |
| ANTHROPIC_MODEL | claude-sonnet-4-6 | Anthropic model |
| OPENAI_API_KEY | - | OpenAI-specific key |
| OPENAI_MODEL | gpt-4o-mini | OpenAI model |
| OPENAI_BASE_URL | https://api.openai.com | OpenAI base URL |
| DEEPSEEK_API_KEY | - | DeepSeek-specific key |
| DEEPSEEK_MODEL | deepseek-reasoner | DeepSeek model |
| DEEPSEEK_BASE_URL | https://api.deepseek.com | DeepSeek base URL |
| LLAMA_API_KEY | (empty) | Ollama API key (usually empty) |
| LLAMA_MODEL | llama3.1 | Ollama model name |
| LLAMA_BASE_URL | http://localhost:11434 | Ollama base URL |
| VERCEL | - | Set to "1" on Vercel to use /tmp and inline processing |

### Frontend Environment Variables

| Variable | Default | Description |
|---|---|---|
| NEXTAUTH_SECRET | - | NextAuth signing secret |
| NEXTAUTH_URL | http://localhost:3000 | Full URL for OAuth callbacks |
| BACKEND_URL | http://localhost:4000 | Backend URL (server-side SSR calls) |
| NEXT_PUBLIC_BACKEND_URL | http://localhost:4000 | Backend URL (browser-side calls) |
| GOOGLE_CLIENT_ID | - | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | - | Google OAuth client secret |

---

## Frontend Component Reference

| Component | Type | Purpose |
|---|---|---|
| `app/dashboard/page.tsx` | Server | Upload list page |
| `app/dashboard/[id]/page.tsx` | Server | Analysis view page |
| `app/settings/page.tsx` | Server | LLM settings page |
| `AnalysisView` | Client | Polls for analysis status, renders all sections |
| `UploadsTable` | Client | Upload list with inline analysis history toggle |
| `FileUploader` | Client | Drag-and-drop upload zone |
| `LlmSettingsForm` | Client | Provider/model/key config form with test button |
| `StatsCards` | Client | 6 metric cards |
| `AiSummary` | Server/pure | Executive summary card |
| `Charts` | Client | Recharts bar + pie charts |
| `IpRiskTable` | Server/pure | Per-IP risk breakdown table |
| `BlockedDestinations` | Server/pure | Top blocked destinations table |
| `Timeline` | Server/pure | Vertical event timeline |
| `AnomalyPanel` | Server/pure | Anomaly cards sorted by severity |
| `SocRecommendations` | Server/pure | Recommendations checklist |
| `LogTable` | Client | Paginated + filterable log entries table |
| `StatusBadge` | Server/pure | Colored upload status indicator |

---

## Security Considerations

1. **API Key Storage**: User LLM API keys are encrypted at rest using AES-256-GCM. The encryption key must be set as `ENCRYPTION_KEY` env var. Keys are never returned in API responses (only `hasApiKey: boolean`).

2. **JWT Secrets**: `JWT_SECRET` and `NEXTAUTH_SECRET` should be long random strings (32+ chars). Auto-generated in Docker if not set, but set explicitly for production.

3. **File Upload**: Only `.log`, `.txt`, `.csv` accepted. File content is not executed. Stored with UUID names to prevent path traversal. Multer sanitizes filenames.

4. **SQL Injection**: Prisma ORM uses parameterized queries exclusively.

5. **Password Storage**: bcryptjs with work factor 10. Login uses constant-time compare.

6. **User Enumeration**: Login returns the same error message for wrong email and wrong password.

7. **Authorization**: Every upload/analysis endpoint verifies `upload.userId === req.user.userId` before serving data.
