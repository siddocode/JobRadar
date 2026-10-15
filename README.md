# JobRadar (Milestone 1)

A personal, local-only job-search tool aggregating real published jobs directly from Greenhouse public Job Board APIs.

## Architecture & Layout

```text
JobRadar/
├── backend/
│   ├── config/
│   │   └── companies.json       # Configurable company board tokens
│   ├── controllers/
│   │   └── jobController.js     # Query validation, filtering, MongoDB queries, responses
│   ├── routes/
│   │   └── jobRoutes.js         # Endpoint definitions mapped to controllers
│   ├── models/
│   │   ├── Job.js               # Job schema with compound unique index on (source, sourceJobId)
│   │   └── SourceRun.js         # Ingestion run history and metrics
│   ├── adapters/
│   │   └── greenhouse.js        # Public JSON API adapter, 1 req/sec rate limiting, normalization
│   ├── scripts/
│   │   └── collect.js           # Idempotent upsert & active sync workflow
│   ├── utils/                   # Shared helper functions
│   ├── server.js                # Express app entrypoint & route mounting
│   ├── package.json             # Minimal dependencies (express, mongoose, dotenv, cors)
│   └── .env                     # MongoDB URI and port configuration
├── frontend/                    # React + Vite application (vanilla CSS, responsive dark UI)
└── package.json                 # Root convenience scripts
```

## Running the Project

### 1. Ingest / Sync Live Jobs
```bash
npm run collect
# Or directly from backend:
cd backend && npm run collect
```

### 2. Start Backend Server
```bash
npm run backend
# Listens on http://localhost:5000
```

### 3. Start Frontend
```bash
npm run frontend
# Opens Vite dev server on http://localhost:5173
```
