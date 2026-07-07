import type { WordResult, FluencyNote } from "./types";

/**
 * Tunable constants for scoring thresholds.
 * Adjust these to calibrate scoring sensitivity.
 */
const LONG_PAUSE_THRESHOLD_SECONDS = 0.5; // Gaps longer than this count as fluency deductions
const MAX_FLUENCY_PENALTY = 1.0; // Clamp to 1.0 (0 fluency score)

/**
 * Compute clarity score from Deepgram word-level confidence values.
 * Clarity = average confidence across all words, scaled to 0-100.
 */
export function computeClarityScore(words: WordResult[]): number {
  if (words.length === 0) return 0;
  const totalConfidence = words.reduce((sum, w) => sum + w.confidence, 0);
  const avgConfidence = totalConfidence / words.length;
  return Math.round(avgConfidence * 100);
}

/**
 * Compute fluency score based on consistency of inter-word timing gaps.
 * Long pauses mid-sentence indicate hesitation/disfluency.
 *
 * Formula:
 *   pausePenalty = clamp(longPauseCount / totalWords, 0, 1)
 *   fluencyScore = 100 - (pausePenalty * 100)
 */
export function computeFluencyScore(words: WordResult[]): {
  score: number;
  notes: FluencyNote;
} {
  if (words.length < 2) {
    return {
      score: 100,
      notes: {
        pauseCount: 0,
        totalWords: words.length,
        avgPause: 0,
        comment: "Insufficient data to assess fluency.",
      },
    };
  }

  let longPauseCount = 0;
  let totalGap = 0;
  const gapCount = words.length - 1;

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startTime - words[i - 1].endTime;
    if (gap > 0) {
      totalGap += gap;
      if (gap > LONG_PAUSE_THRESHOLD_SECONDS) {
        longPauseCount++;
      }
    }
  }

  const avgPause = totalGap / gapCount;
  const pausePenalty = Math.min(
    longPauseCount / words.length,
    MAX_FLUENCY_PENALTY
  );
  const score = Math.round(100 - pausePenalty * 100);

  let comment = "";
  if (longPauseCount === 0) {
    comment = "Speech flowed naturally with no significant pauses.";
  } else if (longPauseCount <= 2) {
    comment = `${longPauseCount} noticeable pause${longPauseCount > 1 ? "s" : ""} detected. Overall fluency is good.`;
  } else {
    comment = `${longPauseCount} longer pauses detected, which may indicate hesitation. Practice speaking at a steadier pace.`;
  }

  return {
    score: Math.max(0, score),
    notes: {
      pauseCount: longPauseCount,
      totalWords: words.length,
      avgPause: Math.round(avgPause * 1000) / 1000,
      comment,
    },
  };
}

/**
 * Compute the overall composite pronunciation score.
 * Weights: Clarity 70%, Fluency 30%
 */
export function computeOverallScore(
  clarityScore: number,
  fluencyScore: number
): number {
  return Math.round(clarityScore * 0.7 + fluencyScore * 0.3);
}

/**
 * Return a qualitative label for a given score.
 */
export function getQualityLabel(
  score: number
): "Excellent" | "Good" | "Needs Practice" {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  return "Needs Practice";
}
