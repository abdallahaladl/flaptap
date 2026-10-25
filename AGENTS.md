# 🤖 Flaptap AI — Architectural Constitution & Agentic Directives (`AGENTS.md`)

> **MANDATORY CONSTITUTIONAL LAW FOR FLAPTAP AI:**
> All cognitive intelligence, linguistic judgment, and creative synthesis must be executed exclusively by the **AI Agent / LLM**. Programmatic code is strictly prohibited from attempting to replicate cognitive intelligence through static heuristics, hardcoded templates, or regex ladders.

---

## 1. The Agent-First Cognitive Supremacy Principle

1. **The AI Agent is the Sole Cognitive Actor**:
   Every platform function requiring semantic comprehension, linguistic taxonomy, intonation grouping, sentence thought-unit segmentation, pronunciation mechanics, and dialect translation MUST be delegated directly to the active **AI Agent** (`Antigravity 2.0 / Gemini Flash High`).
2. **Absolute Elimination of "Dumb" Code & Static Templates**:
   - **Prohibited**: Hardcoded dialogue dictionaries, static switch cases for scenario topics, arbitrary word-counting loops, and rigid paragraph slicing heuristics.
   - **Mandated**: Send the raw input/topic to the AI Agent via structured prompts, and have the AI Agent return the dynamic, highly contextualized linguistic data in structured JSON.
3. **Programmatic Code is Plumbing Only**:
   Application code (TypeScript / NestJS / Python / JavaScript) is strictly confined to mechanical, non-cognitive infrastructure:
   - File I/O and persistent database updates (`history.json`).
   - Network routing, HTTP endpoints, and WebSockets.
   - Audio capture via `MediaRecorder` and YouTube IFrame playback control.
   - DOM element rendering, bidirectional (RTL/LTR) styling, and reactive state propagation.

---

## 2. Active AI Agent & Model Specifications

- **Primary Agent Engine**: **Google Antigravity 2.0 (`agy`)**
- **Default Cognitive Model**: **Gemini Flash (Gemini 2.5 / 3.8 Flash High)**
  - Configured for high-speed, sub-second latency, and zero-hallucination structured JSON output.
  - Optimized for natural American English prosody, phonetic IPA mechanics, and modern street slang nuance.
- **Secondary Multi-Agent Adapters**:
  - Claude Code (`Anthropic Claude 3.7 Sonnet / Haiku`)
  - OpenAI Codex CLI (`GPT-4o / o3-mini`)
  - OpenCode Interpreter (`Local / vLLM`)
- **Fast Vernacular Fallback**: `allam-2-7b` (optimized for 22 spoken Arabic vernaculars with zero hidden reasoning overhead).

---

## 3. Cognitive Function Registry & Agent Prompt Contracts

| Cognitive Task | AI Agent Responsibility | Programmatic Role (Plumbing Only) |
| :--- | :--- | :--- |
| **Sentence Thought-Unit Segmentation** | Analyzes breath groups, clause boundaries, and natural spoken cadences (4–11 words) without dangling prepositions. | Computes millisecond seek ranges and renders drill cards. |
| **Real-World Vernacular Translation** | Synthesizes authentic spoken colloquial phrasing (22 Arab dialects + English accents), preserving technical loanwords in English script. | Injects translations into DOM cards and manages client caching. |
| **Street Talk & Slang Generation** | Authors authentic, unscripted urban dialogues with contextual slang and connected speech phenomena. | Stores generated session in database and renders interactive tables. |
| **Phonetics & Mouth Mechanics** | Authors precise tongue placement, jaw opening, and IPA acoustic mechanics (Flap-T, Glottal Stop, Dark-L, TH). | Dispatches drill matrices and coordinates playback loop. |
| **Linguistic & ASR Error Audit** | Scans speech for real-world acoustic homophones, reductions, and intonational stress peaks. | Highlights detected tokens in the transcript DOM. |

---

## 4. Linguistic Directives for Cognitive Skills

### A. Thought-Unit Segmentation Law
- **Complete Short Sentences**: Grammatically complete sentences or questions must remain intact as single items. Never split a verb from its prepositional complement (*"Should human beings remain in control of planet Earth?"* must NEVER be cut in half).
- **Atomic Breath Units**: Typical shadowing length is 4 to 12 words (2.0s to 6.5s).
- **Zero Verbatim Alteration**: The exact spoken words in exact order must be preserved 100%.

### B. Vernacular Translation Directives
- **Spoken Vernacular Only**: Absolutely no literal, academic, or stiff textbook translations.
- **Default Dialects**:
  - Arabic: **Egyptian Arabic (`ar-EG` 🇪🇬)** as top default.
  - English: **US English (`en-US` 🇺🇸 - General American)** as top default.
- **Loanword Preservation**: All technical, software, computing, and startup terms MUST remain in English script enclosed in `<bdi class="tech-loanword" dir="ltr">term</bdi>` so mixed RTL/LTR flows flawlessly.

### C. Acoustic Boundaries Law
- Sentence start seek lead-in is clamped to `-0.05s` (50ms buffer) to capture initial plosive consonants without preceding audio.
- Sentence end drill cutoff is locked to `+0.02s` (20ms tail) to eliminate audio bleeding into subsequent sentences.

---

## 5. Developer & Contributor Enforcement

- **Never** add hardcoded string switch-statements to simulate AI intelligence.
- **Never** commit API keys, `.env` files, or credentials to version control.
- **Never** bypass the Agent Adapter layer to serve mock heuristic data for cognitive tracks.
- Always implement new features by defining an Agent Prompt Contract in the adapter and consuming the structured AI Agent response.
