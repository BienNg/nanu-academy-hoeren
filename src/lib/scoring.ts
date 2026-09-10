// src/lib/scoring.ts

export type WordStatus = "correct" | "incorrect" | "missing" | "extra";

export interface WordScore {
  word: string;     // The original script word (or typed word if extra)
  status: WordStatus;
  typed?: string;   // What the user actually typed for this position
}

export interface ScoreResult {
  accuracy: number; // 0 to 100
  words: WordScore[];
}

/**
 * Normalizes a word for comparison by converting to lowercase and stripping
 * common punctuation (periods, commas, question marks, exclamation marks).
 * This ensures that if the script has "Mineralwasser," and the user types "mineralwasser",
 * it counts as correct.
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[.,?!:;]+$/g, "");
}

export function scoreAttempt(typedText: string, script: string): ScoreResult {
  const scriptWords = script.trim().split(/\s+/).filter(Boolean);
  const typedWords = typedText.trim().split(/\s+/).filter(Boolean);

  const words: WordScore[] = [];
  let correctCount = 0;

  // We compare positionally. We'll iterate up to the max length of either array.
  const maxLength = Math.max(scriptWords.length, typedWords.length);

  for (let i = 0; i < maxLength; i++) {
    const sWord = scriptWords[i];
    const tWord = typedWords[i];

    if (sWord !== undefined && tWord !== undefined) {
      if (normalizeWord(sWord) === normalizeWord(tWord)) {
        words.push({ word: sWord, status: "correct", typed: tWord });
        correctCount++;
      } else {
        words.push({ word: sWord, status: "incorrect", typed: tWord });
      }
    } else if (sWord !== undefined && tWord === undefined) {
      // User missed this word
      words.push({ word: sWord, status: "missing" });
    } else if (sWord === undefined && tWord !== undefined) {
      // User typed an extra word
      words.push({ word: tWord, status: "extra", typed: tWord });
    }
  }

  const accuracy = scriptWords.length > 0 
    ? Math.round((correctCount / scriptWords.length) * 100)
    : 0;

  return {
    accuracy,
    words,
  };
}

