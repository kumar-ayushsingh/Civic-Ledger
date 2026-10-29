# CivicLedger (Theme 08)

> **Every repair trackable, escalating, and verifiable.**  
> A public accountability platform for civic infrastructure repairs that couples deterministic AI defect triage, transparent SLA countdown clocks with multi-level auto-escalation, contractor defect liability tracking, and a tamper-evident cryptographic ledger.

---

## 🌟 Key Features

1. **Guided 5-Step Citizen Reporting Wizard (`/app/report`)**
   - **Simulated OTP**: Single-line explanation, floating simulated-SMS toast preview, 6-digit OTP verification with auto-advance and one-tap auto-fill.
   - **Live Camera & Photo Upload**: HTML5 `getUserMedia` live camera stream, capture fallback, and sample defect presets (*Pothole*, *Garbage Heap*, *Waterlogging*).
   - **Smart Geolocation**: Reverse-geocoded to the nearest municipal asset street label. Gracefully falls back to a 1-tap demo location (*Sector 14 Main Road*) if GPS is denied.
   - **Plain-Language AI Defect Triage**: *"We think this is a pothole. Is that right?"* with confirmation or defect correction, severity scoring (Low/Medium/High), and **voice input** (Web Speech API supporting `hi-IN` and `en-IN`).
   - **Zero Department Dropdowns**: Routing, ward assignment, and contractor liability determination occur server-side.

2. **Public No-Login Tracking (`/track/:token`)**
   - 7-step plain-language repair timeline (*Reported $\to$ Checked by AI $\to$ Assigned $\to$ Seen by officer $\to$ Being fixed $\to$ Fixed and checked $\to$ Confirmed*).
   - Live holder visibility (role and department without exposing personal officer names).
   - Dynamic time remaining against SLA countdown timers.
   - Before and after photo comparison.
   - **One-Tap "Still Broken" Button**: Allows citizens to reopen unresolved or poorly fixed cases, automatically escalating them to Level 2 (`L2`) and appending a `CASE_REOPENED` event to the ledger.

3. **Tamper-Evident Cryptographic Ledger (`/app/ledger`)**
   - Every state transition appends an immutable block hashed via SHA-256:  
     $$\text{own\_hash} = \text{SHA-256}(\text{prev\_hash} + \text{canonical\_json}(\text{event}))$$
   - Sequence #1 is anchored with `0000000000000000000000000000000000000000000000000000000000000000`.
   - Periodic external checkpoints (anchors) detect chain rewrite attacks.
   - **Live Verification**: Recomputes the entire chain in the browser header in milliseconds.
   - **Tamper Simulation**: Injects payload corruption into historical blocks to demonstrate immediate detection and pinpointing of broken sequences in the UI banner.

4. **SLA Timers & Automated Multi-Level Escalation**
   - Configurable response and resolution deadlines per defect severity.
   - Background worker monitors simulated time: missed acknowledgement or resolution triggers automatic escalation ($L1 \to L2 \to L3$), reassigns higher-level officers, and records escalation events in the ledger.
   - Demo time advance controls (`POST /api/demo/advance`).

5. **Accessibility & Inclusivity**
   - Fully bilingual in **English** and **Hindi** (`हिंदी`).
   - Dynamic font size adjustment (`A`, `A+`, `A++`) adhering to WCAG 2.1 AA with zero layout clipping.
   - High-contrast mode toggle.
   - Fully responsive down to 360px mobile viewports.

---

## 🏗️ Architecture

```
CivicLedger/
├── backend/
│   ├── database.py         # SQLAlchemy engine, session factory, data paths
│   ├── detector.py         # Deterministic mock & YOLO defect classifier
│   ├── ledger.py           # Cryptographic hash chain, verification & anchors
│   ├── main.py             # FastAPI application, REST endpoints, background SLA worker
│   ├── models.py           # SQLAlchemy database models & indexes
│   ├── seed.py             # Simulated Faridabad-style municipal seed dataset
│   ├── workflow.py         # Intake, OTP, Haversine lookup, SLA escalation, scorecards
│   └── tests/
│       ├── demo_flow.py    # End-to-end simulated CLI workflow test
│       ├── test_ledger.py  # Cryptographic ledger & tamper tests
│       └── test_workflow.py# 15 backend intake, SLA, and tracking pytest suite
├── frontend/
│   ├── src/
│   │   ├── components/     # Header, Footer, LaunchModal, TamperBanner
│   │   ├── context/        # AppContext (language, text size, contrast, clock)
│   │   ├── i18n/           # en.json, hi.json bilingual translations
│   │   └── pages/
│   │       ├── LandingPage.jsx       # Public landing page with Launch Prototype
│   │       ├── ReportWizardPage.jsx  # 5-step citizen reporting wizard
│   │       ├── TrackingPage.jsx      # Public no-login case tracking page
│   │       └── LedgerStubPage.jsx    # Public ledger table & tamper testing
│   └── tests/
│       ├── test_e2e_citizen.cjs # Puppeteer mobile viewport 11-stage E2E test
│       ├── test_e2e_landing.cjs # Landing page test
│       └── test_e2e_module3.cjs # Ledger verification & tamper E2E test
└── docs/
    └── CONTEXT.md          # Technical specification & requirements
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+ (or [uv](https://github.com/astral-sh/uv))
- Node.js 18+ & [pnpm](https://pnpm.io/)

### 1. Backend Setup
```bash
cd backend
uv venv
uv pip install -e .
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
The FastAPI backend will start at `http://127.0.0.1:8000` (Interactive API docs at `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup
```bash
cd frontend
pnpm install
pnpm run dev
```
The React frontend will start at `http://127.0.0.1:5173`.

---

## 🧪 Testing

### Backend Unit & Integration Tests (15 tests)
```bash
cd backend
uv run pytest -v
```

### Citizen Experience Mobile E2E Test
```bash
node frontend/tests/test_e2e_citizen.cjs
```

### Ledger & Tamper E2E Test
```bash
node frontend/tests/test_e2e_module3.cjs
```

---

## 📜 License
MIT License. Built for civic transparency and verifiable municipal accountability.
