---
name: american-accent-shadowing
description: >-
  Extracts verbatim transcripts from YouTube video links and generates visually
  appealing, color-coded Obsidian notes for American accent shadowing. Highlights
  American slang, native idioms, connected speech reductions, conversational fillers,
  and pitch emphasis while fixing only transcription errors to preserve the creator's
  authentic spoken rhythm and vocabulary.
---

# 🎙️ American Accent Shadowing Skill

Use this skill whenever a user provides a YouTube video URL and wants to shadow the creator's American accent, learn authentic American slang, master connected speech, or prepare for YouTube content creation.

---

## 🎯 Core Purpose & Philosophy

1. **Target Dialect:** General American (conversational, tech, podcast, financial, self-improvement).
2. **Absolute Verbatim Fidelity:**
   - **DO NOT** edit, polish, or sanitize the creator's grammar or sentence structure.
   - If the creator says *"ain't gonna happen"*, keep *"ain't gonna happen"*.
   - If the creator drops prepositions or uses informal street slang, preserve every single word.
3. **Intelligence-Driven ASR Error Correction:**
   - Automatic speech recognition (ASR) frequently makes homophone or domain mishearings (e.g. *"carrot"* instead of *"caret"*, *"pie thon"* instead of *"Python"*, *"could of"* instead of *"could've"*).
   - Correct **only** genuine ASR mishearings so the user never trains on garbled speech.
   - Mark every corrected word in <mark style="background-color: #FECDD3; color: #881337; padding: 2px 5px; border-radius: 4px;">🔴 Light Rose</mark>.
4. **Color-Coded Visual Highlighting:**
   - Color-code every target speech phenomenon directly inside the transcript using inline HTML `<mark>` tags (ensuring it renders with zero required plugins across all Obsidian vaults and themes).

---

## 🎨 The 6-Color Shadowing Taxonomy

Every generated Obsidian note must include this visual legend at the top:

| Category | Icon & Color Badge | Spoken Phenomenon | Examples |
| :--- | :---: | :--- | :--- |
| **Slang & Street Talk** | <mark style="background-color: #FEF08A; color: #713F12; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟡 Yellow</mark> | Casual idioms, modern internet slang, colloquial street expressions | *"no cap"*, *"lit"*, *"lowkey"*, *"deadass"*, *"bussin"*, *"game changer"*, *"rip-off"* |
| **Native Expressions** | <mark style="background-color: #E9D5FF; color: #581C87; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟣 Lavender</mark> | Natural collocations, American turns of phrase, business/podcast idioms | *"at the end of the day"*, *"take it with a grain of salt"*, *"ballpark estimate"*, *"touch base"* |
| **Connected Speech** | <mark style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔵 Sky Blue</mark> | Phonetic reductions, contractions, flap-T, elisions, dropped consonants | *"gonna"*, *"wanna"*, *"gotta"*, *"lemme"*, *"coulda"*, *"whaddya"*, Flap-T (*"better"* -> *[bedder]*), Dropped G's (*"runnin'"*) |
| **Rhythm & Fillers** | <mark style="background-color: #A7F3D0; color: #064E3B; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟢 Mint Green</mark> | Natural conversational glues, pacing markers, hesitation particles | *"like"*, *"you know"*, *"honestly"*, *"I mean"*, *"literally"*, *"to be fair"*, *"right?"* |
| **Pitch & Emphasis** | <mark style="background-color: #FED7AA; color: #7C2D12; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟠 Peach Orange</mark> | Contrastive word stress, dramatic pitch peaks, emotional punches | Stressed key words (*"ABSOLUTELY"*, *"THAT is the real issue"*), pitch resets |
| **ASR Error Fixes** | <mark style="background-color: #FECDD3; color: #881337; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔴 Light Rose</mark> | Corrected YouTube speech recognition mistakes | Fixes homophones, audio glitches, or garbled tech names while preserving the speaker's true words |

---

## 🛠️ Step-by-Step Execution Workflow for AI Agents

When given a YouTube video link:

### Step 1: Extract Raw Verbatim Subtitles
Execute the local helper script:
```bash
/Users/abdallah/workspace/american-accent-shadowing-skill/scripts/extract_transcript.py "<YOUTUBE_URL>" --interval 35 --output-json transcript.json --output-txt transcript.txt
```
This downloads the official or auto-generated English captions via `yt-dlp`, strips karaoke duplicate lines, and packages speech into timed 30–45 second intervals.

### Step 2: Intelligent Verbatim Analysis & Error Correction
Read the extracted text. As an intelligent agent:
1. **Identify ASR Errors:** Spot words where speech recognition misheard acoustic homophones (e.g., *"pie thon"* -> *"Python"*, *"carrot"* -> *"caret"*, *"then"* vs *"than"*, numbers transcribed as letters).
2. **Preserve Spoken Non-Standard Forms:** If the creator literally articulated *"kinda"*, *"ain't"*, or an informal phrase, DO NOT "fix" it into formal English.

### Step 3: Color-Code the Transcript
For each timestamped interval (e.g., `[00:00:02 - 00:00:45]`):
Apply the appropriate inline HTML `<mark>` tags:
- Slang: `<mark class="shadow-slang" style="background-color: #FEF08A; color: #713F12; padding: 2px 6px; border-radius: 4px;">slang_word</mark>`
- Idiom: `<mark class="shadow-idiom" style="background-color: #E9D5FF; color: #581C87; padding: 2px 6px; border-radius: 4px;">native_expression</mark>`
- Reduction: `<mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 6px; border-radius: 4px;">reduced_phrase</mark>`
- Filler: `<mark class="shadow-filler" style="background-color: #A7F3D0; color: #064E3B; padding: 2px 6px; border-radius: 4px;">filler_word</mark>`
- Stress: `<mark class="shadow-stress" style="background-color: #FED7AA; color: #7C2D12; padding: 2px 6px; border-radius: 4px;">STRESSED_WORD</mark>`
- ASR Fix: `<mark class="shadow-correction" style="background-color: #FECDD3; color: #881337; padding: 2px 6px; border-radius: 4px;" title="Corrected transcription error">corrected_word</mark>`

### Step 4: Generate Linguistic Breakdown Tables
Create dedicated drill tables:
1. **Slang & Street Talk Table:** Meaning, delivery vibe, context.
2. **Native Expressions Table:** Literal vs conversational meaning, why natives use it.
3. **Connected Speech Table:** Written text vs spoken sound (IPA), mouth/tongue mechanics (flap-T, schwa, contractions).
4. **ASR Corrections Log:** Timestamp, wrong caption, corrected spoken word, reason.

### Step 5: Deliver the Obsidian Note
Write the final note using the structure in:
`templates/obsidian_shadowing_template.md`.
The note must be directly usable in any Obsidian vault without requiring manual adjustments.

---

## 📋 Quality Verification Checklist

Before presenting the note to the user, verify:
- [ ] **No grammatical homogenization:** Creator's natural cadence and colloquialisms are preserved 100%.
- [ ] **No hallucinated speech:** The text mirrors the creator's actual words from the video.
- [ ] **All 6 categories represented:** Legend clearly displayed at the top.
- [ ] **Accessible color contrast:** Every highlight uses dark, legible text against soft pastel backgrounds.
- [ ] **Zero paid APIs used:** Extraction performed locally and free of charge via `yt-dlp`.
