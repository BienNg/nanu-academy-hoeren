// src/lib/scoring.ts

export type WordStatus = "correct" | "incorrect" | "missing" | "extra";

export interface WordScore {
  word: string; // The original script word (or typed word if extra)
  status: WordStatus;
  typed?: string; // What the user actually typed for this position
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

type AlignOp = "match" | "sub" | "del" | "ins";

/**
 * Aligns typed words to the script with word-level edit distance so a single
 * missing/extra word does not shift every later match into an incorrect.
 */
function alignWords(scriptWords: string[], typedWords: string[]): WordScore[] {
  const n = scriptWords.length;
  const m = typedWords.length;

  const dist: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );
  const op: AlignOp[][] = Array.from({ length: n + 1 }, () =>
    Array<AlignOp>(m + 1).fill("match"),
  );

  for (let i = 1; i <= n; i++) {
    dist[i]![0] = i;
    op[i]![0] = "del";
  }
  for (let j = 1; j <= m; j++) {
    dist[0]![j] = j;
    op[0]![j] = "ins";
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same =
        normalizeWord(scriptWords[i - 1]!) === normalizeWord(typedWords[j - 1]!);
      const subCost = dist[i - 1]![j - 1]! + (same ? 0 : 1);
      const delCost = dist[i - 1]![j]! + 1;
      const insCost = dist[i]![j - 1]! + 1;

      // Prefer match/sub over insert/delete when costs tie, so correct words stay aligned.
      if (subCost <= delCost && subCost <= insCost) {
        dist[i]![j] = subCost;
        op[i]![j] = same ? "match" : "sub";
      } else if (delCost <= insCost) {
        dist[i]![j] = delCost;
        op[i]![j] = "del";
      } else {
        dist[i]![j] = insCost;
        op[i]![j] = "ins";
      }
    }
  }

  const words: WordScore[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const current = op[i]![j]!;
    if (i > 0 && j > 0 && (current === "match" || current === "sub")) {
      const sWord = scriptWords[i - 1]!;
      const tWord = typedWords[j - 1]!;
      words.push(
        current === "match"
          ? { word: sWord, status: "correct", typed: tWord }
          : { word: sWord, status: "incorrect", typed: tWord },
      );
      i -= 1;
      j -= 1;
    } else if (i > 0 && (j === 0 || current === "del")) {
      words.push({ word: scriptWords[i - 1]!, status: "missing" });
      i -= 1;
    } else {
      words.push({ word: typedWords[j - 1]!, status: "extra", typed: typedWords[j - 1]! });
      j -= 1;
    }
  }

  words.reverse();
  return words;
}

export function scoreAttempt(typedText: string, script: string): ScoreResult {
  const scriptWords = script.trim().split(/\s+/).filter(Boolean);
  const typedWords = typedText.trim().split(/\s+/).filter(Boolean);
  const words = alignWords(scriptWords, typedWords);
  const correctCount = words.filter((w) => w.status === "correct").length;

  const accuracy =
    scriptWords.length > 0
      ? Math.round((correctCount / scriptWords.length) * 100)
      : 0;

  return {
    accuracy,
    words,
  };
}
