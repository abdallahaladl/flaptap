# Flaptap — Feature Inventory, Architecture Audit & UX Baseline

> Generated before any code changes on branch `refactor/ux-cleanup` (baseline tag: `pre-refactor`, audited live at `http://localhost:3344` across desktop `1440×900` Light/Dark and mobile `390×844`).

---

## 1. Routes, Navigation & Feature Inventory

All workspace pages share `frontend/index.html` and `frontend/router.js` (`FlaptapRouter`), registered in `backend/src/core/config/frontend-routes.ts`. The interactive player lives in `frontend/studio.html` (`/studio`, `/studio.html`).

### Sidebar Group 1: `Studio`

| Feature | Canonical Route | Aliases / Sub-routes | How to Reach | Core Capabilities & Options |
| :--- | :--- | :--- | :--- | :--- |
| **Video Lessons** | `/` | `/lessons`, `/index.html` | Sidebar `Studio → Lessons`, brand logo | Paste video URL (YouTube, TikTok, Instagram Reels, X/Twitter, Vimeo, TED, Loom, Direct Video); `Paste` & `Clear` capsule actions; instant local cache detection banner (`#url-cache-banner`) with `Open cached` + `Force re-extract`; 4 Bento KPI stats (`Lessons in Library`, `Lessons Completed`, `Saved Vocabulary`, `Practice Minutes`); `Lesson Library` filter tabs (`All`, `Videos`, `Dialogues`, `Pronunciation`), search, completion progress bar, lesson cards with checkable completion, open in Studio, delete. Signed-out gate card. |
| **Conversational Dialogue** | `/dialogue` | — | Sidebar `Studio → Dialogue` | Scenario prompt form (`#dialogue-form`) generating AI spoken dialogue lessons (opens in Studio); `Your Dialogues` shelf with count, completion progress bar, lesson cards, empty state. |
| **Pronunciation Lab** | `/pronunciation` | — | Sidebar `Studio → Pronunciation` | Articulatory target prompt form (`#pronunciation-form`) generating AI pronunciation workouts (opens in Studio); `Your Pronunciation Workouts` shelf with count, completion progress bar, lesson cards, empty state. |
| **Interactive Studio** | `/studio?id=<id>` | `/studio.html?id=<id>` | Click any Lesson, Dialogue, or Pronunciation card (or after generation) | Dual-pane viewport-locked workspace (Media Deck + Learning Canvas); Docking layouts (`Transcript` side-by-side vs `Theater` 65/35 with 2-col under-video grid); 5 Learning Modes (`Shadow`, `Read`, `Listen` dictation cloze, `Coach` dynamic AI connected speech/expressions/vocab, `Notes` auto-saved to SQLite); Master transport, speed (`0.5x–1.5x`), sentence flow/loop, voice recorder & comparison, 170+ world-language translation console (per-sentence + Translate All + permanent cache), click-any-word contextual lookup popover, complete drill & streak logging, Markdown export. |

### Sidebar Group 2: `Knowledge`

| Feature | Canonical Route | Aliases / Sub-routes | How to Reach | Core Capabilities & Options |
| :--- | :--- | :--- | :--- | :--- |
| **Learning Library** | `/library` | `/learning-library`, `/library/browse` (`?domain=...`) | Sidebar `Knowledge → Learning Library` | 3 selectable domains (`Natural American English`, `Technical Vocabulary`, `Programming Terminology`); optional situation/topic prompt; item count presets (`3, 5, 8, 12, 20` + custom 1–25); Category, Register, Meaning language (170+ languages) selectors; compact `FlaptapAiSelector`; streaming generation progress card with cancel; 4-stat telemetry strip; Library toolbar (`All`, `To Study`, `Completed`, `Favorites`, Category/Register/Sort filters, Search, `Recall` hide-meaning toggle, `Table`/`Cards` view toggle, overflow menu: Export `.md`, Export `.json`, Clear Domain Library); Slide-over Study Detail Drawer (`Prev`/`Next`, notes, mastery, favorite, audio TTS). |
| **Tech Lexicon** | `/lexicon` | `/tech-lexicon`, `/tech-linguist`, `/lexicon/library`, `/lexicon/note/:id` | Sidebar `Knowledge → Tech Lexicon` | Sub-views (`Extractor Studio`, `Active Study Note`, `Study Library`); Input source tabs (`YouTube / Media URL` + `Paste`, `Raw Transcript / Notes`); Quick sample chips (`NYC Tech Boom`, `Grok 4.7 Regression`); Extraction Mode radio cards (`Full Studio Lexicon` 4-Tab vs `Native Elite` 2-Tab Zero Duplicates); full `FlaptapAiSelector`; 4-step pipeline progress indicator; Recent Study Notes strip; Study Note reader (click-any-word lookup, target language picker, copy/export Markdown, 2-tab or 4-tab view, completion checks); Study Library search & management. |
| **Phrase Lens** *(American English Extractor)* | `/extractor` | `/american-extractor`, `/american-english`, `/extractor/library`, `/extractor/note/:id` | Sidebar `Knowledge → Phrase Lens` | Sub-views (`Capture`, `Library`, `Study Guide`); 3 input sources (`Link` URL + Paste for video/articles/audio, `Text` textarea + word counter + optional title + import from Saved Lesson dropdown, `File` drag/drop <=50 MB for `.txt/.md/.srt/.vtt/.json`, screenshots/images OCR, audio/video transcription); `Options` (`Type`, `Level` A1–C2, `Translate` 170+ languages) + expandable `Customize` (`Style`, `Focus`, `Depth`, `Goal`, `Order`, `Reset`); `FlaptapAiSelector`; Recent Guides shelf; Interactive Study Guide reader (filters, recall toggle, word lookup, completion checks, TTS, export `.md`/`.json`, selectable source text panel); Saved Guides Library. |
| **Vocabulary Vault** | `/vocabulary` | `/vocabulary?view=flashcards&filter=...` | Sidebar `Knowledge → Vocabulary` | Filter tabs (`All`, `Due for Review`, `Mastered`); Search saved words; `Practice Flashcards` spaced active-recall deck (`Review Soon` / `Got It` / `Easy`, completion toggle, general + contextual senses); progress bar; Vocabulary grid with IPA, context, TTS, delete, mastery badges; signed-out gate card. |

### Sidebar Group 3: `Workspace` & Global Chrome

| Feature | Route / Location | How to Reach | Core Capabilities & Options |
| :--- | :--- | :--- | :--- |
| **History & Usage** | `/history` (`?track=...&cache=...`) | Sidebar `Workspace → History & Usage` | Refresh usage; Export full account backup (`.json`); 3 overview cards (`Daily Practice Goal` with 10m–60m quick target pills, `Library & Recall Breakdown`, `Cache & Storage Footprint`); Global Cache & Data Controls (Clear translations / AI Coach / transcripts / all caches, Clear Vocabulary, Delete All Lessons); `Lesson History & Per-Item Cache Manager` (track filter, cache-state filter, sort, search, multi-select bulk cache clear / reset progress / delete); `Practice Activity Timeline` (clear log). |
| **Left Primary Sidebar** | Global shell | Always visible on desktop (`Cmd+B` collapse) / Hamburger drawer on `<=960px` | Brand mark, grouped links with live count badges (`#nav-ll-badge`, `#nav-vocab-badge`), footer `AI Keys & Models` button opening BYOK vault modal. |
| **Minimal Topbar** | Global shell | Fixed top strip | Mobile menu button, sidebar collapse toggle, contextual breadcrumb (`Group / Page / Subview`), practice streak pill, UI language selector (`EN, AR, ES, FR, DE, TR`), Light/Dark theme toggle, PWA install button, Account button (`Sign in` or user pill). |
| **Account & Security Drawer** | Slide-over modal | Topbar Account button (or auto-opened by auth gate) | Guest view: Auth gate banner, `Sign in` / `Create account` tabs (email, password, translation language), auto-resumes pending action. Authenticated view: Profile card, Full name / Default translation language / Daily practice goal form, Password & Security change form, Active Sessions list + revoke others, Sign out, Delete account & all data. |
| **AI Provider Keys Modal (BYOK)** | Global modal | Sidebar `AI Keys & Models` or `+ API Keys` inside any `FlaptapAiSelector` | List active system & user encrypted keys (masked preview, default badge, delete), Add API Key form (Provider preset, custom label, optional custom Base URL, API key secret, set default, live verification via `/models`). |
| **Word Lookup & Selection Popover** | Global floating component | Click any word or highlight any phrase in Studio, Tech Lexicon, Phrase Lens, Learning Library | Floating selection action bar (Define / Speak / Copy), contextual AI definition popover with IPA, part of speech, general vs in-context translation, examples, audio TTS, one-click Save to Vocabulary Vault. |

---

## 2. Shared Components, Utilities & Settings Map

| Asset / Module | Role | Current Consumers |
| :--- | :--- | :--- |
| `frontend/router.js` (`FlaptapRouter`) | SPA History API router, route aliases, sub-route sync, breadcrumbs, sidebar collapse, mobile drawer | `app.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js` |
| `frontend/icon.js` (`FlaptapIcon`) + `frontend/icons.svg` | SVG sprite renderer | `app.js`, `studio.js`, `learning-library.js`, `word-lookup.js`, `copy.js` |
| `frontend/copy.js` (`FlaptapCopy`) | Delegated clipboard copy button + flash confirmation | `app.js`, `studio.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js` |
| `frontend/word-lookup.js` (`FlaptapWordLookup`) | Click/selection word lookup popover, TTS `speakText`, Vocabulary save sync | `studio.js`, `tech-lexicon.js`, `american-extractor.js`, `learning-library.js` |
| `frontend/ai-provider-selector.js` (`FlaptapAiSelector`) | Shared direct API provider/model/thinking picker + BYOK modal | `learning-library.js`, `tech-lexicon.js`, `american-extractor.js`, `app.js` (sidebar button) |
| `frontend/tech-lexicon-modes.js` | Pure extraction mode helpers (`comprehensive` vs `advanced_native`) | `tech-lexicon.js`, `scripts/test_tech_linguist_modes_unit.js` |
| `localStorage` settings | `flaptap_theme`, `flaptap_ui_lang`, `flaptap_sidebar_collapsed`, `flaptap_guest_token`, `flaptap_ai_sel_*` | Initialized inline in `index.html`/`studio.html`, managed in `app.js`/`router.js`/`ai-provider-selector.js` |

---

## 3. Duplicated / Overlapping Code, Features & Options

### A. Code & Utility Duplication (JS)
1. **`escapeHtml` duplicated 6 times** (`app.js`, `studio.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js`, `ai-provider-selector.js`) + `escapeText` in `word-lookup.js` + `escapeAttribute` in `copy.js`/`icon.js`.
2. **`apiFetch` / `defaultFetcher` duplicated 6 times** across `app.js`, `studio.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js`, and `ai-provider-selector.js` — each separately attaching auth/guest headers and parsing JSON errors.
3. **`showToast` duplicated 5 times** (`app.js`, `studio.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js`).
4. **Clipboard paste + Blob file download** duplicated across `app.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js`, `studio.js`.
5. **World language list population** duplicated across `app.js` (`reg-native-lang`, `pref-native-lang`), `learning-library.js` (`ll-target-lang-select`), `american-extractor.js` (`aex-language-select`), `tech-lexicon.js` (`lexicon-lookup-lang`), and `studio.js`.
6. **Direct `speechSynthesis` boilerplate** duplicated in `studio.js` instead of sharing `FlaptapWordLookup.speakText` / a shared speech utility.

### B. CSS Design Token & Style Duplication
1. **Fragmented dual design systems:**
   - Old **Paper & Vox** (`styles.css` 6,291 lines + `learning-library.css` 1,561 lines): `#F6F4EE` newsprint, `#FFF04B` yellow highlighter, Georgia serif, black box shadows, paper grain `body::before`.
   - Approved **Apple Design Language** duplicated across 3 isolated files with repeated `--ap-*` token blocks and hacky `body:has(#section-*:not([hidden]))` overrides:
     - `lessons-apple.css` (1,348 lines, scoped to `#section-lessons`)
     - `studio-apple.css` (2,909 lines, scoped to `studio.html`)
     - `american-extractor.css` (3,038 lines, scoped to `#section-american-extractor`, including duplicate shell overrides!)
2. **Resulting visual breakage:** App Shell (sidebar, topbar, user pill, Account Drawer, AI Keys Modal, Toasts, Word Lookup) and 6 of 8 sections still render Paper/Vox; switching between `/` → `/extractor` → `/library` causes the entire sidebar, topbar, background color, font family, and button color to flash between Apple Blue/SF Pro and Paper/Yellow/Georgia!

### C. Overlapping Features, Controls & Disconnected Flows
1. **Disconnected Settings & Data Management:**
   - Account preferences & sessions live in the topbar **Account Drawer** (`#account-drawer-backdrop`),
   - **AI Keys & Models** lives in a separate sidebar footer modal (`#sidebar-ai-keys-btn`),
   - **Full Account JSON Export** & **Daily Practice Goal quick targets** live on `/history` (`#export-account-json-btn`, `#quick-goal-pills`).
   - Account Drawer has no tabs, lacks quick links to AI Keys and Account Export, displays raw `User-Agent` strings in Active Sessions, and styles `Delete account & all data` identically to `Sign out`.
2. **Inconsistent `FlaptapAiSelector` across Knowledge tools:**
   - `Learning Library` uses compact unlabeled labels (`Provider / Model / Thinking`) with wrapping dropdowns; `Tech Lexicon` uses numbered labels (`1. Provider / API Key`) and duplicates `Mode:` twice in the footer (`Mode: Full Studio (4-Tab) ... Mode: Live Direct API`); `Phrase Lens` defaults to `Balanced` instead of `Fast` and clips long provider names near the chevron.
   - BYOK Modal (`#ft-ai-keys-modal-backdrop`) references `.ll-select-field` and `.ll-input-field` classes that aren't defined in `styles.css`, leaving `<select>` and `<input>` raw/unstyled!
3. **Duplicated Lesson Shelves & Navigation Friction:**
   - `/` (Lessons) shows ALL lessons (`All`, `Videos`, `Dialogues`, `Pronunciation`), while `/dialogue` and `/pronunciation` repeat bare single-input forms with no quick starter prompts or shared hero rhythm, and `/history` duplicates the same lesson track filter tabs.
   - `/library/browse` renders the exact same page as `/library` and scrolls halfway down the hero rather than cleanly focusing the library view; Programming Terminology stat card says `SAVED EXPRESSIONS` instead of matching the domain noun.
   - `Tech Lexicon` and `Phrase Lens` are both content extractors in `Knowledge` with slightly different visual layouts, tab styles, and empty states (`/lexicon/library` shows `"Try a different search query"` even when the search input is empty).
   - `Vocabulary Vault` mentions `"save expressions from the Coach tab"` and disables `Practice Flashcards` without clarifying why or linking directly to study tools.
4. **Specific Baseline UI Bugs Identified in Live Audit:**
   - **Theme toggle icon stuck on Moon in Dark Mode** (`svg` display rule overrides `[hidden]` attribute on `#theme-icon-sun` / `#theme-icon-moon`).
   - **Scroll position not reset on route change** (switching sidebar routes leaves viewport scrolled down).
   - **`History & Usage` layout breaks:** `Target: 10m 15m 30m 45m 60m` pill strip overflows right border of `Daily Practice Goal` card; metric values wrap awkwardly onto 2 lines; 4 global cache-clear buttons and 3 bulk action buttons are icon-only without visible labels.
   - **`Phrase Lens` Customize grid orphan:** `Order` sits alone on row 3 when `Customize` is expanded.
   - **Mobile `EN ▾` select alignment:** Text pinned to top edge on `/` and `/library` (fixed on `/extractor`).
   - **`test_production_e2e.js` nav assertion drift:** E2E test still checked for 7 sidebar nav items while 8 exist (`american-extractor` was added).

---

## 4. Refactor & Design Unification Strategy

1. **Extract Shared Core Utilities (`frontend/shared-utils.js`):**
   - Single authoritative `FlaptapUtils` module providing `escapeHtml`, `escapeAttr`, `apiFetch`, `showToast`, `readClipboardText`, `downloadBlob`, `formatBytes`, `formatRelativeDate`, `parseUserAgent`, and `speakText` fallback.
   - Migrate `app.js`, `studio.js`, `ai-provider-selector.js`, `learning-library.js`, `tech-lexicon.js`, `american-extractor.js` to consume `FlaptapUtils` — deleting all duplicated helper definitions.
2. **Extract Approved Apple Design System (`frontend/design-tokens.css`):**
   - Promote the approved Apple Design Language tokens (`--ap-*` colors, SF Pro typography scale, radii, shadows, glass surfaces, spacing, motion curves, semantic tints) from `lessons-apple.css` into a single global `frontend/design-tokens.css` loaded first on BOTH `index.html` and `studio.html`.
   - Map all legacy base variables (`--bg-paper`, `--bg-sheet`, `--ink`, `--vox-yellow`, `--font-serif`, etc.) cleanly onto Apple tokens so ZERO pages or components can fall back to old cream/yellow/Georgia styles.
   - Define reusable Apple component primitives in `design-tokens.css`: App Shell (frosted Liquid Glass sidebar + topbar, Apple Blue active nav pill, centered `EN` pill select, theme toggle icon fix, Apple account button), Hero Desk (`editorial-desk`), Spotlight Command Capsule (`.command-form`), Pill CTAs (`.btn-vox` / `.btn-primary` / `.btn-secondary` / `.btn-danger-ghost`), Bento Stat Cards (`.telemetry-strip`), Segmented Controls (`.filter-pills`), Form Controls (`.field-input`, `.ll-input-field`, `.ll-select-field`, `.search-box`), Slide-over Drawers & Modals (Account Drawer, BYOK Modal, Study Drawer), Progress Bars, Empty/Gate Cards, and Toasts.
   - Strip all duplicated `--ap-*` token blocks and `body:has(...)` shell hacks from `lessons-apple.css`, `american-extractor.css`, and `studio-apple.css`, and update `learning-library.css` & `styles.css` to consume `design-tokens.css` exclusively.
3. **UX & Flow Polish Across Every Section:**
   - **Navigation & Route Polish:** Keep all 8 routes + legacy aliases/redirects intact, organize sidebar cleanly (`Studio`: Lessons, Dialogue, Pronunciation · `Knowledge`: Phrase Lens, Tech Lexicon, Learning Library, Vocabulary · `Workspace`: History & Usage), reset scroll to top on top-level route switches, add direct cross-links between related workflows (e.g., Account Drawer ↔ AI Keys & Account Export; Vocabulary empty state ↔ Studio/Knowledge tools; Dialogue/Pronunciation quick starter inspiration links or clean Apple command capsules matching Lessons).
   - **Unified `FlaptapAiSelector`:** Consistent Apple styling, fixed label alignment, no clipped provider text, fix duplicate `Mode:` footer bug, consistent default preset alignment, clean BYOK modal styling.
   - **History & Usage Fix:** Responsive flex-wrap target pills (zero overflow), `white-space: nowrap` on metric values, clear text+icon labels on Global Cache & Bulk Action buttons.
   - **Account Drawer Upgrade:** Tabbed sections (`Profile`, `Security & Sessions`, `Workspace & Keys`) or crisp Apple grouped cards with parsed browser/OS session labels, quick links to AI Provider Keys & Account JSON Backup, and clearly styled destructive `Delete account & all data` danger zone.
   - **Detail Fixes:** Dynamic domain noun in Learning Library stat card, clean `/library/browse` focus behavior, empty-state copy fix in Tech Lexicon library, 2-column balanced Customize grid in Phrase Lens, theme toggle SVG `[hidden]` fix, centered mobile `EN` select everywhere.
