#!/usr/bin/env python3
import json

theo_sentences = [
  {
    "id": "sent-1",
    "index": 1,
    "timeRange": "[00:00 - 00:02]",
    "startSec": 0.0,
    "endSec": 2.66,
    "durationSec": 2.66,
    "text": "It seems like pretty much everything just got hacked.",
    "highlightedHtml": 'It seems like pretty much everything just got <mark class="shadow-slang" style="background-color: #FEF08A; color: #713F12; padding: 2px 5px; border-radius: 4px; font-weight: 600;">hacked</mark>.'
  },
  {
    "id": "sent-2",
    "index": 2,
    "timeRange": "[00:02 - 00:09]",
    "startSec": 2.66,
    "endSec": 9.0,
    "durationSec": 6.34,
    "text": "And the reason is cuz it I actually feel a little bit bad about how I'm starting this video because it's almost misleading in a way.",
    "highlightedHtml": 'And the reason is <mark class="shadow-reduction" style="background-color: #BAE6FD; color: #0C4A6E; padding: 2px 5px; border-radius: 4px; font-weight: 500;">cuz</mark> it I actually feel a little bit bad about how I\'m starting this video because it\'s almost misleading in a way.'
  },
  {
    "id": "sent-3",
    "index": 3,
    "timeRange": "[00:09 - 00:12]",
    "startSec": 9.0,
    "endSec": 12.6,
    "durationSec": 3.6,
    "text": "The reality is that two different things are happening at once right now.",
    "highlightedHtml": "The reality is that two different things are happening at once right now."
  },
  {
    "id": "sent-4",
    "index": 4,
    "timeRange": "[00:12 - 00:18]",
    "startSec": 12.6,
    "endSec": 18.4,
    "durationSec": 5.8,
    "text": "On one side, we have the CVEs like with Node, GitLab, PHP, Quick, LiteLLM, and more.",
    "highlightedHtml": 'On one side, we have the <mark class="shadow-stress" style="background-color: #FED7AA; color: #7C2D12; padding: 2px 5px; border-radius: 4px; font-weight: 700;">CVEs</mark> like with Node, GitLab, PHP, Quick, LiteLLM, and more.'
  },
  {
    "id": "sent-5",
    "index": 5,
    "timeRange": "[00:18 - 00:20]",
    "startSec": 18.4,
    "endSec": 20.0,
    "durationSec": 1.6,
    "text": "The rest, however, are different.",
    "highlightedHtml": "The rest, however, are different."
  },
  {
    "id": "sent-6",
    "index": 6,
    "timeRange": "[00:20 - 00:26]",
    "startSec": 20.0,
    "endSec": 26.96,
    "durationSec": 6.96,
    "text": "Railway and Open Code are not at all like the hacks on the left side here because these are actual attacks.",
    "highlightedHtml": 'Railway and Open Code are not at all like the hacks on the left side here because these are <mark class="shadow-stress" style="background-color: #FED7AA; color: #7C2D12; padding: 2px 5px; border-radius: 4px; font-weight: 700;">actual attacks</mark>.'
  },
  {
    "id": "sent-7",
    "index": 7,
    "timeRange": "[00:26 - 00:31]",
    "startSec": 26.96,
    "endSec": 31.92,
    "durationSec": 4.96,
    "text": "These are incident reports of bugs that exist in software that could be exploited.",
    "highlightedHtml": "These are incident reports of bugs that exist in software that could be exploited."
  },
  {
    "id": "sent-8",
    "index": 8,
    "timeRange": "[00:31 - 00:35]",
    "startSec": 31.92,
    "endSec": 35.39,
    "durationSec": 3.47,
    "text": "Both of these are bad, but they're bad for very different reasons,",
    "highlightedHtml": "Both of these are bad, but they're bad for very different reasons,"
  },
  {
    "id": "sent-9",
    "index": 9,
    "timeRange": "[00:35 - 00:45]",
    "startSec": 35.39,
    "endSec": 45.4,
    "durationSec": 10.01,
    "text": "and I actually think the right side here is what we should be way, way more scared of even though everyone seems really focused on the left side here.",
    "highlightedHtml": 'and I actually think the right side here is what we should be <mark class="shadow-stress" style="background-color: #FED7AA; color: #7C2D12; padding: 2px 5px; border-radius: 4px; font-weight: 700;">way, way more scared of</mark> even though everyone seems really focused on the left side here.'
  }
]

ar_eg_translations = {
  1: "باين كده إن كل حاجة تقريباً اتهكرت.",
  2: "والسبب في ده، بصراحة، إني حاسس بشوية ذنب بالطريقة اللي ببدأ بيها الفيديو ده، عشان تعتبر مضللة شوية لحد ما.",
  3: "الحقيقة إن فيه حاجتين مختلفين بيحصلوا في نفس الوقت دلوقتي.",
  4: "من ناحية، عندنا الـ <bdi class=\"tech-loanword\" dir=\"ltr\">CVEs</bdi> زي اللي في <bdi class=\"tech-loanword\" dir=\"ltr\">Node</bdi>، و<bdi class=\"tech-loanword\" dir=\"ltr\">GitLab</bdi>، و<bdi class=\"tech-loanword\" dir=\"ltr\">PHP</bdi>، و<bdi class=\"tech-loanword\" dir=\"ltr\">Quick</bdi>، و<bdi class=\"tech-loanword\" dir=\"ltr\">LiteLLM</bdi> وغيرهم كتير.",
  5: "لكن الباقي بقى موضوع تاني خالص.",
  6: "يعني <bdi class=\"tech-loanword\" dir=\"ltr\">Railway</bdi> و<bdi class=\"tech-loanword\" dir=\"ltr\">Open Code</bdi> مش شبه خالص التهكيرات اللي على الناحية الشمال دي، عشان دي كانت هجمات واختراقات فعلية.",
  7: "دي تقارير لحالات عن ثغرات وبجات موجودة في الـ <bdi class=\"tech-loanword\" dir=\"ltr\">software</bdi> وكان ممكن استغلالها.",
  8: "الاتنين سيئين، بس سيئين لأسباب مختلفة تماماً،",
  9: "وأنا في الحقيقة شايف إن الناحية اليمين دي هي اللي المفروض نخاف منها أكتر بكتير، مع إن كل الناس مركزة على الناحية الشمال هنا."
}

ar_sa_translations = {
  1: "شكله كل شيء تقريباً تهكر.",
  2: "والسبب هو إني صراحة أحس بشوي ذنب من بداية الفيديو هذا لأنه نوعاً ما يشتت ويضلل.",
  3: "الواقع إنه فيه شغلتين مختلفة جالسة تصير بنفس الوقت حالياً.",
  4: "من جهة، عندنا ثغرات الـ <bdi class=\"tech-loanword\" dir=\"ltr\">CVEs</bdi> زي اللي صارت مع <bdi class=\"tech-loanword\" dir=\"ltr\">Node</bdi> و<bdi class=\"tech-loanword\" dir=\"ltr\">GitLab</bdi> و<bdi class=\"tech-loanword\" dir=\"ltr\">PHP</bdi> و<bdi class=\"tech-loanword\" dir=\"ltr\">Quick</bdi> و<bdi class=\"tech-loanword\" dir=\"ltr\">LiteLLM</bdi> وغيرهم.",
  5: "لكن الباقي مختلف تماماً.",
  6: "يعني <bdi class=\"tech-loanword\" dir=\"ltr\">Railway</bdi> و<bdi class=\"tech-loanword\" dir=\"ltr\">Open Code</bdi> مو زي التهكيرات اللي في الجنب اليسار أبد، لأن هذي هجمات واختراقات حقيقية.",
  7: "هذي بلاغات لحوادث أمنية وثغرات موجودة بالـ <bdi class=\"tech-loanword\" dir=\"ltr\">software</bdi> كان ممكن تستغل.",
  8: "كل الثنتين سيئة، بس لأسباب مختلفة كلياً،",
  9: "وأنا أشوف إن الجنب اليمين هو اللي المفروض نخاف منه أكثر بكثير، رغم إن الكل مركز على الجنب اليسار."
}

en_us_translations = {
  1: "Looks like pretty much everything just got hacked.",
  2: "And honestly, I feel kinda bad about kicking off the video like this because it's almost a little misleading.",
  3: "The reality is that two totally separate things are going down at the exact same time.",
  4: "On one hand, you have CVE vulnerabilities like with Node, GitLab, PHP, Quick, LiteLLM, and so on.",
  5: "The other ones, though, are completely different.",
  6: "Railway and Open Code aren't like the hacks on the left at all, because those were legit attacks.",
  7: "These are actual incident reports of vulnerabilities in software that could be exploited.",
  8: "Both of these are bad news, but for totally different reasons,",
  9: "and I honestly think the right side is what we should be way more terrified of, even though everyone's fixated on the left."
}

theo_item = {
  "id": "080eabc5-0b57-4e95-a33e-04abf5ffbd9a",
  "track": "shadowing",
  "trackTitle": "YouTube Video Shadowing",
  "title": "Even The NSA Got Involved",
  "creator": "Theo - t3․gg",
  "videoId": "nXpoU99pTho",
  "sourceUrl": "https://www.youtube.com/shorts/nXpoU99pTho",
  "thumbnailUrl": "https://img.youtube.com/vi/nXpoU99pTho/hqdefault.jpg",
  "categoryIcon": "🎙️",
  "accentDialect": "General American (Fast Tech Cadence & Pitch Peaks)",
  "colorTheme": "#3B82F6",
  "durationSeconds": 45,
  "pacingWpm": 175,
  "difficulty": "Intermediate",
  "stats": {
    "slangCount": 4,
    "idiomsCount": 3,
    "reductionsCount": 3,
    "fillersCount": 5,
    "correctionsCount": 0,
    "totalWords": 132
  },
  "keyHighlights": [
    { "category": "Tech Vernacular", "text": "hacked", "meaning": "Compromised or breached", "icon": "🟡", "color": "#FEF08A" },
    { "category": "Connected Speech", "text": "cuz", "meaning": "because", "icon": "🔵", "color": "#BAE6FD" },
    { "category": "Pitch Peak", "text": "CVEs", "meaning": "Common Vulnerabilities and Exposures", "icon": "🟠", "color": "#FED7AA" }
  ],
  "chunks": [
    {
      "timeRange": "[00:00:00 - 00:00:27]",
      "start": "00:00:00",
      "end": "00:00:27",
      "startSec": 0,
      "endSec": 27,
      "text": "It seems like pretty much everything just got hacked. And the reason is cuz it I actually feel a little bit bad about how I'm starting this video because it's almost misleading in a way. The reality is that two different things are happening at once right now. On one side, we have the CVEs like with Node, GitLab, PHP, Quick, LiteLLM, and more. The rest, however, are different. Railway and Open Code are not at all like the hacks on the left side here because these are actual attacks.",
      "highlightedHtml": "It seems like pretty much everything just got hacked..."
    },
    {
      "timeRange": "[00:00:27 - 00:00:45]",
      "start": "00:00:27",
      "end": "00:00:45",
      "startSec": 27,
      "endSec": 45,
      "text": "These are incident reports of bugs that exist in software that could be exploited. Both of these are bad, but they're bad for very different reasons, and I actually think the right side here is what we should be way, way more scared of even though everyone seems really focused on the left side here.",
      "highlightedHtml": "These are incident reports of bugs..."
    }
  ],
  "sentences": theo_sentences,
  "translationsCache": {
    "ar-EG": ar_eg_translations,
    "ar-SA": ar_sa_translations,
    "en-US": en_us_translations
  },
  "slangTable": [
    { "term": "hacked", "meaning": "Security breached or exploited", "delivery": "Emphasized plosive /k/ and /t/" },
    { "term": "bad news", "meaning": "Unfavorable situation", "delivery": "Downward pitch" }
  ],
  "idiomsTable": [
    { "phrase": "at once", "equivalent": "simultaneously / right now", "usage": "Temporal coordination" }
  ],
  "reductionsTable": [
    { "written": "because", "spoken": "cuz (/kəz/)", "phenomenon": "Vowel reduction and truncation", "mechanics": "Short central vowel without initial syllable" }
  ],
  "asrFixes": [],
  "chunksCount": 2,
  "noteMarkdown": "# Even The NSA Got Involved\n> Creator: Theo - t3․gg\n> Accent: General American",
  "agentUsed": "Google Antigravity 2.0 (Model: 3.8 Flash High)",
  "createdAt": "2026-10-25T17:00:00.000Z",
  "completedDrills": 0
}

with open("data/history.json", "w", encoding="utf-8") as f:
    json.dump([theo_item], f, indent=2, ensure_ascii=False)

print("Successfully written production history with Theo session!")
