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


def _assert_json3_invariants(cues, timed_words):
    cue_words = " ".join(c["text"] for c in cues).split()
    word_tokens = [w["word"] for w in timed_words]
    assert word_tokens == cue_words, f"Word mismatch!\n  cues:  {cue_words}\n  words: {word_tokens}"
    for i, w in enumerate(timed_words):
        assert w["end_sec"] > w["start_sec"], f"Non-positive duration at {i}: {w}"
        if i > 0:
            assert w["start_sec"] >= timed_words[i - 1]["start_sec"], (
                f"Non-monotonic start_sec at {i}: {timed_words[i - 1]} -> {w}"
            )


def test_parse_json3_events_preserves_exact_order():
    # 1. Multi-word segs with tight next seg / tight next cue / bracketed tokens / repeated words
    events = [
        {"tStartMs": 0, "dDurationMs": 50000, "segs": []},
        {
            "tStartMs": 14200,
            "dDurationMs": 3800,
            "segs": [
                {"utf8": "back"},
                {"utf8": " in the", "tOffsetMs": 100},
                {"utf8": " day,", "tOffsetMs": 200},
                {"utf8": " it's", "tOffsetMs": 400},
            ],
        },
        {
            "tStartMs": 48900,
            "dDurationMs": 3600,
            "segs": [
                {"utf8": "they're going"},
                {"utf8": " to", "tOffsetMs": 100},
                {"utf8": " make", "tOffsetMs": 200},
                {"utf8": " some", "tOffsetMs": 300},
                {"utf8": " cash", "tOffsetMs": 500},
            ],
        },
        {
            "tStartMs": 56000,
            "dDurationMs": 2000,
            "segs": [
                {"utf8": "go"},
                {"utf8": " in the", "tOffsetMs": 1200},
            ],
        },
        {
            "tStartMs": 57300,
            "dDurationMs": 2500,
            "segs": [
                {"utf8": "program."},
                {"utf8": " And", "tOffsetMs": 800},
                {"utf8": " two,", "tOffsetMs": 1100},
            ],
        },
        {
            "tStartMs": 61000,
            "dDurationMs": 2000,
            "segs": [
                {"utf8": "had"},
                {"utf8": " no", "tOffsetMs": 200},
                {"utf8": " [ __ ]", "tOffsetMs": 400},
                {"utf8": " windows", "tOffsetMs": 500},
            ],
        },
        {
            "tStartMs": 64000,
            "dDurationMs": 1800,
            "segs": [
                {"utf8": "what"},
                {"utf8": " is", "tOffsetMs": 200},
                {"utf8": " is", "tOffsetMs": 205},
                {"utf8": " no", "tOffsetMs": 400},
                {"utf8": " no", "tOffsetMs": 400},
            ],
        },
        {
            "tStartMs": 67000,
            "dDurationMs": 1500,
            "segs": [
                {"utf8": "don"},
                {"utf8": "'t", "tOffsetMs": 100},
                {"utf8": " know", "tOffsetMs": 300},
            ],
        },
    ]
    cues, timed_words = extractor.parse_json3_events(events)
    _assert_json3_invariants(cues, timed_words)
    got_words = [w["word"] for w in timed_words]
    expected_words = [
        "back", "in", "the", "day,", "it's",
        "they're", "going", "to", "make", "some", "cash",
        "go", "in", "the", "program.", "And", "two,",
        "had", "no", "[", "__", "]", "windows",
        "what", "is", "is", "no", "no",
        "don't", "know",
    ]
    assert got_words == expected_words, f"Expected {expected_words}, got {got_words}"

    # 2. Out-of-order / jittery raw tOffsetMs & tStartMs never reorder words
    jittery_events = [
        {
            "tStartMs": 1000,
            "dDurationMs": 1000,
            "segs": [
                {"utf8": "first", "tOffsetMs": 400},
                {"utf8": " second", "tOffsetMs": 200},
                {"utf8": " third", "tOffsetMs": 500},
            ],
        },
        {
            "tStartMs": 1900,
            "dDurationMs": 1000,
            "segs": [
                {"utf8": "fourth"},
                {"utf8": " fifth", "tOffsetMs": 300},
            ],
        },
    ]
    j_cues, j_words = extractor.parse_json3_events(jittery_events)
    _assert_json3_invariants(j_cues, j_words)
    assert [w["word"] for w in j_words] == ["first", "second", "third", "fourth", "fifth"]

    # 3. Manual caption cue with many words in a single seg spans full cue without overshooting next cue
    manual_events = [
        {
            "tStartMs": 0,
            "dDurationMs": 4000,
            "segs": [{"utf8": "one two three four five six seven eight nine ten"}],
        },
        {
            "tStartMs": 4000,
            "dDurationMs": 2000,
            "segs": [{"utf8": "eleven twelve"}],
        },
    ]
    m_cues, m_words = extractor.parse_json3_events(manual_events)
    _assert_json3_invariants(m_cues, m_words)
    assert [w["word"] for w in m_words] == [
        "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"
    ]
    assert m_words[9]["start_sec"] < 4.0 and m_words[9]["end_sec"] <= 4.001
    assert m_words[10]["start_sec"] == 4.0
    print("✅ JSON3 event parsing — exact word order, whitespace gluing, repeated words, and monotonic timing")


def test_clean_vtt_cues_no_midword_corruption_and_entities():
    vtt = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:01.000
in

00:00:01.000 --> 00:00:03.000
thinking about it

00:00:03.000 --> 00:00:05.000
it&#39;s &amp; &gt;&gt; done

00:00:05.000 --> 00:00:07.000
it&#39;s &amp; &gt;&gt; done
going to work

00:00:07.000 --> 00:00:09.000
going to work
right now
"""
    cues = extractor.clean_vtt_cues(vtt)
    texts = [c["text"] for c in cues]
    assert texts == [
        "in",
        "thinking about it",
        "it's & >> done",
        "going to work",
        "right now",
    ], f"Unexpected VTT cues: {texts}"
    print("✅ WebVTT cues parsing — no mid-word deletion, entity unescaping, and rolling dedup")


if __name__ == "__main__":
    test_clean_vtt_cues()
    test_clean_vtt_cues_no_midword_corruption_and_entities()
    test_extract_timed_words()
    test_parse_json3_events_preserves_exact_order()
    test_group_cues_into_sentences()
    test_group_cues_by_interval()
    test_extract_youtube_id()
    test_error_definitions()
    test_fetch_youtube_transcript_mocked()
    print("🎉 Timing extractor tests passed successfully!")
