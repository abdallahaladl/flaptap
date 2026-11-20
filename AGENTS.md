# Flaptap — Architectural Constitution & Agentic Directives (`AGENTS.md`)

> **MANDATORY CONSTITUTIONAL LAW FOR FLAPTAP**
>
> Cognitive linguistic work is performed **only** by configured AI models reached directly over HTTPS APIs (`AiProvidersModule` / `backend/src/core/ai/ai.client.ts`). There is **no CLI agent layer** and **zero static regex wordlists** pretending to do linguistic extraction. Application code handles deterministic plumbing: caption extraction, full-sentence & cohesive-paragraph timing alignment, encrypted BYOK vaulting, modular client/server URL routing, relational SQLite persistence, authentication, and editorial rendering.

---

## 1. AI Transport: Direct Multi-Provider APIs & Shared Selector

1. **Unified Direct API Transport (`AiProvidersModule` + `AiClient`)**
   - AI-powered workspace generators (`LearningLibrary`, `TechLinguist`) execute through [`AiProvidersService`](file:///Users/abdallah/workspace/flaptap/backend/src/modules/ai-providers/ai-providers.service.ts), supporting live `/models` probing, `models.dev` capability enrichment, streaming SSE with intra-key transient `429`/timeout failover, and per-user AES-256-GCM BYOK keys alongside `.env` system keys (`OPENCODE_GO_API_KEY`, etc.).
   - Studio sentence pipelines (`ShadowingAnalysisService`, `ShadowingTranslationService`, `StreetTalkService`, `PhoneticsService`, `WordLookupService`) use [`AiClient`](file:///Users/abdallah/workspace/flaptap/backend/src/core/ai/ai.client.ts) (`reasoning_effort: "none"` for sub-second interactive Studio responsiveness).
   - `.env` and personal BYOK keys must never be committed or exposed in client-accessible responses outside authenticated masked previews (`sk-••••abcd`).
2. **One Reusable Selector UI & Zero CLI Agent Bloat**
   - Every AI-configurable feature MUST mount the single shared frontend module [`FlaptapAiSelector`](file:///Users/abdallah/workspace/flaptap/frontend/ai-provider-selector.js) rather than inventing a parallel provider/model picker.
   - Never reintroduce slow/hanging CLI agent adapters (`opencode-cli`, `claude-cli`, `antigravity-cli`) or static regex wordlists.
   - Connected speech, expressions/idioms, contextual vocabulary, prosody coaching, word lookup, translation, dialogue generation, and pronunciation workouts are 100% model-authored via engineered prompts.

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
   - `SqliteService` manages `data/flaptap.sqlite` (`users`, `auth_sessions`, `lessons`, `vocabulary_items`, `practice_logs`) using Node's native `node:sqlite` (`DatabaseSync`, zero native compilation dependencies).
   - **Zero Benefit Before Sign-In:** All UI sections and inputs are browseable by visitors, but every value-producing action prompts the user to sign in or create an account **before execution** (preserving and auto-resuming their pending action) and every protected backend route enforces `requireAuthenticatedUser` (`401 auth_required`) with strict `WHERE user_id = ?` isolation.
   - `AuthService` provides `scrypt` email/password accounts, `HttpOnly` session cookies + Bearer tokens, active session revocation, password management, and full account deletion.
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
- Flexible video docking: **Transcript** (35% Video Stage · 65% Sentence Learning Canvas) and **Theater** (65% Video Cinema Stage · 35% Compact Sentence Rail), and scalable primary Studio learning modes (`Shadow` | `Read` | `Listen` | `Coach` | `Notes`) switch in 0ms client-side without reloading the page or remounting the YouTube player.
- Timestamp and IPA spans enforce `direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums`.

### Modular Feature Architecture, Dedicated URL Routing & Primary Navigation Law (Mandatory)

1. **Dedicated Page URL & Refresh Persistence (No Home-URL Trapping)**
   - Every top-level feature MUST own a dedicated clean URL route (`/feature`) and meaningful sub-routes (`/feature/subview`, `/feature/item/:id`) rather than toggling hidden DOM panels on `/`.
   - Any new feature route MUST be registered in **both**:
     1. Backend static/HTML route manifest (`backend/src/core/config/frontend-routes.ts`) so direct loads and hard refreshes (`Cmd+R` / `F5`) return `200 OK` while keeping `/api/*` strictly isolated.
     2. Frontend History API router (`frontend/router.js`, `FlaptapRouter`) handling `pushState` / `replaceState`, `popstate` (Back/Forward), document `<title>`, breadcrumbs, and sub-route query/path restoration.
   - Any multi-view feature (`LearningLibrary`, `TechLexicon`, `Vocabulary`, `History`) MUST synchronize sub-views/filters via `FlaptapRouter.updateSubroute(...)` so refreshing mid-workflow keeps the user on that exact view instead of snapping back to `/`.
   - Always reference stylesheets and scripts in HTML templates with root-relative paths (`/styles.css`, `/feature.js`) so nested feature sub-routes resolve static assets accurately on hard refresh.
2. **Modular Feature Encapsulation (Zero Monolith Dumping)**
   - Every new feature MUST ship as an isolated backend module (`backend/src/modules/<feature>/`) AND isolated frontend module (`frontend/<feature>.js` + optional `frontend/<feature>.css`) interacting with the shell exclusively through `FlaptapWorkspace`, `FlaptapRouter`, `FlaptapAiSelector`, and `FlaptapWordLookup`.
   - Future AI agents are forbidden from embedding large feature implementations inside `frontend/app.js` or creating duplicate settings/provider pickers.
3. **Left Primary Sidebar Navigation & Minimal Topbar Law**
   - Primary site navigation lives exclusively inside the Left Primary Sidebar Navigation Rail (`.app-sidebar`), organized by domain group (`Studio`, `Knowledge`, `Workspace`) with keyboard-accessible collapse (`Cmd+B`) and mobile off-canvas drawer (`<= 960px`).
   - Future AI agents are strictly forbidden from adding horizontal navigation tabs back into the top bar (`.workspace-topbar`). The top bar is reserved exclusively for mobile menu trigger, contextual page breadcrumb, and global utilities (streak, UI language, light/dark toggle, install, account).
   - Remove redundant jump links and legacy hidden DOM duplicates—each navigation action has one authoritative location.

### Real Derived Completion Law (Website-Wide Invariant)

- **Zero Fake Completion Controls:** Never add manual "Mark Complete" buttons or container-level completion toggle switches on any multi-item learning entity (Anything to Phrases Study Guides, Tech Lexicon notes, Shadowing/Dialogue/Pronunciation Lessons, History Ledger rows, or future multi-item features).
- **Strict Derivation from Child Items:** A container entity is in the `Completed` (`done`) state **if and only if** every checkable item it contains is checked off (`totalItems > 0 && completedItems === totalItems`). If even one child item is unchecked, the container MUST NOT be marked completed (`progress` when `completedItems > 0`, `new` when `0`).
- **Single Source of Truth:** Users check or uncheck individual atomic items (phrases, sentences, paragraphs, vocab terms, idioms, patterns, flashcards). Both backend repositories and frontend views MUST derive and persist parent completion strictly from those child item states—never trust or expose a manual container-level override.

### Independent Dual-Pane Studio Scrolling Law (Strict Invariant)

- **Desktop Viewport Lock (> 768px):** Viewport is fixed (`html:has(.studio-body), .studio-body { height: 100dvh; overflow: hidden; }`). The topbar is fixed (`flex-shrink: 0`).
- **Strict Dual-Pane Scroll Isolation:** Media Deck (`.studio-deck`) and Primary Learning Canvas (`.studio-canvas`) MUST scroll as completely isolated, independent scroll containers (`height: 100%; max-height: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;`).
- **Zero Cross-Pane Displacement:** Scrolling through sentences, transcripts, notes, or controls on either pane MUST NEVER scroll or displace the other pane or the outer window (`window.scrollY` remains 0 at all times).
- **Mobile Graceful Degradation (<= 768px):** Viewport and workspace revert to standard document flow (`height: auto; overflow-y: auto;`) for native single-column phone ergonomics.
- **Future AI Agent Invariant:** Future AI agents and developers are strictly forbidden from removing independent pane scrolling or reverting the Studio desktop workspace to window-level scrolling.

### Theater Mode Under-Video Controller Symmetry Law

- In Theater mode (`data-layout="theater"` / `data-layout="focus"`), `.deck-controls-stack` MUST format as a 2-column balanced grid (`display: grid; grid-template-columns: 1fr 1fr; gap: 12px;`) to completely eliminate all blank void space beneath the video stage.
- Row 1: `Master Transport` (Col 1) and `Playback Speed` (Col 2).
- Row 2: `Voice Comparison` (Col 1) and `Sentence Flow` (Col 2).
- Row 3: `Language Console` (`.translation-deck-panel`) spanning full width (`grid-column: 1 / -1`).
- Row 4: `Shortcuts Strip` (`.shortcuts-strip`) spanning full width (`grid-column: 1 / -1`).
- Future AI agents must never collapse controls into a single left-aligned column with an empty right-hand void in Theater mode.

---

## 5. Testing & Enforcement

- Build TypeScript: `npm run build` (`cd backend && npm run build`).
- Offline timing unit suite: `npm run test:timing`.
- Full production E2E suite (API + SQLite + Auth + Dynamic AI + Puppeteer Browser): `npm run test:e2e`.
- Never commit `.env`, API keys, `data/*.sqlite*`, or temporary artifacts.
