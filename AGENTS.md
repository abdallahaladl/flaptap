# Flaptap — Architectural Constitution & Agentic Directives (`AGENTS.md`)

> **MANDATORY CONSTITUTIONAL LAW FOR FLAPTAP**
>
> Cognitive linguistic work is performed **only** by the configured AI model, reached through the single OpenCode Go transport (`backend/src/core/ai/ai.client.ts`). There is no agent adapter layer, no model routing cascade, no CLI agent, and **zero static regex wordlists** pretending to do linguistic extraction. Application code handles deterministic plumbing: caption extraction, full-sentence & cohesive-paragraph timing alignment, relational SQLite persistence, authentication, and editorial rendering.

---

## 1. AI Transport: One Client, One Model

1. **OpenCode Go only**
   - Every AI call goes exclusively through `backend/src/core/ai/ai.client.ts`.
   - Provider endpoint: `https://opencode.ai/inference/go/openai/v1` (OpenAI-compatible).
   - Default model: **DeepSeek V4.1 Flash** (`deepseek-v4.1-flash`).
   - Configuration lives in `.env`:
     ```env
     OPENCODE_GO_API_KEY=...
     OPENCODE_GO_MODEL=deepseek-v4.1-flash
     OPENCODE_GO_BASE_URL=https://opencode.ai/inference/go/openai/v1
     ```
   - `OPENCODE_GO_API_KEY` must never be committed. `.env` is git-ignored.
2. **No agent layer & no static linguistic fallbacks**
   - Do not add CLI agent adapters or UI model pickers.
   - Connected speech, expressions/idioms, contextual vocabulary, prosody coaching, word lookup, translation, dialogue generation, and pronunciation workouts are 100% model-authored via engineered prompts. Never reintroduce hardcoded regex tables or `0` counter badges.
3. **Reasoning off for interactive latency**
   - Every request sets `reasoning_effort: "none"` for fast interactive responses.

---

## 2. Cognitive & Segmentation Contracts

| Feature | Owner | Contract |
| :--- | :--- | :--- |
| **Dynamic AI Coach & Word Lookup** | `ShadowingAnalysisService` | Universal genre-adaptive prompt extracting verbatim-grounded Connected Speech (with IPA & mouth mechanics), Expressions/Idioms, Key Vocabulary, Prosody Brief, and Contextual Word Definitions. |
| **World-Language Translation** | `ShadowingTranslationService` | Translate spoken English into 170+ languages (Arabic `ar` default). Standard register, preserve names & technical terms in Latin script (`<bdi class="tech-loanword" dir="ltr">` for RTL). |
| **Dialogue Generation** | `StreetTalkService` | Author realistic spoken American dialogues with dynamic connected speech, expressions, and vocabulary. |
| **Pronunciation Workouts** | `PhoneticsService` | Author physical articulatory workouts with IPA, tongue/jaw mechanics, and spoken lines. |
| **Caption Extraction & Timing** | `TranscriptService` + Python helper | Mechanical JSON3 word-offset ingestion, rolling-cue deduplication, and accurate failure taxonomy. |
| **Full-Sentence & Paragraph Segmentation** | `segmentation.ts` | Punctuated transcripts cut strictly at true grammatical sentence endings (`.`, `?`, `!`), never mid-sentence on caption cues or commas. Unpunctuated ASR streams combine acoustic pause absorption with syntactic completeness. Paragraphs (`ChunkItem[]`) are strictly contiguous unions of complete sentences. |

### Playback Boundary Law

- Prefer YouTube JSON3 per-word `tOffsetMs` values over interpolation.
- Store and compare start/end times at **millisecond precision** (3 decimals).
- Ensure sentence `endSec` absorbs the natural spoken acoustic release and decay tail (up to +420ms into any inter-sentence pause) while strictly bounding at least 50ms before the subsequent sentence onset.
- Play through the sentence's full acoustic decay without mid-syllable clipping or premature truncation.
- Preserve verbatim text character-for-character across all `<mark>` highlights (`highlightsAreVerbatim`).

### Caption Failure Contract

- `video_unavailable` (404) — removed, private, or region-restricted video (no retry button);
- `no_captions` (422) — no English caption track (no retry button);
- `rate_limited` (503) — YouTube temporary throttle (retry offered);
- `timeout` (503) — time budget exceeded (retry offered).

---

## 3. Relational Persistence, Authentication, Caching & Performance

1. **Built-in SQLite WAL Engine (`node:sqlite`) & Strict Account Isolation**
   - `SqliteService` manages `data/flaptap.sqlite` (`users`, `auth_sessions`, `oauth_states`, `lessons`, `vocabulary_items`, `practice_logs`) using Node's native `node:sqlite` (`DatabaseSync`, zero native compilation dependencies).
   - **Zero Benefit Before Sign-In:** All UI sections and inputs are browseable by visitors, but every value-producing action prompts the user to sign in or create an account **before execution** (preserving and auto-resuming their pending action) and every protected backend route enforces `requireAuthenticatedUser` (`401 auth_required`) with strict `WHERE user_id = ?` isolation.
   - `AuthService` + `GoogleOAuthService` provide real Google OAuth 2.0 Authorization Code + PKCE (`S256`) and native `node:crypto` RS256 OIDC JWKS verification alongside `scrypt` email/password accounts, `HttpOnly` session cookies + Bearer tokens, active session revocation, password management, and full account deletion.
   - `HistoryRepository` & `VocabularyService` power the **History, Caching & Usage Control Center** (per-lesson & global cache clearing across transcripts/coach/translations, cache-bypass `force` re-extraction, progress reset, bulk operations, activity log controls, full JSON account export) and spaced active-recall flashcards (`mastery_level` 0–4).
2. **Instant Video Open Path**
   - `POST /api/tracks/shadowing/process` performs caption extraction + deterministic full-sentence/paragraph segmentation + SQLite save and returns immediately.
   - Dynamic AI Coach analysis (`POST /api/tracks/shadowing/analyze`) runs asynchronously once the Studio renders and caches permanently in SQLite.
3. **Zero External Font or Render-Blocking Assets**
   - System editorial font stacks (`Iowan Old Style` / `Charter` / `Georgia` + system UI sans + monospace strictly for timestamps/IPA).

---

## 4. Paper & Vox Editorial Frontend Laws

- Minimal, paper-tactile (`#F6F4EE` / `#FCFBF7` newsprint + `#141413` ink + `#FFF04B` Vox highlighter yellow) Light Mode and matte carbon (`#121210` / `#191916`) Dark Mode.
- Authored 1.5px stroke SVG icons everywhere — zero emojis, zero static example chips under inputs, zero purple AI gradients.
- English (`en`, LTR) default UI with multi-language support (`ar` RTL, `es`, `fr`, `de`, `tr`).
- Flexible video docking: **Transcript** (25% Video Stage · 75% Sentence Learning Canvas) and **Theater** (75% Video Cinema Stage · 25% Compact Sentence Rail), and scalable primary Studio learning modes (`Shadow` | `Read` | `Listen` | `Coach` | `Notes`) switch in 0ms client-side without reloading the page or remounting the YouTube player.
- Timestamp and IPA spans enforce `direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums`.

### Independent Dual-Pane Studio Scrolling Law (Strict Invariant)

- **Desktop Viewport Lock (> 768px):** Viewport is fixed (`html:has(.studio-body), .studio-body { height: 100dvh; overflow: hidden; }`). The topbar is fixed (`flex-shrink: 0`).
- **Strict Dual-Pane Scroll Isolation:** Media Deck (`.studio-deck`) and Primary Learning Canvas (`.studio-canvas`) MUST scroll as completely isolated, independent scroll containers (`height: 100%; max-height: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;`).
- **Zero Cross-Pane Displacement:** Scrolling through sentences, transcripts, notes, or controls on either pane MUST NEVER scroll or displace the other pane or the outer window (`window.scrollY` remains 0 at all times).
- **Mobile Graceful Degradation (<= 768px):** Viewport and workspace revert to standard document flow (`height: auto; overflow-y: auto;`) for native single-column phone ergonomics.
- **Future AI Agent Invariant:** Future AI agents and developers are strictly forbidden from removing independent pane scrolling or reverting the Studio desktop workspace to window-level scrolling.

### Theater Mode Under-Video Controller Symmetry Law

- In Theater mode (`data-layout="theater"` / `data-layout="focus"`), `.deck-controls-stack` MUST format as a 2-column balanced grid (`display: grid; grid-template-columns: 1fr 1fr; gap: 12px;`) to completely eliminate all blank void space beneath the video stage.
- Row 1: `Master Transport` (Col 1) and `Sentence Flow` (Col 2).
- Row 2: `Playback Speed` (Col 1) and `Voice Comparison` (Col 2).
- Row 3: `Language Console` (`.translation-deck-panel`) spanning full width (`grid-column: 1 / -1`).
- Row 4: `Shortcuts Strip` (`.shortcuts-strip`) spanning full width (`grid-column: 1 / -1`).
- Future AI agents must never collapse controls into a single left-aligned column with an empty right-hand void in Theater mode.

---

## 5. Testing & Enforcement

- Build TypeScript: `npm run build` (`cd backend && npm run build`).
- Offline timing unit suite: `npm run test:timing`.
- Full production E2E suite (API + SQLite + Auth + Dynamic AI + Puppeteer Browser): `npm run test:e2e`.
- Never commit `.env`, API keys, `data/*.sqlite*`, or temporary artifacts.
