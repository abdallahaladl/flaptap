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
import socket
import time
import threading
import difflib
import shutil
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional

# Hard ceiling for every network operation in this helper. YouTube sometimes
# stalls a caption request for tens of seconds; a bounded timeout keeps the
# studio responsive and lets the caller show a clean retry message instead.
socket.setdefaulttimeout(6)

# Machine-readable failure codes. The Node backend maps these to precise HTTP
# responses so the studio can explain *why* a video failed to load instead of
# blaming the creator's captions for a network-level block.
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


def _http_status(error: BaseException) -> Optional[int]:
    response = getattr(error, "response", None)
    status = getattr(response, "status_code", None) or getattr(response, "code", None)
    try:
        return int(status) if status is not None else None
    except (TypeError, ValueError):
        return None


def _is_rate_limited(error: BaseException) -> bool:
    if _http_status(error) == 429:
        return True
    text = f"{type(error).__name__} {error}".lower()
    return (
        "429" in text
        or "too many requests" in text
        or "ipblocked" in text
        or "requestblocked" in text
        or "po_token" in text
    )


def _classify_api_error(error: BaseException) -> TranscriptError:
    """Turn a youtube-transcript-api exception into a user-actionable code."""
    name = type(error).__name__.lower()
    text = str(error).lower()

    if _is_rate_limited(error):
        return TranscriptError(RATE_LIMITED, RATE_LIMITED_MESSAGE)
    if "videounavailable" in name or "invalidvideoid" in name:
        return TranscriptError(VIDEO_UNAVAILABLE, VIDEO_UNAVAILABLE_MESSAGE)
    if "transcriptsdisabled" in name or "notranscriptfound" in name:
        return TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)
    if "videounplayable" in name or "agerestricted" in name:
        return TranscriptError(VIDEO_UNAVAILABLE, VIDEO_UNAVAILABLE_MESSAGE)
    if "timed out" in text or "timeout" in text:
        return TranscriptError(TIMEOUT, TIMEOUT_MESSAGE)
    return TranscriptError(RATE_LIMITED, RATE_LIMITED_MESSAGE)


def _fetch_oembed(video_id: str) -> Optional[Dict[str, str]]:
    """
    Resolve title/uploader, and detect a removed or private video early.

    YouTube returns 404 for a removed/unknown id and 401 for a private one; in
    both cases no caption request can ever succeed, so we fail fast with the
    right explanation instead of a misleading "enable captions" error.
    """
    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    oembed_url = (
        "https://www.youtube.com/oembed?url="
        f"{urllib.parse.quote(canonical_url, safe='')}&format=json"
    )
    request = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
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
    for cue_index, cue in enumerate(cues):
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
                "cue_index": cue_index,
                "cue_end": i == n - 1
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

def _segment_text(segment: Any) -> str:
    if isinstance(segment, str):
        return segment
    if isinstance(segment, dict):
        return segment.get("utf8", "")
    return ""


def _normalize_token(token: str) -> str:
    value = (token or "").lower().replace("\xa0", " ")
    value = value.replace("\u2018", "'").replace("\u2019", "'")
    return re.sub(r"^[^\w']+|[^\w']+$", "", value)


def _fetch_json3_events(transcript: Any) -> List[Dict[str, Any]]:
    """Fetch the track as JSON3 so per-word tOffsetMs values are preserved."""
    base = transcript._url
    for suffix in ("&fmt=json3", "&fmt=srv3", "&fmt=vtt"):
        base = base.replace(suffix, "")
    try:
        response = transcript._http_client.get(base + "&fmt=json3")
        response.raise_for_status()
    except Exception as error:
        if _is_rate_limited(error):
            raise TranscriptError(RATE_LIMITED, RATE_LIMITED_MESSAGE)
        raise
    return json.loads(response.text).get("events", [])


def _json3_cues(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cues: List[Dict[str, Any]] = []
    for event in events:
        if not isinstance(event, dict) or not event.get("segs"):
            continue
        text = "".join(_segment_text(segment) for segment in event["segs"])
        text = re.sub(r"\s+", " ", text.replace("\n", " ").replace("\xa0", " ")).strip()
        if not text:
            continue
        start = event.get("tStartMs", 0) / 1000
        duration = max(event.get("dDurationMs", 0), 0) / 1000
        end = start + duration
        cues.append({
            "start": format_seconds_str(start),
            "end": format_seconds_str(end),
            "start_sec": round(start, 3),
            "end_sec": round(end, 3),
            "text": text,
        })

    # Keep cue ends monotonic; overlapping rolling captions otherwise make the
    # last word of a line claim audio that belongs to the next line.
    for index in range(len(cues) - 1):
        if cues[index]["end_sec"] > cues[index + 1]["start_sec"]:
            cues[index]["end_sec"] = max(
                cues[index]["start_sec"] + 0.2,
                cues[index + 1]["start_sec"],
            )
            cues[index]["end"] = format_seconds_str(cues[index]["end_sec"])
    return cues


def _json3_words(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Exact word timings from JSON3. Handles both per-word and per-line segs."""
    words: List[Dict[str, Any]] = []
    cue_index = -1

    for event in events:
        if not isinstance(event, dict) or not event.get("segs"):
            continue
        full_text = "".join(_segment_text(segment) for segment in event["segs"])
        full_text = re.sub(r"\s+", " ", full_text.replace("\n", " ").replace("\xa0", " ")).strip()
        if not full_text:
            continue

        cue_index += 1
        base = event.get("tStartMs", 0)
        event_end = (base + max(event.get("dDurationMs", 0), 0)) / 1000
        line: List[Dict[str, Any]] = []
        segs = event["segs"]

        for seg_index, segment in enumerate(segs):
            segment_text = _segment_text(segment).replace("\n", " ").replace("\xa0", " ").strip()
            if not segment_text:
                continue
            offset = segment.get("tOffsetMs", 0) if isinstance(segment, dict) else 0
            start = (base + offset) / 1000
            parts = segment_text.split()

            if len(parts) == 1:
                line.append({"word": parts[0], "start_sec": round(start, 3)})
                continue

            # Manual captions often put the whole line in one segment. Split it
            # and distribute the segment span by character weight as a fallback.
            next_seconds = event_end
            for candidate in segs[seg_index + 1:]:
                candidate_text = _segment_text(candidate).strip()
                if candidate_text and candidate_text != "\n":
                    candidate_offset = candidate.get("tOffsetMs", 0) if isinstance(candidate, dict) else 0
                    next_seconds = (base + candidate_offset) / 1000
                    break
            span = max(next_seconds - start, 0.12)
            total_weight = sum(len(part) + 1 for part in parts) or 1
            cursor = start
            for part in parts:
                share = (len(part) + 1) / total_weight
                line.append({
                    "word": part,
                    "start_sec": round(cursor, 3),
                    "end_sec": round(min(cursor + span * share, next_seconds), 3),
                })
                cursor += span * share

        for index, word in enumerate(line):
            if "end_sec" not in word or word["end_sec"] <= word["start_sec"]:
                if index + 1 < len(line) and line[index + 1]["start_sec"] > word["start_sec"]:
                    word["end_sec"] = line[index + 1]["start_sec"]
                else:
                    word["end_sec"] = max(word["start_sec"] + 0.05, event_end)
            word["cue_index"] = cue_index
            word["cue_end"] = index == len(line) - 1
            word["clean"] = re.sub(r"^[^\w]+|[^\w]+$", "", word["word"].lower())
            words.append(word)

    # Never let one word's declared end run into the next word's onset.
    for index in range(len(words) - 1):
        if words[index]["end_sec"] > words[index + 1]["start_sec"]:
            words[index]["end_sec"] = max(words[index]["start_sec"], words[index + 1]["start_sec"])
    return words


def _flatten_cue_words(cues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    words: List[Dict[str, Any]] = []
    for cue_index, cue in enumerate(cues):
        parts = cue["text"].split()
        for index, part in enumerate(parts):
            words.append({
                "text": part,
                "cue_index": cue_index,
                "cue_end": index == len(parts) - 1,
                "cue_start": cue["start_sec"],
                "cue_end_sec": cue["end_sec"],
            })
    return words


def _align_text_words(
    text_words: List[Dict[str, Any]],
    auto_words: List[Dict[str, Any]],
) -> Optional[List[Dict[str, Any]]]:
    """Align authoritative caption text to exact auto-caption word offsets."""
    if not text_words or not auto_words:
        return None

    text_norm = [_normalize_token(word["text"]) for word in text_words]
    auto_norm = [_normalize_token(word["word"]) for word in auto_words]
    text_idx = [index for index, token in enumerate(text_norm) if token]
    auto_idx = [index for index, token in enumerate(auto_norm) if token]
    if not text_idx or not auto_idx:
        return None

    manual = [text_norm[index] for index in text_idx]
    auto = [auto_norm[index] for index in auto_idx]
    matcher = difflib.SequenceMatcher(None, manual, auto, autojunk=False)
    assigned: List[Optional[tuple]] = [None] * len(text_words)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                target = text_idx[i1 + offset]
                source = auto_idx[j1 + offset]
                assigned[target] = (
                    auto_words[source]["start_sec"],
                    auto_words[source]["end_sec"],
                )
        elif tag == "replace" and j1 < j2:
            start = auto_words[auto_idx[j1]]["start_sec"]
            end = auto_words[auto_idx[j2 - 1]]["end_sec"]
            span = max(end - start, 0.1)
            weights = [max(len(text_words[text_idx[k]]["text"]), 1) for k in range(i1, i2)]
            total_weight = sum(weights) or 1
            cursor = start
            for offset, weight in enumerate(weights):
                target = text_idx[i1 + offset]
                duration = span * weight / total_weight
                assigned[target] = (round(cursor, 3), round(cursor + duration, 3))
                cursor += duration

    # Fill unmatched text words (ASR differences, punctuation-only tokens).
    index = 0
    while index < len(text_words):
        if assigned[index] is not None:
            index += 1
            continue
        run_end = index
        while run_end < len(text_words) and assigned[run_end] is None:
            run_end += 1
        previous = assigned[index - 1] if index > 0 else None
        following = assigned[run_end] if run_end < len(text_words) else None

        if previous and following:
            gap = max(following[0] - previous[1], 0.01)
            weights = [max(len(text_words[k]["text"]), 1) for k in range(index, run_end)]
            total_weight = sum(weights) or 1
            cursor = previous[1]
            for offset, weight in enumerate(weights):
                duration = gap * weight / total_weight
                assigned[index + offset] = (round(cursor, 3), round(cursor + duration, 3))
                cursor += duration
        elif previous:
            cursor = previous[1]
            for offset in range(index, run_end):
                assigned[index + offset] = (round(cursor, 3), round(cursor + 0.08, 3))
                cursor += 0.08
        elif following:
            cursor = max(0.0, following[0] - 0.08 * (run_end - index))
            for offset in range(index, run_end):
                assigned[index + offset] = (round(cursor, 3), round(cursor + 0.08, 3))
                cursor += 0.08
        else:
            for offset in range(index, run_end):
                word = text_words[index + offset]
                assigned[index + offset] = (
                    word.get("cue_start", 0.0),
                    word.get("cue_end_sec", word.get("cue_start", 0.0) + 0.2),
                )
        index = run_end

    aligned: List[Dict[str, Any]] = []
    previous_end = 0.0
    for index, word in enumerate(text_words):
        start, end = assigned[index] or (word.get("cue_start", 0.0), word.get("cue_end_sec", 0.2))
        if start < previous_end:
            start = previous_end
        if end <= start:
            end = start + 0.05
        if index + 1 < len(text_words) and assigned[index + 1]:
            next_start = assigned[index + 1][0]
            if next_start > start:
                end = min(end, next_start)
        if end <= start:
            end = start + 0.05

        start = round(start, 3)
        end = round(end, 3)
        aligned.append({
            "word": word["text"],
            "clean": _normalize_token(word["text"]) or re.sub(r"^[^\w]+|[^\w]+$", "", word["text"].lower()),
            "start_sec": start,
            "end_sec": end,
            "cue_index": word["cue_index"],
            "cue_end": word["cue_end"],
        })
        previous_end = end

    return aligned


def _build_payload(
    video_id: str,
    url: str,
    title: str,
    uploader: str,
    cues: List[Dict[str, Any]],
    timed_words: List[Dict[str, Any]],
    interval: int,
) -> Dict[str, Any]:
    """Assemble the single JSON document the studio consumes."""
    grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
    sentences = group_cues_into_sentences(cues)
    full_text = " ".join(cue["text"] for cue in cues)

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
        "full_raw_transcript": full_text,
    }


def _english_tracks(transcript_list: Any) -> List[Any]:
    tracks = list(transcript_list)
    english = [
        transcript for transcript in tracks
        if transcript.language_code in ("en", "en-US", "en-GB", "en-orig")
    ]
    return english or tracks


def fetch_via_transcript_api(video_id: str, url: str, title: str, uploader: str, interval: int) -> Optional[Dict[str, Any]]:
    """Word-accurate transcript fetch via YouTube JSON3 caption tracks."""
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        english = _english_tracks(transcript_list)
    except Exception as error:
        raise _classify_api_error(error)

    manual_tracks = [transcript for transcript in english if not transcript.is_generated]
    auto_tracks = [transcript for transcript in english if transcript.is_generated]

    def safe_events(track: Any) -> List[Dict[str, Any]]:
        try:
            return _fetch_json3_events(track)
        except TranscriptError:
            raise
        except Exception as error:
            print(f"[extract] json3_failed={type(error).__name__}", file=sys.stderr)
            return []

    manual_events = safe_events(manual_tracks[0]) if manual_tracks else []
    auto_events = safe_events(auto_tracks[0]) if auto_tracks else []

    manual_cues = _json3_cues(manual_events) if manual_events else []
    auto_cues = _json3_cues(auto_events) if auto_events else []

    if manual_cues:
        cues = manual_cues
        text_words = _flatten_cue_words(manual_cues)
    elif auto_cues:
        cues = auto_cues
        text_words = []
    else:
        if not manual_tracks and not auto_tracks:
            raise TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)
        return None

    auto_words = _json3_words(auto_events) if auto_events else []
    if manual_events and auto_words:
        timed_words = _align_text_words(text_words, auto_words)
    elif auto_words and not manual_events:
        timed_words = auto_words
    else:
        timed_words = _json3_words(manual_events) if manual_events else []

    if not timed_words:
        timed_words = extract_timed_words(cues)

    return _build_payload(video_id, url, title, uploader, cues, timed_words, interval)


INLINE_VTT_TIME = re.compile(r"<(\d{2}:\d{2}:\d{2}\.\d{3})>")
VTT_RANGE = re.compile(
    r"(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*"
    r"(\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})"
)


def _vtt_seconds(timestamp: str) -> float:
    parts = timestamp.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return 0.0


def _strip_vtt_tags(text: str) -> str:
    text = re.sub(r"</?c[^>]*>", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _distribute_tokens(tokens: List[str], start: float, end: float) -> List[Dict[str, Any]]:
    """Split a span across tokens by character weight (manual VTT fallback)."""
    if not tokens:
        return []
    span = max(end - start, 0.04)
    weights = [max(len(token), 1) for token in tokens]
    total = sum(weights) or 1
    cursor = start
    words = []
    for index, (token, weight) in enumerate(zip(tokens, weights)):
        duration = span * weight / total
        word_end = end if index == len(tokens) - 1 else min(cursor + duration, end)
        words.append({
            "word": token,
            "start_sec": round(cursor, 3),
            "end_sec": round(max(word_end, cursor + 0.04), 3),
        })
        cursor += duration
    return words


def _vtt_blocks(content: str) -> List[Any]:
    """
    Split WebVTT into (text lines, timing match) cues.

    YouTube inserts a whitespace-only spacer line between the timing line and
    the caption text, so splitting on blank lines would drop the first line of
    every cue. A small state machine keeps that spacer harmless.
    """
    cues: List[Any] = []
    current: Optional[Dict[str, Any]] = None

    for raw_line in content.replace("\r\n", "\n").split("\n"):
        line = raw_line.strip()
        if not line:
            if current and current["lines"]:
                cues.append((current["lines"], current["match"]))
                current = None
            continue

        match = VTT_RANGE.search(line) if "-->" in line else None
        if match:
            if current and current["lines"]:
                cues.append((current["lines"], current["match"]))
            current = {"lines": [], "match": match}
            continue

        if current is None:
            continue  # WEBVTT header or a numeric cue identifier
        current["lines"].append(line)

    if current and current["lines"]:
        cues.append((current["lines"], current["match"]))
    return cues


def _vtt_words(content: str) -> List[Dict[str, Any]]:
    """
    Parse YouTube WebVTT into word records.

    Auto-generated VTT carries inline `<00:00:01.234>` markers per word, so we
    keep those exact offsets instead of dividing each line evenly. Manual VTT
    has only cue bounds and is distributed inside the cue as a last resort.
    """
    blocks = _vtt_blocks(content)
    words: List[Dict[str, Any]] = []
    previous_tokens: List[str] = []
    cue_index = -1

    for lines, match in blocks:
        cue_start = _vtt_seconds(match.group(1))
        cue_end = max(_vtt_seconds(match.group(2)), cue_start + 0.04)
        body = " ".join(lines)
        if not body:
            continue

        segments: List[Dict[str, Any]] = []
        markers = list(INLINE_VTT_TIME.finditer(body))
        if markers:
            prefix = _strip_vtt_tags(body[:markers[0].start()]).split()
            if prefix:
                segments.append({
                    "tokens": prefix,
                    "start": cue_start,
                    "end": max(_vtt_seconds(markers[0].group(1)), cue_start + 0.04),
                })
            for index, marker in enumerate(markers):
                next_marker = markers[index + 1] if index + 1 < len(markers) else None
                word_start = _vtt_seconds(marker.group(1))
                word_end = _vtt_seconds(next_marker.group(1)) if next_marker else cue_end
                chunk_end = next_marker.start() if next_marker else len(body)
                tokens = _strip_vtt_tags(body[marker.end():chunk_end]).split()
                if tokens:
                    segments.append({
                        "tokens": tokens,
                        "start": word_start,
                        "end": max(word_end, word_start + 0.04),
                    })
        else:
            tokens = _strip_vtt_tags(body).split()
            if tokens:
                segments.append({"tokens": tokens, "start": cue_start, "end": cue_end})

        cue_words: List[Dict[str, Any]] = []
        for segment in segments:
            cue_words.extend(_distribute_tokens(segment["tokens"], segment["start"], segment["end"]))

        # Rolling auto-captions repeat the previous line at the head of the
        # next cue. Drop that repeated prefix so words are never duplicated.
        current_tokens = [_normalize_token(word["word"]) for word in cue_words]
        overlap = 0
        for size in range(1, min(len(previous_tokens), len(current_tokens)) + 1):
            if previous_tokens[-size:] == current_tokens[:size]:
                overlap = size
        if overlap:
            cue_words = cue_words[overlap:]
            current_tokens = current_tokens[overlap:]
        if not cue_words:
            continue

        cue_index += 1
        for index, word in enumerate(cue_words):
            if index + 1 < len(cue_words):
                next_start = cue_words[index + 1]["start_sec"]
                word["end_sec"] = round(min(word["end_sec"], max(next_start, word["start_sec"] + 0.04)), 3)
            words.append({
                "word": word["word"],
                "clean": _normalize_token(word["word"]),
                "start_sec": round(float(word["start_sec"]), 3),
                "end_sec": round(float(word["end_sec"]), 3),
                "cue_index": cue_index,
                "cue_end": index == len(cue_words) - 1,
            })
        previous_tokens = current_tokens

    for index in range(len(words) - 1):
        if words[index]["end_sec"] > words[index + 1]["start_sec"]:
            words[index]["end_sec"] = max(words[index]["start_sec"], words[index + 1]["start_sec"])
    return words


def _cues_from_words(words: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cues: List[Dict[str, Any]] = []
    for word in words:
        if not cues or word["cue_index"] != cues[-1].get("_cue_index"):
            cues.append({
                "_cue_index": word["cue_index"],
                "start_sec": word["start_sec"],
                "end_sec": word["end_sec"],
                "words": [word["word"]],
            })
        else:
            cues[-1]["end_sec"] = max(cues[-1]["end_sec"], word["end_sec"])
            cues[-1]["words"].append(word["word"])

    clean_cues = []
    for cue in cues:
        clean_cues.append({
            "start": format_seconds_str(cue["start_sec"]),
            "end": format_seconds_str(cue["end_sec"]),
            "start_sec": round(cue["start_sec"], 3),
            "end_sec": round(cue["end_sec"], 3),
            "text": " ".join(cue["words"]),
        })
    return clean_cues


def _pick_caption_file(files: List[str], extension: str) -> Optional[str]:
    candidates = [name for name in files if name.lower().endswith(f".{extension}")]
    if not candidates:
        return None

    def rank(name: str) -> int:
        lower = name.lower()
        if lower.endswith(f".en.{extension}"):
            return 0
        if lower.endswith(f".en-orig.{extension}"):
            return 1
        if lower.endswith(f".en-us.{extension}") or lower.endswith(f".en-gb.{extension}"):
            return 2
        return 3

    return sorted(candidates, key=rank)[0]


def _ytdlp_json3_payload(tmpdir: str, video_id: str, url: str, title: str, uploader: str, interval: int) -> Optional[Dict[str, Any]]:
    files = os.listdir(tmpdir)
    chosen = _pick_caption_file(files, "json3")
    if chosen:
        try:
            with open(os.path.join(tmpdir, chosen), "r", encoding="utf-8") as handle:
                events = json.load(handle).get("events", [])
            cues = _json3_cues(events)
            timed_words = _json3_words(events)
            if cues and timed_words:
                return _build_payload(video_id, url, title, uploader, cues, timed_words, interval)
        except (OSError, ValueError, AttributeError) as error:
            print(f"[extract] json3_parse_failed={type(error).__name__}", file=sys.stderr)

    chosen_vtt = _pick_caption_file(files, "vtt")
    if chosen_vtt:
        try:
            with open(os.path.join(tmpdir, chosen_vtt), "r", encoding="utf-8") as handle:
                timed_words = _vtt_words(handle.read())
            cues = _cues_from_words(timed_words)
            if cues and timed_words:
                return _build_payload(video_id, url, title, uploader, cues, timed_words, interval)
        except (OSError, ValueError) as error:
            print(f"[extract] vtt_parse_failed={type(error).__name__}", file=sys.stderr)

    return None


def fetch_via_ytdlp(video_id: str, url: str, title: str, uploader: str, interval: int) -> Optional[Dict[str, Any]]:
    """
    Fallback caption download through yt-dlp.

    yt-dlp negotiates the YouTube signature/PO-token handshake for us. We ask
    for JSON3 first so per-word offsets survive, and keep WebVTT only as a
    last resort. The old hard-coded `android` player client is deliberately
    gone: current yt-dlp releases reject it for most videos.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "caption.%(ext)s")
        command = [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", "en,en-US,en-GB,en-orig",
            "--sub-format", "json3/vtt",
            "--retries", "2",
            "--socket-timeout", "8",
            "-o", output_template,
            url,
        ]
        if shutil.which("node"):
            command[1:1] = ["--js-runtimes", "node"]
        try:
            subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=25,
            )
        except FileNotFoundError:
            print("[extract] ytdlp_missing", file=sys.stderr)
            return None
        except subprocess.TimeoutExpired:
            raise TranscriptError(TIMEOUT, TIMEOUT_MESSAGE)

        return _ytdlp_json3_payload(tmpdir, video_id, url, title, uploader, interval)


def _preferred_error(*errors: Optional[BaseException]) -> TranscriptError:
    """Pick the most actionable failure when both retrieval paths fail."""
    candidates = [error for error in errors if error is not None]
    for error in candidates:
        if isinstance(error, TranscriptError) and error.code == VIDEO_UNAVAILABLE:
            return error
    for error in candidates:
        if isinstance(error, TranscriptError) and error.code == RATE_LIMITED:
            return error
    for error in candidates:
        if isinstance(error, TranscriptError):
            return error
    if candidates:
        return _classify_api_error(candidates[0])
    return TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)


def fetch_youtube_transcript(url: str, interval: int = 30) -> Dict[str, Any]:
    """
    Resolve one YouTube URL into verbatim, word-timed English speech data.

    Path 1 is the direct JSON3 caption API (1-3 seconds). Path 2 is yt-dlp for
    videos where the direct API is throttled or needs a signed handshake. Both
    paths classify failures so the studio can explain what actually happened.
    """
    video_id = extract_youtube_id(url)
    if not video_id:
        raise TranscriptError(
            INVALID_URL,
            f"Invalid YouTube URL or Video ID: '{url}'. Please provide a valid YouTube link.",
        )

    started_at = time.time()

    # 1. Metadata + an early, unambiguous unavailable/private check.
    title = "YouTube Shadowing Session"
    uploader = "Content Creator"
    metadata = _fetch_oembed(video_id)
    if metadata:
        title = metadata.get("title") or title
        uploader = metadata.get("creator") or uploader
    print(f"[extract] oembed={round(time.time() - started_at, 2)}s", file=sys.stderr)

    # 2. Direct caption API inside a hard 4s budget.
    api_started = time.time()
    api_box: Dict[str, Any] = {}

    def _api_worker() -> None:
        try:
            result = fetch_via_transcript_api(video_id, url, title, uploader, interval)
            if result:
                api_box["data"] = result
            else:
                api_box["error"] = TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)
        except BaseException as error:  # classified below
            api_box["error"] = error

    api_thread = threading.Thread(target=_api_worker, daemon=True)
    api_thread.start()
    api_thread.join(timeout=4.0)

    if "data" in api_box:
        print(f"[extract] api={round(time.time() - api_started, 2)}s", file=sys.stderr)
        return api_box["data"]

    api_error = api_box.get("error")
    if api_error is not None:
        print(
            f"[extract] api_failed={round(time.time() - api_started, 2)}s "
            f"({type(api_error).__name__}: {getattr(api_error, 'code', 'error')})",
            file=sys.stderr,
        )
        if isinstance(api_error, TranscriptError) and api_error.code == VIDEO_UNAVAILABLE:
            raise api_error
    else:
        print(f"[extract] api_timeout={round(time.time() - api_started, 2)}s", file=sys.stderr)

    # 3. yt-dlp fallback.
    fallback_started = time.time()
    ytdlp_error: Optional[BaseException] = None
    try:
        result = fetch_via_ytdlp(video_id, url, title, uploader, interval)
        print(f"[extract] ytdlp={round(time.time() - fallback_started, 2)}s", file=sys.stderr)
        if result:
            return result
        ytdlp_error = TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)
    except TranscriptError as error:
        print(
            f"[extract] ytdlp_failed={round(time.time() - fallback_started, 2)}s ({error.code})",
            file=sys.stderr,
        )
        ytdlp_error = error
    except Exception as error:
        print(
            f"[extract] ytdlp_failed={round(time.time() - fallback_started, 2)}s "
            f"({type(error).__name__})",
            file=sys.stderr,
        )
        ytdlp_error = error

    raise _preferred_error(
        api_error if isinstance(api_error, BaseException) else None,
        ytdlp_error,
    )

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

    except TranscriptError as error:
        # The backend parses this line and maps the code to an HTTP response.
        print(f"FLAPTAP_ERROR:{error.code}:{error.message}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
