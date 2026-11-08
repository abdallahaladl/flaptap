#!/usr/bin/env python3
"""
Offline regression tests for transcript and word-level caption timing.

No live YouTube requests are made: embedded fixtures and mock transcripts ensure
tests run completely offline and deterministically without network flakiness.
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


VTT_SAMPLE = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000 align:start position:0%
 
Hello<00:00:00.400><c> world,</c><00:00:01.000><c> this</c>

00:00:02.000 --> 00:00:04.000 align:start position:0%
Hello world, this<00:00:02.300><c> is</c><00:00:02.800><c> a</c><00:00:03.200><c> test.</c>
"""


def assert_close(actual, expected, label):
    if abs(actual - expected) > 0.002:
        raise AssertionError(f"{label}: expected {expected}, got {actual}")


def test_clean_vtt_cues():
    cues = extractor.clean_vtt_cues(VTT_SAMPLE)
    assert len(cues) >= 2, f"expected at least 2 cues, got {len(cues)}"
    assert cues[0]["start_sec"] == 0.0
    assert cues[0]["end_sec"] <= cues[1]["start_sec"] + 0.001
    # Check deduplication of rolling text
    assert "Hello" in cues[0]["text"]
    assert "is a test." in cues[1]["text"] or "test." in cues[1]["text"]
    for cue in cues:
        assert cue["end_sec"] > cue["start_sec"], f"invalid duration in cue: {cue}"
        assert cue["text"], f"empty text in cue: {cue}"
    print("✅ WebVTT cues parsing — deduplicated rolling lines and clamped windows")


def test_extract_timed_words():
    cues = [
        {
            "start": "00:00:00.000",
            "end": "00:00:02.000",
            "start_sec": 0.0,
            "end_sec": 2.0,
            "text": "Hello world this is",
        },
        {
            "start": "00:00:02.000",
            "end": "00:00:04.000",
            "start_sec": 2.0,
            "end_sec": 4.0,
            "text": "a test sentence.",
        },
    ]
    words = extractor.extract_timed_words(cues)
    assert len(words) == 7, f"expected 7 words, got {len(words)}"
    expected_words = ["Hello", "world", "this", "is", "a", "test", "sentence."]
    for idx, (w, exp) in enumerate(zip(words, expected_words)):
        assert w["word"] == exp, f"word mismatch at {idx}: expected {exp}, got {w['word']}"
        assert w["end_sec"] > w["start_sec"], f"word {w['word']} has invalid timing"
        assert w["clean"], f"clean token missing for {w['word']}"
        if idx > 0 and w["cue_index"] == words[idx - 1]["cue_index"]:
            assert w["start_sec"] >= words[idx - 1]["start_sec"], "word starts went backwards"

    assert words[3]["cue_end"] is True
    assert words[6]["cue_end"] is True
    assert words[0]["cue_index"] == 0
    assert words[4]["cue_index"] == 1
    print("✅ Timed words extraction — monotonic timestamps, cue boundaries and clean tokens")


def test_group_cues_into_sentences():
    cues = [
        {"start": "00:00:00.000", "end": "00:00:01.500", "start_sec": 0.0, "end_sec": 1.5, "text": "Welcome back to the channel."},
        {"start": "00:00:01.600", "end": "00:00:03.000", "start_sec": 1.6, "end_sec": 3.0, "text": "Today we are learning"},
        {"start": "00:00:03.100", "end": "00:00:04.500", "start_sec": 3.1, "end_sec": 4.5, "text": "about American shadowing."},
    ]
    sentences = extractor.group_cues_into_sentences(cues)
    assert len(sentences) == 2, f"expected 2 sentences, got {len(sentences)}"
    assert sentences[0]["text"] == "Welcome back to the channel."
    assert sentences[0]["start_sec"] == 0.0
    assert sentences[0]["end_sec"] == 1.5
    assert sentences[1]["text"] == "Today we are learning about American shadowing."
    assert sentences[1]["start_sec"] == 1.6
    assert sentences[1]["end_sec"] == 4.5
    print("✅ Sentence grouping — terminal punctuation and cohesive chunking")


def test_group_cues_by_interval():
    cues = [
        {"start": "00:00:00.000", "end": "00:00:10.000", "start_sec": 0.0, "end_sec": 10.0, "text": "First chunk."},
        {"start": "00:00:10.000", "end": "00:00:25.000", "start_sec": 10.0, "end_sec": 25.0, "text": "Still first chunk."},
        {"start": "00:00:36.000", "end": "00:00:45.000", "start_sec": 36.0, "end_sec": 45.0, "text": "Second chunk."},
    ]
    chunks = extractor.group_cues_by_interval(cues, interval_sec=30)
    assert len(chunks) == 2, f"expected 2 chunks, got {len(chunks)}"
    assert chunks[0]["start_sec"] == 0.0
    assert chunks[0]["end_sec"] == 25.0
    assert "First chunk. Still first chunk." in chunks[0]["text"]
    assert chunks[1]["start_sec"] == 36.0
    assert chunks[1]["end_sec"] == 45.0
    print("✅ Interval chunking — groups cues within duration intervals")


def test_extract_youtube_id():
    cases = [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"),
        ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"),
        ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ]
    for url, expected in cases:
        result = extractor.extract_youtube_id(url)
        assert result == expected, f"failed for {url}: expected {expected}, got {result}"

    invalid = ["https://example.com/not-youtube", "", "short", "invalid?id=123"]
    for url in invalid:
        assert extractor.extract_youtube_id(url) is None or len(extractor.extract_youtube_id(url) or "") != 11
    print("✅ YouTube ID extraction — handles all URL patterns and raw IDs")


def test_error_definitions():
    assert extractor.VIDEO_UNAVAILABLE == "video_unavailable"
    assert extractor.NO_CAPTIONS == "no_captions"
    assert extractor.RATE_LIMITED == "rate_limited"
    assert extractor.TIMEOUT == "timeout"
    assert extractor.INVALID_URL == "invalid_url"

    err = extractor.TranscriptError(extractor.NO_CAPTIONS, "No captions found")
    assert err.code == "no_captions"
    assert str(err) == "No captions found"
    print("✅ Error definitions and TranscriptError exception class")


def test_fetch_youtube_transcript_mocked():
    import types

    class FakeSnippet:
        def __init__(self, text, start, duration):
            self.text = text
            self.start = start
            self.duration = duration

    class FakeApi:
        def fetch(self, video_id):
            return [
                FakeSnippet("Hello everyone.", 0.5, 2.0),
                FakeSnippet("Welcome to American accent shadowing.", 2.8, 3.2),
            ]

    orig_oembed = extractor._fetch_oembed
    orig_api = sys.modules.get("youtube_transcript_api")

    try:
        extractor._fetch_oembed = lambda vid: {"title": "Test Title", "creator": "Test Creator"}
        sys.modules["youtube_transcript_api"] = types.SimpleNamespace(
            YouTubeTranscriptApi=lambda: FakeApi()
        )

        result = extractor.fetch_youtube_transcript("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assert result["title"] == "Test Title"
        assert result["creator"] == "Test Creator"
        assert result["video_id"] == "dQw4w9WgXcQ"
        assert len(result["cues"]) == 2
        assert len(result["sentences"]) == 2
        assert len(result["timed_words"]) > 0
        assert "Hello everyone." in result["full_raw_transcript"]
    finally:
        extractor._fetch_oembed = orig_oembed
        if orig_api is not None:
            sys.modules["youtube_transcript_api"] = orig_api
        else:
            sys.modules.pop("youtube_transcript_api", None)
    print("✅ Verbatim transcript extraction pipeline — cues, sentences, and words assembled")


if __name__ == "__main__":
    test_clean_vtt_cues()
    test_extract_timed_words()
    test_group_cues_into_sentences()
    test_group_cues_by_interval()
    test_extract_youtube_id()
    test_error_definitions()
    test_fetch_youtube_transcript_mocked()
    print("🎉 Timing extractor tests passed successfully!")
