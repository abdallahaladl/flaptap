#!/usr/bin/env python3
"""
Flaptap — media-to-text helper for the American English Extractor.

One job: turn an audio/video URL or a local media file into verbatim English
speech text. Fast path first: existing platform subtitles via yt-dlp (seconds).
Fallback: yt-dlp audio download + local faster-whisper transcription (CPU).

The Node service treats stdout as data only and reads the final
`FLAPTAP_RESULT:{json}` line. Failures use `FLAPTAP_ERROR:<code>:<message>`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple

MAX_DOWNLOAD_BYTES = 320 * 1024 * 1024
SUBTITLE_LANGS = "en.*,en,en-US,en-GB,en-orig"


class MediaError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def emit_error(code: str, message: str) -> None:
    print(f"FLAPTAP_ERROR:{code}:{message}", file=sys.stderr)
    sys.exit(2)


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
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = text.replace("\u200b", "").replace("\ufeff", "")
    return re.sub(r"\s+", " ", text).strip()


def parse_vtt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        content = handle.read()
    lines: List[str] = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.upper().startswith("WEBVTT") or line.startswith("NOTE "):
            continue
        if "-->" in line or re.fullmatch(r"\d{1,4}", line):
            continue
        lines.append(normalize_text(line))
    return normalize_text(" ".join(lines))


def parse_json3(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            payload = json.load(handle)
    except Exception:
        return ""
    parts: List[str] = []
    for event in payload.get("events", []) or []:
        for segment in event.get("segs", []) or []:
            piece = normalize_text(segment.get("utf8", ""))
            if piece:
                parts.append(piece)
    return normalize_text(" ".join(parts))


def read_metadata(url: str) -> Dict[str, Any]:
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--socket-timeout",
        "12",
        "--print",
        "%(title)s\t%(uploader)s\t%(duration)s",
        url,
    ]
    try:
        result = run_command(cmd, timeout=35)
        if result.returncode != 0:
            return {}
        first = (result.stdout or "").strip().splitlines()[0] if result.stdout.strip() else ""
        title, uploader, duration = (first.split("\t") + ["", "", ""])[:3]
        return {
            "title": normalize_text(title),
            "creator": normalize_text(uploader),
            "duration_seconds": int(float(duration)) if duration and duration.replace(".", "", 1).isdigit() else 0,
        }
    except Exception:
        return {}


def try_platform_subtitles(url: str, workdir: str) -> Tuple[str, str]:
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
        "vtt/json3",
        "--no-warnings",
        "--socket-timeout",
        "12",
        "-o",
        f"{prefix}.%(ext)s",
        url,
    ]
    try:
        run_command(cmd, timeout=45)
    except Exception as error:
        log(f"Subtitle probe failed: {error}")
        return "", ""

    files = [name for name in os.listdir(workdir) if name.startswith("subs.")]
    if not files:
        return "", ""

    def rank(name: str) -> Tuple[int, int]:
        return (
            0 if "en-orig" in name else (1 if "en-US" in name else (2 if "en-GB" in name else 3)),
            0 if name.endswith(".json3") else 1,
        )

    files.sort(key=rank)
    for name in files:
        path = os.path.join(workdir, name)
        text = parse_json3(path) if name.endswith(".json3") else parse_vtt(path)
        if len(text) >= 180:
            return text, "platform_subtitles"
    return "", ""


def download_audio(url: str, workdir: str) -> str:
    prefix = os.path.join(workdir, "audio")
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--no-part",
        "--no-warnings",
        "--socket-timeout",
        "20",
        "--max-filesize",
        str(MAX_DOWNLOAD_BYTES),
        "-f",
        "bestaudio/best",
        "-o",
        f"{prefix}.%(ext)s",
        url,
    ]
    try:
        run_command(cmd, timeout=300)
    except subprocess.TimeoutExpired:
        raise MediaError("download_timeout", "Downloading that media took too long. Try a shorter clip.")
    except Exception as error:
        log(f"yt-dlp audio download failed: {error}")

    for name in os.listdir(workdir):
        if name.startswith("audio.") and not name.endswith(".part"):
            path = os.path.join(workdir, name)
            if os.path.getsize(path) > 1024:
                return path

    raise MediaError(
        "download_failed",
        "Could not download audio from that link. The platform may require a login or the URL may not be a media page.",
    )


def transcribe(path: str, model_name: str, max_seconds: int) -> Dict[str, Any]:
    try:
        from faster_whisper import WhisperModel
    except Exception as error:
        raise MediaError("transcription_unavailable", f"Local speech transcription is unavailable: {error}")

    try:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
    except Exception as error:
        raise MediaError("model_unavailable", f"Could not load the Whisper model '{model_name}': {error}")

    segments, info = model.transcribe(
        path,
        language="en",
        task="transcribe",
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=False,
    )

    collected: List[Dict[str, Any]] = []
    parts: List[str] = []
    truncated = False
    for segment in segments:
        start = float(getattr(segment, "start", 0) or 0)
        if start > max_seconds:
            truncated = True
            break
        text = normalize_text(getattr(segment, "text", ""))
        if not text:
            continue
        parts.append(text)
        collected.append(
            {
                "start": round(start, 2),
                "end": round(float(getattr(segment, "end", start) or start), 2),
                "text": text,
            }
        )

    return {
        "text": normalize_text(" ".join(parts)),
        "segments": collected,
        "duration_seconds": round(float(getattr(info, "duration", 0) or 0), 2),
        "truncated": truncated,
        "engine": "faster_whisper",
        "model": model_name,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe a media URL or local audio/video file to English text.")
    parser.add_argument("source", help="Media URL or local file path")
    parser.add_argument("--model", default=os.environ.get("FLAPTAP_WHISPER_MODEL", "base.en"))
    parser.add_argument("--max-seconds", type=int, default=int(os.environ.get("FLAPTAP_WHISPER_MAX_SECONDS", "1800")))
    parser.add_argument("--output-json", default=None)
    args = parser.parse_args()

    source = str(args.source or "").strip()
    if not source:
        emit_error("missing_source", "A media URL or file path is required.")

    is_url = source.startswith("http://") or source.startswith("https://")
    if not is_url and not os.path.isfile(source):
        emit_error("missing_file", "That local media file could not be found.")

    metadata: Dict[str, Any] = {}
    warnings: List[str] = []

    with tempfile.TemporaryDirectory(prefix="flaptap-media-") as workdir:
        subtitle_text = ""
        subtitle_engine = ""
        if is_url:
            metadata = read_metadata(source)
            subtitle_text, subtitle_engine = try_platform_subtitles(source, workdir)

        if subtitle_text:
            result = {
                "title": metadata.get("title", ""),
                "creator": metadata.get("creator", ""),
                "text": subtitle_text,
                "segments": [],
                "duration_seconds": metadata.get("duration_seconds", 0),
                "engine": subtitle_engine,
                "model": "",
                "truncated": False,
                "warnings": warnings,
            }
        else:
            media_path = download_audio(source, workdir) if is_url else source
            transcribed = transcribe(media_path, args.model, max(60, args.max_seconds))
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
                "text": transcribed["text"],
                "segments": transcribed["segments"],
                "duration_seconds": transcribed.get("duration_seconds", metadata.get("duration_seconds", 0)),
                "engine": transcribed["engine"],
                "model": transcribed.get("model", ""),
                "truncated": bool(transcribed.get("truncated")),
                "warnings": warnings,
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
