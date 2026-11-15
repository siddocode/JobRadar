# JobRadar — External Services, APIs, and Cost Transparency Manual

> **Document Status:** Authoritative Configuration & Pricing Guide  
> **Version:** 2.0.0  
> **Currency:** Indian Rupee (INR ₹) & USD ($)  
> **Core Policy:** Zero unexpected subscriptions. Free and open-source solutions are prioritized first.

---

## 1. Summary Cost & Dependency Matrix

| Service / Dependency | Purpose | Priority | Cost Tier | Free Tier Allowance | Paid Pricing (INR) | Free Alternative |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **MongoDB Atlas** | Primary document database | **ESSENTIAL** | **FREE TIER** | M0 Cluster: 512MB storage, shared RAM, replica set. | Free forever. Upgrades start at ~$9/mo (₹750/mo) for M2. | Local MongoDB Community Edition (`mongodb://localhost:27017`) — 100% Free. |
| **Render** | Backend API & background cron hosting | **ESSENTIAL** | **FREE TIER** | Web Service: 512MB RAM, 0.1 CPU, spins down on inactivity. | Starter plan: $7/mo (~₹580/mo) for persistent 24/7 runtime. | Self-hosted VPS (Hetzner/DigitalOcean) or local Node process (`npm run backend`). |
| **Vercel** | Frontend static React hosting & CDN | **ESSENTIAL** | **FREE TIER** | Hobby Plan: 100GB bandwidth/mo, unlimited builds, global CDN. | Free forever for personal non-commercial projects. Pro: $20/mo (₹1,660/mo). | GitHub Pages, Cloudflare Pages, Netlify — all 100% Free. |
| **Brevo (Sendinblue)** | Transactional email OTPs & application alerts | **RECOMMENDED** | **FREE TIER** | 300 emails per day (9,000 emails/mo) with full REST API v3 access. | Starter: ~$25/mo (₹2,075/mo) for 20k emails. (Free tier is plenty for JobRadar). | Local console OTP logging in development; Nodemailer with custom Gmail SMTP — Free. |
| **OpenStreetMap (Overpass)** | Tech park & office discovery | **RECOMMENDED** | **100% FREE** | Unlimited queries within public rate limits (up to ~10,000 nodes/call). | Free Open Source (ODbL). Zero cost. | Built-in static seed dictionary (`techHubSeeds.js`) — 100% Free offline. |
| **Photon / OSM Nominatim** | High-performance address autocomplete & reverse geocoding | **RECOMMENDED** | **100% FREE** | Open access with polite rate limits (1 req/sec). | Free Open Source. Zero cost. | Curated local POI database in `placeSearchService.js` (0ms response) — Free. |
| **Google Places API** | Secondary tech corridor scanning | **OPTIONAL** | **FREE TIER** | $200 free monthly credit (~10,000 Text Searches free every month). | Beyond free credit: ~$0.032 per Text Search (~₹2.65/call). | OpenStreetMap Overpass API + Curated seeds — 100% Free. |
| **Adzuna India API** | Aggregator job search supplement | **OPTIONAL** | **FREE TIER** | Free developer tier: 25 calls/minute, up to 250 calls/day. | Commercial tier negotiable. | Direct ATS adapters (Greenhouse, Lever, Ashby, etc.) — 100% Free. |
| **Playwright Engine** | Automated form-filling browser engine | **RECOMMENDED** | **100% FREE** | Open-source browser automation library running locally or on worker. | Free Open Source (Apache 2.0). Zero cost. | Manual "1-Click Open Portal" assisted workflow — Free. |
| **Google Gmail API** | Inbound recruiter reply & interview detection | **OPTIONAL** | **FREE TIER** | Standard Google Cloud quota: 250 quota units/sec (billions of free calls). | Zero cost for personal usage via Google Cloud OAuth. | Manual status tracking in Applications tab — Free. |

---

## 2. In-Depth Service Breakdown

### 2.1 MongoDB Atlas (Database Persistence)
- **Purpose:** Primary persistence store for jobs, companies, offices, candidate master profiles, application lifecycle states, and autopilot run telemetry.
- **Why Needed:** Cloud-hosted, high-availability document database accessible concurrently by local dev machines, GitHub Actions collectors, and Render backends.
- **Priority:** **ESSENTIAL**
- **Cost:** **FREE TIER (M0 Sandbox)**
- **Limits:** 512 MB storage, shared vCPU.
- **Paid Pricing:** M2 tier is $9/month (~₹750/month). *Recommendation: Do not upgrade; 512MB accommodates ~150,000 job records with proper retention.*
- **Official Portal:** [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
- **Environment Variable:** `MONGODB_URI`
- **Setup Instructions:**
  1. Create a free cluster on MongoDB Atlas.
  2. In Network Access, add `0.0.0.0/0` (Allow from anywhere) to permit dynamic IPs from GitHub Actions and Render.
  3. In Database Access, create a user and copy the connection string.
- **Free Alternative:** Local MongoDB Community Edition (`mongodb://127.0.0.1:27017/jobradar`).

---

### 2.2 Brevo REST API v3 (Transactional Email & Security OTPs)
- **Purpose:** Dispatches 6-digit registration OTP codes, passwordless sign-in tokens, and urgent autopilot notification summaries.
- **Why Needed:** Delivers emails reliably to candidate inboxes with DKIM/SPF alignment without getting flagged as spam.
- **Priority:** **RECOMMENDED**
- **Cost:** **FREE TIER**
- **Limits:** 300 emails/day (~9,000/month). JobRadar's single-user or small-team workflow uses fewer than 10 emails/day.
- **Paid Pricing:** Starter plan is ₹1,600/month for 20,000 emails/month. *Recommendation: Not needed; 300/day is more than sufficient.*
- **Official Portal:** [https://www.brevo.com](https://www.brevo.com)
- **Environment Variables:** `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- **Setup Instructions:**
  1. Sign up for a free Brevo account.
  2. Go to SMTP & API -> API Keys -> Generate a new v3 API key.
  3. Add a verified sender email in Senders & IP.
- **Free Alternative:** In development, when `BREVO_API_KEY` is omitted, OTP codes are logged directly to the server terminal.

---

### 2.3 OpenStreetMap Overpass API & Nominatim (Geographic Intelligence)
- **Purpose:** Discovers physical tech hubs, software offices, and coworking spaces across 34+ Indian cities; powers map views and reverse geocoding.
- **Why Needed:** Eliminates expensive Google Maps Platform licensing fees while providing accurate geospatial bounding boxes for Indian tech corridors.
- **Priority:** **RECOMMENDED**
- **Cost:** **100% FREE (Open-Source / Community)**
- **Limits:** Max ~10,000 nodes per query; politeness requirement of 1 request/second.
- **Paid Pricing:** Zero cost forever.
- **Official Documentation:** [https://wiki.openstreetmap.org/wiki/Overpass_API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- **Environment Variables:** None required.
- **Free Alternative:** Curated static registry (`backend/config/companyOfficeRegistry.json` and `backend/data/seeds/techHubSeeds.js`).

---

### 2.4 Google Places API (Optional Secondary Enrichment)
- **Purpose:** Sweeps city tech corridors for newly established enterprise offices and startup campuses.
- **Why Needed:** Augments OpenStreetMap with Google's commercial business listings when deep discovery is desired.
- **Priority:** **OPTIONAL**
- **Cost:** **FREE TIER ($200 Monthly Cloud Credit)**
- **Limits:** Google Cloud grants $200 recurring monthly credit, covering ~6,000 to 10,000 Text Searches per month.
- **Paid Pricing:** ~$0.032 per search (~₹2.65/call).
- **Official Documentation:** [https://developers.google.com/maps/documentation/places/web-service](https://developers.google.com/maps/documentation/places/web-service)
- **Environment Variable:** `GOOGLE_PLACES_API_KEY`
- **Free Alternative:** Built-in fallback to local seed data and OpenStreetMap Overpass (requires zero API keys).

---

### 2.5 Playwright Browser Automation Subsystem
- **Purpose:** Headless browser automation for opening application forms, filling candidate credentials, attaching tailored resumes, and capturing submission receipts.
- **Why Needed:** Automates repetitive ATS application form filling on career portals that do not provide public submission APIs.
- **Priority:** **RECOMMENDED**
- **Cost:** **100% FREE (Open Source)**
- **Limits:** Governed only by local CPU/RAM constraints.
- **Paid Pricing:** Zero cost.
- **Official Documentation:** [https://playwright.dev](https://playwright.dev)
- **Environment Variables:** None required for local runner.

---

## 3. Configuration & Readiness Checklist

Review the following matrix to identify configured versus required external assets:

```text
[✓] CONFIGURED & READY:
    • MongoDB Atlas connection string (configured in backend/.env)
    • Vercel static deployment & path rewrite routing (configured in vercel.json)
    • OpenStreetMap Overpass API integration (100% Free, active without keys)
    • Photon / Nominatim geocoding service (100% Free, active without keys)
    • Public ATS Adapters (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Amazon, Google, Eightfold)

[!] ACTION REQUIRED (NO COST):
    • Brevo API Key: Provide personal BREVO_API_KEY in backend/.env to replace legacy hardcoded constant.
    • JWT Secret: Provide secure random string for JWT_SECRET in backend/.env.
    • Render Backend URL: Verify deployment endpoint on Render matches vercel.json rewrite.

[?] OPTIONAL ENHANCEMENTS (FREE TIER / NO UPFRONT COST):
    • Google Places API Key: Optional for secondary company office scanning.
    • Adzuna API ID/Key: Optional for aggregator job ingestion.
    • Google Cloud OAuth Client: Optional for Gmail recruiter reply tracking.
```

