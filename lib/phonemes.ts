/**
 * Phoneme lookup via the CMU Pronouncing Dictionary.
 *
 * The `pronouncing` npm package bundles the full CMU dict offline —
 * no API call needed, no network dependency.
 *
 * Returns ARPABET phoneme strings for a given English word, or null if
 * the word is not found in the dictionary (proper nouns, slang, etc.).
 *
 * Example: getPhonemesForWord("hello") → "HH AH0 L OW1"
 */

// pronouncing is a CommonJS module — use require for compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pronouncing = require("pronouncing");

/**
 * Get the primary ARPABET phoneme sequence for a word from CMU dict.
 * Returns null if the word is not in the dictionary.
 */
export function getPhonemesForWord(word: string): string | null {
  const cleaned = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!cleaned) return null;

  try {
    const phones: string[] = pronouncing.phonesForWord(cleaned);
    if (phones && phones.length > 0) {
      return phones[0]; // Return primary pronunciation
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get all pronunciation variants for a word (some words have multiple).
 * Returns empty array if not found.
 */
export function getAllPhonemesForWord(word: string): string[] {
  const cleaned = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!cleaned) return [];

  try {
    return pronouncing.phonesForWord(cleaned) || [];
  } catch {
    return [];
  }
}
