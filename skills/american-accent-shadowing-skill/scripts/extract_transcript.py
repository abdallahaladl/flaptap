#!/usr/bin/env python3
"""
extract_transcript.py
Extracts verbatim English subtitles and metadata from any YouTube video URL
using yt-dlp. Handles deduplication of rolling auto-captions and groups text
into clean timestamped speech intervals.

Usage:
    python3 extract_transcript.py "<YOUTUBE_URL>" [--interval 30] [--output-json <path>] [--output-txt <path>]
"""

import sys
import os
import json
import re
import argparse
import tempfile
import subprocess
from typing import List, Dict, Any, Optional

def clean_vtt_cues(vtt_content: str) -> List[Dict[str, Any]]:
    """
    Parses WebVTT content and extracts deduplicated cues with timestamps.
    """
    raw_lines = vtt_content.splitlines()
    cues = []
    
    time_pattern = re.compile(r'(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})')
    
    current_start = None
    current_end = None
    buffer_lines = []
    
    def parse_seconds(ts: str) -> float:
        parts = ts.split(':')
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        elif len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
        return 0.0

    for line in raw_lines:
        line = line.strip()
        if not line or line.startswith('WEBVTT') or line.startswith('Kind:') or line.startswith('Language:'):
            continue
            
        match = time_pattern.search(line)
        if match:
            if current_start is not None and buffer_lines:
                text = " ".join(buffer_lines)
                text = re.sub(r'<[^>]+>', '', text).strip()
                if text:
                    cues.append({
                        "start": current_start,
                        "end": current_end,
                        "start_sec": round(parse_seconds(current_start), 3),
                        "end_sec": round(parse_seconds(current_end), 3),
                        "text": text
                    })
                buffer_lines = []
            current_start = match.group(1) # Keep full precision with milliseconds
            current_end = match.group(2)
        else:
            clean_line = re.sub(r'<[^>]+>', '', line).strip()
            if clean_line and clean_line not in buffer_lines:
                buffer_lines.append(clean_line)
                
    if current_start is not None and buffer_lines:
        text = " ".join(buffer_lines)
        text = re.sub(r'<[^>]+>', '', text).strip()
        if text:
            cues.append({
                "start": current_start,
                "end": current_end,
                "start_sec": round(parse_seconds(current_start), 3),
                "end_sec": round(parse_seconds(current_end), 3),
                "text": text
            })

    # Deduplicate rolling lines in cues
    deduped_cues = []
    last_text = ""
    for cue in cues:
        cue_text = cue["text"]
        # In YouTube auto-captions, each line often repeats the previous line
        if cue_text == last_text:
            continue
        if last_text and cue_text.startswith(last_text):
            cue_text = cue_text[len(last_text):].strip()
        elif last_text and last_text in cue_text:
            # Overlapping substring
            idx = cue_text.find(last_text)
            cue_text = (cue_text[:idx] + cue_text[idx+len(last_text):]).strip()
            
        if cue_text:
            cue["text"] = cue_text
            deduped_cues.append(cue)
            last_text = cue["text"]

    # Ensure strictly sequential and positive boundaries across consecutive cues
    for i in range(len(deduped_cues)):
        if i + 1 < len(deduped_cues):
            target_end = min(deduped_cues[i]["end_sec"], deduped_cues[i + 1]["start_sec"])
            deduped_cues[i]["end_sec"] = max(deduped_cues[i]["start_sec"] + 0.2, target_end)
            deduped_cues[i]["end"] = format_seconds_str(deduped_cues[i]["end_sec"])
            
    return deduped_cues

def extract_youtube_id(url: str) -> Optional[str]:
    """
    Bulletproof extraction of 11-character YouTube video ID across all valid YouTube URL variations:
    - standard watch: https://www.youtube.com/watch?v=VIDEO_ID
    - shorts: https://www.youtube.com/shorts/VIDEO_ID
    - shortened: https://youtu.be/VIDEO_ID
    - embed: https://www.youtube.com/embed/VIDEO_ID
    - live: https://www.youtube.com/live/VIDEO_ID
    - legacy/alt: https://www.youtube.com/v/VIDEO_ID
    - mobile: https://m.youtube.com/...
    - raw 11-char ID
    """
    if not url:
        return None
    url = url.strip()
    if re.fullmatch(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    patterns = [
        r'(?:v=|\/shorts\/|\/embed\/|\/live\/|\/v\/|youtu\.be\/|\/e\/)([\w-]{11})',
        r'[\?&]v=([\w-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None

def extract_timed_words(cues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extracts individual words with interpolated millisecond timestamps from audio cues.
    Used by the AI Agent to anchor semantic thought-units to exact millisecond bounds.
    """
    timed_words = []
    last_end = 0.0
    for cue in cues:
        raw_words = cue.get("text", "").strip().split()
        if not raw_words:
            continue
        c_start = max(cue["start_sec"], last_end)
        c_end = max(cue["end_sec"], c_start + 0.2)
        c_dur = max(c_end - c_start, 0.2)
        n = len(raw_words)
        for i, w in enumerate(raw_words):
            w_start = round(c_start + (i / n) * c_dur, 3)
            w_end = round(c_start + ((i + 1) / n) * c_dur, 3)
            if w_end <= w_start:
                w_end = round(w_start + 0.08, 3)
            timed_words.append({
                "word": w,
                "clean": re.sub(r'^[^\w]+|[^\w]+$', '', w.lower()),
                "start_sec": w_start,
                "end_sec": w_end
            })
            last_end = w_start
    return timed_words

def group_cues_into_sentences(cues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Groups individual sub-second cues into clean, bite-sized shadowable sentences (4-11 words, 2-5s).
    Respects natural pauses and avoids ending on dangling prepositions or articles.
    """
    if not cues:
        return []

    dangling_words = {
        'the', 'a', 'an', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
        'as', 'into', 'upon', 'towards', 'and', 'or', 'but', 'so', 'because', 'nor', 'yet',
        'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'if',
        'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this', 'these', 'those'
    }

    break_before_words = {
        'and', 'but', 'so', 'or', 'nor', 'yet', 'because', 'although', 'though', 'while',
        'since', 'if', 'unless', 'which', 'where', 'when', 'who', 'why', 'how',
        'instead', 'before', 'after', 'during', 'without', 'like'
    }
        
    sentences = []
    curr_cues = []
    curr_start_sec = None
    curr_start_ts = None
    
    for i, cue in enumerate(cues):
        if curr_start_sec is None:
            curr_start_sec = cue["start_sec"]
            curr_start_ts = cue["start"]
            
        curr_cues.append(cue)
        curr_text = " ".join([c["text"] for c in curr_cues]).strip()
        words = curr_text.split()
        num_words = len(words)
        
        last_word_clean = re.sub(r'^[^\w]+|[^\w]+$', '', words[-1].lower()) if words else ""
        has_terminal = bool(re.search(r'[.?!]["\']?$', curr_text))
        has_comma_break = bool(re.search(r'[,;:\u2014\u2013-]$', curr_text)) and num_words >= 12 and last_word_clean not in dangling_words
        
        next_first_word = ""
        if i + 1 < len(cues):
            next_words = cues[i + 1]["text"].strip().split()
            if next_words:
                next_first_word = re.sub(r'^[^\w]+|[^\w]+$', '', next_words[0].lower())
                
        is_break_ahead = (next_first_word in break_before_words and num_words >= 14 and last_word_clean not in dangling_words)
        duration = round(cue["end_sec"] - curr_start_sec, 2)

        should_split = False
        if has_terminal and num_words >= 3:
            # Full complete sentence or question terminal boundary
            should_split = True
        elif has_comma_break and num_words >= 12:
            should_split = True
        elif is_break_ahead and num_words >= 14:
            should_split = True
        elif num_words >= 16 and last_word_clean not in dangling_words:
            # Long spoken run-on protection
            should_split = True
        elif num_words >= 20 or duration >= 8.5:
            should_split = True

        if should_split:
            sentences.append({
                "id": f"sent-{len(sentences) + 1}",
                "index": len(sentences) + 1,
                "start": curr_start_ts,
                "end": cue["end"],
                "start_sec": curr_start_sec,
                "end_sec": cue["end_sec"],
                "time_range": f"[{curr_start_ts.split('.')[0]} - {cue['end'].split('.')[0]}]",
                "duration_sec": max(duration, 0.8),
                "text": curr_text
            })
            curr_cues = []
            curr_start_sec = None
            curr_start_ts = None
            
    if curr_cues:
        duration = round(cues[-1]["end_sec"] - (curr_start_sec or cues[-1]["start_sec"]), 2)
        start_ts = curr_start_ts or cues[-1]["start"]
        curr_text = " ".join([c["text"] for c in curr_cues]).strip()
        sentences.append({
            "id": f"sent-{len(sentences) + 1}",
            "index": len(sentences) + 1,
            "start": start_ts,
            "end": cues[-1]["end"],
            "start_sec": curr_start_sec or cues[-1]["start_sec"],
            "end_sec": cues[-1]["end_sec"],
            "time_range": f"[{start_ts.split('.')[0]} - {cues[-1]['end'].split('.')[0]}]",
            "duration_sec": max(duration, 0.8),
            "text": curr_text
        })
        
    # Post-processing Pass 1: Merge tiny 1-3 word fragments (like 'Nice.', 'Super cool.') into adjacent sentences
    merged_sentences = []
    for s in sentences:
        words = s["text"].strip().split()
        if len(words) < 4 and merged_sentences:
            prev = merged_sentences[-1]
            prev["text"] = prev["text"].strip() + " " + s["text"].strip()
            prev["end_sec"] = max(prev["end_sec"], s["end_sec"])
            prev["end"] = s["end"]
            prev["duration_sec"] = max(round(prev["end_sec"] - prev["start_sec"], 2), 0.8)
            prev["time_range"] = f"[{prev['start'].split('.')[0]} - {s['end'].split('.')[0]}]"
        else:
            merged_sentences.append(s)

    # If first sentence is a crumb and there are more sentences, merge forward
    if len(merged_sentences) > 1 and len(merged_sentences[0]["text"].strip().split()) < 4:
        first = merged_sentences.pop(0)
        merged_sentences[0]["text"] = first["text"].strip() + " " + merged_sentences[0]["text"].strip()
        merged_sentences[0]["start_sec"] = first["start_sec"]
        merged_sentences[0]["start"] = first["start"]
        merged_sentences[0]["duration_sec"] = max(round(merged_sentences[0]["end_sec"] - merged_sentences[0]["start_sec"], 2), 0.8)
        merged_sentences[0]["time_range"] = f"[{first['start'].split('.')[0]} - {merged_sentences[0]['end'].split('.')[0]}]"

    # Post-processing Pass 2: Merge non-terminal fragments where combined length <= 16 words (keep full short sentences intact)
    final_merged = []
    for s in merged_sentences:
        if final_merged:
            prev = final_merged[-1]
            prev_has_terminal = bool(re.search(r'[.?!]["\']?$', prev["text"].strip()))
            comb_words = len(prev["text"].split()) + len(s["text"].split())
            if not prev_has_terminal and comb_words <= 16:
                prev["text"] = prev["text"].strip() + " " + s["text"].strip()
                prev["end_sec"] = max(prev["end_sec"], s["end_sec"])
                prev["end"] = s["end"]
                prev["duration_sec"] = max(round(prev["end_sec"] - prev["start_sec"], 2), 0.8)
                prev["time_range"] = f"[{prev['start'].split('.')[0]} - {s['end'].split('.')[0]}]"
                continue
        final_merged.append(s)

    # Re-index
    for idx, s in enumerate(final_merged, 1):
        s["index"] = idx
        s["id"] = f"sent-{idx}"

    return final_merged

def group_cues_by_interval(cues: List[Dict[str, Any]], interval_sec: int = 30) -> List[Dict[str, Any]]:
    """
    Groups individual cues into readable timestamped intervals (e.g. 30-45 seconds).
    """
    if not cues:
        return []
        
    grouped = []
    curr_group = {
        "start": cues[0]["start"],
        "end": cues[0]["end"],
        "start_sec": cues[0]["start_sec"],
        "end_sec": cues[0]["end_sec"],
        "words": []
    }
    
    for cue in cues:
        if cue["end_sec"] - curr_group["start_sec"] > interval_sec and curr_group["words"]:
            grouped.append({
                "time_range": f"[{curr_group['start']} - {curr_group['end']}]",
                "start": curr_group["start"],
                "end": curr_group["end"],
                "text": " ".join(curr_group["words"]).strip()
            })
            curr_group = {
                "start": cue["start"],
                "end": cue["end"],
                "start_sec": cue["start_sec"],
                "end_sec": cue["end_sec"],
                "words": [cue["text"]]
            }
        else:
            curr_group["end"] = cue["end"]
            curr_group["end_sec"] = cue["end_sec"]
            curr_group["words"].append(cue["text"])
            
    if curr_group["words"]:
        grouped.append({
            "time_range": f"[{curr_group['start']} - {curr_group['end']}]",
            "start": curr_group["start"],
            "end": curr_group["end"],
            "text": " ".join(curr_group["words"]).strip()
        })
        
    return grouped

def format_seconds_str(sec: float) -> str:
    m = int(sec // 60)
    s = sec % 60
    return f"{m:02d}:{s:06.3f}"

def fetch_youtube_transcript(url: str, interval: int = 30) -> Dict[str, Any]:
    """
    Ultra-fast transcript extraction using direct YouTubeTranscriptApi and oEmbed,
    with automatic yt-dlp fallback if required. Runs in ~1-3 seconds.
    """
    video_id = extract_youtube_id(url)
    if not video_id:
        raise ValueError(f"Invalid YouTube URL or Video ID: '{url}'. Please provide a valid YouTube link.")

    # 1. Fetch metadata via fast YouTube oEmbed
    title = "YouTube Shadowing Session"
    uploader = "Content Creator"
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        import urllib.request
        oembed_url = f"https://www.youtube.com/oembed?url={canonical_url}&format=json"
        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            oembed_data = json.loads(resp.read().decode())
            title = oembed_data.get("title", title)
            uploader = oembed_data.get("author_name", uploader)
    except Exception:
        pass

    # 2. Try direct YouTubeTranscriptApi (pure Python, 1-2s response)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcripts = YouTubeTranscriptApi().fetch(video_id)
        raw_snippets = []
        for s in transcripts:
            txt = s.text.replace("\n", " ").strip()
            if txt:
                raw_snippets.append({
                    "start_sec": round(s.start, 3),
                    "duration": round(s.duration, 3),
                    "text": txt
                })

        cues = []
        for i, snip in enumerate(raw_snippets):
            s_sec = snip["start_sec"]
            # Fix YouTube 2-line rolling overlap: spoken speech ends when next line starts
            if i + 1 < len(raw_snippets):
                next_start = raw_snippets[i + 1]["start_sec"]
                e_sec = round(min(s_sec + snip["duration"], next_start), 3)
                if e_sec <= s_sec:
                    e_sec = round(s_sec + min(snip["duration"], 2.0), 3)
            else:
                e_sec = round(s_sec + min(snip["duration"], 4.0), 3)

            cues.append({
                "start": format_seconds_str(s_sec),
                "end": format_seconds_str(e_sec),
                "start_sec": s_sec,
                "end_sec": e_sec,
                "text": snip["text"]
            })

        if cues:
            grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
            sentences = group_cues_into_sentences(cues)
            full_text = " ".join([c["text"] for c in cues])
            duration = int(cues[-1]["end_sec"]) if cues else 180

            timed_words = extract_timed_words(cues)
            return {
                "title": title,
                "creator": uploader,
                "url": url,
                "video_id": video_id,
                "duration_seconds": duration,
                "total_cues": len(cues),
                "chunks": grouped_chunks,
                "sentences": sentences,
                "cues": cues,
                "timed_words": timed_words,
                "full_raw_transcript": full_text
            }
    except Exception as e:
        # Fallback to yt-dlp if transcript-api was restricted
        pass

    # 3. Fallback: yt-dlp with android player client
    with tempfile.TemporaryDirectory() as tmpdir:
        sub_prefix = os.path.join(tmpdir, "caption")
        
        meta_cmd = [
            "yt-dlp",
            "--extractor-args", "youtube:player_client=android",
            "--dump-single-json",
            "--skip-download",
            url
        ]
        try:
            meta_res = subprocess.run(meta_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            meta_data = json.loads(meta_res.stdout)
            title = meta_data.get("title", title)
            uploader = meta_data.get("uploader", meta_data.get("channel", uploader))
        except Exception:
            pass

        dl_cmd = [
            "yt-dlp",
            "--extractor-args", "youtube:player_client=android",
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", "en-orig,en-US,en",
            "--sub-format", "vtt",
            "-o", f"{sub_prefix}.%(ext)s",
            url
        ]
        subprocess.run(dl_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        vtt_files = [f for f in os.listdir(tmpdir) if f.endswith(".vtt")]
        if not vtt_files:
            raise RuntimeError(f"Could not extract English subtitles for video: {url}. Please ensure video has captions enabled.")

        chosen_vtt = os.path.join(tmpdir, vtt_files[0])
        with open(chosen_vtt, "r", encoding="utf-8") as vf:
            vtt_content = vf.read()

        cues = clean_vtt_cues(vtt_content)
        grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
        sentences = group_cues_into_sentences(cues)
        full_text = " ".join([c["text"] for c in cues])

        timed_words = extract_timed_words(cues)
        return {
            "title": title,
            "creator": uploader,
            "url": url,
            "video_id": video_id,
            "duration_seconds": int(cues[-1]["end_sec"]) if cues else 180,
            "total_cues": len(cues),
            "chunks": grouped_chunks,
            "sentences": sentences,
            "cues": cues,
            "timed_words": timed_words,
            "full_raw_transcript": full_text
        }

def main():
    parser = argparse.ArgumentParser(description="Extract verbatim subtitles from YouTube for Accent Shadowing.")
    parser.add_argument("url", help="YouTube video link")
    parser.add_argument("--interval", type=int, default=30, help="Interval size in seconds for grouping (default: 30)")
    parser.add_argument("--output-json", help="Path to write JSON output")
    parser.add_argument("--output-txt", help="Path to write clean TXT output")
    
    args = parser.parse_args()
    
    try:
        data = fetch_youtube_transcript(args.url, interval=args.interval)
        
        if args.output_json:
            with open(args.output_json, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"JSON saved to: {args.output_json}")
            
        if args.output_txt:
            with open(args.output_txt, "w", encoding="utf-8") as f:
                f.write(f"TITLE: {data['title']}\n")
                f.write(f"CREATOR: {data['creator']}\n")
                f.write(f"URL: {data['url']}\n\n")
                for chunk in data["chunks"]:
                    f.write(f"{chunk['time_range']}\n{chunk['text']}\n\n")
            print(f"TXT saved to: {args.output_txt}")
            
        if not args.output_json and not args.output_txt:
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
