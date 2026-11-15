# JobRadar — Design System & Visual Specification

> **Document Status:** Authoritative Design Specification  
> **Brand Identity:** Restrained, editorial, engineering-grade SaaS  
> **Primary Palette:** Forest Ink (`#173D35`) | Warm Sand (`#F3EFE5`) | Muted Copper (`#B47A49`)

---

## 1. Visual Identity & Design Philosophy

JobRadar avoids generic "AI-dashboard" cliches (purple-blue saturated gradients, excessive glassmorphism, oversized cards, and decorative empty badges). Instead, it adopts an **editorial, engineering-first aesthetic** inspired by high-density scientific publications, Bloomberg terminals, and classic architectural schematics.

### 1.1 Color Tokens & Palette

```text
Core Brand Colors:
  • Forest Ink:   #173D35   (Primary brand, headers, high-emphasis text, active states)
  • Warm Sand:    #F3EFE5   (Light theme canvas, subtle component backgrounds)
  • Muted Copper: #B47A49   (Accents, highlights, progress indicators, action indicators)

Semantic Status Palette:
  • Success:      #1B5E20 / #E8F5E9  (Eligible match, active job, application submitted)
  • Warning:      #B26A00 / #FFF3E0  (Review needed, unverified company, approaching limit)
  • Error/Block:  #B71C1C / #FFEBEE  (Hard eligibility blocker, expired job, auth failure)
  • Info:         #1565C0 / #E3F2FD  (Neutral metadata, tech tags, sync in progress)

Neutral Gray Scale:
  • Canvas Surface:    #F9F8F5  (Page background in light mode)
  • Card Surface:      #FFFFFF  (Pure white for raised cards and drawers)
  • Subtle Border:     #E5E0D5  (Crisp, 1px hairline container borders)
  • Text Primary:      #173D35  (High-contrast deep forest ink)
  • Text Secondary:    #4A5550  (Neutral slate for labels, timestamps, metadata)
  • Text Muted:        #7D8A84  (Discreet helper text and inactive tabs)

Dark Theme Tokens:
  • Canvas Dark:       #0C1E1A  (Deep Forest Noir canvas)
  • Card Dark:         #132B25  (Muted Forest Ink card surface)
  • Border Dark:       #24453D  (Low-luminance border)
  • Text Dark Primary: #F3EFE5  (Warm Sand text)
  • Text Dark Muted:   #9AB3AB  (Sage gray text)
```

---

## 2. Typography & Scale

The system uses a modern, high-legibility geometric sans-serif font stack:
`font-family: 'Inter', 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`

Monospace numerals and technical values (coordinates, match scores, slugs):
`font-family: 'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace;`

### Type Scale Hierarchy

| Token | Size | Line Height | Weight | Application |
| :--- | :--- | :--- | :--- | :--- |
| `display-1` | 32px (2.00rem) | 38px | 700 Bold | Primary page headers, major metric counters |
| `heading-1` | 24px (1.50rem) | 30px | 600 SemiBold | Section headings, modal titles |
| `heading-2` | 18px (1.125rem) | 24px | 600 SemiBold | Card titles, job titles, company names |
| `body-lead` | 15px (0.9375rem) | 22px | 500 Medium | Subheadings, card summaries, prominent metadata |
| `body-base` | 14px (0.875rem) | 20px | 400 Regular | Standard body text, descriptions, table contents |
| `body-small`| 12px (0.75rem) | 16px | 400 / 500 | Form labels, tags, badges, timestamps, helper copy |
| `caption`   | 11px (0.6875rem) | 14px | 500 Medium | Monospace coordinates, ATS status labels, fine print |

---

## 3. Layout Grid & Spacing System

- **Base Unit:** 4px micro-grid, 8px layout rhythm (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`).
- **Maximum Content Width:** `1440px` centered with auto-margins.
- **Card Styling:** `border-radius: 8px`, `border: 1px solid var(--border-color)`, `box-shadow: 0 1px 3px rgba(23, 61, 53, 0.05)`.
- **Zero Glassmorphism:** Clean, opaque solid surfaces with high contrast readability.

---

## 4. Product Information Architecture & View Specifications

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] JobRadar 2.0   | Overview | Discover Jobs | Applications | Companies | Profile | Autopilot     │ [User Menu]
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Overview View
- **Purpose:** Central mission control.
- **Components:**
  - Metric Ribbon: Active Applications, Jobs Ingested Today, High-Match Opportunities, Autopilot Status.
  - Urgent Tasks: Applications awaiting user approval, upcoming interview dates, expired listings.
  - Recent Postings: Curated list of top-ranked openings tailored to the candidate profile.

### 4.2 Discover Jobs View
- **Purpose:** Primary job search and screening interface.
- **Components:**
  - Filter Bar: Role family, seniority tier, freshers-only toggle, remote/hybrid/onsite, city/corridor dropdown, distance slider.
  - View Switcher: High-density Table Mode vs Visual Card Grid Mode.
  - Job Detail Drawer: Slides in from the right, displaying complete description, requirements breakdown, hard blocker warnings, match explanation, and Action Bar (`Apply Directly`, `Tailor Resume`, `Stage to Autopilot`).

### 4.3 Applications View
- **Purpose:** Full 10-stage lifecycle management.
- **Lifecycle Stages:**
  1. `Discovered`
  2. `Shortlisted`
  3. `Resume Ready`
  4. `Awaiting Approval`
  5. `Applied`
  6. `Assessment`
  7. `Interview`
  8. `Offer`
  9. `Rejected`
  10. `Withdrawn`
- **Views:** Kanban Column Board & Sortable Table List with inline stage selector and historical event timeline drawer.

### 4.4 Companies View
- **Purpose:** Pan-India corporate intelligence and tech hubs.
- **Components:**
  - City selector (34+ hubs), corridor polygon selector.
  - Company cards with verified domain, career portal URL, detected ATS engine, physical branch offices, and hiring status.
  - Secondary spatial view: Toggleable Leaflet corridor map.

### 4.5 My Career Profile View
- **Purpose:** Candidate credentials master hub.
- **Components:**
  - Master CV Ingestion (PDF upload or portfolio URL parsing).
  - Structured Profile Editor: Editable cards for Identity, Headline, Work Experience, Education, Projects, and Skills.
  - Resume Version Vault: Repository of tailored resumes generated for specific companies.

### 4.6 Autopilot View
- **Purpose:** Automated discovery and application management.
- **Components:**
  - Autopilot Master Toggle (Active / Paused).
  - Mode Selector: `Assisted Mode` (stages to Awaiting Approval) vs `Autonomous Mode` (auto-submits supported forms).
  - Safety Controls: Daily application cap slider, minimum match percentage cutoff, excluded company keywords.
  - Live Execution Feed: Chronological stream of evaluated jobs, prepared resumes, and submission receipts.

---

## 5. Desktop vs. Mobile Layout Specifications

### Desktop (Viewport >= 1024px)
- Fixed top navigation bar (`64px` height) with brand lockup, pill tabs, and candidate session badge.
- Multi-column layouts: Filter sidebar (`280px` width) + main fluid feed + slide-over drawer (`560px` width).
- Full table mode with keyboard shortcut navigation (`J` / `K` for next/previous job, `Enter` to open drawer).

### Mobile (Viewport < 1024px)
- Compact top bar (`56px`) with logo and profile avatar.
- Bottom navigation bar (`64px` height, fixed) containing 4 primary touch targets:
  `[Jobs]` | `[Applications]` | `[Companies]` | `[Autopilot]`
- Profile and settings accessible via full-screen slide-up drawer.
- Filter options collapse into an accessible bottom sheet modal.
- Map view is strictly opt-in via a floating toggle button to preserve mobile bandwidth and battery.

---

## 6. Lucide Icon Mapping

Uniform icon usage across all views:
- **Jobs / Discovery:** `Briefcase`, `Search`, `SlidersHorizontal`, `Sparkles`, `ExternalLink`
- **Applications:** `Layers`, `Send`, `Clock`, `CheckCircle2`, `XCircle`, `AlertCircle`, `Calendar`
- **Companies / Locations:** `Building2`, `MapPin`, `Navigation`, `Compass`, `Globe`
- **Career Profile:** `User`, `FileText`, `Award`, `GraduationCap`, `Code2`, `Download`
- **Autopilot:** `Bot`, `Zap`, `Play`, `Pause`, `ShieldCheck`, `Settings2`, `Activity`
- **Actions:** `Copy`, `Check`, `ChevronRight`, `ChevronDown`, `Trash2`, `Edit3`

