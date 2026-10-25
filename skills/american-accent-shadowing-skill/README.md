# 🎙️ American Accent Shadowing Skill (Universal AI Agent Skill)

A universal AI agent skill and phonetic framework to help non-native speakers master authentic American English, conversational slang, street vernacular, connected speech reductions, and natural cadence by shadowing YouTube content creators (tech, AI, podcasts, finance, self-improvement, etc.).

---

## 🌟 Key Capabilities

- **Zero-Cost Transcript Extraction:** Uses local `yt-dlp` to extract official and auto-generated English captions directly from any YouTube link without paid APIs or cloud dependencies.
- **Strict Verbatim Fidelity:** Preserves 100% of the creator's conversational patterns, contractions, and colloquialisms. Never rewrites into sanitized textbook English.
- **Intelligent ASR Error Correction:** Detects and fixes speech-to-text mishearings (homophones, garbled audio, technical names) without changing intentional spoken slang.
- **Visual Color-Coded Taxonomy:** High-contrast, theme-agnostic highlighting using native HTML `<mark>` tags that render immediately in any Obsidian vault.
- **Universal Portability:** Works in Google Antigravity, Claude Code, Cursor, Copilot, ChatGPT, or as a standalone Python CLI.

---

## 🎨 Color-Coded Shadowing Taxonomy

| Category | Icon & Swatch | Spoken Phenomenon | Purpose in Shadowing |
| :--- | :---: | :--- | :--- |
| **Slang & Street Talk** | <mark style="background-color: #FEF08A; color: #713F12; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟡 Yellow</mark> | Casual idioms, modern internet slang, street expressions | Sound natural, modern, and effortless |
| **Native Expressions** | <mark style="background-color: #E9D5FF; color: #581C87; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟣 Lavender</mark> | Everyday collocations, turns of phrase, podcast idioms | Build chunked memory for fluent phrasing |
| **Connected Speech** | <mark style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔵 Sky Blue</mark> | Reductions (`gonna`, `wanna`), Flap-T, elisions, dropped consonants | Retrain mouth muscles for American rhythm |
| **Rhythm & Fillers** | <mark style="background-color: #A7F3D0; color: #064E3B; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟢 Mint Green</mark> | Discourse glues (`like`, `you know`, `I mean`, `honestly`) | Master American conversational pacing |
| **Pitch & Emphasis** | <mark style="background-color: #FED7AA; color: #7C2D12; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟠 Peach Orange</mark> | Contrastive word stress, dramatic punches, pitch spikes | Eliminate robotic, flat-pitch delivery |
| **ASR Error Fixes** | <mark style="background-color: #FECDD3; color: #881337; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔴 Light Rose</mark> | Corrected YouTube speech recognition mistakes | Train on 100% accurate words |

---

## 📁 Repository Structure

```text
/Users/abdallah/workspace/american-accent-shadowing-skill/
├── SKILL.md                              # Main agent skill definition (Antigravity / Cursor / Claude Code)
├── SYSTEM_PROMPT.md                      # Copy-paste system prompt for web LLMs (ChatGPT, Claude.ai, Gemini)
├── README.md                             # Documentation and setup guide
├── scripts/
│   ├── extract_transcript.py             # CLI tool to download and parse YouTube captions into timed chunks
│   └── generate_obsidian_note.py         # Automated CLI generator creating Obsidian markdown scaffolding
├── templates/
│   ├── obsidian_shadowing_template.md    # Standard Obsidian note template with callouts and legends
│   └── shadowing-highlights.css          # Optional Obsidian CSS snippet for custom theme support
├── references/
│   ├── color_taxonomy.md                 # Complete linguistic definition of each color category
│   └── american_phonetics_guide.md       # Mechanics of Flap-T, Glottal Stop, Contractions & Schwa
└── examples/
    ├── example_tech_shadowing_note.md    # Full production-grade Obsidian note example (Programming with Mosh)
    └── raw_sample.txt                    # Raw timed transcript extracted from a real YouTube video
```

---

## 🚀 How to Use

### Method 1: In Antigravity or Coding AI Agents
1. Link or copy this directory into your agent's customization directory (e.g. `~/.gemini/config/skills/american-accent-shadowing` or your workspace `.agents/skills/`).
2. Provide any YouTube URL in your prompt:
   > *"Shadow this video for American slang and connected speech: https://www.youtube.com/watch?v=..."*
3. The agent activates this skill, extracts the transcript, corrects ASR errors, applies color highlights, and outputs your Obsidian note.

### Method 2: In Web AI Models (ChatGPT, Claude, Gemini Web)
1. Open [`SYSTEM_PROMPT.md`](./SYSTEM_PROMPT.md).
2. Copy the text into the system instructions or as the first message.
3. Paste your YouTube transcript or link and let the model generate the note.

### Method 3: Standalone Python CLI
Run the automated script to generate an Obsidian note directly:
```bash
python3 scripts/generate_obsidian_note.py "https://www.youtube.com/watch?v=kqtD5dpn9C8" --output "Python_Shadowing_Note.md"
```

---

## ⚙️ Technology Stack & API Requirements

### 1. Paid APIs or Third-Party Accounts
- **Paid APIs Required:** **NONE ($0.00).**
- No OpenAI Whisper API, no Google Cloud Speech API, and no YouTube Data API key needed.

### 2. Technologies Used
| Technology | Role | Licensing / Cost |
| :--- | :--- | :--- |
| **`yt-dlp`** | Fetches subtitles, metadata, and auto-captions directly from YouTube | Open Source (Free) |
| **`python3`** | Parses VTT/SRT, deduplicates rolling karaoke lines, groups into timed chunks | Built-in (Free) |
| **Any LLM** (Gemini / Claude / GPT / Llama) | Linguistic classification, ASR error detection, expression matrix | Portable across any model |
| **Obsidian Markdown + HTML5 `<mark>`** | Native rendering with zero plugins required | Open Standard (Free) |
