/**
 * Hangul romanization for code-switched student transcripts.
 *
 * Korean learners routinely name a place, a friend, or a dish in Korean
 * inside an otherwise English sentence ("I'm going to 거제도 this summer").
 * The transcription adapter pins `language: "en"`, which keeps most such
 * tokens in Latin script, but an empirical probe (2026-07-23,
 * gpt-4o-mini-transcribe) found 3 of 6 code-switched samples still came
 * back containing Hangul.
 *
 * Deleting those spans — the original behaviour — produced a fluent but
 * factually gutted sentence ("I'm going to this summer vacation") that no
 * downstream stage could recognise as damaged.
 *
 * Rewriting them into romanized English was then tried and also rejected: it
 * put words into the child's mouth in `original_transcript`, the record a
 * teacher reads as evidence. The shipped design keeps the transcript verbatim
 * and passes `detectHangulSpans` output to the evaluator, which classifies
 * each word as a name to accept or vocabulary to teach.
 *
 * Dropping the `language: "en"` pin was measured and rejected: without it
 * 거제도 (Geoje Island) transcribed as "Jeju Island", substituting a wrong
 * fact for a missing one.
 *
 * Implements Revised Romanization of Korean (RR) transliteration for
 * syllable blocks. RR's word-level assimilation rules are deliberately not
 * modelled — for proper nouns spoken by a child, per-syllable
 * transliteration lands close enough for an evaluator to recognise the name,
 * which is all this needs to do.
 */

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28;

/** RR transliteration of the 19 leading consonants (초성), by jamo index. */
const INITIAL_ROMAN = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp",
  "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
] as const;

/** RR transliteration of the 21 vowels (중성), by jamo index. */
const MEDIAL_ROMAN = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o",
  "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu",
  "eu", "ui", "i",
] as const;

/**
 * RR transliteration of the 27 trailing consonants (종성) plus none, by jamo
 * index. Jamo order is ᆨ ᆩ ᆪ ᆫ ᆬ ᆭ ᆮ ᆯ ᆰ ᆱ ᆲ ᆳ ᆴ ᆵ ᆶ ᆷ ᆸ ᆹ ᆺ ᆻ ᆼ ᆽ ᆾ ᆿ ᇀ ᇁ ᇂ;
 * RR romanizes a final by its released value, so ᆷ is "m" and ᆸ is "p"
 * (김밥 -> "Gimbap"), and clusters take the sound actually pronounced.
 */
const FINAL_ROMAN = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k",
  "m", "p", "l", "l", "p", "l", "m", "p", "p", "t",
  "t", "ng", "t", "t", "k", "t", "p", "t",
] as const;

/**
 * Standalone jamo and compatibility jamo, which appear when a transcript
 * contains an isolated letter rather than a composed syllable block.
 */
const COMPATIBILITY_JAMO: Record<string, string> = {
  "ㄱ": "g", "ㄲ": "kk", "ㄴ": "n", "ㄷ": "d", "ㄸ": "tt",
  "ㄹ": "r", "ㅁ": "m", "ㅂ": "b", "ㅃ": "pp", "ㅅ": "s",
  "ㅆ": "ss", "ㅇ": "ng", "ㅈ": "j", "ㅉ": "jj", "ㅊ": "ch",
  "ㅋ": "k", "ㅌ": "t", "ㅍ": "p", "ㅎ": "h",
  "ㅏ": "a", "ㅐ": "ae", "ㅑ": "ya", "ㅒ": "yae", "ㅓ": "eo",
  "ㅔ": "e", "ㅕ": "yeo", "ㅖ": "ye", "ㅗ": "o", "ㅘ": "wa",
  "ㅙ": "wae", "ㅚ": "oe", "ㅛ": "yo", "ㅜ": "u", "ㅝ": "wo",
  "ㅞ": "we", "ㅟ": "wi", "ㅠ": "yu", "ㅡ": "eu", "ㅢ": "ui",
  "ㅣ": "i",
};

/** Matches any Hangul: syllable blocks, conjoining jamo, compatibility jamo. */
export const HANGUL_PATTERN = /[ᄀ-ᇿ㄰-㆏가-힯]/u;
const HANGUL_RUN_PATTERN = /[ᄀ-ᇿ㄰-㆏가-힯]+/gu;

function romanizeSyllable(codePoint: number): string {
  const offset = codePoint - HANGUL_SYLLABLE_START;
  const initial = Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT));
  const medial = Math.floor((offset % (MEDIAL_COUNT * FINAL_COUNT)) / FINAL_COUNT);
  const final = offset % FINAL_COUNT;

  return `${INITIAL_ROMAN[initial]}${MEDIAL_ROMAN[medial]}${FINAL_ROMAN[final]}`;
}

/**
 * Romanize a single run of Hangul into one capitalized token.
 *
 * Runs are capitalized because every Hangul span surviving an English-pinned
 * transcript is, in practice, a proper noun the model declined to render —
 * a place, a person, or a dish. Capitalizing marks it as a name for the
 * evaluator rather than leaving a lowercase word it may try to "correct".
 */
export function romanizeHangulRun(run: string): string {
  let romanized = "";

  for (const character of run) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint >= HANGUL_SYLLABLE_START && codePoint <= HANGUL_SYLLABLE_END) {
      romanized += romanizeSyllable(codePoint);
      continue;
    }

    romanized += COMPATIBILITY_JAMO[character] ?? "";
  }

  if (!romanized) return "";
  return romanized.charAt(0).toUpperCase() + romanized.slice(1);
}

export type RomanizeHangulResult = {
  /** The text with every Hangul run replaced by its romanization. */
  text: string;
  /** Romanized forms, in order, of each Hangul run that was converted. */
  romanizedSpans: string[];
};

/**
 * Replace every Hangul run in `text` with its RR romanization, reporting
 * which spans were converted so callers can flag the turn downstream.
 *
 * NOTE: no production caller as of 2026-07-24. The transcript pipeline uses
 * `detectHangulSpans` instead, because rewriting the transcript claims the
 * student said English they never spoke. Kept for callers that need a
 * romanized *rendering* of Korean text without touching stored evidence.
 */
export function romanizeHangul(text: string): RomanizeHangulResult {
  const romanizedSpans: string[] = [];

  const romanizedText = text.replace(HANGUL_RUN_PATTERN, (run) => {
    const romanized = romanizeHangulRun(run);
    if (!romanized) return " ";
    romanizedSpans.push(romanized);
    return romanized;
  });

  return { text: romanizedText, romanizedSpans };
}

export type HangulSpan = {
  /** The Korean text exactly as the student said it. */
  hangul: string;
  /** RR romanization, supplied so the evaluator can read the name aloud. */
  romanized: string;
};

/**
 * Report each distinct Hangul run in `text` **without modifying the text**.
 *
 * This is the transcript-safe counterpart to `romanizeHangul`. The transcript
 * is the evidence record a teacher reads, so it must store what the child
 * actually said; rewriting 서울초등학교 into "Seoul Chodeunghakgyo" would claim
 * the child produced English they never spoke. The romanization travels
 * beside the transcript instead, letting the evaluator decide per span
 * whether the word is a proper noun to accept or ordinary vocabulary to
 * teach.
 *
 * Runs are deduplicated: a word the student repeats is one classification
 * decision, not two.
 */
export function detectHangulSpans(text: string): HangulSpan[] {
  const spans: HangulSpan[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(HANGUL_RUN_PATTERN)) {
    const hangul = match[0];
    if (seen.has(hangul)) continue;

    const romanized = romanizeHangulRun(hangul);
    if (!romanized) continue;

    seen.add(hangul);
    spans.push({ hangul, romanized });
  }

  return spans;
}

/** Lowercase and drop every non-letter, so "Baedal-ranteu" == "baedalranteu". */
function collapseLetters(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z]/gu, "");
}

/**
 * Latin words in `sentence` that are merely the RR romanization of a Hangul
 * span the student actually said.
 *
 * A transcriber that mishears 발로란트 (Valorant) as 배달란트 hands the
 * evaluator a Hangul span with no real English reading. The evaluator, told to
 * keep the child's word, transliterates it and emits the non-word
 * "Baedalranteu" — which Coco then says aloud and asks the child to repeat.
 * Five clips at 90+ accuracy were rejected, because a word that does not exist
 * cannot be pronounced (attempt 6406e6a5, 2026-07-27).
 *
 * This is deterministic on purpose. The evaluator prompt already forbids the
 * substitution and the model did it anyway, so the guard cannot be a prompt
 * line. Matching is on collapsed letters, catching "Baedalranteu",
 * "baedal-ranteu", and "Baedal Ranteu" alike, and a romanization split across
 * adjacent words.
 *
 * Only spans the model transliterated are reported. A span it genuinely
 * recognized comes back as a real English word ("플레이 게임즈" -> "play games"),
 * which shares no letters with "Peullei Geimjeu" and so never matches.
 */
export function findRomanizationArtifacts(
  sentence: string,
  spans: HangulSpan[],
): string[] {
  if (!sentence || spans.length === 0) return [];

  const words = sentence.match(/[A-Za-z][A-Za-z'-]*/gu) ?? [];
  if (words.length === 0) return [];

  const artifacts: string[] = [];
  const seen = new Set<string>();
  const targets = spans
    .map((span) => collapseLetters(span.romanized))
    .filter((target) => target.length > 0);

  for (let index = 0; index < words.length; index += 1) {
    // A romanization may arrive as one token or be split across a few
    // ("Baedal Ranteu"), so grow a window from each word and stop as soon as
    // it can no longer be a prefix of any target.
    let joined = "";
    for (let length = 0; length < 4 && index + length < words.length; length += 1) {
      joined += collapseLetters(words[index + length]);
      if (!joined) break;

      if (targets.includes(joined)) {
        const matched = words.slice(index, index + length + 1).join(" ");
        if (!seen.has(matched)) {
          seen.add(matched);
          artifacts.push(matched);
        }
        break;
      }

      if (!targets.some((target) => target.startsWith(joined))) break;
    }
  }

  return artifacts;
}

/**
 * True when `text` contains no Latin letters — i.e. the learner answered
 * entirely in Korean rather than code-switching a single proper noun.
 *
 * Checked before romanization so a fully Korean answer is still rejected and
 * retried, preserving the guard added in f50ed045.
 */
export function isEntirelyNonEnglish(text: string): boolean {
  return HANGUL_PATTERN.test(text) && !/[A-Za-z]/u.test(text);
}

/**
 * NOTE (UAT 2026-07-24): a string heuristic that decided code-switch vs
 * "Korean answer in an English frame" was tried here and abandoned.
 * "바닐라 is good." (a Korean answer) and "I like 축구." (a valid code-switch)
 * have identical word-class and Korean/English-ratio profiles — they differ
 * only in whether Korean fills the subject or the object slot. Separating them
 * is a syntactic judgement, so it belongs to the evaluator, which sees the
 * whole sentence. See the mixed-language instruction in
 * `src/server/ai/turn-evaluator.ts`. Don't reintroduce a word-list or
 * ratio-based gate at this layer.
 */
