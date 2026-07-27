import { describe, expect, it } from "vitest";
import {
  detectHangulSpans,
  findRomanizationArtifacts,
  isEntirelyNonEnglish,
  romanizeHangul,
  romanizeHangulRun,
} from "@/domain/audio/hangul-romanization";

describe("romanizeHangulRun", () => {
  it("romanizes a place name the transcriber left in Hangul", () => {
    // The exact failure from the 2026-07-23 probe: 거제도 survived the
    // English language pin and was previously deleted outright.
    expect(romanizeHangulRun("거제도")).toBe("Geojedo");
  });

  it("romanizes syllables with a trailing consonant", () => {
    expect(romanizeHangulRun("김밥")).toBe("Gimbap");
    expect(romanizeHangulRun("민준")).toBe("Minjun");
  });

  it("romanizes a syllable with no leading consonant sound", () => {
    expect(romanizeHangulRun("아이")).toBe("Ai");
  });

  it("romanizes compound vowels and the ng final", () => {
    expect(romanizeHangulRun("서울")).toBe("Seoul");
    expect(romanizeHangulRun("강")).toBe("Gang");
  });

  it("capitalizes the run so the evaluator reads it as a proper noun", () => {
    expect(romanizeHangulRun("부산")).toBe("Busan");
  });

  it("romanizes isolated compatibility jamo", () => {
    expect(romanizeHangulRun("ㄱ")).toBe("G");
  });

  it("returns an empty string when a run romanizes to nothing", () => {
    expect(romanizeHangulRun("")).toBe("");
  });
});

describe("romanizeHangul", () => {
  it("keeps the student's answer instead of deleting it", () => {
    const result = romanizeHangul("I'm going to 거제도 this summer vacation.");

    expect(result.text).toBe("I'm going to Geojedo this summer vacation.");
    expect(result.romanizedSpans).toEqual(["Geojedo"]);
  });

  it("reports every converted span in order", () => {
    const result = romanizeHangul("I ate 김밥 with 민준.");

    expect(result.text).toBe("I ate Gimbap with Minjun.");
    expect(result.romanizedSpans).toEqual(["Gimbap", "Minjun"]);
  });

  it("leaves pure-English text and its span list untouched", () => {
    const result = romanizeHangul("I like apples and oranges.");

    expect(result.text).toBe("I like apples and oranges.");
    expect(result.romanizedSpans).toEqual([]);
  });

  it("romanizes a fully Korean sentence rather than emptying it", () => {
    const result = romanizeHangul("나는 방과 후에 축구를 좋아해요.");

    expect(result.text).not.toBe("");
    expect(result.romanizedSpans.length).toBeGreaterThan(0);
  });
});

describe("detectHangulSpans", () => {
  it("reports the span without altering the student's words", () => {
    // The transcript is the evidence record a teacher reads, so it must keep
    // what the child actually said. The romanization rides alongside it.
    const spans = detectHangulSpans("I'm going to 거제도 this summer vacation.");

    expect(spans).toEqual([{ hangul: "거제도", romanized: "Geojedo" }]);
  });

  it("reports every span in order", () => {
    expect(detectHangulSpans("I ate 김밥 with 민준.")).toEqual([
      { hangul: "김밥", romanized: "Gimbap" },
      { hangul: "민준", romanized: "Minjun" },
    ]);
  });

  it("deduplicates a span the student repeats", () => {
    // One classification per distinct word; a repeat is not a second decision.
    expect(detectHangulSpans("I like 축구. 축구 is fun.")).toEqual([
      { hangul: "축구", romanized: "Chukgu" },
    ]);
  });

  it("returns nothing for pure English", () => {
    expect(detectHangulSpans("I like apples and oranges.")).toEqual([]);
  });

  it("skips a run that romanizes to nothing", () => {
    expect(detectHangulSpans("I like 。 apples.")).toEqual([]);
  });

  it("returns the same result on repeated calls", () => {
    // The run pattern is a shared module-level /g regex; a detector built on
    // exec() rather than matchAll() would carry lastIndex between calls and
    // silently miss spans on every other turn.
    const text = "I'm going to 거제도 this summer vacation.";
    const expected = [{ hangul: "거제도", romanized: "Geojedo" }];

    expect(detectHangulSpans(text)).toEqual(expected);
    expect(detectHangulSpans(text)).toEqual(expected);
    expect(detectHangulSpans(text)).toEqual(expected);
  });
});

describe("isEntirelyNonEnglish", () => {
  it("flags an answer given entirely in Korean", () => {
    expect(isEntirelyNonEnglish("나는 방과 후에 축구를 좋아해요.")).toBe(true);
  });

  it("does not flag a code-switched sentence with an English frame", () => {
    expect(isEntirelyNonEnglish("I'm going to 거제도 this summer vacation.")).toBe(
      false,
    );
  });

  it("does not flag pure English", () => {
    expect(isEntirelyNonEnglish("I like apples.")).toBe(false);
  });

  it("does not flag text with no Hangul at all", () => {
    expect(isEntirelyNonEnglish("12345")).toBe(false);
  });
});

describe("romanization exposes the phonetic cue the evaluator judges (UAT 2026-07-24)", () => {
  // There is no hardcoded loanword list. The evaluator decides whether an
  // accented-English word was mis-scripted to Hangul by sounding out the
  // romanization, so the only thing this layer must guarantee is that the
  // romanization carries the resemblance: 초콜릿 must sound like "chocolate",
  // and 딸기 must NOT sound like "strawberry".
  it("romanizes accented-English loanwords close to their English sound", () => {
    expect(romanizeHangulRun("초콜릿")).toBe("Chokolrit");
    expect(romanizeHangulRun("바닐라")).toBe("Banilra");
    expect(romanizeHangulRun("피자")).toBe("Pija");
    expect(romanizeHangulRun("아이스크림")).toBe("Aiseukeurim");
  });

  it("romanizes native Korean vocabulary to a sound unlike its English word", () => {
    // 딸기 sounds nothing like "strawberry"; 축구 nothing like "soccer".
    // These must NOT be read as accented English — they are words to teach.
    expect(romanizeHangulRun("딸기")).toBe("Ttalgi");
    expect(romanizeHangulRun("축구")).toBe("Chukgu");
    expect(romanizeHangulRun("학교")).toBe("Hakgyo");
  });
});

describe("Korean answer in an English frame (UAT 2026-07-24)", () => {
  it("still reports spans for an answer whose English is only scaffolding", () => {
    // "초콜릿 is better than 바닐라." reaches the evaluator intact rather than
    // being gated here; deciding it is a syntactic call, not a string one.
    expect(detectHangulSpans("초콜릿 is better than 바닐라.")).toEqual([
      { hangul: "초콜릿", romanized: "Chokolrit" },
      { hangul: "바닐라", romanized: "Banilra" },
    ]);
    expect(isEntirelyNonEnglish("초콜릿 is better than 바닐라.")).toBe(false);
  });
});

describe("findRomanizationArtifacts", () => {
  const valorant = detectHangulSpans("배달란트");

  it("catches a romanization the evaluator invented from a misheard span", () => {
    // The exact failure: the child said 발로란트 (Valorant), the transcriber
    // wrote 배달란트, and the evaluator emitted a word that does not exist.
    expect(
      findRomanizationArtifacts("I like to play Baedalranteu.", valorant),
    ).toEqual(["Baedalranteu"]);
  });

  it("catches the artifact however it is spaced or cased", () => {
    expect(findRomanizationArtifacts("I play baedal-ranteu.", valorant)).toEqual([
      "baedal-ranteu",
    ]);
    expect(findRomanizationArtifacts("I play Baedal Ranteu.", valorant)).toEqual([
      "Baedal Ranteu",
    ]);
  });

  it("leaves a genuinely resolved span alone", () => {
    // "플레이 게임즈" romanizes to "Peulleigeimjeu"; the evaluator reading it as
    // "play games" is the behaviour to keep, so nothing must be reported.
    const spans = detectHangulSpans("플레이 게임즈.");
    expect(findRomanizationArtifacts("I play games.", spans)).toEqual([]);
  });

  it("reports nothing when the turn had no Hangul at all", () => {
    expect(findRomanizationArtifacts("I like to play soccer.", [])).toEqual([]);
  });

  it("does not flag an ordinary English word that merely starts alike", () => {
    expect(findRomanizationArtifacts("I bake bread.", valorant)).toEqual([]);
  });
});
