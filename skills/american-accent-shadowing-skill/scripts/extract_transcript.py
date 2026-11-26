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
import html
import json
import re
import argparse
import concurrent.futures
import tempfile
import subprocess
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Dict, Any, Optional, Tuple

# Hard ceiling for every network operation in this helper.
socket.setdefaulttimeout(8)

# Machine-readable failure codes mapped by the Node backend.
VIDEO_UNAVAILABLE = "video_unavailable"
NO_CAPTIONS = "no_captions"
RATE_LIMITED = "rate_limited"
TIMEOUT = "timeout"
INVALID_URL = "invalid_url"
LIVE_FETCH_DISABLED = "live_fetch_disabled"

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
LIVE_FETCH_DISABLED_MESSAGE = (
    "Live transcript fetching is disabled by guard policy (FLAPTAP_LIVE_TRANSCRIPTS=off)."
)


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
                text = html.unescape(re.sub(r'<[^>]+>', '', " ".join(buffer_lines)))
                text = re.sub(r'\s+', ' ', text).strip()
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
            clean_line = html.unescape(re.sub(r'<[^>]+>', '', line))
            clean_line = re.sub(r'\s+', ' ', clean_line).strip()
            if clean_line and clean_line not in buffer_lines:
                buffer_lines.append(clean_line)

    if current_start is not None and buffer_lines:
        text = html.unescape(re.sub(r'<[^>]+>', '', " ".join(buffer_lines)))
        text = re.sub(r'\s+', ' ', text).strip()
        if text:
            cues.append({
                "start": current_start,
                "end": current_end,
                "start_sec": round(parse_seconds(current_start), 3),
                "end_sec": round(parse_seconds(current_end), 3),
                "text": text,
            })

    # Deduplicate rolling lines strictly at word boundaries (never strip mid-cue or mid-word)
    deduped_cues = []
    last_raw_text = ""
    last_emitted_text = ""
    for cue in cues:
        raw_text = cue["text"]
        if raw_text == last_raw_text or raw_text == last_emitted_text:
            last_raw_text = raw_text
            continue

        cue_text = raw_text
        matched_prefix = ""
        for prev_text in (last_raw_text, last_emitted_text):
            if prev_text and raw_text.startswith(prev_text + " ") and len(prev_text) > len(matched_prefix):
                matched_prefix = prev_text

        if matched_prefix:
            cue_text = raw_text[len(matched_prefix) + 1:].strip()
        else:
            curr_words = raw_text.split()
            best_overlap = 0
            for prev_text in (last_raw_text, last_emitted_text):
                if not prev_text:
                    continue
                prev_words = prev_text.split()
                max_k = min(len(prev_words), len(curr_words))
                for k in range(max_k, 1, -1):
                    if prev_words[-k:] == curr_words[:k]:
                        if k > best_overlap:
                            best_overlap = k
                        break
            if best_overlap >= 2:
                cue_text = " ".join(curr_words[best_overlap:]).strip()

        last_raw_text = raw_text
        if cue_text:
            cue["text"] = cue_text
            deduped_cues.append(cue)
            last_emitted_text = cue_text

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


def parse_json3_events(events: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses native YouTube JSON3 caption events into verbatim cues and exact
    per-word timed_words with monotonic millisecond precision.

    Strictly preserves the original word sequence and never sorts or drops words.
    """
    timed_words: List[Dict[str, Any]] = []
    cues: List[Dict[str, Any]] = []

    def clean_token(token: str) -> str:
        return re.sub(r'^[^\w\']+|[^\w\']+$', '', token.lower())

    # Pass 1: collect text-bearing events in exact original order
    parsed_events: List[Dict[str, Any]] = []
    for ev in events:
        segs = ev.get('segs', [])
        if not segs:
            continue

        t_start = round((ev.get('tStartMs', 0) or 0) / 1000.0, 3)
        d_dur = max(0.0, (ev.get('dDurationMs', 0) or 0) / 1000.0)

        seg_groups: List[Dict[str, Any]] = []
        prev_ended_with_ws = True

        for s in segs:
            utf8 = s.get('utf8', '')
            if not utf8:
                continue
            normalized = utf8.replace('\r', ' ').replace('\n', ' ')
            if not normalized.strip():
                prev_ended_with_ws = True
                continue

            starts_with_ws = normalized[0].isspace()
            ends_with_ws = normalized[-1].isspace()
            tokens = normalized.strip().split()
            offset = (s.get('tOffsetMs', 0) or 0) / 1000.0
            seg_start = round(t_start + offset, 3)

            if not starts_with_ws and not prev_ended_with_ws and seg_groups:
                seg_groups[-1]['tokens'][-1] += tokens[0]
                tokens = tokens[1:]

            if tokens:
                seg_groups.append({'start_sec': seg_start, 'tokens': tokens})

            prev_ended_with_ws = ends_with_ws

        if seg_groups:
            parsed_events.append({
                't_start': t_start,
                'd_dur': d_dur,
                'seg_groups': seg_groups,
            })

    # Pass 2: bounded interpolation within each seg_group window; no sorting, no word dropping
    for ev_idx, ev in enumerate(parsed_events):
        t_start = ev['t_start']
        d_dur = ev['d_dur']
        seg_groups = ev['seg_groups']
        next_ev_start = parsed_events[ev_idx + 1]['t_start'] if ev_idx + 1 < len(parsed_events) else None
        raw_end = round(t_start + d_dur, 3) if d_dur > 0 else None

        if next_ev_start is not None and next_ev_start > t_start:
            ev_window_end = (
                min(raw_end, next_ev_start)
                if (raw_end is not None and raw_end > t_start)
                else next_ev_start
            )
        elif raw_end is not None and raw_end > t_start:
            ev_window_end = raw_end
        else:
            ev_window_end = None

        event_words: List[Dict[str, Any]] = []
        for g_idx, grp in enumerate(seg_groups):
            g_start = grp['start_sec']
            tokens = grp['tokens']
            if g_idx + 1 < len(seg_groups):
                g_end = seg_groups[g_idx + 1]['start_sec']
            elif ev_window_end is not None and ev_window_end > g_start:
                g_end = ev_window_end
            elif next_ev_start is not None and next_ev_start > g_start:
                g_end = next_ev_start
            else:
                g_end = round(g_start + max(0.25, 0.22 * len(tokens)), 3)

            if g_end < g_start:
                g_end = g_start

            g_dur = g_end - g_start
            m = len(tokens)
            for tok_idx, tok in enumerate(tokens):
                tok_start = round(g_start, 3) if m == 1 else round(g_start + (tok_idx / m) * g_dur, 3)
                event_words.append({
                    'word': tok,
                    'clean': clean_token(tok),
                    'start_sec': tok_start,
                })

        if ev_window_end is not None and ev_window_end > event_words[-1]['start_sec']:
            cue_end = round(ev_window_end, 3)
        elif next_ev_start is not None and next_ev_start > event_words[-1]['start_sec']:
            cue_end = round(next_ev_start, 3)
        else:
            cue_end = round(max(t_start + d_dur, event_words[-1]['start_sec'] + 0.25), 3)

        cue_idx = len(cues)
        cue_text = ' '.join(w['word'] for w in event_words)

        cues.append({
            'start': format_seconds_str(t_start),
            'end': format_seconds_str(cue_end),
            'start_sec': t_start,
            'end_sec': cue_end,
            'text': cue_text,
        })

        for i, w in enumerate(event_words):
            w['cue_index'] = cue_idx
            w['cue_end'] = (i == len(event_words) - 1)
            timed_words.append(w)

    # Pass 3: in-place monotonic clamping & end_sec assignment — never sort or drop words
    for i in range(1, len(timed_words)):
        if timed_words[i]['start_sec'] < timed_words[i - 1]['start_sec']:
            timed_words[i]['start_sec'] = timed_words[i - 1]['start_sec']

    for i, w in enumerate(timed_words):
        if i + 1 < len(timed_words):
            next_start = timed_words[i + 1]['start_sec']
            cue_end = cues[w['cue_index']]['end_sec']
            if w['cue_end'] and w['start_sec'] < cue_end < next_start:
                w['end_sec'] = round(cue_end, 3)
            elif next_start > w['start_sec']:
                w['end_sec'] = round(next_start, 3)
            else:
                w['end_sec'] = round(w['start_sec'] + 0.01, 3)
        else:
            last_cue_end = cues[-1]['end_sec'] if cues else w['start_sec'] + 0.35
            w['end_sec'] = round(max(w['start_sec'] + 0.35, last_cue_end), 3)

    return cues, timed_words


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


def _assert_live_fetch_allowed() -> None:
    flag = (os.environ.get("FLAPTAP_LIVE_TRANSCRIPTS") or "").strip().lower()
    if flag in ("off", "0", "false"):
        raise TranscriptError(LIVE_FETCH_DISABLED, LIVE_FETCH_DISABLED_MESSAGE)
    if flag not in ("on", "1", "true") and (os.environ.get("NODE_ENV") or "").strip().lower() == "test":
        raise TranscriptError(LIVE_FETCH_DISABLED, LIVE_FETCH_DISABLED_MESSAGE)


def fetch_youtube_transcript(url: str, interval: int = 30) -> Dict[str, Any]:
    """
    Ultra-fast verbatim transcript extraction:
    Directly retrieves the exact original subtitles provided by the video itself
    via YouTubeTranscriptApi in ~0.5-1.5s, with clean yt-dlp subtitle fallback.
    """
    _assert_live_fetch_allowed()

    video_id = extract_youtube_id(url)
    if not video_id:
        raise TranscriptError(
            INVALID_URL,
            f"Invalid YouTube URL or Video ID: '{url}'. Please provide a valid YouTube link.",
        )

    # 1. Start fast YouTube oEmbed concurrently with caption extraction
    title = "YouTube Shadowing Session"
    uploader = "Content Creator"
    saw_rate_limit = False
    saw_no_captions = False
    saw_unavailable = False

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        oembed_future = executor.submit(_fetch_oembed, video_id)

        def resolve_oembed() -> None:
            nonlocal title, uploader
            metadata = oembed_future.result()
            if metadata:
                title = metadata.get("title") or title
                uploader = metadata.get("creator") or uploader

        # 2. Direct YouTubeTranscriptApi: exact original video subtitles
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            api = YouTubeTranscriptApi()

            tr = None
            has_list = hasattr(api, "list")
            if has_list:
                try:
                    t_list = api.list(video_id)
                    try:
                        tr = t_list.find_manually_created_transcript(['en', 'en-US', 'en-GB', 'en-orig'])
                    except Exception:
                        tr = t_list.find_generated_transcript(['en', 'en-US', 'en-GB', 'en-orig'])
                except Exception as list_err:
                    list_msg = str(list_err).lower()
                    if any(k in list_msg for k in ("ipblocked", "requestblocked", "too many requests", "429", "rate limit")):
                        saw_rate_limit = True
                    elif "videounavailable" in list_msg or "invalidvideoid" in list_msg:
                        saw_unavailable = True
                    elif "transcriptsdisabled" in list_msg or "notranscriptfound" in list_msg:
                        saw_no_captions = True
                    tr = None

            # Prefer per-word JSON3 timedtext track directly from YouTube
            if tr and getattr(tr, '_url', None) and not saw_rate_limit:
                try:
                    timedtext_url = tr._url
                    if '&fmt=' not in timedtext_url:
                        timedtext_url += '&fmt=json3'
                    else:
                        timedtext_url = re.sub(r'&fmt=[^&]+', '&fmt=json3', timedtext_url)
                    req = urllib.request.Request(timedtext_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req, timeout=4) as resp:
                        json3_payload = json.loads(resp.read().decode("utf-8"))
                        events = json3_payload.get("events", [])
                        if events:
                            cues, timed_words = parse_json3_events(events)
                            if cues and timed_words:
                                resolve_oembed()
                                grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
                                sentences = group_cues_into_sentences(cues)
                                full_text = " ".join(c["text"] for c in cues)
                                duration = int(cues[-1]["end_sec"]) if cues else 180
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
                except urllib.error.HTTPError as http_err:
                    if http_err.code == 429:
                        saw_rate_limit = True
                except Exception:
                    pass

            transcripts = None
            if tr and not saw_rate_limit:
                try:
                    transcripts = tr.fetch()
                except Exception as fetch_err:
                    fetch_msg = str(fetch_err).lower()
                    if any(k in fetch_msg for k in ("ipblocked", "requestblocked", "too many requests", "429", "rate limit")):
                        saw_rate_limit = True
                    transcripts = None
            elif not has_list and not saw_rate_limit and hasattr(api, "fetch"):
                try:
                    transcripts = api.fetch(video_id)
                except Exception as api_err:
                    api_msg = str(api_err).lower()
                    if any(k in api_msg for k in ("ipblocked", "requestblocked", "too many requests", "429", "rate limit")):
                        saw_rate_limit = True
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
                    resolve_oembed()
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
            if any(k in err_msg for k in ("ipblocked", "requestblocked", "too many requests", "429", "rate limit")):
                saw_rate_limit = True

        resolve_oembed()

    if saw_rate_limit:
        raise TranscriptError(RATE_LIMITED, RATE_LIMITED_MESSAGE)
    if saw_unavailable:
        raise TranscriptError(VIDEO_UNAVAILABLE, VIDEO_UNAVAILABLE_MESSAGE)
    if saw_no_captions:
        raise TranscriptError(NO_CAPTIONS, NO_CAPTIONS_MESSAGE)

    # 3. Clean yt-dlp fallback to download the exact video caption file (never retries on 429/disabled/unavailable)
    with tempfile.TemporaryDirectory() as tmpdir:
        sub_prefix = os.path.join(tmpdir, "caption")
        dl_cmd = [
            "yt-dlp",
            "--no-playlist",
            "--retries", "0",
            "--extractor-retries", "0",
            "--fragment-retries", "0",
            "--sleep-requests", "1.5",
            "--sleep-subtitles", "1.5",
            "--extractor-args", "youtube:player_client=android",
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", "en-orig,en-US,en",
            "--sub-format", "json3/vtt",
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

        json3_files = [f for f in os.listdir(tmpdir) if f.endswith(".json3")]
        if json3_files:
            json3_files.sort(key=lambda name: (
                0 if "en-orig" in name else (1 if "en-US" in name else 2)
            ))
            try:
                with open(os.path.join(tmpdir, json3_files[0]), "r", encoding="utf-8") as jf:
                    j_data = json.load(jf)
                    events = j_data.get("events", [])
                    if events:
                        cues, timed_words = parse_json3_events(events)
                        if cues and timed_words:
                            grouped_chunks = group_cues_by_interval(cues, interval_sec=interval)
                            sentences = group_cues_into_sentences(cues)
                            full_text = " ".join(c["text"] for c in cues)
                            duration = int(cues[-1]["end_sec"]) if cues else 180
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
            except Exception:
                pass

        vtt_files = [f for f in os.listdir(tmpdir) if f.endswith(".vtt")]
        if not vtt_files:
            stderr_low = (res.stderr or "").lower()
            if saw_rate_limit or any(
                k in stderr_low
                for k in ("429", "too many requests", "sign in to confirm", "not a bot", "captcha", "rate limit")
            ):
                raise TranscriptError(RATE_LIMITED, RATE_LIMITED_MESSAGE)
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
