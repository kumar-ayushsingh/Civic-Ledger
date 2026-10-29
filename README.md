# CivicLedger (Theme 08: CivicTech & Public Transparency)

> **Every repair trackable, escalating, and verifiable.**  
> Civic problems don't stay broken because nobody saw them. They stay broken because nobody is accountable. CivicLedger enforces SLA timers, deterministic AI defect triage, automatic multi-level escalation, contractor warranty tracking, 4-rule closure verification, and an immutable SHA-256 hash-chained public ledger.

---

## ⚡ Quick Start: Two Commands to Run Everything

### 1. Terminal 1 (Backend API & Ledger Engine)
```bash
cd backend && uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
*Starts FastAPI, SQLite database, background SLA deadline evaluator, and REST APIs at `http://127.0.0.1:8000` (Interactive Swagger docs at `/docs`).*

### 2. Terminal 2 (Vite Frontend Application)
```bash
cd frontend && pnpm run dev --host 127.0.0.1 --port 5173
```
*Starts the React + Tailwind application at `http://127.0.0.1:5173`.*

---

## 📱 Testing on a Real Phone via HTTPS Tunnel

Mobile browsers (Chrome, Safari, Edge on iOS/Android) enforce secure context (`https://`) requirements before allowing access to the camera (`navigator.mediaDevices.getUserMedia`) and GPS location (`navigator.geolocation`).

To test live camera capture and GPS on your physical phone:

### Option A: Cloudflare Tunnel (Free, No Account Required)
```bash
cloudflared tunnel --url http://127.0.0.1:5173
```
Open the generated `https://<random-name>.trycloudflare.com` link on your phone.

### Option B: LocalTunnel (Free, Node.js)
```bash
npx localtunnel --port 5173
```

### Option C: ngrok
```bash
ngrok http 5173
```
*Once loaded on your phone, navigate to `/app/report` to test live photo capture and real GPS detection.*

---

## 🧠 Adding an Optional YOLO v8 Model

CivicLedger features a dual-mode Computer Vision inference engine (`backend/detector.py`):
- **Deterministic Mock (Default)**: Uses keyword-based hashing to deterministically identify potholes, garbage dumps, and waterlogging with confidence scores, bounding boxes, and area ratios.
- **YOLO v8 Model**: Automatically activated if a PyTorch model weight file is detected.

### How to install YOLO weights:
1. Place your trained model weight file at:
   ```
   backend/models/pothole.pt
   ```
2. Install the YOLO runtime:
   ```bash
   cd backend
   uv pip install ultralytics
   ```
3. Restart or reload the FastAPI server. The detector will automatically detect `backend/models/pothole.pt` and switch from `mode: "mock"` to `mode: "yolo"`.
4. If the model file is removed or fails, it gracefully falls back to `mode: "mock-fallback"`.

---

## 🎮 Live Demo & Hackathon Pitch Script (3-Minute Walkthrough)

CivicLedger includes an integrated **Demo Control Panel** at [`/demo`](http://127.0.0.1:5173/demo) (accessible from any page by pressing <kbd>Shift + D</kbd>) and a floating **Guided Demo Checklist** in the bottom-right corner.

### The 3-Minute Presentation Script:

1. **Step 1: The Problem & Citizen Intake (`/app/report`)**
   - Citizen enters their 10-digit phone number. Receives a simulated SMS toast and one-tap auto-fills the OTP code.
   - Snaps a photo of a road defect (or chooses a demo sample).
   - Phone location automatically finds the nearest asset (*Sector 14 Main Commercial Avenue, Ward 14*).
   - Computer vision AI classifies the defect (*Pothole, 88% confidence, 16% road area ratio*) and calculates severity.
   - **No Department Dropdown**: The system automatically routes the ticket to the Public Works Dept (`PWD`), checks active road contract warranties, and flags **Contractor Liability**.
   - Submits report: Generates a unique Case ID (`CAS-8901`) with QR code tracking link and simulated SMS confirmation.

2. **Step 2: Transparent Public Tracking (`/track/:id`)**
   - Open the tracking page directly without login.
   - Shows the 7-step plain-language timeline (*Reported $\to$ Checked by AI $\to$ Assigned $\to$ Seen by officer $\to$ Being fixed $\to$ Fixed and checked $\to$ Confirmed*).
   - Displays the current holder (*Public Works Dept, L1 Field Engineer*) and real-time SLA countdown clock.
   - Features a **One-Tap "Still Broken" Button** allowing citizens to reopen fake or poor fixes, which instantly triggers Level 2 (`L2`) escalation.

3. **Step 3: Fast-Forward Time & Automated Escalation**
   - Open `/demo` or click **Fast-Forward (+4h / +24h)**.
   - Simulated clock advances past the SLA response deadline.
   - The background evaluator automatically triggers an `ESCALATED_L1` event, reassigns the ticket to the Executive Engineer (`L2`), and updates the map pin to amber.

4. **Step 4: 4-Rule Cryptographic Closure Engine (`/app/officer`)**
   - Navigate to the Officer Portal.
   - Click **Verify Fix** on a ticket to open the Closure Verification Modal.
   - **Test Fake Fix 1 (Wrong Location)**: Submits photo $150\text{m}$ away $\to$ Rule 1 fails with clear GPS distance explanation.
   - **Test Fake Fix 2 (Reused Photo)**: Submits original defect image $\to$ Rule 3 fails via perceptual hash (pHash distance $0$).
   - **Test Fake Fix 3 (Lingering Defect)**: Submits unfixed road photo $\to$ Rule 4 fails with AI defect confidence alert.
   - **Test Genuine Fix**: Submits clean, repaired road $\to$ All 4 rules pass, case is marked `Resolved`, and a `CLOSURE_VERIFIED` block is appended to the ledger.

5. **Step 5: Tamper-Evident Ledger & Audit Test (`/app/ledger`)**
   - Open the Public Dashboard.
   - Review the live SVG Ward Map with circular pins and real-time **Department Scorecards** (letter grades A/B/C, contractor firm names, fix speed, and reopen rates).
   - Observe the dark **Tamper-Evident Ledger** streaming SHA-256 block hashes every 3 seconds.
   - Open the **Case-Level Ledger Explorer Drawer**: Watch the browser recompute $\text{SHA-256}(\text{prev\_hash} + \text{canonical\_json}(\text{event}))$ on-the-fly and display a cryptographic match checkmark.
   - Click **Simulate Audit Tamper**: Directly corrupts Block #5 in the database.
   - The header button immediately reflects `Broken at block #5`, and the red `TamperBanner` announces the exact breached sequence.
   - Click **Restore Clean Chain**: Instantly resets the database to a clean, verified state in under 1 second.

---

## 🧪 Automated Test Suites

```bash
# 1. Full Backend Pytest Suite (21 tests)
cd backend && uv run pytest -v

# 2. End-to-End 3-Cycle Repeatability Acceptance Test
node frontend/tests/test_e2e_repeatability.cjs

# 3. Public Dashboard & SVG Ward Map Acceptance Test
node frontend/tests/test_e2e_dashboard.cjs

# 4. Officer Portal & 4-Rule Closure Verification Test
node frontend/tests/test_e2e_officer.cjs

# 5. Citizen 5-Step Wizard & Tracking E2E Test
node frontend/tests/test_e2e_citizen.cjs

# 6. Automated WCAG 2.1 AA Axe-Core Accessibility Audit
node frontend/tests/audit_a11y_axe.cjs
```

---

## ♿ Accessibility & Inclusivity Features

- **Full Bilingual Support**: 314 audited translation strings in **English** and **Hindi** (`हिंदी`) with live toggle. Review file available at `docs/HINDI_TRANSLATIONS_REVIEW.md`.
- **Text Scaling**: `A` ($16\text{px}$), `A+` ($18\text{px}$), `A++` ($20\text{px}$) with zero horizontal clipping.
- **High-Contrast Theme**: Meets and exceeds WCAG 2.1 AA color contrast standards.
- **Zero Named Individual Officers**: All public dashboards and tracking pages anonymize staff, displaying department roles only (*Junior Engineer L1*, *Executive Engineer L2*, *Zonal Head L3*) and contractor firm names.
- **Mobile First**: Native layout scaling down to $360\text{px}$ viewports.

---

## 📜 License
MIT License. Built for CYPHER '26, Theme 08: CivicTech, Public Transparency and Smart Governance.
