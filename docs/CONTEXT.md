# CivicLedger: project context (read before any task)

WHAT
Hackathon prototype for CYPHER '26, Theme 8 (CivicTech, Public Transparency and Smart Governance). A public accountability ledger for civic repairs. A citizen reports a defect with a live photo. AI verifies it and scores severity. The case is assigned to the responsible department and contract. An acknowledgement clock runs. If nobody responds it auto-escalates. A closure is accepted only with verified after-photo evidence. Every state change is appended to a SHA-256 hash-chained ledger shown on a public dashboard with department scorecards.
Pitch line: Problems stay broken because nobody is accountable. We make every repair trackable, escalating and verifiable.

STACK
Frontend: React + Vite + Tailwind CSS v3 + react-router + @fortawesome/fontawesome-free + qrcode.react. Backend: FastAPI + SQLite (SQLAlchemy), Pillow, imagehash, optional ultralytics YOLO. Vite dev proxy: /api -> http://localhost:8000. Folders: /frontend /backend /reference /docs. No external map tiles, no CDN dependencies at runtime (bundle fonts and icons locally).

DESIGN SOURCE OF TRUTH
/reference/landing_reference.html: header, tab pill nav, landing page (hero, badges, three pillars), footer, tamper banner.
/reference/dashboard_reference.html: dashboard (metrics row, filter buttons, stylised SVG ward map with circular pins, scorecards, live complaints feed, dark ledger panel), report form, officer portal, closure modal.
The landing reference has its dashboard top section deleted by mistake; take the metrics row and filter buttons from the dashboard reference.
Copy the look exactly: Inter font; sky-blue brand (sky-500 primary, sky-600 hover); page background #f8fafc; white cards with border-slate-200 and shadow-sm, rounded-2xl or rounded-3xl; pills and buttons rounded-full; sticky white header h-16 with a circular logo (fa-layer-group), the name CivicLedger and a small Public Beta pill; centred pill tab nav (bg-slate-100 p-1 rounded-full, active tab white with sky text); status colours Open sky, Escalated amber, Resolved emerald, tamper rose; dark ledger panel bg-slate-900 with a bg-slate-950 monospace hash stream; pulse animation on live dots; thin rounded scrollbars; footer text 'CivicLedger - Public Accountability Ledger for Civic Repairs | Theme 08: CivicTech and Public Transparency | CYPHER 26'. Reuse the reference's wording where it exists.

CHANGES FROM THE REFERENCE (deliberate)
1. Text size: the reference uses 10 to 12 px. Citizen-facing screens (landing body, report wizard, tracking page) use 16 px minimum and buttons at least 48 px tall. Officer and dashboard screens use 13 px minimum.
2. The report form must not have a manual GPS text box or a department dropdown. Location comes from the phone and the department comes from the AI and the assets table.
3. No registration. Citizens verify with a phone number and a simulated OTP.

ACCESSIBILITY FOR ALL AGES
Header controls: language toggle EN/hi, text size A / A+ / A++, high-contrast mode. Persist in localStorage. One primary action per step, large buttons with icon plus label, plain language at about grade 6, never colour alone to show status, visible focus rings, ARIA labels, respect prefers-reduced-motion. Hindi uses simple everyday words; keep all strings in /frontend/src/i18n/en.json and hi.json and list the Hindi strings for human review.

LESSONS FROM THE CPGRAMS REVIEW (apply everywhere)
No forced account; track by link or QR; the system classifies and routes, not the citizen; a per-case timeline in plain language showing who holds the case and time left; mobile first; one-tap 'Still broken' after a closure; automatic escalation instead of citizen reminders; public department scorecards; notify proactively.

DATA AND RULES
Seed data is simulated and labelled 'Simulated data' in the UI. Tables: wards, departments, officers, contractors, assets, contracts (with completion date and defect liability months), sla_policies, cases, evidence, events (the ledger), anchors, notifications, settings (simulated clock), otp_sessions.
Severity = detection confidence x defect size ratio x road importance x age factor, mapped to Low, Medium, High. Duplicate rule: same type within 30 m of an open case becomes a supporting report on that case.
SLA (illustrative, configurable): High acknowledge 4 h, resolve 3 d; Medium 24 h, 7 d; Low 48 h, 14 d. Escalation levels: L1 field engineer, L2 executive engineer, L3 zonal head. All deadlines use the simulated clock.
Contractor liability: if the report date is within completion date + defect liability months of the asset's contract, flag the case 'contractor liability'.
Closure accepted only if all pass: (1) after-photo GPS within 25 m of the original; (2) captured live within 10 minutes of submission and after assignment; (3) perceptual-hash distance from every earlier evidence image above a threshold (no reuse); (4) detector finds no defect above 0.5 confidence. Each failure is logged with a plain-language reason.
Ledger: every state change appends one event. hash = sha256(prev_hash + canonical_json(event)); canonical_json = json.dumps(sort_keys=True, separators=(',',':')); genesis prev_hash is 64 zeros. Verify recomputes the chain and returns the first broken sequence. Anchors store head hash and sequence. Say 'tamper-evident', never 'tamper-proof' or 'blockchain'.
Detector interface: detect(image_bytes) -> {type, confidence, bbox, area_ratio, mode}. mode is 'mock', 'yolo' or 'mock-fallback'. Mock is deterministic. The UI shows a 'Demo detection mode' badge whenever mode is not 'yolo'.
Public views show departments, contracts and firm names, never named individual officers.

WORKING RULES FOR THE AGENT
Plan briefly, implement, run the app and the tests, then report exactly what you verified. Do not add features outside the module. Do not invent data sources or real government integrations. Keep code simple and commented where the logic is core (ledger, closure rules, SLA).
