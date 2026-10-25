#!/usr/bin/env python3
"""
generate_obsidian_note.py
Takes a YouTube URL, pulls verbatim subtitles, formats timestamped intervals,
and writes an Obsidian-ready markdown note with scaffolding for accent shadowing.

Usage:
    python3 generate_obsidian_note.py "<YOUTUBE_URL>" --output "<OUTPUT_NOTE_PATH>"
"""

import sys
import os
import argparse
from datetime import datetime
from extract_transcript import fetch_youtube_transcript

def build_obsidian_scaffold(data: dict) -> str:
    title = data.get("title", "YouTube Speech Shadowing")
    creator = data.get("creator", "Content Creator")
    url = data.get("url", "")
    duration_sec = data.get("duration_seconds", 0)
    minutes = duration_sec // 60
    today = datetime.now().strftime("%Y-%m-%d")

    # Estimate words per minute
    total_words = len(data.get("full_raw_transcript", "").split())
    wpm = int(total_words / (minutes if minutes > 0 else 1)) if minutes > 0 else 140

    md = []
    # Frontmatter
    md.append("---")
    md.append(f'title: "{title}"')
    md.append(f'creator: "{creator}"')
    md.append(f'source_url: "{url}"')
    md.append(f'date_processed: "{today}"')
    md.append('accent_dialect: "General American (Modern Conversational)"')
    md.append(f'pacing_wpm: "{wpm} WPM"')
    md.append('difficulty: "Intermediate / Advanced"')
    md.append("tags:")
    md.append("  - accent-shadowing")
    md.append("  - american-english")
    md.append("  - youtube-creator")
    md.append("  - speech-drill")
    md.append("---\n")

    # Title & Overview
    md.append(f"# 🎙️ American Accent Shadowing: {title}\n")
    md.append("> [!abstract] **Video Overview & Source**")
    md.append(f"> - **Creator:** **{creator}**")
    md.append(f"> - **Original Video:** [Watch on YouTube]({url})")
    md.append(f"> - **Estimated Pacing:** `~{wpm} WPM` | **Duration:** `{minutes} min`")
    md.append("> - **Dialect Focus:** General American Conversational Cadence, Connected Speech & Casual Slang\n")
    md.append("---\n")

    # Color Legend
    md.append("## 🎨 Color-Coded Shadowing Legend\n")
    md.append("Refer to this visual guide while shadowing. Match the creator's rhythm and mouth movements based on each category:\n")
    md.append("| Category | Icon & Color Swatch | What It Signals in Speech | How to Deliver It |")
    md.append("| :--- | :---: | :--- | :--- |")
    md.append('| **Slang & Street Talk** | <mark style="background-color: #FEF08A; color: #713F12; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟡 Yellow</mark> | Casual idioms, modern internet/street vocabulary, youth slang | Deliver relaxed, confident, low-stress |')
    md.append('| **Native Expressions** | <mark style="background-color: #E9D5FF; color: #581C87; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟣 Lavender</mark> | Natural multi-word collocations, everyday business/podcast phrases | Pronounce as a single linked chunk |')
    md.append('| **Connected Speech** | <mark style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔵 Sky Blue</mark> | Phonetic reductions, contractions, flap-T, dropped consonants | Blend words together, soften unstressed syllables |')
    md.append('| **Rhythm & Fillers** | <mark style="background-color: #A7F3D0; color: #064E3B; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟢 Mint Green</mark> | Natural conversational glues, pacing markers, hesitations | Lower pitch, lower volume, bridge between thoughts |')
    md.append('| **Pitch & Emphasis** | <mark style="background-color: #FED7AA; color: #7C2D12; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🟠 Peach Orange</mark> | Intonation peaks, contrastive word stress, dramatic punches | Raise vocal pitch 3-5 semitones, elongate vowel |')
    md.append('| **ASR Error Fixes** | <mark style="background-color: #FECDD3; color: #881337; padding: 2px 6px; border-radius: 4px; font-weight: 600;">🔴 Rose</mark> | Corrected YouTube speech recognition mistakes (faithful to audio) | Exact word the creator actually articulated |\n')
    md.append("---\n")

    # Delivery Profile
    md.append("## 👤 Creator Vocal Snapshot & Delivery Profile\n")
    md.append("> [!info] **Acoustic & Articulation Characteristics**")
    md.append(f"> - **Tempo & Cadence:** `~{wpm} WPM` — *Natural conversational pacing with micro-pauses.*")
    md.append("> - **Phonetic Traits:** Flap-T between vowels, reduced prepositions to schwa, natural contractions (`gonna`, `wanna`).")
    md.append("> - **Tone:** Authentic, conversational direct-to-audience engagement.\n")
    md.append("---\n")

    # Transcript Chunks
    md.append("## 📝 Verbatim Transcript & Color-Coded Shadowing Drill\n")
    md.append("> [!tip] **Verbatim Accuracy Note**")
    md.append("> This transcript preserves the creator's exact spontaneous speech patterns, contractions, and colloquialisms. Only YouTube ASR mishearings are corrected.\n")

    for idx, chunk in enumerate(data.get("chunks", [])):
        md.append(f"### ⏱️ {chunk['time_range']} — Segment {idx + 1}\n")
        md.append(f"{chunk['text']}\n")

    md.append("---\n")
    # Routine
    md.append("## 🎯 4-Step Action Routine for Practicing\n")
    md.append("```mermaid")
    md.append("flowchart LR")
    md.append('    A["1️⃣ Listen & Map"] --> B["2️⃣ Whisper Shadow"]')
    md.append('    B --> C["3️⃣ Full Sync Shadow"]')
    md.append('    C --> D["4️⃣ Record & Compare"]')
    md.append("```\n")
    md.append('1. **Step 1: Active Listen (No Talking):** Focus your ears on pitch peaks and word connections.')
    md.append('2. **Step 2: Whisper Shadow (0.85x - 1.0x Speed):** Mumble along softly. Match the mouth posture and tongue speed.')
    md.append('3. **Step 3: Full Vocal Shadow (Simultaneous):** Speak out loud *at the exact same second* as the creator. Match their volume and cadence.')
    md.append('4. **Step 4: Record & Self-Audit:** Record a 30-second take using your phone or Obsidian Audio recorder. Compare your rhythm to the creator.')

    return "\n".join(md)

def main():
    parser = argparse.ArgumentParser(description="Generate Obsidian Accent Shadowing note from YouTube URL.")
    parser.add_argument("url", help="YouTube video link")
    parser.add_argument("--output", "-o", required=True, help="Output markdown file path")
    parser.add_argument("--interval", type=int, default=40, help="Chunk interval in seconds (default: 40)")
    
    args = parser.parse_args()
    
    print(f"Fetching transcript for: {args.url} ...")
    data = fetch_youtube_transcript(args.url, interval=args.interval)
    note_content = build_obsidian_scaffold(data)
    
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(note_content)
        
    print(f"✅ Successfully created Obsidian note: {args.output}")

if __name__ == "__main__":
    main()
