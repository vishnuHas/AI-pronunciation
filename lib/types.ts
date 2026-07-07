// Shared TypeScript interfaces for the Pronunciation Assessment App

/**
 * Error classification for a mispronounced word.
 * - vowel      : Wrong vowel sound (e.g. ship → sheep)
 * - consonant  : Wrong/dropped consonant (e.g. think → tink)
 * - stress     : Wrong syllable stress (e.g. pho-TO-graph → PHO-to-graph)
 * - omission   : Dropped sound/syllable (e.g. camera → camra)
 * - insertion  : Extra sound inserted (e.g. athlete → athalete)
 * - unclear    : Broadly unclear or inaudible articulation
 */
export type ErrorType = "vowel" | "consonant" | "stress" | "omission" | "insertion" | "unclear";

export interface WordResult {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  flagged: boolean;
  issue?: string;           // Claude-generated explanation for flagged words
  correction?: string;      // Claude-suggested pronunciation correction/tip
  phonemes?: string;        // CMU dict ARPABET phonemes for flagged words (expected)
  errorType?: ErrorType;    // Classified error category
  phoneticsTarget?: string; // IPA/simple phonetic of the CORRECT pronunciation
  phoneticsActual?: string; // IPA/simple phonetic of what was LIKELY said
}

export interface FluencyNote {
  pauseCount: number;
  totalWords: number;
  avgPause: number;
  comment: string;
}

export interface AnalysisResult {
  overallScore: number;
  clarityScore: number;
  fluencyScore: number;
  qualityLabel: "Excellent" | "Good" | "Needs Practice";
  words: WordResult[];
  transcript: string;
  fluencyNotes: FluencyNote;
  flaggedCount: number;
  nvidiaSummary?: string;   // Nvidia-generated pronunciation and topic summary
  nvidiaTips?: string[];    // Nvidia-generated speech/transcript improvement tips
  nvidiaPolished?: string;  // Nvidia-generated optimized/fluent transcript
}

export interface AnalyzeRequest {
  audio: File | Blob;
  consent: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}
