#!/usr/bin/env python3
"""
Offline regression tests for word-level caption timing.

No YouTube request is made: the JSON3 fixture is embedded, so this test can run
even when YouTube rate-limits the machine.
"""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(
    ROOT,
    "skills",
    "american-accent-shadowing-skill",
    "scripts",
    "extract_transcript.py",
)

spec = importlib.util.spec_from_file_location("extract_transcript", SCRIPT)
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)

EVENTS = [
    {
        "tStartMs": 0,
        "dDurationMs": 2000,
        "segs": [
            {"utf8": "Hello"},
            {"utf8": " world", "tOffsetMs": 200},
            {"utf8": " this", "tOffsetMs": 500},
            {"utf8": " is", "tOffsetMs": 900},
        ],
    },
    {
        "tStartMs": 1800,
        "dDurationMs": 2000,
        "segs": [
            {"utf8": "a"},
            {"utf8": " test", "tOffsetMs": 300},
        ],
    },
]


def assert_close(actual, expected, label):
    if abs(actual - expected) > 0.002:
        raise AssertionError(f"{label}: expected {expected}, got {actual}")


def test_json3_words():
    words = extractor._json3_words(EVENTS)
    assert len(words) == 6, f"expected 6 words, got {len(words)}"
    expected = [
        ("Hello", 0.0, 0.2),
        ("world", 0.2, 0.5),
        ("this", 0.5, 0.9),
        ("is", 0.9, 1.8),
        ("a", 1.8, 2.1),
        ("test", 2.1, 3.8),
    ]
    for word, (text, start, end) in zip(words, expected):
        assert word["word"] == text, f"word mismatch: {word} vs {text}"
        assert_close(word["start_sec"], start, f"{text} start")
        assert_close(word["end_sec"], end, f"{text} end")
    assert words[3]["cue_end"] is True
    assert words[5]["cue_end"] is True
    assert words[0]["cue_index"] == 0 and words[4]["cue_index"] == 1
    print("✅ JSON3 word offsets — exact starts and contiguous ends")


def test_alignment():
    # Manual text has punctuation/capitalization; auto words have exact times.
    text = extractor._flatten_cue_words([
        {"start_sec": 0.0, "end_sec": 3.0, "text": "Hello, world! This is a test."}
    ])
    auto = extractor._json3_words(EVENTS)
    aligned = extractor._align_text_words(text, auto)
    assert aligned is not None and len(aligned) == 6, f"alignment failed: {aligned}"

    for index, word in enumerate(aligned):
        assert word["word"] == text[index]["text"], f"alignment reordered text at {index}"
        assert word["end_sec"] > word["start_sec"], f"word {word['word']} has no duration"
        if index > 0:
            assert word["start_sec"] >= aligned[index - 1]["end_sec"] - 0.0005, (
                f"overlap between {aligned[index - 1]['word']} and {word['word']}"
            )
    print("✅ Manual-text alignment — punctuation preserved, no overlaps")


def test_cue_clamping():
    cues = extractor._json3_cues(EVENTS)
    assert len(cues) == 2
    assert cues[0]["end_sec"] <= cues[1]["start_sec"] + 0.0005, (
        f"overlapping cues: {cues[0]} / {cues[1]}"
    )
    print("✅ Cue windows — clamped to avoid rolling-caption overlap")


VTT = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
 
so<00:00:00.400><c> today</c><00:00:01.000><c> we</c>

00:00:02.000 --> 00:00:04.000 align:start position:0%
so today we<00:00:02.300><c> begin</c>
"""


def test_vtt_words():
    words = extractor._vtt_words(VTT)
    got = [(word["word"], word["start_sec"]) for word in words]
    expected = [("so", 0.0), ("today", 0.4), ("we", 1.0), ("begin", 2.3)]
    assert got == expected, f"unexpected VTT words: {got}"
    for index, word in enumerate(words):
        assert word["end_sec"] > word["start_sec"], f"{word['word']} has no duration"
        if index:
            assert word["start_sec"] >= words[index - 1]["start_sec"], "word starts went backwards"
    assert words[-1]["cue_end"] is True
    print("✅ WebVTT words — inline offsets kept, rolling repeat de-duplicated")


class FakeVideoUnavailable(Exception):
    pass


class FakeTranscriptsDisabled(Exception):
    pass


class FakeResponse:
    status_code = 429


class FakeRateLimit(Exception):
    def __init__(self):
        super().__init__("Too Many Requests")
        self.response = FakeResponse()


def test_error_classification():
    unavailable = extractor._classify_api_error(FakeVideoUnavailable("gone"))
    assert unavailable.code == extractor.VIDEO_UNAVAILABLE, unavailable.code

    disabled = extractor._classify_api_error(FakeTranscriptsDisabled("off"))
    assert disabled.code == extractor.NO_CAPTIONS, disabled.code

    limited = extractor._classify_api_error(FakeRateLimit())
    assert limited.code == extractor.RATE_LIMITED, limited.code

    preferred = extractor._preferred_error(limited, disabled)
    assert preferred.code == extractor.RATE_LIMITED, preferred.code

    preferred = extractor._preferred_error(unavailable, limited)
    assert preferred.code == extractor.VIDEO_UNAVAILABLE, preferred.code

    fallback = extractor._preferred_error(None, None)
    assert fallback.code == extractor.NO_CAPTIONS, fallback.code
    print("✅ Failure classification — unavailable / no captions / rate limited")


def test_ytdlp_payload_parsing():
    """The yt-dlp fallback must keep JSON3 offsets, not interpolate a VTT line."""
    import json
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "caption.en.json3"), "w", encoding="utf-8") as handle:
            json.dump({"events": EVENTS}, handle)
        payload = extractor._ytdlp_json3_payload(
            tmpdir, "dQw4w9WgXcQ", "https://example.test", "Title", "Creator", 30
        )
        assert payload is not None, "JSON3 fallback produced no payload"
        assert payload["timed_words"][1]["word"] == "world"
        assert_close(payload["timed_words"][1]["start_sec"], 0.2, "fallback word start")
        assert payload["cues"], "fallback produced no cues"
        assert payload["sentences"], "fallback produced no sentences"

    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "caption.en.vtt"), "w", encoding="utf-8") as handle:
            handle.write(VTT)
        payload = extractor._ytdlp_json3_payload(
            tmpdir, "dQw4w9WgXcQ", "https://example.test", "Title", "Creator", 30
        )
        assert payload is not None, "VTT fallback produced no payload"
        assert [word["word"] for word in payload["timed_words"]] == ["so", "today", "we", "begin"]
    print("✅ yt-dlp fallback — JSON3 offsets preserved, VTT last resort parses")


def test_primary_api_path():
    """The fast JSON3 path must build the same payload shape as the fallback."""
    import sys
    import types

    class FakeTranscript:
        language_code = "en"
        is_generated = False
        _url = "https://example.test/timedtext?x=1"
        _http_client = None

    class FakeApi:
        def list(self, video_id):
            return [FakeTranscript()]

    original_module = sys.modules.get("youtube_transcript_api")
    original_fetch = extractor._fetch_json3_events
    try:
        sys.modules["youtube_transcript_api"] = types.SimpleNamespace(
            YouTubeTranscriptApi=lambda: FakeApi()
        )
        extractor._fetch_json3_events = lambda track: EVENTS
        payload = extractor.fetch_via_transcript_api(
            "dQw4w9WgXcQ", "https://example.test", "Title", "Creator", 30
        )
    finally:
        extractor._fetch_json3_events = original_fetch
        if original_module is not None:
            sys.modules["youtube_transcript_api"] = original_module
        else:
            sys.modules.pop("youtube_transcript_api", None)

    assert payload is not None, "primary API path produced no payload"
    assert len(payload["timed_words"]) == 6
    assert payload["sentences"], "primary API path produced no sentences"
    assert payload["cues"][0]["text"] == "Hello world this is"
    print("✅ Primary JSON3 path — payload, sentences, and cues assembled")


def test_whisper_word_alignment():
    import types

    seg1 = types.SimpleNamespace(
        start=85.58,
        end=99.0,
        text=" Got that 6 p.m. post-mortem planning.",
        words=[
            types.SimpleNamespace(word=" Got", start=85.58, end=85.74),
            types.SimpleNamespace(word=" that", start=85.74, end=85.94),
            types.SimpleNamespace(word=" 6", start=85.94, end=86.30),
            types.SimpleNamespace(word=" p", start=86.30, end=86.48),
            types.SimpleNamespace(word=".m.", start=86.48, end=86.72),
            types.SimpleNamespace(word=" post", start=86.88, end=87.00),
            types.SimpleNamespace(word="-mortem", start=87.00, end=87.34),
            types.SimpleNamespace(word=" planning.", start=87.34, end=99.00),
        ],
    )
    # Micro-duplicate hallucination segment (<0.14s per word with identical text)
    seg2_dup = types.SimpleNamespace(
        start=99.02,
        end=99.20,
        text=" Got that 6 p.m. post-mortem planning.",
        words=[
            types.SimpleNamespace(word=" Got", start=99.02, end=99.20),
        ],
    )
    words = extractor._whisper_words_from_segments([seg1, seg2_dup])
    tokens = [w["word"] for w in words]
    assert tokens == ["Got", "that", "6", "p.m.", "post-mortem", "planning."], tokens
    # Trailing silence tail (87.34 -> 99.00) must be clamped to plausible speech duration
    assert words[-1]["end_sec"] - words[-1]["start_sec"] <= 2.2, words[-1]
    for idx, w in enumerate(words):
        assert w["end_sec"] > w["start_sec"], w
        if idx > 0:
            assert w["start_sec"] >= words[idx - 1]["end_sec"] - 0.001, (words[idx - 1], w)
    print("✅ Whisper DTW fallback — sub-word tokens merged, silence tails clamped")


def test_english_track_filtering():
    import types

    en_auto = types.SimpleNamespace(language_code="en", is_generated=True)
    en_orig = types.SimpleNamespace(language_code="en-orig", is_generated=True)
    ar_auto = types.SimpleNamespace(language_code="ar", is_generated=True)
    ranked = extractor._english_tracks([ar_auto, en_auto, en_orig])
    assert [t.language_code for t in ranked] == ["en-orig", "en"]

    try:
        extractor._english_tracks([ar_auto])
        raise AssertionError("Expected NO_CAPTIONS when no English track exists")
    except extractor.TranscriptError as err:
        assert err.code == extractor.NO_CAPTIONS
    print("✅ English track ranking — prefers en-orig and rejects non-English-only tracks")


if __name__ == "__main__":
    test_json3_words()
    test_alignment()
    test_cue_clamping()
    test_vtt_words()
    test_error_classification()
    test_ytdlp_payload_parsing()
    test_primary_api_path()
    test_whisper_word_alignment()
    test_english_track_filtering()
    print("🎉 Timing extractor tests passed")
