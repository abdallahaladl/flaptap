---
title: Flaptap Spoken English Studio
emoji: 🎙️
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 3333
pinned: true
---

# Flaptap — Spoken English Studio

Master real-world spoken English from YouTube videos, custom dialogues, and articulatory pronunciation workouts with millisecond word precision, dynamic AI coaching, and spaced active-recall vocabulary.

---

## Key Capabilities

- **Full-Sentence & Cohesive-Paragraph Precision:** Automatically segments YouTube JSON3 word timings into complete grammatical sentences (never cutting mid-sentence on caption cues) and groups complete sentences into logical editorial paragraphs.
- **Five Instant Learning Modes (0ms Switch, Zero Reloads):**
  1. **Shadow** — Sentence-by-sentence drilling with exact onset playback (`startSec` to `endSec - 12ms`), loop/auto-pause/continuous flow, `0.25x–2.00x` speed control, voice recorder comparison, and 170+ world-language translations.
  2. **Read** — Vox/NYT-inspired long-form cohesive paragraphs with live playhead sentence tracking.
  3. **Listen** — Interactive active-listening cloze dictation at Easy, Medium, and Hard levels.
  4. **Coach** — 100% dynamic AI prosody brief, connected speech & Flap-T mouth mechanics, expressions/phrasal verbs, and contextual vocabulary grounded verbatim to video timestamps.
  5. **Notes** — SQLite-persisted study notebook with 1-click Markdown (`.md`) study sheet export.
- **Click-Any-Word Contextual Lookup & Vocabulary Vault:** Click any word in a transcript for an instant contextual definition, IPA, spoken pronunciation tip, and target-language translation, then save to your personal **Vocabulary Vault** with spaced-repetition flashcards.
- **Flexible Video Docking:** Switch seamlessly between **Side**, **Top**, and **Focus** video layouts without ever remounting the player or interrupting audio.
- **Paper & Vox Editorial Design System:** Tactile cotton-paper Light Mode and matte-carbon Dark Mode, crisp SVG iconography, and multi-language interface (`EN`, `AR` RTL, `ES`, `FR`, `DE`, `TR`).
- **Accounts, Google OAuth 2.0 & Strict Sign-In Gate:** All workspace tabs and tools are visible to visitors, while execution is gated behind authentication (`401 auth_required`) with automatic pending-action continuation right after sign-in. Supports real **Google OAuth 2.0 Authorization Code + PKCE (`S256`) & RS256 OIDC ID-token verification**, email/password accounts (`scrypt`), active device session management, password updates, and account deletion on Node's native `node:sqlite` (WAL mode).
- **Full History, Caching & Usage Control Center:** Dedicated **History & Usage** workspace view with daily goal progress, per-lesson & global cache management (`Transcript`, `AI Coach`, `World Translations`, `Study Notes`), instant URL cache detection with optional cache bypass (`force: true`), bulk actions, practice activity timeline, and 1-click full JSON account export.

---

## Architecture

```text
flaptap/
├── backend/                          # NestJS TypeScript API
│   └── src/
│       ├── core/
│       │   ├── ai/                   # Single OpenCode Go transport + 170+ languages
│       │   ├── config/               # Environment & skill helper paths
│       │   ├── database/             # Native node:sqlite WAL engine + HistoryRepository
│       │   └── linguistics/          # Full-sentence/paragraph segmenter + dynamic highlights
│       ├── modules/
│       │   ├── auth/                 # Register, login, sessions, preferences, guest claiming
│       │   ├── vocabulary/           # Vocabulary Vault CRUD + SRS flashcard progression
│       │   ├── tracks/shadowing/     # Video processing, dynamic AI Coach, word lookup, translation
│       │   ├── tracks/street-talk/   # Custom spoken dialogue generator
│       │   ├── tracks/phonetics/     # Custom articulatory pronunciation workout generator
│       │   ├── history/              # Scoped lesson summaries, notes persistence, stats
│       │   └── languages/            # World-language catalog & AI health
│       └── main.ts
├── frontend/                         # Zero-framework Paper-Editorial Web App
│   ├── index.html & app.js           # Workspace, generators, library, Vocabulary flashcards, Auth
│   ├── studio.html & studio.js       # 5-mode learning studio, flexible video docking, word lookup
│   └── styles.css & studio.css       # Light/Dark paper tokens, RTL/LTR layout
├── skills/
│   └── american-accent-shadowing-skill/scripts/extract_transcript.py
└── scripts/
    ├── test_production_e2e.js        # Comprehensive API + SQLite + AI + Puppeteer E2E suite
    └── test_timing_extractor.py      # Offline JSON3 word-offset regression suite
```

---

## Quick Start

### 1. Prerequisites
- **Node.js** `>= 22.5` (uses native `node:sqlite`)
- **Python** `>= 3.9` with `youtube_transcript_api` and `yt-dlp`

### 2. Environment
Copy `.env.example` to `.env` and configure your OpenCode Go key:

```env
PORT=3333
HOST=0.0.0.0
NODE_ENV=production

OPENCODE_GO_API_KEY=your_opencode_go_api_key
OPENCODE_GO_MODEL=deepseek-v4.1-flash
OPENCODE_GO_BASE_URL=https://opencode.ai/inference/go/openai/v1

# Optional: Real Google OAuth 2.0 + OIDC Sign-In
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 3. Build, Run & Verify

```bash
npm run build
npm start

# In a second terminal:
npm run test:timing
npm run test:e2e
```
