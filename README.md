# Handoff: Core Web Vitals Tester

## Overview
A developer-focused web app that runs a performance audit on a URL and presents the results as a polished SaaS dashboard — prioritizing **clarity and actionable insights** over dumping every Lighthouse audit. It shows an overall performance score, the Core Web Vitals + key lab metrics, a ranked list of the biggest optimization opportunities, prioritized recommendations, a resource breakdown, and secondary diagnostics. A second screen shows **audit history** with a score trend over time.

The product deliberately does **not** look like Chrome DevTools or the raw Lighthouse report.

## About the Design Files
The file in this bundle (`Core Web Vitals Tester.dc.html`) is a **design reference created in HTML** — a working prototype that shows the intended look, layout, copy, and interactions. It is **not production code to copy directly**.

It is authored in a lightweight in-house component format ("Design Component"): a single HTML file with an `<x-dc>` template, an inline `class Component` logic block, and inline styles. **Do not port that format or its runtime.** Instead, **recreate these designs in the target codebase's environment** using its established patterns and libraries. If no codebase exists yet, the recommended stack is **React + TypeScript** (e.g. Next.js) for the front-end and a **Node service running Lighthouse** for the backend (see "Backend / Data Source").

All numeric values in the prototype (scores, metric values, issues, history rows) are **mock data** for layout purposes. In the real app they come from Lighthouse (see the data contract below).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are specified. Recreate the UI to match, using the target codebase's component library where equivalents exist. Exact hex values, font sizes, and spacing are given in Design Tokens.

---

## Backend / Data Source (critical — not in the prototype)
The prototype is front-end only. To make this real:

- **Audit runner:** A Node service that launches headless Chrome (`chrome-launcher`) and runs `lighthouse` against the requested URL with a `desktop` or `mobile` config. This requires a real Chrome binary, so it must run on a container/VM (Cloud Run, Fly, Render, etc.) — **not** a standard edge/serverless function.
- **Async job model:** Audits take several seconds. Expose `POST /audits { url, device }` → returns `{ id }`; the client polls `GET /audits/:id` → `{ status: 'queued'|'running'|'done'|'error', stage, result?, error? }`. `stage` drives the loading status text ("Launching Chrome…", "Running Lighthouse…", etc.).
- **Persistence:** Store each completed run (url, device, timestamp, scores, metrics, opportunities) in a DB (Postgres/SQLite). The History screen and trend chart read from this.

### Mapping Lighthouse → this UI
- Overall score: `lhr.categories.performance.score * 100` (round).
- Metrics (use `.numericValue` for scale math, `.displayValue` for the label):
  - LCP → `audits['largest-contentful-paint']`
  - INP → `audits['interaction-to-next-paint']`
  - CLS → `audits['cumulative-layout-shift']`
  - TBT → `audits['total-blocking-time']`
  - Speed Index → `audits['speed-index']`
  - FCP → `audits['first-contentful-paint']`
- Opportunities: iterate `audits` where `details.type === 'opportunity'`, sort by `details.overallSavingsMs` desc; use `title`, `description`, and `details.items` (affected resources).
- Diagnostics: TTFB (`server-response-time`), TTI (`interactive`), DOM size (`dom-size`), network requests + transfer size (`network-requests` / `total-byte-weight`), main-thread work (`mainthread-work-breakdown`).
- Status thresholds (good / needs-improvement / poor) are standard Web Vitals: LCP 2.5s/4s · INP 200ms/500ms · CLS 0.1/0.25 · TBT 200ms/600ms · SI 3.4s/5.8s · FCP 1.8s/3s.

---

## Screens / Views

The app is a **single-page dashboard** with two views toggled by client state (`view: 'dashboard' | 'history'`). A persistent top **header** is shared by both. Content max-width **1160px**, centered, `padding: 34px 24px 96px`.

### Shared: Header
- Sticky, `height 60px`, `background rgba(250,250,250,0.82)` with `backdrop-filter: saturate(180%) blur(12px)`, bottom border `1px solid #ececec`.
- **Left:** logo mark (30×30, `border-radius 9px`, `background #e35a2a`, containing three ascending white bars — a mini bar chart) + wordmark "Core Web Vitals Tester" (15px/600) + a "BETA" pill (10px uppercase, grey, bordered). The whole left cluster is a click target that returns to the dashboard.
- **Right:** "History" (ghost button → opens History view; when the History view is active it renders in an active style: `background #fff1ea`, `color #c2410c`) and "Export report" (bordered button `#fff`/`border #e4e4e7` with a ▾ caret). **Note:** Export is currently a non-functional placeholder — a future dropdown for PDF/CSV export. (Compare and category tabs were intentionally removed — this product audits Performance only.)

### View 1: Dashboard (default)
Vertical stack of sections:

**a. Page title** — `<h1>` "Performance audit" (26px/600, `letter-spacing -0.02em`) + subtitle "Analyze website performance and identify the biggest opportunities for improvement." (14.5px, `#71717a`).

**b. Audit form** — white card (`border-radius 16px`, `border 1px #ececec`, `box-shadow 0 1px 2px rgba(0,0,0,0.04)`, `padding 18px 20px`), flex row, `gap 14px`:
- URL input (flex-grow, `height 44px`, `border-radius 11px`, monospace text, leading globe icon; focus ring `border #e35a2a` + `box-shadow 0 0 0 3px rgba(227,90,42,0.12)`).
- **Device segmented control** — Desktop / Mobile, `background #f0f0f1`, `border-radius 11px`, `padding 4px`; the selected side has a white sliding pill (`box-shadow 0 1px 2px rgba(0,0,0,0.1)`). Default **Mobile**.
- **Run Audit** primary button — `background #e35a2a`, white, `height 44px`, `border-radius 11px`, play-triangle icon; hover `#cc4d20`. Should be **disabled while an audit is running**.
- Below the card: a monospace meta line — "● Audit complete · Moto G Power · Slow 4G throttle · Lighthouse 12 · Chrome 126 · just now".

**c. Performance summary hero** — white card (`border-radius 20px`, `padding 34px`, `margin-top 34px`), 2-column grid `minmax(260px,320px) 1fr`, `gap 32px`:
- **Left (gauge):** a **semicircle gauge** (SVG viewBox `0 0 220 130`). Track = full semicircle path `M20 110 A90 90 0 0 1 200 110`, `stroke #f0f0f1`, `stroke-width 15`, round caps. Value arc = same path with `stroke-dasharray` = `(score/100)*282.74` (path length ≈ 282.74) and the second value `283`; stroke color by score band. Centered: score number (mono, 54px/600) with "/ 100" beneath, then a status pill. **The score counts up from 0 to the value on mount** (~1.1s, ease-out cubic). Border-right divider.
- **Right:** "SUMMARY" eyebrow (11px uppercase `#a1a1aa`), a sentence summarizing the score + top wins (19px, `#3f3f46`, key figures bolded to `#18181b`), then a 3-tile stat grid (Opportunities count, Est. total savings in green `#16a34a`, Page weight). Each tile: `background #fafafa`, `border 1px #f0f0f1`, `border-radius 12px`, `padding 14px 16px`, mono value 24px/600 + 12px `#71717a` label.

**d. Core Web Vitals** — section header ("Core Web Vitals" 15px/600 + right meta "Lab data · mobile"). **3-column grid, `gap 16px`** → 6 cards in 2 rows. Card order: **LCP, INP, CLS** (the three Core Web Vitals) / **TBT, Speed Index, FCP**. Each card (`position: relative`, white, `border-radius 16px`, `padding 20px`):
  - Header row: metric abbreviation (**13px/600 uppercase, `#52525b`**, `letter-spacing 0.03em`) + a circular "i" info button (18px, `1px #e4e4e7` border, `cursor: help`).
  - Big mono value (36px/600, `letter-spacing -0.03em`) + unit (16px `#a1a1aa`).
  - **Status badge** pill (11.5px/600): Good = `bg #ecfdf3` / `border #bbf7d0` / `text #15803d` / dot `#16a34a`; Needs Improvement = `bg #fffbeb` / `border #fde68a` / `text #b45309` / dot `#f59e0b`; Poor = `bg #fef2f2` / `border #fecaca` / `text #b91c1c` / dot `#ef4444`. Always includes text, not color alone (a11y).
  - Full metric name (12.5px `#71717a`).
  - **Threshold scale:** a 6px bar split into three zones (green 40% `#bbf7d0` / amber 30% `#fde68a` / red 30% `#fecaca`) with a 12px marker dot (`#18181b`, 2px white border) positioned by the measured value; labels "Good" / "Poor" beneath.
  - **Tooltip (hover on the "i"):** dark card (`#18181b`, white text, `border-radius 12px`, `width 228px`, `box-shadow 0 12px 32px rgba(0,0,0,0.28)`, `fadeIn 0.12s`) with the metric name, a one-line "what it measures / why it matters", and the good/ok thresholds in mono. Shown via hover state (`onMouseEnter`/`onMouseLeave`), positioned `top:42px; right:14px`.

**e. Top Performance Opportunities** — the most important section. Header ("Top Performance Opportunities" + meta "6 found · ranked by savings"). Vertical list, `gap 12px`, of **accordion issue cards**, ranked by estimated savings and sorted so high-severity is at top:
  - Card: white, `border-radius 14px`, `overflow: hidden`, **left accent border 3px** colored by severity (High `#ef4444`, Medium `#f59e0b`, Low `#d4d4d8`).
  - Collapsed header row (a `<button>`, full width, hover `background #fcfcfc`): a **priority pill** (High = red tint, Medium = amber tint, Low = grey), title (14.5px/600) + one-line subtitle (12.5px `#71717a`), then right-aligned **estimated savings** (mono 16px/600, green `#16a34a`, e.g. "−1.20s") with "est. savings" caption, then a 26px +/− toggle chip.
  - Expanded panel (`fadeIn 0.18s`, top border `1px #f4f4f5`): a 2-column grid with **Why it hurts / Likely cause / Estimated impact / Recommended fix** (each: 10.5px uppercase label `#a1a1aa` + 13px body `#3f3f46`), then an **Affected resources** row of mono chips (`bg #fafafa`, `border 1px #ececec`, `border-radius 8px`) showing filename + size.
  - Example issues: Eliminate render-blocking resources, Serve the hero image in a modern format, Reduce unused JavaScript, Reduce main-thread work, Minimize third-party scripts, Remove unused CSS.

**f. Prioritized recommendations** — white card, list of numbered rows (`border-bottom 1px #f4f4f5` between). Each row: a numbered square chip, title + one-line sub, an **impact pill** (High Impact = orange tint `bg #fff1ea`/`text #c2410c`; Quick Win = green tint; Medium Impact = amber tint; Long Term = grey tint), an expected-improvement mono figure with metric caption, and an effort label. Rows are ordered "start at the top".

**g. Resource breakdown** — white card wrapping a table (`min-width 640px`, horizontal scroll on small screens). Columns: Category (grey dot + label) · Resource (mono) · Transfer (mono, right) · Load contribution (a mini bar `max-width 120px` filled to the % in `#e35a2a` + mono %) · Optimization (grey text). Sorted by load contribution desc. Header row `background #fafafa`, 10.5px uppercase labels.

**h. Diagnostics** — de-emphasized. Header "Diagnostics" (14px/600, `#52525b`). A single bordered container `background #f7f7f8` with a 3-column grid of 6 tiles separated by `1px #eaeaeb` dividers. Each tile: 11.5px `#71717a` label + mono 22px/600 value. Metrics: Time to First Byte, Time to Interactive, DOM Size, Network Requests, Transfer Size, Main-Thread Work.

**i. Footer** — centered mono caption `#c4c4c8`: "Lab data collected with Lighthouse · Field data not available for this URL".

### View 2: Audit History
Opened from the header "History" button.
- **Back link** ("← Back to report", ghost, hover `color #e35a2a`).
- **Title row:** `<h1>` "Audit history" (26px/600) + subtitle (mono "acme-store.com · Mobile · last 8 runs") on the left; a primary **"+ New audit"** button (same `#e35a2a` style as Run Audit) on the right → returns to dashboard.
- **Summary tiles:** 4-column grid of white cards — Latest score (with status dot), Best score, Average, 50-day change (green with ▲). Mono values 26px/600.
- **Trend chart card:** white card. Header "Performance score over time" + date range, plus a segmented toggle (Score active / LCP / INP — LCP & INP are visual only for now). The chart is an inline SVG line+area chart (viewBox `0 0 760 244`): faint horizontal gridlines with 40/50/60/70 axis labels, faint amber (needs-improvement) and red (poor) **zone bands**, an area fill `rgba(227,90,42,0.08)`, a `#e35a2a` polyline (2.5px, round joins), a white-filled dot at each run, and a larger solid `#e35a2a` dot + value label on the latest point. X-axis = run dates.
- **All runs table:** white card, header row + clickable run rows. Grid columns: `Date (mono) · Device (pill) · Score (status dot + mono value + delta vs previous run: green "▲n" / red "▼n" / "—") · LCP · INP · CLS (all mono) · chevron`. `min-width 720px` with horizontal scroll. Each row navigates to that run's dashboard (currently → dashboard). Newest first.

---

## Interactions & Behavior
- **View switching:** header logo & History button toggle `view`; each transition does `window.scrollTo(0,0)`. On the dashboard, History button is ghost; on History it's active-styled and clicking it returns to the dashboard. "New audit", "Back to report", and any history run row all return to the dashboard.
- **Score count-up:** on dashboard mount, animate the gauge number 0 → score over ~1100ms with an ease-out cubic (`1 - (1-t)^3`). The gauge arc can stay static at the final value.
- **Accordion issues:** clicking an issue header toggles its expanded panel (independent open state per issue); the +/− chip and panel visibility reflect it; panel animates in with `fadeIn 0.18s`.
- **Metric tooltips:** show on `mouseenter` of the "i" icon, hide on `mouseleave` (single "hovered metric" state). Provide an accessible equivalent (e.g. focusable button + `aria-describedby`, or details on tap for touch).
- **Device segmented control:** toggles selected device; the white pill slides to the active side.
- **Loading state (to build):** replace the dashboard body with a progress animation + rotating status text (no % — duration varies): "Launching Chrome…", "Loading page…", "Running Lighthouse…", "Analyzing performance…", "Generating report…". Disable Run Audit while running.
- **Empty state (to build):** before the first audit, a friendly prompt: "Enter a website URL above to analyze its performance."
- **Error states (to build):** human-readable messages for invalid URL, site unreachable, timeout, Lighthouse failure, Chrome launch failure.
- **Responsive:** desktop multi-column; tablet collapses metric/summary grids to 2-up; mobile single-column stacked. Tables/chart keep horizontal scroll and stay readable. (The prototype grids are fixed at 3/4 columns — add the responsive breakpoints in implementation.)

## State Management
- `view: 'dashboard' | 'history'`
- `device: 'desktop' | 'mobile'` (audit form)
- `score: number` (animated count-up target on the dashboard)
- `openIssues: Record<issueId, boolean>` (accordion)
- `hoveredMetric: metricId | null` (tooltips)
- **Real app additions:** `auditStatus` (idle/running/done/error) + `stage` for the loading text, the fetched `auditResult`, and `history[]` for the History view. Data fetching = the async job/poll flow described under Backend.

## Design Tokens
**Colors**
- Page background `#fafafa`; card surface `#ffffff`; muted surface `#fafafa` / `#f7f7f8` / `#f0f0f1`.
- Borders `#ececec` (cards), `#f4f4f5` (inner dividers), `#e4e4e7` (controls), `#eaeaeb` (diagnostics grid).
- Text: primary `#18181b`; secondary `#3f3f46` / `#52525b`; muted `#71717a`; faint `#a1a1aa`; faintest `#c4c4c8`.
- **Brand accent** `#e35a2a` (hover/darker `#cc4d20`; tint `#fff1ea`, tint border `#fed7c3`, tint text `#c2410c`).
- Status — Good: text `#15803d`, dot `#16a34a`, bg `#ecfdf3`, border `#bbf7d0`, scale zone `#bbf7d0`. Needs-improvement: text `#b45309`, dot `#f59e0b`, bg `#fffbeb`, border `#fde68a`, scale zone `#fde68a`. Poor: text `#b91c1c`, dot `#ef4444`, bg `#fef2f2`, border `#fecaca`, scale zone `#fecaca`.
- Selection highlight `#fbd9c9`.

**Typography**
- Sans: **Geist** (weights 400/450/500/600/700). Mono (all numerics, code, timestamps): **Geist Mono** (400/500/600).
- Scale: h1 26px/600; section h2 15px/600; hero summary 19px/450; big metric value 36px/600; gauge number 54px/600; stat/diag value 22–26px/600; body 13–14.5px; labels 10.5–13px; captions 10.5–12px. Tight `letter-spacing` (−0.01 to −0.03em) on large numerals/headings; +0.03–0.05em uppercase on small labels.

**Radius**: pills/badges 999px; controls/inputs 11px; cards 14–20px; small chips/tiles 8–12px.
**Shadow**: card `0 1px 2px rgba(0,0,0,0.04)`; button `0 1px 2px rgba(227,90,42,0.35)`; tooltip `0 12px 32px rgba(0,0,0,0.28)`; header blur `saturate(180%) blur(12px)`.
**Spacing**: content max-width 1160px; section vertical rhythm ~40–44px; grid gaps 12–16px; card padding 18–34px.
**Motion**: `fadeIn` (opacity) 0.12–0.18s ease for tooltips/accordion; count-up ~1100ms ease-out cubic; segmented pill slide `all 0.2s ease`.

## Assets
- **Fonts:** Geist + Geist Mono via Google Fonts (`https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap`). Use the codebase's font-loading convention.
- **Icons:** all inline SVG (globe, play triangle, chevrons) or simple CSS shapes (logo bars, status dots). No image assets. Swap for the codebase's icon set (e.g. lucide) where equivalents exist.
- No raster images, logos, or third-party art in the design.

## Files
- `Core Web Vitals Tester.dc.html` — the full design reference (both Dashboard and History views). Open it in a browser to see live behavior: score count-up, metric tooltips (hover the "i"), issue accordions (click a row), device toggle, and view switching (header "History" / logo). All data in it is mock.
