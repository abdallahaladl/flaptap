<div align="center">

# 🎙️ Flaptap AI

### **Autonomous AI American Accent, Prosody & Verbatim Shadowing Studio**
*Train the physical muscle mechanics of native American speech using real-world media, AI thought-unit segmentation, and zero-bleed acoustic drilling.*

---

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=flat&logo=nodedotjs)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.0-E0234E?style=flat&logo=nestjs)](https://nestjs.com/)
[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat&logo=python)](https://www.python.org/)
[![Model Engine](https://img.shields.io/badge/AI%20Engine-Gemini%20Flash%20High%20%2F%20Groq-8B5CF6?style=flat)](https://groq.com/)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)](LICENSE)

</div>

---

## 🌟 Why Flaptap?

Traditional pronunciation tools force users through robotic textbook scripts and isolated vowels. 

**Flaptap AI** bridges the gap between academic English and real-world American spoken fluency:
- **Flap-T & Alveolar Tap Mechanics:** Trains the fast `/t/` & `/d/` taps (*"water"*, *"better"*, *"city"*), glottal stops, and vowel reductions that define native American cadence.
- **Atomic Thought-Unit Segmentation:** Powered by Google Antigravity (Gemini Flash High), automatically breaks long run-on speech into 4–11 word natural breath groups without leaving dangling prepositions.
- **Millisecond Precision Audio Drilling:** Tightened acoustic playback boundaries (-0.05s lead-in buffer, +0.02s cutoff) ensure instant sentence repeating with zero audio bleed into adjacent sentences.
- **Real-World Vernacular Dialect Translations:** Instant contextual colloquial translations across 22 Arab dialects (default: Egyptian Arabic `ar-EG` 🇪🇬) and English accents (default: US English `en-US` 🇺🇸), strictly preserving tech loanwords in `<bdi class="tech-loanword" dir="ltr">`.

---

## 🏗️ Architecture & Core Components

```
flaptap-ai/
├── backend/                     # High-performance NestJS production API
│   ├── src/
│   │   ├── core/
│   │   │   ├── agents/          # Multi-Agent Adapter Engine (Antigravity 2.0, Claude, Codex)
│   │   │   ├── config/          # Dynamic path resolution & runtime environment
│   │   │   └── database/        # Thread-safe persistent file-backed repository
│   │   ├── modules/
│   │   │   ├── tracks/          # Shadowing Studio, Street Talk, & Phonetics Tracks
│   │   │   ├── history/         # User Practice History API
│   │   │   └── agents/          # Agent Registry Discovery API
│   │   └── main.ts              # NestJS bootstrap with security & caching headers
├── frontend/                    # Low-latency, zero-framework reactive UI
│   ├── index.html               # Main dashboard (Arabic RTL default)
│   ├── app.js                   # State machine, session router, & track switcher
│   ├── studio.html              # Dedicated Shadowing Studio with YouTube IFrame API
│   ├── studio.js                # Driller loop, dual speed sliders, & dialect switcher
│   └── styles.css / studio.css  # Modern dark-mode UI with bidirectional (RTL/LTR) styling
├── skills/                      # Agentic Skills & Ingestion Pipelines
│   └── american-accent-shadowing-skill/
│       └── scripts/
│           └── extract_transcript.py # Subtitle parser & monotonic audio word aligner
├── data/                        # Persistent practice logs & verified sessions
└── scripts/                     # End-to-end automated testing suites (Puppeteer)
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: `>= 18.0.0`
- **Python**: `>= 3.9` with `yt-dlp` and `youtube_transcript_api`
  ```bash
  pip install yt-dlp youtube_transcript_api
  ```

### 2. Environment Setup
```bash
cp .env.example .env
```
Configure your environment variables in `.env`:
```env
PORT=3333
HOST=0.0.0.0
NODE_ENV=production
GROQ_API_KEY=your_groq_api_key_here
DEFAULT_COGNITIVE_MODEL=qwen/qwen3.8-27b
```

### 3. Installation & Build
```bash
# Install backend dependencies
cd backend && npm install

# Build TypeScript to production bundle
npm run build
```

### 4. Run the Production Server
From the root directory:
```bash
npm run start
```
Or directly from `backend/`:
```bash
npm run start:prod
```

Access the studio at:
**`http://localhost:3333`**

---

## 🧪 Automated Testing & Verification

Flaptap AI includes an automated end-to-end Puppeteer verification suite that validates:
1. **Arabic RTL UI** default direction and typography.
2. **Video ID Extraction** across YouTube Shorts, standard watch, and embed URLs.
3. **Millisecond boundary precision** in Sentence Drill mode.
4. **Vernacular Dialect Switching** between Egyptian (`ar-EG`), Saudi (`ar-SA`), and American English (`en-US`).

Run the automated test suite:
```bash
npm run test:e2e
```

---

## 📜 Constitutional Laws for AI Agents (`AGENTS.md`)

All cognitive linguistic processing in Flaptap AI is strictly governed by the **Agent-First Cognitive Supremacy Principle** defined in [`AGENTS.md`](./AGENTS.md):
- **Sole Cognitive Actor:** LLM Agents execute all thought-unit grouping, dialect translations, and mouth mechanics analysis.
- **Zero Heuristic Templates:** Programmatic code is strictly plumbing (routing, database persistence, and DOM rendering).
- **Verbatim Audio Fidelity:** Spoken reductions (*"gonna"*, *"didja"*) and colloquial idioms are preserved exactly as spoken.

---

## 📄 License

Proprietary & Confidential. All rights reserved.
