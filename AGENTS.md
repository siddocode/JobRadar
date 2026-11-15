# AGENTS.md — AI Developer & Coding Agent Operational Manual

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS:**  
> Before proposing or implementing significant architectural alterations, adding new ATS adapters, modifying schema definitions, or altering authentication/session mechanics, you **MUST** first review the exhaustive technical documentation in [docs/PROJECT_OVERVIEW.md](file:///home/sid/Desktop/JobRadar/docs/PROJECT_OVERVIEW.md). Always keep this file (`AGENTS.md`) synchronized whenever architectural patterns, commands, or invariants are modified.

---

## 1. Project Purpose & Architecture Summary

**JobRadar** is an engineering-first, pan-India tech career search platform and company intelligence aggregator. It tracks direct job postings from public Applicant Tracking Systems (ATS) and enterprise career portals, bypasses low-quality generic aggregators, identifies physical tech hubs and office corridors across 34+ Indian cities, evaluates candidate eligibility against Indian residency and experience rules, tailors resumes into single-column ATS LaTeX-style PDFs, and manages cold outreach pipelines.

### High-Level Topology

```text
[ Browser / Client: React 19 + Vite ] 
       │ 
       ├── Static Hosting (Vercel) [Rewrites /api/* to Render]
       │
       ▼ (HTTP / JSON / SameSite Cookie / Bearer JWT)
[ Backend: Node.js 18+ / Express 4.21 ] 
       ├── Cron Scheduler (node-cron / autoJobHarvester)
       ├── Public ATS Adapters & Scrapers (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, etc.)
       ├── Brevo REST API v3 (Transactional Email OTPs & Notifications)
       ├── OpenStreetMap Overpass & Google Places (Tech office & corridor discovery)
       │
       ▼ (Mongoose ODM / TCP Connection Pool)
[ Database: MongoDB Atlas (Replica Set) ]
```

---

## 2. Tech Stack & Important Dependencies

### Backend (`/backend`)
- **Runtime:** Node.js `>=18.0.0` (ESM/CommonJS hybrid running CommonJS modules).
- **Web Framework:** Express `^4.21.2`.
- **Database & ODM:** Mongoose `^8.9.2` connecting to MongoDB Atlas (`mongodb+srv://`).
- **Authentication & Security:** `jsonwebtoken` (`^9.0.3`), `bcryptjs` (`^3.0.3`), `cookie-parser` (`^1.4.7`), `cors` (`^2.8.5`).
- **File Upload & Parsing:** `multer` (`^2.5.0`, in-memory buffer storage), `pdf-parse` (`^2.4.5`, PDF text extraction).
- **Automation & Headless Execution:** `playwright` (`^1.52.0`, isolated Chromium session runner with dual-engine fallback and anti-bot safety halt).
- **Background Tasks:** `node-cron` (`^4.6.0`).
- **External Communications:** Native Node `fetch` (`node:dns`, `AbortSignal.timeout`), Brevo REST API v3, Google OAuth 2.0 / Gmail REST API.

### Frontend (`/frontend`)
- **Framework & Build:** React `^19.2.8`, ReactDOM `^19.2.8`, Vite `^8.3.0` (`@vitejs/plugin-react` `^6.1.1`).
- **Map & Geo UI:** Leaflet `^1.9.4` (OpenStreetMap tile layers, custom SVG markers, polygon tech corridors).
- **PDF Generation:** `jspdf` `^4.2.1` (Client-side single-column Jake's Resume / Overleaf LaTeX rendering).
- **Linter & Tools:** `oxlint` `^1.81.0`.

---

## 3. Directory Structure & Key Files

```text
JobRadar/
├── AGENTS.md                                # This operational guide
├── README.md                                # Public milestone documentation
├── package.json                             # Root monorepo scripts
├── vercel.json                              # Production Vercel rewrite configuration
├── .github/
│   └── workflows/
│       └── sync.yml                         # 6-hourly automated GitHub Actions job collector
├── backend/
│   ├── server.js                            # Express server entry point & cron bootstrap
│   ├── package.json                         # Backend dependencies & run scripts
│   ├── adapters/                            # Direct career board adapters
│   │   ├── greenhouse.js                    # Greenhouse Public Board API
│   │   ├── lever.js                         # Lever Postings JSON API
│   │   ├── ashby.js                         # Ashby Job Board API
│   │   ├── smartrecruiters.js               # SmartRecruiters Postings API
│   │   ├── workable.js                      # Workable Public Widget & v3 API adapter
│   │   ├── recruitee.js                     # Recruitee Public Careers API adapter
│   │   ├── personio.js                      # Personio XML feed & job board adapter
│   │   ├── teamtailor.js                    # Teamtailor JSON & schema.org career portal adapter
│   │   ├── workday.js                       # Workday Candidate Experience (CXS) API
│   │   ├── amazon.js                        # Amazon Jobs JSON search API
│   │   ├── google.js                        # Google Careers SSR extractor
│   │   ├── eightfold.js                     # Eightfold.ai public API adapter
│   │   ├── adzuna.js                        # Adzuna India Job Search API
│   │   └── universalFeed.js                 # Dynamic router across big-tech engines
│   ├── config/                              # Static seed data and alias dictionaries
│   │   ├── companies.json                   # Verified company tokens & ATS targets
│   │   ├── companyCareerPortals.json        # Direct career site URLs
│   │   ├── companyOfficeRegistry.json       # Exact office addresses & coordinates
│   │   ├── locationAliases.json             # City, state, country name mappings
│   │   └── techHubCorridors.json            # Tech corridor polygon centers and aliases
│   ├── controllers/
│   │   ├── applicationController.js         # 10-stage application lifecycle & pipeline migration
│   │   ├── authController.js                # Auth, registration, OTP, candidate profile
│   │   ├── autopilotController.js           # Autonomous matching engine, staging & telemetry
│   │   ├── directoryController.js           # Directory, OSM/Google discovery, places autocomplete, ATS sniffer
│   │   └── jobController.js                 # Job queries, sync, harvest, CV parsing, CV tailoring
│   ├── middleware/
│   │   └── authMiddleware.js                # JWT verification (requireAuth & optionalAuth)
│   ├── models/
│   │   ├── Application.js                   # 10-stage application lifecycle tracking & resume snapshots
│   │   ├── AutopilotConfig.js               # User autopilot settings, quotas, and preferences
│   │   ├── AutopilotRun.js                  # Execution telemetry & audit logs for autopilot runs
│   │   ├── City.js                          # City metadata & geographic bounding box
│   │   ├── Company.js                       # Tech company directory & contact metadata
│   │   ├── Job.js                           # Job postings with compound unique index
│   │   ├── Office.js                        # Physical branch/office locations
│   │   ├── QueueTask.js                     # Background queue tasks, retries, and execution states
│   │   ├── SourceRun.js                     # Ingestion execution telemetry
│   │   ├── UncertainMerge.js                # Company duplicate resolution queue
│   │   ├── User.js                          # User accounts, hashed passwords, candidateProfile
│   │   └── UserPipeline.js                  # Scoped user outreach status & personal notes (migratable to Application)
│   ├── routes/
│   │   ├── applicationRoutes.js             # /api/applications endpoints (stages, dispatch, ingest-message)
│   │   ├── authRoutes.js                    # /api/auth endpoints
│   │   ├── autopilotRoutes.js               # /api/autopilot endpoints
│   │   ├── directoryRoutes.js               # /api/directory endpoints (places, discover, detect-ats)
│   │   └── jobRoutes.js                     # /api/jobs endpoints (jobs, sync, harvest, queue-status)
│   ├── services/
│   │   ├── atsDetector.js                   # Automated ATS sniffer & live URL verifier
│   │   ├── autoJobHarvester.js              # Autonomous multi-hub ATS probe engine
│   │   ├── browserSubmissionService.js      # Assisted form pre-filling & dispatch service
│   │   ├── candidateParser.js               # PDF CV & portfolio text extractor
│   │   ├── cvTailorService.js               # Resume tailoring & skill-injection engine
│   │   ├── eligibilityAnalyzer.js           # Tech taxonomy & job criteria parser
│   │   ├── eligibilityMatcher.js            # Dual-factor candidate vs job matcher
│   │   ├── emailService.js                  # Brevo v3 transactional email service
│   │   ├── emailTrackingService.js          # Recruiter email stage classifier & timeline updater
│   │   ├── googlePlacesService.js           # Google Places API corridor scanner
│   │   └── jobQueue.js                      # Resilient in-process / MongoDB task queue worker
│   ├── workers/
│   │   └── browserWorker.js                 # ATS form blueprint, field mapping & CAPTCHA safety protocol
│   ├── utils/
│   │   ├── companyUtils.js                  # Deduplication, domain extraction, tech classification
│   │   ├── corridorResolver.js              # Corridor resolution & geo dispersion
│   │   ├── normalizeLocation.js             # Location normalization & workMode detection
│   │   └── rateLimiter.js                   # Host-based 1 req/sec & auth sliding-window rate limiters
│   └── scripts/
│       ├── collect.js                       # Core idempotent job collection workflow
│       └── runAcceptanceTests.js            # Invariant acceptance verification script
└── frontend/
    ├── package.json                         # Frontend dependencies (Lucide icons, Leaflet, jsPDF)
    ├── vite.config.js                       # Vite dev server & /api proxy to localhost:5000
    ├── src/
    │   ├── main.jsx                         # App bootstrap & production API fetch patch
    │   ├── App.jsx                          # Main view orchestration, 6 core tabs, and filters
    │   ├── context/
    │   │   ├── AuthContext.jsx              # Global authentication & candidate profile state
    │   │   └── LocationContext.jsx          # GPS geolocation & distance calculation state
    │   ├── components/
    │   │   ├── ApplicationsView.jsx         # 10-stage Kanban & table view with notes drawer
    │   │   ├── AuthModal.jsx                # Login / Registration / OTP modal
    │   │   ├── AutopilotView.jsx            # Autopilot engine configuration & execution telemetry
    │   │   ├── CandidateProfileUploadModal.jsx # CV & portfolio upload modal
    │   │   ├── CareerProfileView.jsx        # Master career profile editor & residency controls
    │   │   ├── CompanyDirectory.jsx         # Tech directory & office corridor view
    │   │   ├── CvTailorSection.jsx          # Interactive CV tailor & editor
    │   │   ├── DiscoveredPlacesMap.jsx      # Leaflet map for discovered company offices
    │   │   ├── JobEligibilityModal.jsx      # Match breakdown & criteria modal
    │   │   ├── OverviewView.jsx             # Mission control dashboard, metrics, and staged review
    │   │   ├── PersonalizeModal.jsx         # Cold email pitch generator modal
    │   │   ├── ReachOutView.jsx             # Outreach pipeline management
    │   │   ├── TechCorridorMapView.jsx      # Interactive corridor map for jobs
    │   │   └── UserLocationModal.jsx        # GPS / manual location selector
    │   └── utils/
    │       ├── candidateMatcher.js          # Client-side candidate matching engine
    │       └── pdfGenerator.js              # Single-column ATS PDF & Overleaf LaTeX generator
```

---

## 4. Database & API Architecture

### Primary MongoDB Models & Indexes
- **`Job`**: Compound unique index `{ source: 1, sourceJobId: 1 }`. Additional indexes on `{ status: 1, lastSeenAt: -1 }`, `{ company: 1, status: 1 }`, `{ city: 1, techCorridor: 1, status: 1 }`, `{ fresherFriendly: 1, status: 1 }`, `{ fingerprint: 1, status: 1 }`.
- **`Company`**: Unique sparse index on `{ domain: 1 }`, indexes on `{ slug: 1 }`, `{ name: 1 }`, `{ isTech: 1 }`, `{ followUpStatus: 1 }`.
- **`Office`**: Compound indexes on `{ companyId: 1, cityId: 1 }`, `{ companyId: 1, lat: 1, lng: 1 }`.
- **`User`**: Unique index on `{ email: 1 }`. Stores hashed password, verification status, ephemeral OTP object, and embedded `candidateProfile`.
- **`Application`**: Multi-tenant lifecycle tracking across 10 stages (`discovered`, `shortlisted`, `resume_ready`, `awaiting_approval`, `applied`, `assessment`, `interview`, `offer`, `rejected`, `withdrawn`). Compound unique index on `{ userId: 1, jobId: 1 }`, index on `{ userId: 1, status: 1 }`, `{ userId: 1, createdAt: -1 }`.
- **`AutopilotConfig`**: User automation settings, autonomy level (`assisted`, `semi_autonomous`, `autonomous`), daily quotas, score thresholds, target roles. Unique index on `{ userId: 1 }`.
- **`AutopilotRun`**: Telemetry and audit log of matching operations and staged applications. Index on `{ userId: 1, createdAt: -1 }`.
- **`UserPipeline`**: Scoped multi-tenant tracking (legacy model, with 1-click migration to `Application`).
- **`SourceRun`**: Index on `{ source: 1, slug: 1, createdAt: -1 }`.

### API Conventions
- All backend routes are mounted under `/api`.
- Client requests in production are redirected or rewritten via `vercel.json` and intercepted in [frontend/src/main.jsx](file:///home/sid/Desktop/JobRadar/frontend/src/main.jsx) to target the backend URL.
- Auth tokens are transmitted via the `jobradar_auth_token` HTTP cookie (`SameSite=Lax`, `Secure` in prod) or `Authorization: Bearer <token>` header.
- Cross-Origin Resource Sharing (CORS) is configured with `credentials: true`.
- Rate Limiting: Sliding-window rate limiting on `/api/auth/*` (10 req/15min) and general API protection (100 req/min) on `/api/*`. Administrative and sync endpoints protected by `requireAuth`.

---

## 5. Development Conventions & Invariants

1. **Idempotent Ingestion Rule**: The collector script [backend/scripts/collect.js](file:///home/sid/Desktop/JobRadar/backend/scripts/collect.js) must **never** close jobs upon network failure or HTTP errors. A job is transitioned from `status: 'open'` to `'closed'` **only** when a successful fetch for that specific company completes and the job ID is confirmed absent.
2. **Rate Limiting**: Always pass requests to ATS endpoints through [backend/utils/rateLimiter.js](file:///home/sid/Desktop/JobRadar/backend/utils/rateLimiter.js) (`rateLimitHost`) to enforce a minimum 1000ms delay per host.
3. **No Fabricated Slugs**: Never guess or synthesize ATS slugs without verifying an HTTP 200 response containing valid job arrays.
4. **Deterministic Geo-Dispersion**: When multiple offices share the exact same coordinates (e.g. IT tech park centroid), use `applyDeterministicDispersion()` in [backend/utils/corridorResolver.js](file:///home/sid/Desktop/JobRadar/backend/utils/corridorResolver.js) to avoid overlapping markers.
5. **Rule-Based NLP Reality**: Current CV parsing, job eligibility analysis, and resume tailoring are deterministic, rule-based heuristics using regex patterns. Do not assume third-party LLM APIs (OpenAI, Gemini, Anthropic) are hooked up unless you are explicitly commissioned to integrate them.
6. **Zero Direct Code Mod Unless Prompted**: Never modify application code, configuration values, or database records unless explicitly instructed by the user.

---

## 6. Critical Security Rules & Protected Boundaries

> [!CAUTION]
> Violating any of these security invariants compromises production credentials and system integrity.

- **NEVER Commit Real Secrets**: Never commit or print plaintext API keys, passwords, connection URIs, or tokens.
  - Check `.env.example` files for reference variable names.
  - Notice that [backend/services/emailService.js](file:///home/sid/Desktop/JobRadar/backend/services/emailService.js) and [backend/middleware/authMiddleware.js](file:///home/sid/Desktop/JobRadar/backend/middleware/authMiddleware.js) historically had fallback development constants; in production, `process.env.BREVO_API_KEY`, `process.env.JWT_SECRET`, and `process.env.MONGODB_URI` must always be supplied through environment variables.
- **SSRF Protection in URL Fetchers**: [backend/services/candidateParser.js](file:///home/sid/Desktop/JobRadar/backend/services/candidateParser.js) uses DNS resolution and private IP rejection (`isPrivateIp`) before fetching candidate portfolio URLs. Any new external URL fetching service must implement this exact check to prevent internal cloud metadata exploitation (`169.254.169.254`).
- **Multer Memory Limits**: CV uploads are restricted to `10 * 1024 * 1024` bytes (10MB) and MIME type `application/pdf` in memory. Never store uploaded CVs on local server disk in serverless or ephemeral environments.
- **Database Safety**: The compound unique index on `{ source: 1, sourceJobId: 1 }` guarantees data integrity. Always wrap bulk writes in deduplication sets (`seenIds`) before executing `Job.bulkWrite()`.

---

## 7. Important Commands

### Local Development
```bash
# 1. Install dependencies
npm install --prefix backend
npm install --prefix frontend

# 2. Run both backend and frontend concurrently
npm run dev
# Or in separate terminals:
npm run backend    # http://localhost:5000 (node --watch server.js)
npm run frontend   # http://localhost:5173 (Vite dev server)
```

### Ingestion & Verification Scripts
```bash
# Run manual job collection across all configured companies
npm run collect

# Run automated public ATS slug discovery for Indian tech hubs
npm run discover

# Check for unparsed location strings in the database
npm run unparsed-locations

# Run acceptance verification suite
cd backend && node scripts/runAcceptanceTests.js
```

### Production Build & Linting
```bash
# Lint frontend code using oxlint
npm run --prefix frontend lint

# Build frontend production bundle (outputs to frontend/dist)
npm run build
```

---

## 8. Workflow Checklist for AI Coding Agents

When working on JobRadar:
1. **Audit First**: Read [docs/PROJECT_OVERVIEW.md](file:///home/sid/Desktop/JobRadar/docs/PROJECT_OVERVIEW.md) to understand dependencies, data flows, and known debt.
2. **Preserve Database Invariants**: Maintain `{ source: 1, sourceJobId: 1 }` idempotence and never close jobs on failed scrapes.
3. **Check Auth Requirements**: Protect endpoints with `requireAuth` or `optionalAuth` from [backend/middleware/authMiddleware.js](file:///home/sid/Desktop/JobRadar/backend/middleware/authMiddleware.js).
4. **Test Before Submitting**: Run `npm run --prefix frontend build` and verify that no breaking syntax errors or unhandled promise rejections are introduced.
5. **Update Documentation**: When modifying schemas, adapters, or adding environment variables, update both `AGENTS.md` and [docs/PROJECT_OVERVIEW.md](file:///home/sid/Desktop/JobRadar/docs/PROJECT_OVERVIEW.md).

