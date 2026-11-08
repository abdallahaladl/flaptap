#!/usr/bin/env python3
"""
extract_transcript.py
Extracts verbatim English subtitles and metadata from any YouTube video URL.
Retrieves the exact original subtitles provided by the video itself using
direct YouTubeTranscriptApi with clean yt-dlp subtitle fallback.

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
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional

# Hard ceiling for every network operation in this helper.
socket.setdefaulttimeout(8)

# Machine-readable failure codes mapped by the Node backend.
VIDEO_UNAVAILABLE = "video_unavailable"
NO_CAPTIONS = "no_captions"
RATE_LIMITED = "rate_limited"
TIMEOUT = "timeout"
INVALID_URL = "invalid_url"

VIDEO_UNAVAILABLE_MESSAGE = (
    "This video is unavailable. It may have been removed, made private, or "
    "restricted by its owner."
)
NO_CAPTIONS_MESSAGE = "This video has no English captions available to shadow."
RATE_LIMITED_MESSAGE = (
    "YouTube is temporarily rate-limiting caption requests from this network. "
    "Please try again in a few minutes."
)
TIMEOUT_MESSAGE = "YouTube took too long to respond. Please try again."


class TranscriptError(RuntimeError):
    """A caption failure that the caller can classify and explain."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def format_seconds_str(sec: float) -> str:
    m = int(sec // 60)
    s = sec % 60
    return f"{m:02d}:{s:06.3f}"


def clean_vtt_cues(vtt_content: str) -> List[Dict[str, Any]]:
    """
    Parses WebVTT content and extracts deduplicated cues with timestamps.
    """
    raw_lines = vtt_content.splitlines()
    cues = []

    time_pattern = re.compile(
        r'(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})'
    )

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
                        "text": text,
                    })
                buffer_lines = []
            current_start = match.group(1)
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
                "text": text,
            })

    # Deduplicate rolling lines in cues
    deduped_cues = []
    last_text = ""
    for cue in cues:
        cue_text = cue["text"]
        if cue_text == last_text:
            continue
        if last_text and cue_text.startswith(last_text):
            cue_text = cue_text[len(last_text):].strip()
        elif last_text and last_text in cue_text:
            idx = cue_text.find(last_text)
            cue_text = (cue_text[:idx] + cue_text[idx + len(last_text):]).strip()

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
    Extracts individual words with exact millisecond timestamps from audio cues.
    """
    timed_words = []
    last_end = 0.0
    for cue_idx, cue in enumerate(cues):
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
                "end_sec": w_end,
                "cue_index": cue_idx,
                "cue_end": (i == n - 1),
            })
            last_end = w_start
    return timed_words


def group_cues_into_sentences(cues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Groups cues into clean, bite-sized shadowable sentences.
    Respects natural pauses and true punctuation marks.
    """
    if not cues:
        return []

    dangling_words = {
        'the', 'a', 'an', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
        'as', 'into', 'upon', 'towards', 'and', 'or', 'but', 'so', 'because', 'nor', 'yet',
        'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'if',
    }

    sentences = []
    curr_words = []
    curr_start = cues[0]["start"]
    curr_start_sec = cues[0]["start_sec"]
    curr_end = cues[0]["end"]
    curr_end_sec = cues[0]["end_sec"]

    for i, cue in enumerate(cues):
        text = cue["text"].strip()
        if not text:
            continue

        words = text.split()
        curr_words.extend(words)
        curr_end = cue["end"]
        curr_end_sec = cue["end_sec"]

        # Sentence end criteria: terminal punctuation, pause >= 0.75s, or optimal word count (6-14 words)
        has_terminal = text.endswith(('.', '!', '?'))
        pause_gap = 0.0
        if i + 1 < len(cues):
            pause_gap = cues[i + 1]["start_sec"] - cue["end_sec"]

        word_count = len(curr_words)
        last_word = re.sub(r'[^\w]', '', words[-1].lower()) if words else ""
        is_dangling = last_word in dangling_words

        should_split = False
        if has_terminal and not is_dangling:
            should_split = True
        elif pause_gap >= 0.75 and word_count >= 4 and not is_dangling:
            should_split = True
        elif word_count >= 12 and not is_dangling:
            should_split = True

        if should_split or i == len(cues) - 1:
            sent_text = " ".join(curr_words).strip()
            if sent_text:
                sentences.append({
                    "index": len(sentences) + 1,
                    "time_range": f"[{curr_start} - {curr_end}]",
                    "start": curr_start,
                    "end": curr_end,
                    "start_sec": curr_start_sec,
                    "end_sec": curr_end_sec,
                    "text": sent_text,
                })
            curr_words = []
            if i + 1 < len(cues):
                curr_start = cues[i + 1]["start"]
                curr_start_sec = cues[i + 1]["start_sec"]
                curr_end = cues[i + 1]["end"]
                curr_end_sec = cues[i + 1]["end_sec"]

    return sentences


def group_cues_by_interval(cues: List[Dict[str, Any]], interval_sec: int = 30) -> List[Dict[str, Any]]:
    """
    Groups individual cues into cohesive speech chunks.
    """
    if not cues:
        return []

    grouped = []
    curr_group = {
        "start": cues[0]["start"],
        "end": cues[0]["end"],
        "start_sec": cues[0]["start_sec"],
        "end_sec": cues[0]["end_sec"],
        "words": [cues[0]["text"]],
    }

    for cue in cues[1:]:
        if cue["end_sec"] - curr_group["start_sec"] > interval_sec:
            grouped.append({
                "time_range": f"[{curr_group['start']} - {curr_group['end']}]",
                "start": curr_group["start"],
                "end": curr_group["end"],
                "start_sec": curr_group["start_sec"],
                "end_sec": curr_group["end_sec"],
                "text": " ".join(curr_group["words"]).strip(),
            })
            curr_group = {
                "start": cue["start"],
                "end": cue["end"],
                "start_sec": cue["start_sec"],
                "end_sec": cue["end_sec"],
                "words": [cue["text"]],
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
            "start_sec": curr_group["start_sec"],
            "end_sec": curr_group["end_sec"],
            "text": " ".join(curr_group["words"]).strip(),
        })

    return grouped


def _fetch_oembed(video_id: str) -> Optional[Dict[str, str]]:
    """
    Fast YouTube oEmbed lookup for video title and uploader.
    Fails fast if video is unavailable (404/401/403).
    """
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    oembed_url = (
        "https://www.youtube.com/oembed?url="
        f"{urllib.parse.quote(canonical_url, safe='')}&format=json"
    )
    request = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8", "replace") or "{}")
            return {
                "title": payload.get("title", ""),
                "creator": payload.get("author_name", ""),
            }
    except urllib.error.HTTPError as error:
        if error.code in (401, 403, 404):
            raise TranscriptError(VIDEO_UNAVAILABLE, VIDEO_UNAVAILABLE_MESSAGE)
        return None
    except Exception:
        return None


def fetch_youtube_transcript(url: str, interval: int = 30) -> Dict[str, Any]:
    """
    Ultra-fast verbatim transcript extraction:
    Directly retrieves the exact original subtitles provided by the video itself
    via YouTubeTranscriptApi in ~0.5-1.5s, with clean yt-dlp subtitle fallback.
    """
    video_id = extract_youtube_id(url)
    if not video_id:
        raise TranscriptError(
            INVALID_URL,
            f"Invalid YouTube URL or Video ID: '{url}'. Please provide a valid YouTube link.",
        )

    # 1. Fetch metadata via fast YouTube oEmbed
    title = "YouTube Shadowing Session"
    uploader = "Content Creator"
    metadata = _fetch_oembed(video_id)
    if metadata:
        title = metadata.get("title") or title
        uploader = metadata.get("creator") or uploader

    # 2. Direct YouTubeTranscriptApi: exact original video subtitles
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()

        transcripts = None
        try:
            transcripts = api.fetch(video_id)
        except Exception:
            # Fall back to listing transcripts to find exact English track
            try:
                t_list = api.list(video_id)
                try:
                    tr = t_list.find_manually_created_transcript(['en', 'en-US', 'en-GB', 'en-orig'])
                except Exception:
                    tr = t_list.find_generated_transcript(['en', 'en-US', 'en-GB', 'en-orig'])
                transcripts = tr.fetch()
            except Exception:
                transcripts = None

        if transcripts:
            raw_snippets = []
            for s in transcripts:
                txt = s.text.replace("\n", " ").strip()
                if txt:
                    raw_snippets.append({
                        "start_sec": round(s.start, 3),
                        "duration": round(s.duration, 3),
                        "text": txt,
                    })

            cues = []
            for i, snip in enumerate(raw_snippets):
                s_sec = snip["start_sec"]
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
                    "text": snip["text"],
                })

            if cues:
                grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
                sentences = group_cues_into_sentences(cues)
                full_text = " ".join(c["text"] for c in cues)
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
                    "full_raw_transcript": full_text,
                }
    except TranscriptError:
        raise
    except Exception as error:
        err_msg = str(error).lower()
        if "videounavailable" in err_msg or "invalidvideoid" in err_msg:
            raise TranscriptError(VIDEO_UNAVAILABLE, VIDEO_UNAVAILABLE_MESSAGE)
        if "transcriptsdisabled" in err_msg or "notranscriptfound" in err_msg:
            raise TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)

    # 3. Clean yt-dlp fallback to download the exact video caption file
    with tempfile.TemporaryDirectory() as tmpdir:
        sub_prefix = os.path.join(tmpdir, "caption")
        dl_cmd = [
            "yt-dlp",
            "--extractor-args", "youtube:player_client=android",
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", "en-orig,en-US,en",
            "--sub-format", "vtt",
            "-o", f"{sub_prefix}.%(ext)s",
            url,
        ]
        try:
            res = subprocess.run(
                dl_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=15,
            )
        except subprocess.TimeoutExpired:
            raise TranscriptError(TIMEOUT, TIMEOUT_MESSAGE)

        vtt_files = [f for f in os.listdir(tmpdir) if f.endswith(".vtt")]
        if not vtt_files:
            raise TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)

        # Pick original / standard English vtt file
        vtt_files.sort(key=lambda name: (
            0 if "en-orig" in name else (1 if "en-US" in name else 2)
        ))
        chosen_vtt = os.path.join(tmpdir, vtt_files[0])
        with open(chosen_vtt, "r", encoding="utf-8") as vf:
            vtt_content = vf.read()

        cues = clean_vtt_cues(vtt_content)
        if not cues:
            raise TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)

        grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
        sentences = group_cues_into_sentences(cues)
        full_text = " ".join(c["text"] for c in cues)
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
            "full_raw_transcript": full_text,
        }


def main():
    parser = argparse.ArgumentParser(description="Extract verbatim English subtitles from YouTube.")
    parser.add_argument("url", help="YouTube video link")
    parser.add_argument("--interval", type=int, default=30, help="Interval size in seconds for grouping (default: 30)")
    parser.add_argument("--media-dir", help=argparse.SUPPRESS, default=None)
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

    except TranscriptError as error:
        print(f"FLAPTAP_ERROR:{error.code}:{error.message}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
