#!/usr/bin/env python3
"""
Flaptap — Shared Universal Media-to-Word-Timed-Transcript Helper.

Used by BOTH American Extractor and Transcript Lab (zero duplication).
Reuses `parse_json3_events`, `clean_vtt_cues`, `extract_timed_words`, and
`format_seconds_str` directly from `extract_transcript.py`.

Capabilities:
  1. Direct audio/video URLs (.mp3, .m4a, .wav, .mp4, .webm, .ogg, .opus, .mov)
     downloaded via streaming HTTP (no yt-dlp overhead).
  2. Podcast RSS / XML feeds -> resolves latest episode <enclosure> audio +
     optional Podcasting 2.0 <podcast:transcript> VTT/SRT/JSON captions.
  3. Universal social & media platforms (TikTok, Instagram, X, Vimeo, Facebook,
     Reddit, TED, Loom, Twitch, SoundCloud, Apple Podcasts episodes, etc.) via
     yt-dlp with platform subtitles fast-path and local faster-whisper fallback.
  4. Optional `--word-timestamps`: emits exact millisecond-aligned `timed_words`
     and `cues` for both platform subtitles and faster-whisper (with Silero VAD).
  5. Optional `--persist-media-dir <dir> --media-id <id>`: saves one compact
     playable media file so Flaptap streams exact millisecond word/clip audio.

The Node service treats stdout as data only and reads the final
`FLAPTAP_RESULT:{json}` line. Failures use `FLAPTAP_ERROR:<code>:<message>`.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from extract_transcript import (  # noqa: E402
    clean_vtt_cues,
    extract_timed_words,
    format_seconds_str,
    parse_json3_events,
)

MAX_DOWNLOAD_BYTES = 320 * 1024 * 1024
SUBTITLE_LANGS = "en.*,en,en-US,en-GB,en-orig"
DIRECT_MEDIA_EXTS = {
    ".mp3": ("audio/mpeg", False),
    ".m4a": ("audio/mp4", False),
    ".wav": ("audio/wav", False),
    ".aac": ("audio/aac", False),
    ".flac": ("audio/flac", False),
    ".ogg": ("audio/ogg", False),
    ".opus": ("audio/opus", False),
    ".mp4": ("video/mp4", True),
    ".m4v": ("video/mp4", True),
    ".webm": ("video/webm", True),
    ".mov": ("video/quicktime", True),
    ".mkv": ("video/x-matroska", True),
}


class MediaError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def emit_error(code: str, message: str) -> None:
    print(f"FLAPTAP_ERROR:{code}:{message}", file=sys.stderr)
    sys.exit(2)


def _is_live_fetch_disabled() -> bool:
    flag = (os.environ.get("FLAPTAP_LIVE_TRANSCRIPTS") or "").strip().lower()
    if flag in ("off", "0", "false"):
        return True
    if flag not in ("on", "1", "true") and (os.environ.get("NODE_ENV") or "").strip().lower() == "test":
        return True
    return False


def _is_rate_limit_stderr(stderr: str) -> bool:
    low = (stderr or "").lower()
    return any(
        k in low
        for k in ("429", "too many requests", "rate limit", "temporarily blocked", "captcha", "sign in to confirm")
    )


def log(message: str) -> None:
    print(f"[media] {message}", file=sys.stderr)


def run_command(cmd: List[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        env={**os.environ, "PYTHONWARNINGS": "ignore"},
    )


def normalize_text(value: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    text = text.replace("\u200b", "").replace("\ufeff", "")
    return re.sub(r"\s+", " ", text).strip()


def clean_word_token(word: str) -> str:
    return re.sub(r"^[^\w']+|[^\w']+$", "", (word or "").lower())


def parse_srt_to_cues(srt_content: str) -> List[Dict[str, Any]]:
    """Converts SRT content to VTT-compatible format and reuses clean_vtt_cues."""
    converted = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", srt_content or "")
    return clean_vtt_cues("WEBVTT\n\n" + converted)


def parse_subtitle_file_structured(path: str) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Parses JSON3, VTT, or SRT into (full_text, cues, timed_words)."""
    lower = path.lower()
    if lower.endswith(".json3"):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                payload = json.load(handle)
            events = payload.get("events", []) or []
            cues, timed_words = parse_json3_events(events)
            text = normalize_text(" ".join(c["text"] for c in cues))
            return text, cues, timed_words
        except Exception:
            return "", [], []

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            raw = handle.read()
    except Exception:
        return "", [], []

    cues = parse_srt_to_cues(raw) if lower.endswith(".srt") else clean_vtt_cues(raw)
    if not cues:
        return "", [], []
    timed_words = extract_timed_words(cues)
    text = normalize_text(" ".join(c["text"] for c in cues))
    return text, cues, timed_words


def detect_direct_media_ext(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        ext = os.path.splitext(parsed.path.lower())[1]
        if ext in DIRECT_MEDIA_EXTS:
            return ext
    except Exception:
        pass
    return ""


def is_probably_rss_url(url: str) -> bool:
    low = (url or "").lower()
    path = urllib.parse.urlparse(low).path
    return (
        path.endswith(".xml")
        or path.endswith(".rss")
        or "/rss" in path
        or "/feed" in path
        or "feeds." in low
    )


def try_resolve_podcast_rss(url: str, workdir: str) -> Optional[Dict[str, Any]]:
    """
    If `url` is a Podcast RSS/Atom feed, extracts the latest episode audio
    enclosure URL, metadata, and any Podcasting 2.0 transcript link.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; FlaptapPodcast/1.0)",
                "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
            },
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            head_bytes = resp.read(2 * 1024 * 1024)
        snippet = head_bytes[:512].decode("utf-8", errors="ignore").lstrip()
        if not (
            "xml" in ctype
            or "rss" in ctype
            or snippet.startswith("<?xml")
            or "<rss" in snippet.lower()
            or "<feed" in snippet.lower()
        ):
            return None

        root = ET.fromstring(head_bytes)
        channel = root.find("channel")
        if channel is None:
            return None

        show_title = normalize_text(channel.findtext("title") or "")
        author = normalize_text(
            channel.findtext("{http://www.itunes.com/dtds/podcast-1.0.dtd}author")
            or channel.findtext("author")
            or show_title
        )
        item = channel.find("item")
        if item is None:
            return None

        ep_title = normalize_text(item.findtext("title") or show_title or "Podcast Episode")
        enclosure = item.find("enclosure")
        audio_url = enclosure.attrib.get("url", "").strip() if enclosure is not None else ""
        if not audio_url:
            return None

        # Check Podcasting 2.0 <podcast:transcript> tag for instant captions
        transcript_url = ""
        transcript_type = ""
        for child in item:
            tag_low = child.tag.lower()
            if tag_low.endswith("}transcript") or tag_low == "transcript":
                t_url = (child.attrib.get("url") or "").strip()
                t_type = (child.attrib.get("type") or "").lower()
                if t_url and any(k in t_type or t_url.lower().endswith(k) for k in ("vtt", "srt", "json")):
                    transcript_url = t_url
                    transcript_type = t_type
                    break

        image_el = item.find("{http://www.itunes.com/dtds/podcast-1.0.dtd}image")
        if image_el is None:
            image_el = channel.find("{http://www.itunes.com/dtds/podcast-1.0.dtd}image")
        thumb = image_el.attrib.get("href", "") if image_el is not None else ""

        return {
            "title": ep_title,
            "creator": author or show_title or "Podcast",
            "audio_url": audio_url,
            "transcript_url": transcript_url,
            "transcript_type": transcript_type,
            "thumbnail_url": thumb,
        }
    except Exception as error:
        log(f"RSS probe skipped: {error}")
        return None


def download_direct_url(url: str, dest_path: str, timeout: int = 120) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
    )
    total = 0
    with urllib.request.urlopen(req, timeout=timeout) as resp, open(dest_path, "wb") as out:
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise MediaError("media_too_large", "That media file exceeds the maximum supported size.")
            out.write(chunk)
    if total < 512:
        raise MediaError("download_failed", "The downloaded media file was empty.")
    return dest_path


def read_metadata(url: str) -> Dict[str, Any]:
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--retries",
        "1",
        "--extractor-retries",
        "1",
        "--sleep-requests",
        "1",
        "--socket-timeout",
        "12",
        "--print",
        "%(title)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s",
        url,
    ]
    try:
        result = run_command(cmd, timeout=30)
        if result.returncode != 0:
            return {}
        first = (result.stdout or "").strip().splitlines()[0] if result.stdout.strip() else ""
        parts = (first.split("\t") + ["", "", "", ""])[:4]
        title, uploader, duration, thumbnail = parts
        dur_val = 0
        try:
            dur_val = int(float(duration)) if duration and duration != "NA" else 0
        except Exception:
            dur_val = 0
        return {
            "title": normalize_text(title) if title != "NA" else "",
            "creator": normalize_text(uploader) if uploader != "NA" else "",
            "duration_seconds": dur_val,
            "thumbnail_url": thumbnail.strip() if thumbnail and thumbnail != "NA" else "",
        }
    except Exception:
        return {}


def try_platform_subtitles(
    url: str, workdir: str
) -> Tuple[str, str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    prefix = os.path.join(workdir, "subs")
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        SUBTITLE_LANGS,
        "--sub-format",
        "json3/vtt/srt",
        "--no-warnings",
        "--retries",
        "1",
        "--extractor-retries",
        "1",
        "--sleep-requests",
        "1",
        "--sleep-subtitles",
        "1",
        "--socket-timeout",
        "12",
        "-o",
        f"{prefix}.%(ext)s",
        url,
    ]
    res = None
    try:
        res = run_command(cmd, timeout=40)
    except Exception as error:
        log(f"Subtitle probe failed: {error}")
        return "", "", [], []

    files = [name for name in os.listdir(workdir) if name.startswith("subs.")]
    if not files:
        if res and _is_rate_limit_stderr(res.stderr):
            raise MediaError(
                "rate_limited",
                "The media provider is temporarily rate-limiting requests. Please wait before trying again.",
            )
        return "", "", [], []

    def rank(name: str) -> Tuple[int, int]:
        return (
            0 if "en-orig" in name else (1 if "en-US" in name else (2 if "en-GB" in name else 3)),
            0 if name.endswith(".json3") else (1 if name.endswith(".vtt") else 2),
        )

    files.sort(key=rank)
    for name in files:
        path = os.path.join(workdir, name)
        text, cues, timed_words = parse_subtitle_file_structured(path)
        if len(text) >= 40:
            engine = "platform_subtitles_json3" if name.endswith(".json3") else "platform_subtitles_vtt"
            return text, engine, cues, timed_words
    return "", "", [], []


def download_media_via_ytdlp(url: str, workdir: str, want_video: bool) -> str:
    prefix = os.path.join(workdir, "media")
    fmt = (
        "best[ext=mp4][height<=720]/bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/bestaudio[ext=m4a]/bestaudio/best"
        if want_video
        else "worstaudio[abr>=48]/bestaudio[abr<=96]/bestaudio[ext=m4a]/bestaudio/best"
    )
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--no-part",
        "--no-warnings",
        "--retries",
        "1",
        "--extractor-retries",
        "1",
        "--sleep-requests",
        "1",
        "--sleep-subtitles",
        "1",
        "--socket-timeout",
        "20",
        "--max-filesize",
        str(MAX_DOWNLOAD_BYTES),
        "-f",
        fmt,
    ]
    if want_video:
        cmd.extend(["--merge-output-format", "mp4"])
    cmd.extend(["-o", f"{prefix}.%(ext)s", url])
    dl_res = None
    try:
        dl_res = run_command(cmd, timeout=300)
    except subprocess.TimeoutExpired:
        raise MediaError("download_timeout", "Downloading that media took too long. Try a shorter clip.")
    except Exception as error:
        log(f"yt-dlp download failed: {error}")

    candidates = [
        os.path.join(workdir, name)
        for name in os.listdir(workdir)
        if name.startswith("media.") and not name.endswith(".part")
    ]
    candidates.sort(key=lambda p: os.path.getsize(p) if os.path.isfile(p) else 0, reverse=True)
    for path in candidates:
        if os.path.isfile(path) and os.path.getsize(path) > 1024:
            return path

    if dl_res and _is_rate_limit_stderr(dl_res.stderr):
        raise MediaError(
            "rate_limited",
            "The media provider is temporarily rate-limiting requests. Please wait before trying again.",
        )

    raise MediaError(
        "download_failed",
        "Could not download media from that link. The platform may require a login or the URL may not be a media page.",
    )


def probe_media_streams(file_path: str) -> Tuple[bool, bool, float]:
    """Uses ffprobe to detect (has_audio, has_video, duration_seconds)."""
    try:
        res = run_command(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type:format=duration",
                "-of",
                "json",
                file_path,
            ],
            timeout=15,
        )
        if res.returncode == 0 and res.stdout.strip():
            info = json.loads(res.stdout)
            streams = info.get("streams") or []
            has_audio = any(s.get("codec_type") == "audio" for s in streams)
            has_video = any(s.get("codec_type") == "video" for s in streams)
            dur = float((info.get("format") or {}).get("duration") or 0)
            return has_audio, has_video, round(dur, 3)
    except Exception:
        pass
    ext = os.path.splitext(file_path)[1].lower()
    _, is_vid = DIRECT_MEDIA_EXTS.get(ext, ("audio/mpeg", False))
    return True, is_vid, 0.0


def persist_playable_media(
    source_path: str, persist_dir: str, media_id: str
) -> Dict[str, Any]:
    """Copies downloaded media into Flaptap's shared `data/media/` for HTTP 206 playback."""
    os.makedirs(persist_dir, exist_ok=True)
    ext = os.path.splitext(source_path)[1].lower()
    if ext not in DIRECT_MEDIA_EXTS:
        ext = ".mp4"

    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", media_id or "")[:48] or "media_item"
    file_name = f"{safe_id}{ext}"
    dest = os.path.join(persist_dir, file_name)
    tmp = f"{dest}.tmp"
    shutil.copy2(source_path, tmp)
    os.replace(tmp, dest)

    has_audio, has_video, duration = probe_media_streams(dest)
    mime_type, default_vid = DIRECT_MEDIA_EXTS.get(ext, ("video/mp4", True))
    if not has_video and mime_type.startswith("video/"):
        mime_type = "audio/mp4" if ext == ".mp4" else "audio/webm"

    return {
        "media_file": file_name,
        "has_audio": bool(has_audio or True),
        "has_video": bool(has_video if (has_audio or has_video) else default_vid),
        "mime_type": mime_type,
        "duration_seconds": duration,
    }


def transcribe_whisper(
    path: str, model_name: str, max_seconds: int, word_timestamps: bool = False
) -> Dict[str, Any]:
    try:
        from faster_whisper import WhisperModel
    except Exception as error:
        raise MediaError("transcription_unavailable", f"Local speech transcription is unavailable: {error}")

    try:
        from faster_whisper import BatchedInferencePipeline
    except Exception:
        BatchedInferencePipeline = None

    physical_cores = max(1, (os.cpu_count() or 4) // 2 or 2)
    cpu_threads = max(1, min(max(1, physical_cores - 1), 3))
    try:
        os.nice(10)
    except Exception:
        pass
    try:
        model = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
            cpu_threads=cpu_threads,
        )
    except Exception as error:
        raise MediaError("model_unavailable", f"Could not load the Whisper model '{model_name}': {error}")

    vad_opts = {
        "threshold": 0.5,
        "min_speech_duration_ms": 250,
        "min_silence_duration_ms": 500,
        "speech_pad_ms": 400,
    }

    if BatchedInferencePipeline is not None:
        batched_model = BatchedInferencePipeline(model=model)
        segments, info = batched_model.transcribe(
            path,
            language="en",
            task="transcribe",
            batch_size=8,
            beam_size=1,
            best_of=1,
            temperature=0.0,
            without_timestamps=False,
            vad_filter=True,
            vad_parameters=vad_opts,
            condition_on_previous_text=False,
            word_timestamps=word_timestamps,
        )
    else:
        segments, info = model.transcribe(
            path,
            language="en",
            task="transcribe",
            beam_size=1,
            best_of=1,
            temperature=0.0,
            vad_filter=True,
            vad_parameters=vad_opts,
            condition_on_previous_text=False,
            word_timestamps=word_timestamps,
        )

    collected: List[Dict[str, Any]] = []
    cues: List[Dict[str, Any]] = []
    timed_words: List[Dict[str, Any]] = []
    parts: List[str] = []
    truncated = False
    last_word_start = 0.0

    for seg_idx, segment in enumerate(segments):
        start = round(float(getattr(segment, "start", 0) or 0), 3)
        end = round(float(getattr(segment, "end", start) or start), 3)
        if start > max_seconds:
            truncated = True
            break
        text = normalize_text(getattr(segment, "text", ""))
        if not text:
            continue
        parts.append(text)
        collected.append({"start": round(start, 3), "end": round(end, 3), "text": text})
        cues.append(
            {
                "start": format_seconds_str(start),
                "end": format_seconds_str(end),
                "start_sec": start,
                "end_sec": max(end, round(start + 0.12, 3)),
                "text": text,
            }
        )

        if word_timestamps:
            seg_words = list(getattr(segment, "words", None) or [])
            if seg_words:
                for w_idx, w in enumerate(seg_words):
                    token = normalize_text(getattr(w, "word", ""))
                    if not token:
                        continue
                    w_start = round(max(float(getattr(w, "start", start) or start), last_word_start), 3)
                    w_end = round(float(getattr(w, "end", w_start + 0.12) or (w_start + 0.12)), 3)
                    if w_end <= w_start:
                        w_end = round(w_start + 0.08, 3)
                    last_word_start = w_start
                    timed_words.append(
                        {
                            "word": token,
                            "clean": clean_word_token(token),
                            "start_sec": w_start,
                            "end_sec": w_end,
                            "cue_index": len(cues) - 1,
                            "cue_end": w_idx == len(seg_words) - 1,
                        }
                    )
            else:
                # Fallback interpolation for any segment lacking native words
                fallback = extract_timed_words([cues[-1]])
                for fw in fallback:
                    fw["cue_index"] = len(cues) - 1
                    timed_words.append(fw)
                    last_word_start = max(last_word_start, fw["start_sec"])

    # Enforce strict monotonic non-overlapping word ends
    for i in range(len(timed_words) - 1):
        nxt_start = timed_words[i + 1]["start_sec"]
        if timed_words[i]["end_sec"] > nxt_start and nxt_start > timed_words[i]["start_sec"]:
            timed_words[i]["end_sec"] = round(nxt_start, 3)

    return {
        "text": normalize_text(" ".join(parts)),
        "segments": collected,
        "cues": cues,
        "timed_words": timed_words,
        "duration_seconds": round(float(getattr(info, "duration", 0) or 0), 3),
        "truncated": truncated,
        "engine": "faster_whisper",
        "model": model_name,
    }


def _compress_audio_for_cloud(path: str, workdir: str, max_seconds: int = 1800) -> str:
    """Compresses oversized or exotic audio/video into lightweight 16kHz mono MP3 for Cloud Whisper 25MB limit."""
    ext = os.path.splitext(path)[1].lower()
    try:
        if os.path.getsize(path) <= 23 * 1024 * 1024 and ext in (".mp3", ".m4a", ".wav", ".ogg", ".webm", ".flac"):
            return path
    except Exception:
        return path

    out_path = os.path.join(workdir, "cloud_stt.mp3")
    res = run_command(
        [
            "ffmpeg",
            "-y",
            "-i",
            path,
            "-t",
            str(max(60, int(max_seconds or 1800))),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "32k",
            out_path,
        ],
        timeout=60,
    )
    if res.returncode == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 512:
        return out_path
    return path


def _build_multipart_form(fields: List[Tuple[str, str]], file_field: str, file_path: str) -> Tuple[bytes, str]:
    import uuid as _uuid

    boundary = f"----FlaptapBoundary{_uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{value}\r\n".encode("utf-8"))

    filename = os.path.basename(file_path) or "audio.mp3"
    ext = os.path.splitext(filename)[1].lower()
    mime = DIRECT_MEDIA_EXTS.get(ext, ("audio/mpeg", False))[0]
    with open(file_path, "rb") as fh:
        file_bytes = fh.read()

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(
        f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8")
    )
    body.extend(f"Content-Type: {mime}\r\n\r\n".encode("utf-8"))
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def transcribe_cloud_whisper(
    path: str,
    workdir: str,
    provider: str,
    api_key: str,
    base_url: str,
    model_name: str,
    max_seconds: int,
    word_timestamps: bool = False,
) -> Dict[str, Any]:
    """Transcodes if needed and runs zero-local-CPU Cloud Whisper (Groq / OpenAI)."""
    upload_path = _compress_audio_for_cloud(path, workdir, max_seconds=max_seconds)
    endpoint = f"{base_url.rstrip('/')}/audio/transcriptions"
    fields: List[Tuple[str, str]] = [
        ("model", model_name),
        ("language", "en"),
        ("response_format", "verbose_json"),
    ]
    if word_timestamps:
        fields.append(("timestamp_granularities[]", "word"))
        fields.append(("timestamp_granularities[]", "segment"))

    payload_bytes, content_type = _build_multipart_form(fields, "file", upload_path)
    req = urllib.request.Request(
        endpoint,
        data=payload_bytes,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": content_type,
            "User-Agent": "Flaptap/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as http_err:
        detail = ""
        try:
            detail = http_err.read().decode("utf-8", errors="replace")[:300]
        except Exception:
            pass
        raise MediaError("cloud_stt_failed", f"Cloud speech transcription error ({http_err.code}): {detail or http_err.reason}")
    except Exception as err:
        raise MediaError("cloud_stt_failed", f"Cloud speech request failed: {err}")

    raw_segments = list(data.get("segments") or [])
    raw_words = list(data.get("words") or [])
    collected: List[Dict[str, Any]] = []
    cues: List[Dict[str, Any]] = []
    parts: List[str] = []
    truncated = False

    if raw_segments:
        for seg in raw_segments:
            start = round(float(seg.get("start") or 0), 3)
            end = round(float(seg.get("end") or start), 3)
            if start > max_seconds:
                truncated = True
                break
            text = normalize_text(seg.get("text") or "")
            if not text:
                continue
            parts.append(text)
            collected.append({"start": start, "end": end, "text": text})
            cues.append(
                {
                    "start": format_seconds_str(start),
                    "end": format_seconds_str(end),
                    "start_sec": start,
                    "end_sec": max(end, round(start + 0.12, 3)),
                    "text": text,
                }
            )
    else:
        full = normalize_text(data.get("text") or "")
        if full:
            dur = round(float(data.get("duration") or max(2.0, len(full.split()) * 0.4)), 3)
            parts.append(full)
            collected.append({"start": 0.0, "end": dur, "text": full})
            cues.append({"start": format_seconds_str(0.0), "end": format_seconds_str(dur), "start_sec": 0.0, "end_sec": dur, "text": full})

    timed_words: List[Dict[str, Any]] = []
    if word_timestamps:
        if raw_words:
            last_w_start = 0.0
            for w in raw_words:
                token = normalize_text(w.get("word") or "")
                if not token:
                    continue
                w_start = round(max(float(w.get("start") or 0), last_w_start), 3)
                if w_start > max_seconds:
                    break
                w_end = round(float(w.get("end") or (w_start + 0.12)), 3)
                if w_end <= w_start:
                    w_end = round(w_start + 0.08, 3)
                last_w_start = w_start
                timed_words.append(
                    {
                        "word": token,
                        "clean": clean_word_token(token),
                        "start_sec": w_start,
                        "end_sec": w_end,
                    }
                )
        elif cues:
            timed_words = extract_timed_words(cues)

    for i in range(len(timed_words) - 1):
        nxt_start = timed_words[i + 1]["start_sec"]
        if timed_words[i]["end_sec"] > nxt_start and nxt_start > timed_words[i]["start_sec"]:
            timed_words[i]["end_sec"] = round(nxt_start, 3)

    return {
        "text": normalize_text(" ".join(parts) or str(data.get("text") or "")),
        "segments": collected,
        "cues": cues,
        "timed_words": timed_words,
        "duration_seconds": round(float(data.get("duration") or (cues[-1]["end_sec"] if cues else 0)), 3),
        "truncated": truncated,
        "engine": f"cloud_whisper_{provider}",
        "model": model_name,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe a media URL or local audio/video file to English text.")
    parser.add_argument("source", help="Media URL or local file path")
    parser.add_argument("--model", default=os.environ.get("FLAPTAP_WHISPER_MODEL", "base.en"))
    parser.add_argument("--max-seconds", type=int, default=int(os.environ.get("FLAPTAP_WHISPER_MAX_SECONDS", "1800")))
    parser.add_argument("--word-timestamps", action="store_true", help="Emit millisecond word-level timed_words & cues")
    parser.add_argument("--skip-subtitles", action="store_true", help="Skip subtitle probe when caller already attempted captions")
    parser.add_argument("--allow-local-whisper", action="store_true", help="Allow local CPU faster-whisper fallback when cloud STT and subtitles are unavailable")
    parser.add_argument("--persist-media-dir", default="", help="Directory to persist playable media for Range playback")
    parser.add_argument("--media-id", default="", help="Deterministic media ID prefix for persisted file")
    parser.add_argument("--output-json", default=None)
    args = parser.parse_args()

    source = str(args.source or "").strip()
    if not source:
        emit_error("missing_source", "A media URL or file path is required.")

    is_url = source.startswith("http://") or source.startswith("https://")
    if is_url and _is_live_fetch_disabled():
        emit_error(
            "live_fetch_disabled",
            "Live transcript fetching is disabled by guard policy (FLAPTAP_LIVE_TRANSCRIPTS=off).",
        )
    if not is_url and not os.path.isfile(source):
        emit_error("missing_file", "That local media file could not be found.")

    metadata: Dict[str, Any] = {}
    warnings: List[str] = []
    persisted_info: Dict[str, Any] = {}

    with tempfile.TemporaryDirectory(prefix="flaptap-media-") as workdir:
        subtitle_text = ""
        subtitle_engine = ""
        subtitle_cues: List[Dict[str, Any]] = []
        subtitle_words: List[Dict[str, Any]] = []
        media_path = ""

        if is_url:
            direct_ext = detect_direct_media_ext(source)
            rss_info = try_resolve_podcast_rss(source, workdir) if (not direct_ext and is_probably_rss_url(source)) else None

            if rss_info:
                metadata = {
                    "title": rss_info["title"],
                    "creator": rss_info["creator"],
                    "duration_seconds": 0,
                    "thumbnail_url": rss_info.get("thumbnail_url", ""),
                }
                # Try Podcasting 2.0 transcript if provided
                if rss_info.get("transcript_url"):
                    try:
                        t_ext = ".vtt" if "vtt" in rss_info["transcript_type"] or rss_info["transcript_url"].lower().endswith(".vtt") else ".srt"
                        t_file = os.path.join(workdir, f"podcast_sub{t_ext}")
                        download_direct_url(rss_info["transcript_url"], t_file, timeout=20)
                        subtitle_text, subtitle_cues, subtitle_words = parse_subtitle_file_structured(t_file)
                        if subtitle_text:
                            subtitle_engine = "podcast_transcript"
                    except Exception as err:
                        log(f"Podcast transcript fetch skipped: {err}")

                audio_ext = detect_direct_media_ext(rss_info["audio_url"]) or ".mp3"
                media_path = download_direct_url(rss_info["audio_url"], os.path.join(workdir, f"podcast{audio_ext}"))
            elif direct_ext:
                parsed_path = urllib.parse.urlparse(source).path
                base = urllib.parse.unquote(os.path.basename(parsed_path))
                clean_title = re.sub(r"[_-]+", " ", os.path.splitext(base)[0]).strip()
                metadata = {"title": clean_title or "Direct Media", "creator": urllib.parse.urlparse(source).hostname or "Direct Media", "duration_seconds": 0}
                media_path = download_direct_url(source, os.path.join(workdir, f"direct{direct_ext}"))
            else:
                if args.skip_subtitles:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                        meta_fut = ex.submit(read_metadata, source)
                        dl_fut = ex.submit(
                            download_media_via_ytdlp,
                            source,
                            workdir,
                            bool(args.persist_media_dir),
                        )
                        media_path = dl_fut.result()
                        metadata = meta_fut.result() or {}
                else:
                    metadata = read_metadata(source)
                    subtitle_text, subtitle_engine, subtitle_cues, subtitle_words = try_platform_subtitles(source, workdir)

                    # If caller wants persisted playback (Transcript Lab) for non-YouTube URLs, download compact playable media
                    if args.persist_media_dir and not media_path:
                        try:
                            media_path = download_media_via_ytdlp(source, workdir, want_video=True)
                        except Exception as dl_err:
                            if not subtitle_text:
                                raise
                            log(f"Media persistence skipped (subtitles available): {dl_err}")
        else:
            media_path = source

        if media_path and args.persist_media_dir:
            persisted_info = persist_playable_media(media_path, args.persist_media_dir, args.media_id)
            if persisted_info.get("duration_seconds") and not metadata.get("duration_seconds"):
                metadata["duration_seconds"] = persisted_info["duration_seconds"]

        if subtitle_text:
            cues_out = subtitle_cues if args.word_timestamps else []
            words_out = subtitle_words if args.word_timestamps else []
            segments_out = [
                {"start": c["start_sec"], "end": c["end_sec"], "text": c["text"]}
                for c in subtitle_cues
            ]
            duration_out = (
                metadata.get("duration_seconds")
                or (subtitle_cues[-1]["end_sec"] if subtitle_cues else 0)
            )
            result = {
                "title": metadata.get("title", ""),
                "creator": metadata.get("creator", ""),
                "thumbnail_url": metadata.get("thumbnail_url", ""),
                "text": subtitle_text,
                "segments": segments_out,
                "cues": cues_out,
                "timed_words": words_out,
                "duration_seconds": round(float(duration_out or 0), 3),
                "engine": subtitle_engine,
                "model": "",
                "truncated": False,
                "warnings": warnings,
                **persisted_info,
            }
        else:
            cloud_key = (os.environ.get("FLAPTAP_CLOUD_STT_KEY") or "").strip()
            cloud_provider = (os.environ.get("FLAPTAP_CLOUD_STT_PROVIDER") or "groq").strip().lower()
            cloud_base = (os.environ.get("FLAPTAP_CLOUD_STT_BASE_URL") or (
                "https://api.openai.com/v1" if cloud_provider == "openai" else "https://api.groq.com/openai/v1"
            )).strip()
            cloud_model = (os.environ.get("FLAPTAP_CLOUD_STT_MODEL") or (
                "whisper-1" if cloud_provider == "openai" else "whisper-large-v3-turbo"
            )).strip()

            if not cloud_key and not args.allow_local_whisper:
                raise MediaError(
                    "local_whisper_disabled",
                    "Local Whisper CPU transcription is off unless explicitly requested or a Cloud Speech key is configured.",
                )

            if not media_path and is_url:
                media_path = download_media_via_ytdlp(source, workdir, want_video=bool(args.persist_media_dir))
                if args.persist_media_dir:
                    persisted_info = persist_playable_media(media_path, args.persist_media_dir, args.media_id)

            transcribed = None
            if cloud_key:
                try:
                    transcribed = transcribe_cloud_whisper(
                        media_path,
                        workdir,
                        cloud_provider,
                        cloud_key,
                        cloud_base,
                        cloud_model,
                        max(60, args.max_seconds),
                        word_timestamps=bool(args.word_timestamps),
                    )
                except MediaError as cloud_err:
                    if not args.allow_local_whisper:
                        raise cloud_err
                    log(f"Cloud Whisper failed, falling back to opted-in local Whisper: {cloud_err}")

            if transcribed is None:
                if not args.allow_local_whisper:
                    raise MediaError(
                        "local_whisper_disabled",
                        "Local Whisper CPU transcription was not enabled.",
                    )
                transcribed = transcribe_whisper(
                    media_path,
                    args.model,
                    max(60, args.max_seconds),
                    word_timestamps=bool(args.word_timestamps),
                )
            if not transcribed["text"].strip():
                raise MediaError(
                    "no_speech",
                    "No English speech was detected in that media. Try a clip with clear spoken audio.",
                )
            if transcribed.get("truncated"):
                warnings.append(
                    f"Transcribed the first {max(1, args.max_seconds // 60)} minutes; the rest was skipped."
                )
            result = {
                "title": metadata.get("title", ""),
                "creator": metadata.get("creator", ""),
                "thumbnail_url": metadata.get("thumbnail_url", ""),
                "text": transcribed["text"],
                "segments": transcribed["segments"],
                "cues": transcribed["cues"] if args.word_timestamps else [],
                "timed_words": transcribed["timed_words"] if args.word_timestamps else [],
                "duration_seconds": transcribed.get("duration_seconds", metadata.get("duration_seconds", 0)),
                "engine": transcribed["engine"],
                "model": transcribed.get("model", ""),
                "truncated": bool(transcribed.get("truncated")),
                "warnings": warnings,
                **persisted_info,
            }

    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2)

    print("FLAPTAP_RESULT:" + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except MediaError as error:
        emit_error(error.code, error.message)
    except subprocess.TimeoutExpired:
        emit_error("timeout", "Media processing took too long. Try a shorter clip.")
    except Exception as error:  # pragma: no cover - defensive boundary
        emit_error("unknown", str(error))
