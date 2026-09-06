"use client";

import { useMemo, useState } from "react";
import {
  assignPronunciationPracticeAction,
  lookupCustomWordAction,
  previewPronunciationWordAction,
  suggestPronunciationWordsAction,
} from "@/app/teacher/students/[id]/pronunciation-practice/new/actions";
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_SOUNDS,
  type PracticeDifficulty,
  type PracticeSoundId,
} from "@/domain/pronunciation/practice";
import type { PronunciationWordBankEntry } from "@/domain/pronunciation/word-bank.generated";
import type {
  PronunciationAssignmentWordInput,
  PronunciationSoundOption,
} from "@/server/pronunciation/teacher-service";

type PronunciationPracticeFormProps = {
  studentId: string;
  studentName: string;
  soundOptions: PronunciationSoundOption[];
  initialSoundId: PracticeSoundId;
  initialDifficulty: PracticeDifficulty;
  suggestions: PronunciationWordBankEntry[];
};

type SelectedWord = PronunciationAssignmentWordInput;

function customPronunciationKey(text: string, cmuVariant: number) {
  return `${text}:${cmuVariant}`;
}

function wordPreviewKey(word: Pick<SelectedWord, "source" | "text" | "cmuVariant">) {
  return `${word.source}:${customPronunciationKey(word.text, word.cmuVariant)}`;
}

const SOUND_LETTERS: Record<PracticeSoundId, string[]> = {
  light_l: ["l"],
  s: ["s", "c"],
  f: ["f", "p", "g"],
  v: ["v"],
  z: ["z", "s"],
};

function firstHighlight(word: string, soundId: PracticeSoundId) {
  const letters = SOUND_LETTERS[soundId];
  const lower = word.toLocaleLowerCase("en-US");
  for (const letter of letters) {
    const start = lower.indexOf(letter);
    if (start >= 0) return { highlightStart: start, highlightLength: letter.length };
  }
  return { highlightStart: 0, highlightLength: Math.min(1, word.length) };
}

function toSelectedWord(entry: PronunciationWordBankEntry): SelectedWord {
  return {
    text: entry.text,
    source: "verified",
    cmuVariant: entry.cmuVariant,
    highlightStart: entry.highlightStart,
    highlightLength: entry.highlightLength,
  };
}

function highlightWord(word: SelectedWord) {
  const before = word.text.slice(0, word.highlightStart);
  const target = word.text.slice(
    word.highlightStart,
    word.highlightStart + word.highlightLength,
  );
  const after = word.text.slice(word.highlightStart + word.highlightLength);
  return (
    <>
      {before}
      <mark style={{ background: "#FEF08A", color: "#111827", borderRadius: 2 }}>
        {target}
      </mark>
      {after}
    </>
  );
}

export function PronunciationPracticeForm({
  studentId,
  studentName,
  soundOptions,
  initialSoundId,
  initialDifficulty,
  suggestions: initialSuggestions,
}: PronunciationPracticeFormProps) {
  const [soundId, setSoundId] = useState<PracticeSoundId>(initialSoundId);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>(initialDifficulty);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [words, setWords] = useState<SelectedWord[]>(
    initialSuggestions.slice(0, 5).map(toSelectedWord),
  );
  const [dueAt, setDueAt] = useState("");
  const [customWord, setCustomWord] = useState("");
  const [customChoices, setCustomChoices] = useState<
    Array<{ word: string; cmuVariant: number; phones: string[]; targetPhoneIndex: number }>
  >([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState(0);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewedCustom, setPreviewedCustom] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSound = PRACTICE_SOUNDS[soundId];

  const customKeys = useMemo(
    () =>
      words
        .filter((word) => word.source === "custom")
        .map((word) => customPronunciationKey(word.text, word.cmuVariant)),
    [words],
  );
  const canAssign =
    words.length === 5 && customKeys.every((key) => previewedCustom.has(key));

  function markCustomPreviewed(key: string) {
    setPreviewedCustom((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  async function refreshSuggestions(nextSound: PracticeSoundId, nextDifficulty: PracticeDifficulty) {
    setError(null);
    const result = await suggestPronunciationWordsAction({
      studentId,
      soundId: nextSound,
      difficulty: nextDifficulty,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuggestions(result.words);
    setWords(result.words.slice(0, 5).map(toSelectedWord));
    setPreviewedCustom(new Set());
  }

  function changeSound(next: PracticeSoundId) {
    setSoundId(next);
    void refreshSuggestions(next, difficulty);
  }

  function changeDifficulty(next: PracticeDifficulty) {
    setDifficulty(next);
    void refreshSuggestions(soundId, next);
  }

  function replaceWord(index: number) {
    setReplaceIndex(index);
    setCustomOpen(true);
    const candidate = suggestions.find(
      (suggestion) => !words.some((word) => word.text === suggestion.text),
    );
    if (!candidate) return;
    setWords((current) => current.map((word, wordIndex) => (wordIndex === index ? toSelectedWord(candidate) : word)));
  }

  async function findCustomWord() {
    setError(null);
    const result = await lookupCustomWordAction({ studentId, word: customWord, soundId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCustomChoices(result.choices);
  }

  function chooseCustom(choice: (typeof customChoices)[number]) {
    const highlight = firstHighlight(choice.word, soundId);
    const nextWord: SelectedWord = {
      text: choice.word,
      source: "custom",
      cmuVariant: choice.cmuVariant,
      ...highlight,
    };
    setWords((current) =>
      current.map((word, index) => (index === replaceIndex ? nextWord : word)),
    );
    setCustomChoices([]);
  }

  async function previewCustomChoice(choice: (typeof customChoices)[number]) {
    const highlight = firstHighlight(choice.word, soundId);
    const result = await previewPronunciationWordAction({
      studentId,
      soundId,
      difficulty,
      word: {
        text: choice.word,
        source: "custom",
        cmuVariant: choice.cmuVariant,
        ...highlight,
      },
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const key = customPronunciationKey(choice.word, choice.cmuVariant);
    setPreviewUrls((current) => ({ ...current, [`custom-${key}`]: result.audioUrl }));
  }

  async function previewWord(word: SelectedWord) {
    setError(null);
    const result = await previewPronunciationWordAction({
      studentId,
      soundId,
      difficulty,
      word,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreviewUrls((current) => ({ ...current, [wordPreviewKey(word)]: result.audioUrl }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssign) return;
    setWorking(true);
    setError(null);
    const result = await assignPronunciationPracticeAction({
      studentId,
      soundId,
      difficulty,
      dueAt,
      words,
    });
    setWorking(false);
    if (!result.ok) setError(result.error);
    else window.location.href = `/teacher/students/${studentId}`;
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28 }}>Assign pronunciation practice</h1>
        <p style={{ margin: "6px 0 0", color: "#4B5563" }}>For {studentName}</p>
      </div>

      {error ? <p role="alert" style={{ color: "#B42318", margin: 0 }}>{error}</p> : null}

      <section style={panelStyle} aria-labelledby="sound-heading">
        <h2 id="sound-heading" style={headingStyle}>Target sound</h2>
        <div style={choiceGridStyle}>
          {soundOptions.map((option) => (
            <button
              key={option.soundId}
              type="button"
              disabled={!option.available}
              aria-pressed={option.soundId === soundId}
              onClick={() => option.available && changeSound(option.soundId as PracticeSoundId)}
              style={option.soundId === soundId ? selectedChoiceStyle : choiceStyle}
            >
              {option.label} /{option.ipa}/ {option.weak ? "· weak" : ""}
              {!option.available ? " · Not available" : ""}
            </button>
          ))}
        </div>
        <label style={labelStyle}>
          Difficulty
          <select value={difficulty} onChange={(event) => changeDifficulty(event.target.value as PracticeDifficulty)} style={inputStyle}>
            {PRACTICE_DIFFICULTIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </label>
        <audio controls preload="none" src={selectedSound.clip} aria-label={`Play ${selectedSound.label} sound`} />
      </section>

      <section style={panelStyle} aria-labelledby="words-heading">
        <h2 id="words-heading" style={headingStyle}>Five practice words</h2>
        <p style={helpStyle}>Choose five words. Word audio is generated from the server-verified pronunciation.</p>
        <div style={{ display: "grid", gap: 10 }}>
          {words.map((word, index) => (
            <article key={`${index}-${word.text}-${word.cmuVariant}`} data-word-order={index + 1} style={wordRowStyle}>
              <strong>{index + 1}.</strong>
              <span style={{ fontSize: 20, minWidth: 100 }}>{highlightWord(word)}</span>
              <span style={{ color: "#6B7280", fontSize: 13 }}>{word.source}</span>
              <button type="button" onClick={() => void previewWord(word)} style={smallButtonStyle}>Play word</button>
              <button type="button" onClick={() => replaceWord(index)} style={smallButtonStyle}>Replace</button>
              {word.source === "custom" ? (
                <>
                  <label style={numberLabelStyle}>
                    Highlight start
                    <input
                      type="number"
                      min={0}
                      max={word.text.length - 1}
                      value={word.highlightStart}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setWords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, highlightStart: value } : item));
                      }}
                      style={numberInputStyle}
                    />
                  </label>
                  <label style={numberLabelStyle}>
                    Highlight length
                    <input
                      type="number"
                      min={1}
                      max={word.text.length}
                      value={word.highlightLength}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setWords((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, highlightLength: value } : item));
                      }}
                      style={numberInputStyle}
                    />
                  </label>
                </>
              ) : null}
              {previewUrls[wordPreviewKey(word)] ? (
                <audio
                  controls
                  preload="none"
                  src={previewUrls[wordPreviewKey(word)]}
                  aria-label={`Play ${word.text}`}
                  onPlaying={
                    word.source === "custom"
                      ? () => markCustomPreviewed(customPronunciationKey(word.text, word.cmuVariant))
                      : undefined
                  }
                />
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {customOpen ? (
        <section style={panelStyle} aria-labelledby="custom-heading">
          <h2 id="custom-heading" style={headingStyle}>Custom word</h2>
          <p style={helpStyle}>Names, phrases, and hyphenated words are not supported.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={customWord} onChange={(event) => setCustomWord(event.target.value)} aria-label="Custom word" style={{ ...inputStyle, flex: "1 1 180px", marginTop: 0 }} />
            <button type="button" onClick={() => void findCustomWord()} style={smallButtonStyle}>Find pronunciation</button>
          </div>
          {customChoices.length > 0 ? (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {customChoices.map((choice) => {
                const key = customPronunciationKey(choice.word, choice.cmuVariant);
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{choice.word} pronunciation {choice.cmuVariant}</span>
                    <button type="button" onClick={() => void previewCustomChoice(choice)} style={smallButtonStyle}>Play pronunciation</button>
                    <button type="button" onClick={() => chooseCustom(choice)} style={smallButtonStyle}>Use this pronunciation</button>
                    {previewUrls[`custom-${key}`] ? (
                      <audio
                        controls
                        preload="none"
                        src={previewUrls[`custom-${key}`]}
                        aria-label={`Play ${choice.word} pronunciation ${choice.cmuVariant}`}
                        onPlaying={() => markCustomPreviewed(key)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <label style={labelStyle}>
        Due date (optional)
        <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} style={inputStyle} />
      </label>

      <button type="submit" disabled={working || !canAssign} style={canAssign ? submitStyle : disabledSubmitStyle}>
        {working ? "Assigning…" : "Assign practice"}
      </button>
    </form>
  );
}

const panelStyle: React.CSSProperties = { display: "grid", gap: 14, padding: 18, background: "#FFFFFF", border: "1px solid #D1D5DB", borderRadius: 8 };
const headingStyle: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 600 };
const helpStyle: React.CSSProperties = { margin: 0, color: "#4B5563", fontSize: 14, lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14, fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 16 };
const choiceGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 };
const choiceStyle: React.CSSProperties = { padding: "10px 12px", background: "#FFFFFF", border: "1px solid #D1D5DB", borderRadius: 6, cursor: "pointer", textAlign: "left" };
const selectedChoiceStyle: React.CSSProperties = { ...choiceStyle, border: "2px solid #2563EB", background: "#EFF6FF" };
const wordRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 10, border: "1px solid #E5E7EB", borderRadius: 6 };
const smallButtonStyle: React.CSSProperties = { padding: "8px 10px", background: "#FFFFFF", border: "1px solid #9CA3AF", borderRadius: 6, cursor: "pointer", minHeight: 38 };
const numberLabelStyle: React.CSSProperties = { display: "grid", gap: 3, fontSize: 11, fontWeight: 600, color: "#4B5563" };
const numberInputStyle: React.CSSProperties = { width: 72, padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 5, fontSize: 14 };
const submitStyle: React.CSSProperties = { padding: "12px 16px", background: "#2563EB", color: "#FFFFFF", border: 0, borderRadius: 6, fontSize: 16, fontWeight: 600, cursor: "pointer", minHeight: 44 };
const disabledSubmitStyle: React.CSSProperties = { ...submitStyle, background: "#9CA3AF", cursor: "not-allowed" };
