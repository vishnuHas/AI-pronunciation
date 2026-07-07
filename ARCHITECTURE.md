# ARCHITECTURE.md — PronounceAI System Design

---

## 1. Components and How They Connect

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     USER BROWSER                        │
│                                                         │
│  ┌─────────────┐    ┌──────────────┐                   │
│  │AudioUploader│    │AudioRecorder │  (File/Blob)       │
│  └──────┬──────┘    └──────┬───────┘                   │
│         └────────┬─────────┘                           │
│                  │ File/Blob (in-memory)                │
│         ┌────────▼────────┐                            │
│         │   app/page.tsx  │  (state machine)           │
│         └────────┬────────┘                            │
│                  │ multipart/form-data                 │
└──────────────────┼──────────────────────────────────────┘
                   │ HTTPS POST /api/analyze
┌──────────────────▼──────────────────────────────────────┐
│               VERCEL SERVERLESS FUNCTION                │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │           app/api/analyze/route.ts            │       │
│  │                                              │       │
│  │  1. Validate consent (server-side)           │       │
│  │  2. Parse audio → Buffer (in-memory only)    │       │
│  │  3. music-metadata → duration check         │       │
│  │  4. ─────────────────────────────────────   │       │
│  │     Send Buffer → Deepgram nova-2 API        │       │
│  │     ← word[], confidence[], timestamps[]     │       │
│  │  5. NULL the audio Buffer (DPDP discard)     │       │
│  │  6. Flag words with confidence < 0.75        │       │
│  │  7. pronouncing (CMU dict, offline)          │       │
│  │     → ARPABET phonemes for flagged words     │       │
│  │  8. Batch Claude API call (text only):       │       │
│  │     flagged words + phonemes + context       │       │
│  │     ← JSON: {word, issue} per flagged word  │       │
│  │  9. scoring.ts: clarity (70%) + fluency(30%)│       │
│  │  10. Return JSON result                      │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│   External API calls (outbound only):                   │
│   ┌─────────────┐      ┌──────────────────────┐        │
│   │  Deepgram   │      │  Anthropic Claude     │        │
│   │  nova-2 API │      │  claude-sonnet-4-5    │        │
│   │  (audio →  │      │  (text only → text)   │        │
│   │   text)     │      └──────────────────────┘        │
│   └─────────────┘                                       │
└─────────────────────────────────────────────────────────┘
                   │ JSON response
┌──────────────────▼──────────────────────────────────────┐
│              RESULTS UI (browser)                       │
│  ResultsView → ScoreRing + highlighted transcript       │
│  WordTooltip → confidence meter + phonemes + issue      │
└─────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Responsibility |
|-----------|---------------|
| `app/page.tsx` | State machine: idle → ready → analyzing → results/error |
| `AudioUploader` | Drag-and-drop with client-side duration validation |
| `AudioRecorder` | MediaRecorder API recording with 30–45s timer |
| `ProgressIndicator` | Multi-step animated progress during processing |
| `ResultsView` | Animated score ring + highlighted transcript |
| `WordTooltip` | Popover with confidence, ARPABET phonemes, and AI explanation |
| `app/api/analyze/route.ts` | Core processing pipeline (all server-side) |
| `lib/scoring.ts` | Clarity and fluency scoring formulas |
| `lib/phonemes.ts` | CMU dict wrapper |
| `lib/types.ts` | Shared TypeScript interfaces |

---

## 2. Models/APIs Used and Why

### Deepgram nova-2 (Speech-to-Text)

**Chosen over alternatives because:**

| Feature | Deepgram nova-2 | Whisper (OpenAI) | Azure STT | AssemblyAI |
|---------|----------------|------------------|-----------|------------|
| Word-level confidence scores | ✅ Native | ❌ None | ⚠️ Limited | ✅ Yes |
| Word timestamps | ✅ Native | ✅ Via segments | ✅ Yes | ✅ Yes |
| Latency (30s audio) | ~3–6s | ~10–20s (API) | ~5–8s | ~4–7s |
| Free tier | ✅ $200 credit | ✅ Included | Limited | ✅ $50 credit |
| Serverless-compatible | ✅ REST API | ✅ REST API | ✅ REST API | ✅ REST API |

Deepgram's word-level confidence score is the **core signal** for this app. Without it, flagging would require forced alignment (a much more complex pipeline). Nova-2 provides this natively with a single API call.

**Why not Whisper?** OpenAI Whisper does not output word-level confidence scores — only segment-level confidence. This would require a fundamentally different approach (forced alignment, phoneme models) to achieve word-level flagging.

### Confidence-Based Flagging (vs. Forced Alignment)

**Chosen approach:** Flag words where Deepgram confidence < 0.75

**Why this over forced alignment:**
- Forced alignment (e.g., Montreal Forced Aligner, wav2vec2) requires either a reference transcript or a large phoneme recognition model running server-side
- Confidence-based flagging works without a reference text — user speaks freely
- Simpler to deploy in a serverless environment (no large model weights)
- Deepgram's confidence is well-calibrated for English speech

**Acknowledged limitation:** Confidence is a proxy for pronunciation accuracy, not a direct measure. A word can be low-confidence due to background noise, accent variation, or audio quality issues, not just mispronunciation. See Trade-offs section.

### Anthropic Claude (claude-sonnet-4-5)

**Chosen for feedback generation because:**
- Produces coherent, specific, linguistically accurate feedback in natural language
- ARPABET phoneme strings (from CMU dict) give Claude a concrete reference for what the correct pronunciation looks like
- Claude's instruction-following is reliable enough to consistently output structured JSON
- Alternative (fine-tuned model or rule-based phoneme comparison) would require significantly more engineering for equivalent quality
- Single batch call for all flagged words → minimal latency overhead

### CMU Pronouncing Dictionary

**Chosen over alternatives because:**
- Bundled offline via the `pronouncing` npm package — no API call, no latency, no cost
- Full coverage of English vocabulary (~134,000 entries)
- ARPABET notation is a standard that Claude can reason about in its feedback generation
- Free, MIT-compatible license

---

## 3. Pronunciation Scoring — How It Works

### Clarity Score (70% of composite)

```
clarityScore = (average word confidence across all words) × 100
```

- Source data: Deepgram's `confidence` field per word (range: 0.0 to 1.0)
- Higher confidence = speech recognition was more certain = clearer pronunciation
- Scaled to 0–100

### Fluency Score (30% of composite)

```
inter-word gap = word[i].startTime - word[i-1].endTime

longPauseCount = number of gaps > LONG_PAUSE_THRESHOLD (0.5s)
pausePenalty   = clamp(longPauseCount / totalWords, 0, 1.0)
fluencyScore   = 100 - (pausePenalty × 100)
```

- Long pauses indicate hesitation, searching for words, or disfluency
- The 0.5s threshold is tunable (see `lib/scoring.ts`)
- Score approaches 0 as more pauses accumulate, floored at 0

### Composite Score

```
overallScore = (clarityScore × 0.70) + (fluencyScore × 0.30)
```

Weights rationale: Clarity (pronunciation quality) is more diagnostic than fluency for a pronunciation assessment tool, so it has higher weight. Fluency is still meaningful but secondary.

### Qualitative Labels

| Score | Label |
|-------|-------|
| 85–100 | Excellent |
| 65–84 | Good |
| 0–64 | Needs Practice |

### Word Highlighting Thresholds

| Confidence | Severity | Visual Indicator |
|-----------|----------|-----------------|
| < 0.50 | Severe | Red underline + red background tint |
| 0.50–0.65 | Moderate | Orange underline + orange tint |
| 0.65–0.75 | Mild | Yellow underline + yellow tint |
| ≥ 0.75 | None | Normal text |

---

## 4. DPDP Act 2023 Compliance

### Storage
**None.** The audio buffer exists only as a Node.js `Buffer` object in the serverless function's heap memory. It is never:
- Written to disk or any filesystem path
- Uploaded to any object storage (S3, GCS, Vercel Blob, etc.)
- Inserted into any database
- Cached in any key-value store

### Retention
**None.** The audio buffer is explicitly nulled out (`audioBuffer = null`) immediately after the Deepgram transcription call completes. From that point forward, only text-based data (word strings, confidence scores, timestamps) exists in memory, and this too is discarded when the serverless function returns its response. Vercel serverless functions do not persist memory between requests.

### Consent
Implemented at two levels:
1. **Client-side**: A mandatory checkbox on the upload form. The submit button is disabled until checked.
2. **Server-side**: The `consent` form field is validated in the API route. Requests without `consent=true` receive a `400 Bad Request` response before any audio processing begins.

This dual enforcement ensures that even if the client-side check is bypassed (e.g., a direct API call), the server will still reject the request.

### Third-Party Processors
The following third parties receive user data:

| Processor | Data Sent | Purpose |
|-----------|-----------|---------|
| **Deepgram** | Raw audio bytes | Speech-to-text transcription |
| **Anthropic** | Text only (flagged words, phonemes, context) | Pronunciation feedback generation |

> **⚠️ Data Residency Limitation**: Both Deepgram and Anthropic process data on servers that may be located outside India (primarily US/EU regions). This is a **current limitation** for full DPDP Act 2023 compliance for Indian users.
>
> **What a production version would do differently:**
> - Execute formal Data Processing Agreements (DPAs) with both Deepgram and Anthropic specifying Indian user data handling
> - Evaluate Deepgram's EU-region endpoint as an interim measure
> - For strict compliance: replace Deepgram with an on-premises Whisper deployment on Indian infrastructure, and replace Claude with a locally hosted LLM (e.g., Llama 3, Mistral) — eliminating all cross-border data transfer

### Deletion
Inherent by design — since nothing is ever stored, there is nothing to delete. Audio data is discarded at the end of each API request. No deletion workflow or scheduled cleanup is needed.

---

## 5. Trade-offs and What's Next

### Current Trade-offs

#### (a) Confidence-Based Flagging Is a Proxy, Not Ground Truth

The current approach uses Deepgram's word confidence score to flag potentially mispronounced words. This is a **correlation**, not a causal measurement:
- A word can score low-confidence due to: background noise, the speaker's accent being unusual for the model, audio codec artifacts, or genuine mispronunciation
- A word can score high-confidence even if mispronounced, if the mispronunciation happens to be consistent with a valid phonetic sequence

**What a production version would do:** Use a **wav2vec2-based phoneme recognition model** (e.g., `facebook/wav2vec2-lv-60-espeak-cv-ft` from HuggingFace) to extract the *actual phoneme sequence spoken* for each word, and compare it against the CMU dict's *expected phoneme sequence*. This is true forced alignment — a phoneme-level diff would tell you exactly which phonemes were wrong. The Montreal Forced Aligner (MFA) is the production standard for this.

#### (b) No Reference Text → No Ground Truth Comparison

The current "free speech" mode means there is no sentence the user was *supposed* to say, so the system can only measure *relative* confidence — not compare against a target.

**Improvement:** An optional **"Read this sentence" mode** where the user reads a displayed text prompt. This enables forced alignment: the system knows exactly what was supposed to be said and can perform phoneme-level comparison for much higher accuracy. Confidence alone is sufficient for a general fluency check, but forced alignment is far more accurate for phoneme-level assessment.

#### (c) No User Accounts or Progress Tracking

The current app has no persistence — each session is independent. A user cannot track improvement over time.

**What to build next:** Add optional user accounts (Supabase auth) with a dashboard showing score history over time. Scores and transcripts (not audio) can be stored legitimately with explicit user consent. Audio itself should remain never-stored per DPDP and best practice.

### Next-Week Roadmap

| Priority | Feature | Rationale |
|----------|---------|-----------|
| High | wav2vec2 phoneme recognition endpoint | True pronunciation accuracy vs. proxy |
| High | "Read this sentence" mode | Ground-truth comparison |
| Medium | User accounts + score history | Engagement, improvement tracking |
| Medium | Rate limiting (Upstash Redis) | Production safety |
| Medium | Deepgram EU region endpoint | Data residency improvement |
| Low | Sentence-level pause visualization | Richer fluency feedback |
| Low | Mobile app (React Native) | Accessibility of recording |
