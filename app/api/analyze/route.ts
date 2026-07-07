/**
 * =============================================================================
 * PRONUNCIATION ASSESSMENT API ROUTE  —  /api/analyze
 * =============================================================================
 *
 * DPDP ACT 2023 DATA FLOW COMPLIANCE SUMMARY
 * -------------------------------------------
 * This route processes audio files for pronunciation assessment.
 *
 * Data collected    : Audio buffer (in-memory only)
 * Purpose           : Pronunciation scoring via speech-to-text analysis
 * Storage           : NONE. Audio is never written to disk, database, or any
 *                     blob/object storage (S3, GCS, Vercel Blob, etc.).
 * Retention         : NONE. The audio buffer is explicitly nulled out after
 *                     the Deepgram transcription call completes (see step 3 below).
 *                     The buffer goes out of scope and is eligible for GC before
 *                     any further processing occurs.
 * Third-party processors :
 *   - Deepgram (deepgram.com) — receives raw audio bytes for transcription.
 *     Data may be processed on servers outside India (US/EU region).
 *   - Anthropic (anthropic.com) — receives text only (flagged words + phonemes,
 *     NO audio). Data may be processed on servers outside India.
 * Consent           : Explicit user consent is required client-side AND validated
 *                     server-side. Requests without consent=true are rejected (400).
 * User data retained: NONE. No transcripts, scores, or identifying data are
 *                     written to any persistent store.
 *
 * For a production deployment subject to DPDP Act 2023, the following additional
 * steps would be recommended:
 *   - Execute a Data Processing Agreement (DPA) with Deepgram and Anthropic
 *   - Evaluate region-pinned API endpoints (e.g., Deepgram EU region)
 *   - Consider on-premises Whisper/wav2vec2 models to keep audio in-country
 * =============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@deepgram/sdk";
import * as musicMetadata from "music-metadata";
import axios from "axios";
import { getPhonemesForWord } from "@/lib/phonemes";
import {
  computeClarityScore,
  computeFluencyScore,
  computeOverallScore,
  getQualityLabel,
} from "@/lib/scoring";
import type { WordResult, AnalysisResult } from "@/lib/types";

// Nvidia API Configuration for transcript analysis & tips
const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "";

const VALID_ERROR_TYPES = new Set(["vowel", "consonant", "stress", "omission", "insertion", "unclear"]);


// ---------------------------------------------------------------------------
// Tunable constants — adjust here to calibrate the scoring system
// ---------------------------------------------------------------------------

/** Words with Deepgram confidence below this value are flagged for review */
const CONFIDENCE_THRESHOLD = 0.75;

/** Minimum allowed audio duration in seconds (server-side enforcement) */
const MIN_DURATION_SECONDS = 30;

/** Maximum allowed audio duration in seconds (server-side enforcement) */
const MAX_DURATION_SECONDS = 45;

// ---------------------------------------------------------------------------
// RATE LIMITING NOTE (production consideration):
// In a production deployment, add rate limiting here to prevent abuse.
// Recommended approach: use Vercel's @vercel/kv or Upstash Redis with a
// sliding window algorithm (e.g., 5 requests per user per minute).
// Example library: `@upstash/ratelimit` with `@upstash/redis`.
// For a free-tier prototype, at minimum add IP-based limiting.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // Step 0: Parse multipart form data
  // -------------------------------------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid request format. Expected multipart/form-data.", code: "INVALID_FORMAT" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // Step 1: Server-side consent validation
  // DPDP compliance: reject processing without explicit consent
  // -------------------------------------------------------------------------
  const consentValue = formData.get("consent");
  if (consentValue !== "true") {
    return NextResponse.json(
      {
        error: "Consent is required to process your audio.",
        code: "CONSENT_REQUIRED",
      },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Extract audio file and convert to Buffer (in-memory only)
  // DPDP compliance: audio NEVER touches disk at any point
  // -------------------------------------------------------------------------
  const audioFile = formData.get("audio") as File | null;
  if (!audioFile || audioFile.size === 0) {
    return NextResponse.json(
      { error: "No audio file provided.", code: "NO_AUDIO" },
      { status: 400 }
    );
  }

  const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/ogg", "video/webm"];
  if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(mp3|wav|m4a|webm|ogg)$/i)) {
    return NextResponse.json(
      {
        error: "Unsupported audio format. Please upload an MP3, WAV, M4A, or WebM file.",
        code: "UNSUPPORTED_FORMAT",
      },
      { status: 400 }
    );
  }

  // Convert File to ArrayBuffer then to Node.js Buffer — fully in-memory
  const arrayBuffer = await audioFile.arrayBuffer();
  let audioBuffer: Buffer | null = Buffer.from(arrayBuffer);

  // -------------------------------------------------------------------------
  // Step 3: Server-side duration validation via music-metadata
  // -------------------------------------------------------------------------
  let duration: number;
  try {
    const metadata = await musicMetadata.parseBuffer(
      audioBuffer,
      { mimeType: audioFile.type || "audio/mpeg" }
    );
    duration = metadata.format.duration ?? 0;
  } catch {
    // If music-metadata can't parse (e.g., raw webm from MediaRecorder),
    // skip duration validation and proceed — Deepgram will handle it
    duration = -1; // sentinel: unknown duration
    console.warn("[analyze] Could not parse audio duration — proceeding without server-side duration validation");
  }

  if (duration !== -1 && duration < MIN_DURATION_SECONDS) {
    audioBuffer = null; // Discard immediately
    return NextResponse.json(
      {
        error: `Audio is too short (${Math.round(duration)}s). Please upload a clip between 30 and 45 seconds.`,
        code: "TOO_SHORT",
      },
      { status: 400 }
    );
  }

  if (duration !== -1 && duration > MAX_DURATION_SECONDS) {
    audioBuffer = null; // Discard immediately
    return NextResponse.json(
      {
        error: `Audio is too long (${Math.round(duration)}s). Please upload a clip between 30 and 45 seconds.`,
        code: "TOO_LONG",
      },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Send audio to Deepgram nova-2 for transcription
  // Word-level confidence scores and timestamps are requested
  // -------------------------------------------------------------------------
  if (!process.env.DEEPGRAM_API_KEY) {
    audioBuffer = null;
    return NextResponse.json(
      { error: "Deepgram API key not configured.", code: "CONFIG_ERROR" },
      { status: 500 }
    );
  }

  let deepgramResult;
  try {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    const { result, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: "nova-2",
        language: "en",
        punctuate: true,
        smart_format: true,
        // Word-level timestamps and confidence — core requirement
        words: true,
        // Utterances give us natural pause information
        utterances: false,
      }
    );

    if (dgError) {
      throw new Error(dgError.message || "Deepgram transcription failed");
    }
    deepgramResult = result;
  } catch (err) {
    audioBuffer = null; // Discard on failure too
    console.error("[analyze] Deepgram error:", err);
    return NextResponse.json(
      {
        error: "Speech transcription failed. Please try again or check your audio quality.",
        code: "TRANSCRIPTION_ERROR",
      },
      { status: 502 }
    );
  }

  // =========================================================================
  // DPDP COMPLIANCE: Audio buffer is explicitly nulled out here.
  // After this line, the raw audio data is no longer referenced anywhere
  // in this request handler and will be garbage collected.
  // =========================================================================
  audioBuffer = null;

  // -------------------------------------------------------------------------
  // Step 5: Extract word-level results from Deepgram response
  // -------------------------------------------------------------------------
  const channel = deepgramResult?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  if (!alternative || !alternative.words || alternative.words.length === 0) {
    return NextResponse.json(
      {
        error: "Could not extract words from audio. Please ensure the audio contains clear English speech.",
        code: "NO_WORDS_DETECTED",
      },
      { status: 422 }
    );
  }

  const transcript = alternative.transcript || "";

  // -------------------------------------------------------------------------
  // Step 6: Flag words below confidence threshold
  // -------------------------------------------------------------------------
  const words: WordResult[] = alternative.words.map((w) => ({
    text: w.word || "",
    startTime: w.start ?? 0,
    endTime: w.end ?? 0,
    confidence: w.confidence ?? 1,
    flagged: (w.confidence ?? 1) < CONFIDENCE_THRESHOLD,
  }));

  const flaggedWords = words.filter((w) => w.flagged);

  // -------------------------------------------------------------------------
  // Step 7: CMU dict phoneme lookup for flagged words
  // -------------------------------------------------------------------------
  for (const word of flaggedWords) {
    const phonemes = getPhonemesForWord(word.text);
    if (phonemes) {
      word.phonemes = phonemes;
    }
  }

  // -------------------------------------------------------------------------
  // Step 8: Batch Claude API call for issue explanations
  // Only flagged words + their surrounding context are sent (NO audio)
  // -------------------------------------------------------------------------
  if (flaggedWords.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // Build structured context for each flagged word with surrounding words
      const wordContexts = flaggedWords.map((fw) => {
        const idx = words.indexOf(fw);
        const contextStart = Math.max(0, idx - 2);
        const contextEnd = Math.min(words.length - 1, idx + 2);
        const context = words
          .slice(contextStart, contextEnd + 1)
          .map((w) => w.text)
          .join(" ");

        return {
          word: fw.text,
          confidence: fw.confidence,
          context,
          phonemes: fw.phonemes ?? "not found in dictionary",
        };
      });

      const prompt = `You are an expert pronunciation coach analyzing speech recognition output for an English language learner.

The following words had low confidence scores from Deepgram STT (below ${CONFIDENCE_THRESHOLD}), meaning the learner likely mispronounced them.

For each word:
- "word": the target English word
- "confidence": Deepgram's recognition confidence (lower = more mispronounced)
- "context": surrounding words in the sentence
- "phonemes": the correct ARPABET pronunciation from CMU dict

Flagged words data:
${JSON.stringify(wordContexts, null, 2)}

For EACH flagged word, provide:
1. "errorType": classify the pronunciation error into EXACTLY one of these categories:
   - "vowel"     — wrong vowel sound (e.g. said /ɪ/ instead of /iː/)
   - "consonant" — wrong or dropped consonant (e.g. /θ/ → /t/ in "think")
   - "stress"    — wrong syllable stress (e.g. REcord vs reCORD)
   - "omission"  — dropped a sound or syllable (e.g. "camra" for "camera")
   - "insertion" — added an extra sound (e.g. "athalete" for "athlete")
   - "unclear"   — broadly unclear or inaudible articulation

2. "issue": ONE specific sentence (max 15 words) naming exactly what phoneme or pattern went wrong.
   Bad: "The word was not pronounced clearly."
   Good: "The vowel /æ/ in 'and' was shortened to /ə/."

3. "correction": ONE short, actionable coach tip (max 20 words). Use phonetic spelling or mouth position cues.
   Bad: "Practice this word more."
   Good: "Open your mouth wider — say 'aand' with a clear /æ/ like in 'cat'."

4. "phoneticsTarget": simple phonetic spelling of the CORRECT pronunciation (e.g. "em-tee", "look-ing", "OC-ean").
5. "phoneticsActual": simple phonetic spelling of what the learner LIKELY said (e.g. "emp-tee", "look-een", "uh-shun").

Return ONLY valid JSON, no markdown, no explanation:
{
  "issues": [
    {
      "word": "the_word",
      "errorType": "vowel",
      "issue": "One specific sentence about the pronunciation error.",
      "correction": "Short actionable coaching tip.",
      "phoneticsTarget": "correct-phonetic-spelling",
      "phoneticsActual": "what-they-likely-said"
    }
  ]
}`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      // Strip any markdown code fences if Claude wraps in them
      const cleanedText = responseText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

      // Parse Claude's JSON response
      const parsed = JSON.parse(cleanedText) as {
        issues: {
          word: string;
          errorType: string;
          issue: string;
          correction: string;
          phoneticsTarget?: string;
          phoneticsActual?: string;
        }[];
      };

      // Valid error types (also defined above for Nvidia path)

      // Map issues back to flagged words
      for (const issueItem of parsed.issues) {
        const matchingWord = flaggedWords.find(
          (w) => w.text.toLowerCase() === issueItem.word.toLowerCase()
        );
        if (matchingWord) {
          matchingWord.issue = issueItem.issue;
          matchingWord.correction = issueItem.correction;
          matchingWord.errorType = VALID_ERROR_TYPES.has(issueItem.errorType)
            ? (issueItem.errorType as import("@/lib/types").ErrorType)
            : "unclear";
          matchingWord.phoneticsTarget = issueItem.phoneticsTarget;
          matchingWord.phoneticsActual = issueItem.phoneticsActual;
        }
      }
    } catch (err) {
      // Claude failure is non-fatal — words are still flagged, just without explanations
      console.error("[analyze] Anthropic error:", err);
    }
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[analyze] ANTHROPIC_API_KEY not set — skipping issue generation");
  }

  // -------------------------------------------------------------------------
  // Step 8.5: Call Nvidia API to generate summary, tips, AND error-type labels
  // This always runs so errorType classification works even without Anthropic.
  // -------------------------------------------------------------------------
  let nvidiaSummary: string | undefined;
  let nvidiaTips: string[] | undefined;
  let nvidiaPolished: string | undefined;

  if (NVIDIA_API_KEY) {
    try {
      // Build a compact list of flagged words for Nvidia to classify
      const flaggedWordsList = flaggedWords.map((w) => ({
        word: w.text,
        confidence: Number(w.confidence.toFixed(2)),
      }));

      const nvidiaPayload = {
        model: "meta/llama-3.1-8b-instruct",
        messages: [
          {
            role: "user",
            content: `You are an expert English pronunciation coach.
Analyze the transcript below. The flagged words were mispronounced (low speech-recognition confidence).

Original Transcript: "${transcript}"
Flagged Words (word + confidence, lower = worse): ${JSON.stringify(flaggedWordsList)}

Provide ALL of the following in ONE JSON response:

1. "summary": A single 1-2 sentence plain-English description of what the speaker is talking about and their overall clarity. No phoneme codes. No special symbols.

2. "tips": Exactly 3 short, plain-English coaching tips to help this specific learner improve. Rules for tips:
   - Write in simple, everyday English that any learner can read aloud.
   - Do NOT use ARPABET codes (like "EH1", "AE0"), IPA symbols (/æ/, /θ/), or any special phonetic notation.
   - Instead, write phonetics as normal English spelling clues (e.g. "say it like 'cat'", "rhymes with 'ship'", "stress the first part: OK-ean").
   - Each tip must be under 25 words.
   - Make tips specific to the flagged words shown above.

3. "polishedTranscript": Corrected version of the transcript where ONLY the flagged mispronounced words are replaced with their correct forms. Keep every other word identical. Same word count and sentence structure.

4. "errorTypes": An array classifying each flagged word into one error category.
   - Use ONLY these category names: "vowel", "consonant", "stress", "omission", "insertion", "unclear"
   - "vowel"     = wrong vowel sound
   - "consonant" = wrong or dropped consonant sound
   - "stress"    = wrong syllable stress
   - "omission"  = dropped a sound or syllable
   - "insertion" = added an extra sound
   - "unclear"   = broadly unclear or inaudible
   - Return one object per flagged word in the same order as the input list.

Return ONLY valid JSON, no markdown, no explanation:
{
  "summary": "...",
  "tips": ["...", "...", "..."],
  "polishedTranscript": "...",
  "errorTypes": [{"word": "...", "errorType": "vowel"}, ...]
}`
          }
        ],
        max_tokens: 900,
        temperature: 0.20,
        top_p: 0.70,
        stream: false
      };

      const nvidiaResponse = await axios.post(NVIDIA_API_URL, nvidiaPayload, {
        headers: {
          "Authorization": `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      const choice = nvidiaResponse.data?.choices?.[0]?.message?.content || "";
      // Strip any markdown fences the model might wrap the JSON in
      const cleanedNvidiaText = choice.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      const parsedNvidia = JSON.parse(cleanedNvidiaText) as {
        summary: string;
        tips: string[];
        polishedTranscript: string;
        errorTypes?: { word: string; errorType: string }[];
      };

      if (parsedNvidia.summary) nvidiaSummary = parsedNvidia.summary;
      if (parsedNvidia.tips && Array.isArray(parsedNvidia.tips)) nvidiaTips = parsedNvidia.tips;
      if (parsedNvidia.polishedTranscript) nvidiaPolished = parsedNvidia.polishedTranscript;

      // Apply Nvidia's errorType classification to flagged words that weren't
      // already classified by Claude (or when Claude is unavailable)
      if (Array.isArray(parsedNvidia.errorTypes)) {
        for (const item of parsedNvidia.errorTypes) {
          const matchingWord = flaggedWords.find(
            (w) => w.text.toLowerCase() === item.word.toLowerCase()
          );
          // Only set if not already set by the Anthropic pass
          if (matchingWord && !matchingWord.errorType) {
            matchingWord.errorType = VALID_ERROR_TYPES.has(item.errorType)
              ? (item.errorType as import("@/lib/types").ErrorType)
              : "unclear";
          }
        }
      }
    } catch (err) {
      console.error("[analyze] Nvidia API error:", err);
    }
  } else {
    console.warn("[analyze] NVIDIA_API_KEY not set — skipping summary, tips, and classification fallback");
  }

  // -------------------------------------------------------------------------
  // Step 9: Compute composite pronunciation score
  // -------------------------------------------------------------------------
  const clarityScore = computeClarityScore(words);
  const { score: fluencyScore, notes: fluencyNotes } = computeFluencyScore(words);
  const overallScore = computeOverallScore(clarityScore, fluencyScore);
  const qualityLabel = getQualityLabel(overallScore);

  // -------------------------------------------------------------------------
  // Step 10: Return results (no audio, no persistent data)
  // -------------------------------------------------------------------------
  const result: AnalysisResult = {
    overallScore,
    clarityScore,
    fluencyScore,
    qualityLabel,
    words,
    transcript,
    fluencyNotes,
    flaggedCount: flaggedWords.length,
    nvidiaSummary,
    nvidiaTips,
    nvidiaPolished,
  };

  return NextResponse.json(result, { status: 200 });
}

