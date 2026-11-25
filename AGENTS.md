# Flaptap — Architectural Constitution & Agentic Directives (`AGENTS.md`)

> **MANDATORY CONSTITUTIONAL LAW FOR FLAPTAP**
>
> Cognitive linguistic work is executed **only** by configured AI models over direct HTTPS APIs (`AiProvidersModule` / `AiClient`) — never via CLI agent adapters or static regex wordlists. Application code handles deterministic plumbing: caption extraction, millisecond sentence/paragraph alignment, AES-256-GCM BYOK vaulting, clean URL routing, SQLite persistence, authentication, and UI rendering.

---

## 1. AI Transport & Shared Provider Selector

1. **Direct Multi-Provider APIs (`AiProvidersModule` + `AiClient`)**
   - Workspace generators & review pipelines (`Shadowing` AI Verbatim Review, `Phrase Builder` / `learning-library`, `Phrase Miner` / `american-extractor`) run through [`AiProvidersService`](file:///Users/abdallah/workspace/flaptap/backend/src/modules/ai-providers/ai-providers.service.ts), supporting live `/models` probing, `models.dev` capability enrichment, streaming SSE with transient `429`/timeout failover, and per-user AES-256-GCM BYOK keys alongside `.env` system keys.
   - Studio sentence pipelines (`ShadowingAnalysisService`, `ShadowingTranslationService`, `StreetTalkService`, `PhoneticsService`, `WordLookupService`) use [`AiClient`](file:///Users/abdallah/workspace/flaptap/backend/src/core/ai/ai.client.ts) (`reasoning_effort: "none"` for sub-second Studio responsiveness).
   - Never commit `.env` or expose raw secrets outside authenticated masked previews (`sk-••••abcd`).
2. **Single Shared Provider UI**
   - Every AI-configurable feature MUST mount [`FlaptapAiSelector`](file:///Users/abdallah/workspace/flaptap/frontend/ai-provider-selector.js) rather than creating a parallel provider/model picker.
   - Connected speech, idioms, contextual vocabulary, prosody coaching, translations, dialogues, and phonetics workouts must remain 100% model-authored via engineered prompts.

---

## 2. Cognitive, Segmentation & Playback Contracts

| Feature | Owner | Contract |
| :--- | :--- | :--- |
| **Dynamic AI Coach & Word Lookup** | `ShadowingAnalysisService` | Verbatim-grounded Connected Speech (IPA + mouth mechanics), Expressions/Idioms, Key Vocabulary, Prosody Brief, and Contextual Word Definitions. |
| **World-Language Translation** | `ShadowingTranslationService` | Translate spoken English into 170+ languages (`ar` default). Standard register; preserve names and technical terms in Latin script (`<bdi class="tech-loanword" dir="ltr">` for RTL). |
| **Dialogue Generation** | `StreetTalkService` | Author realistic spoken American dialogues with connected speech, expressions, and vocabulary. |
| **Phonetics Workouts** | `PhoneticsService` | Author articulatory workouts with IPA, tongue/jaw mechanics, and spoken drill lines. |
| **Caption Extraction & Timing** | `TranscriptService` + Python helper | JSON3 word-offset ingestion, rolling-cue deduplication, and explicit failure taxonomy. |
| **Sentence & Paragraph Alignment** | `segmentation.ts` | Punctuated transcripts cut strictly at grammatical sentence endings (`.`, `?`, `!`), never mid-sentence. Unpunctuated ASR combines acoustic pause absorption with syntactic completeness. `ChunkItem[]` paragraphs are strictly contiguous unions of complete sentences. |

### Playback Boundary Law

- Prefer YouTube JSON3 per-word `tOffsetMs` values over interpolation; store and compare timings at **millisecond precision** (3 decimals).
- Absorb natural acoustic decay at sentence end (up to `+420ms` into inter-sentence pauses) while staying at least `50ms` before the next sentence onset — zero mid-syllable clipping.
- Preserve verbatim text character-for-character across all `<mark>` highlights (`highlightsAreVerbatim`).

### Caption Failure Contract

- `video_unavailable` (`404`, no retry) · `no_captions` (`422`, no retry) · `rate_limited` (`503`, retry offered) · `timeout` (`503`, retry offered).

---

## 3. Persistence, Auth Gate & Performance

1. **Native SQLite WAL (`node:sqlite`) & Strict Isolation**
   - `SqliteService` manages `data/flaptap.sqlite` using Node's native `DatabaseSync` (`node:sqlite`).
   - **Zero Benefit Before Sign-In:** Visitors can browse all UI surfaces, but every value-producing action opens the auth gate before execution (saving and auto-resuming the pending action), and every protected route enforces `requireAuthenticatedUser` (`401 auth_required`) with `WHERE user_id = ?`.
   - `AuthService` handles `scrypt` accounts, `HttpOnly` cookies + Bearer tokens, session revocation, and full account deletion.
   - `HistoryRepository` & `VocabularyService` power the **Activity & Cache** control center (per-item & global cache clearing, `force` re-extraction, progress reset, bulk operations, JSON backup export) and SRS flashcards (`mastery_level` 0–4).
2. **Instant Video Open Path**
   - `POST /api/tracks/shadowing/process` extracts captions, segments sentences/paragraphs deterministically, saves to SQLite, and returns immediately; AI Coach (`POST /api/tracks/shadowing/analyze`) runs asynchronously afterward and caches in SQLite.
3. **Zero External Font or Render-Blocking Assets**
   - Native system font stacks (`SF Pro Display`, `SF Pro Text`, `SF Mono` via `design-tokens.css` — zero Google Fonts or external font CDN requests).

---

## 4. UI Architecture, Sidebar Governance & Brand System

- **Apple Liquid Glass & Tactile Design Tokens:** All styles consume [`design-tokens.css`](file:///Users/abdallah/workspace/flaptap/frontend/design-tokens.css) and [`apple-components.css`](file:///Users/abdallah/workspace/flaptap/frontend/apple-components.css) (`#F5F5F7` / `#FFFFFF` Light Mode, `#000000` / `#1C1C1E` OLED Dark Mode, `#0071E3` / `#0A84FF` accent).
- **Editorial Polish:** 1.5–1.75px stroke SVG icons everywhere — zero emojis, zero demo chips under inputs, zero purple AI gradients.
- **Localization & Bidi:** English (`en`, LTR) default UI with full `ar` (RTL), `es`, `fr`, `de`, `tr` support. Timestamp and IPA spans enforce `direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums`.
- **Studio Docking & Modes:** **Transcript** (`35%` video / `65%` canvas) and **Theater** (`65%` video / `35%` rail) docking, plus 5 client-side modes (`Shadow` | `Read` | `Listen` | `Coach` | `Notes`) switching in `0ms` without remounting the player.

### Sidebar Taxonomy, Naming & Brand Governance Law (Mandatory & Scalable)

Every AI agent modifying, renaming, or adding any workspace feature MUST follow this taxonomy and naming system so the sidebar stays cohesive, memorable, and scalable as Flaptap grows:

1. **Three-Pillar Scalable Category Architecture**
   - **Studio** *(Active Speaking & Drill Studios — sessions that open in `/studio`)*:
     - `Shadowing` (`/`, `lessons` — unified universal media ingest, upload, millisecond word playback, AI Verbatim Review, multi-speaker/ideas/raw views, Coach, translations & 7-format export) · `Dialogues` (`/dialogue`, `dialogue`) · `Phonetics` (`/pronunciation`, `pronunciation`)
   - **Lab** *(Phrase Extraction & Phrase Authoring Tools)*:
     - `Phrase Miner` (`/extractor`, `american-extractor`) · `Phrase Builder` (`/library`, `learning-library`)
   - **Workspace** *(Personal Memory, Progress, Cache & System Control)*:
     - `Vocabulary` (`/vocabulary`, `vocabulary`) · `Activity` (`/history`, `history`)
   - **Footer Control Dock:** Global system utilities (`AI Models` modal trigger + rail shortcut hint).
   - **Scaling Rule:** Place any new feature into the pillar matching its **primary user job** (`Studio` = live speaking practice, `Lab` = media/text processing & generation, `Workspace` = personal data, recall & settings). Only create a new category if a pillar grows beyond 4–5 items OR a feature introduces a fundamentally distinct domain (e.g., `Community` or `Curriculum`) with at least 2 sibling items — **never create a 1-item orphan group**.

2. **Brand Naming Contract (Short, Expressive, Parallel)**
   - **1–2 Words, ≤ 15 Characters:** Fits cleanly at `248px` desktop and `212px` tablet width without wrapping or truncation.
   - **Noun-First Functional Clarity:** Use concrete, memorable studio/tool nouns (`Shadowing`, `Dialogues`, `Phonetics`, `Phrase Miner`, `Phrase Builder`, `Vocabulary`, `Activity`).
   - **Forbidden Patterns:** Never use imperative CTA verbs (`Generate...`, `Create...`), marketing taglines (`Anything to...`), or ampersands (`X & Y`) in sidebar labels.
   - **Cross-Surface Parity:** The sidebar label, topbar breadcrumb, `<title>`, section `<h1>`, `I18N` translations, and collapsed `data-tooltip` MUST all use the same canonical name.

3. **Zero-FOUC Refresh & Sidebar State Integrity**
   - **Pre-Paint Hydration:** Static HTML in [`index.html`](file:///Users/abdallah/workspace/flaptap/frontend/index.html) MUST NOT hardcode `.active` on the first nav link or leave `#section-lessons` unhidden. Synchronous `<head>` + inline shell scripts resolve `data-sidebar="collapsed"`, active `.sidebar-nav-link`, and visible `<section>` before first paint so hard refreshes (`Cmd+R` / `F5`) never flash or jump focus to item #1.
   - **Focus & Scroll Preservation:** Route sync (`FlaptapRouter.updateDocumentAndChrome`) updates `.active` and `aria-current="page"` and calls `scrollIntoView({ block: 'nearest' })` on initial/popstate load without stealing `document.activeElement`. Keyboard navigation supports `ArrowUp`/`ArrowDown`/`Home`/`End` across links and `Cmd+B` rail toggle.
   - **Clean URL & Sub-Route Preservation:** All routes and sub-routes (`/feature`, `/feature/subview`, `/feature/:id`) MUST be registered in both [`frontend-routes.ts`](file:///Users/abdallah/workspace/flaptap/backend/src/core/config/frontend-routes.ts) and [`router.js`](file:///Users/abdallah/workspace/flaptap/frontend/router.js), preserving `docId`, `noteId`, and query params across refreshes and canonicalization. Always use root-relative asset paths (`/styles.css`, `/feature.js`).

4. **Modular Feature Encapsulation & Minimal Topbar**
   - Every feature lives in an isolated backend module (`backend/src/modules/<feature>/`) and isolated frontend module (`frontend/<feature>/`) talking to the shell solely via `FlaptapWorkspace`, `FlaptapRouter`, `FlaptapAiSelector`, and `FlaptapWordLookup` — never dump large feature code into `frontend/app.js`.
   - Primary navigation lives exclusively in `.app-sidebar`. Never add horizontal nav tabs into `.workspace-topbar` (reserved for mobile drawer trigger, contextual breadcrumb, and global utilities: streak, UI language, theme, install, account).

### Real Derived Completion Law

- **Zero Manual Completion Overrides:** Never add container-level "Mark Complete" buttons or toggles on multi-item learning entities (`Phrase Miner` guides, `Phrase Builder` items, `Shadowing`/`Dialogues`/`Phonetics` lessons, or `Activity` rows).
- **Strict Child Derivation:** A container is `Completed` (`done`) **if and only if** `totalItems > 0 && completedItems === totalItems` (`progress` when `completedItems > 0`, `new` when `0`). Backend repositories and frontend views must compute completion strictly from checked child items.

### Studio Layout Invariants

- **Independent Dual-Pane Desktop Scrolling (`> 768px`):** `.studio-body` locks to `100dvh` (`overflow: hidden`); `.studio-deck` and `.studio-canvas` scroll independently (`overflow-y: auto; overscroll-behavior: contain`) with `window.scrollY === 0`. Mobile (`<= 768px`) reverts to single-column document flow.
- **Theater Mode Grid Symmetry:** Under `data-layout="theater"` / `data-layout="focus"`, `.deck-controls-stack` uses a balanced 2-column grid (`grid-template-columns: 1fr 1fr; gap: 12px`): Row 1 (`Master Transport` + `Playback Speed`), Row 2 (`Voice Comparison` + `Sentence Flow`), Row 3 (`.translation-deck-panel`, `1 / -1`), Row 4 (`.shortcuts-strip`, `1 / -1`).

---

## 5. Verification & Hygiene

- Typecheck & build: `npm run build` (`cd backend && npm run build`)
- Offline timing unit suite: `npm run test:timing`
- Feature unit suites: `npm run test:extractor:unit` · `npm run test:shadowing:unit`
- Full production E2E suite: `npm run test:e2e`
- Never commit `.env`, API keys, `data/*.sqlite*`, or temporary artifacts.
