import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PRACTICE_SOUNDS,
  type PracticeSoundId,
} from "@/domain/pronunciation/practice";

const CMUDICT_PATH = path.join(
  process.cwd(),
  "vendor",
  "cmudict",
  "cmudict-0.7b.dict",
);

type CmuEntry = {
  word: string;
  cmuVariant: number;
  phones: string[];
};

export type CustomPronunciation = {
  word: string;
  cmuVariant: number;
  phones: string[];
  targetPhoneIndex: number;
};

let dictionaryPromise: Promise<CmuEntry[]> | null = null;

function basePhone(phone: string) {
  return phone.replace(/[012]$/, "");
}

function isVowel(phone: string) {
  return /^[A-Z]+[012]$/.test(phone);
}

function parseDictionary(source: string): CmuEntry[] {
  const entries: CmuEntry[] = [];
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(";;;")) continue;
    const match = /^(\S+?)(?:\((\d+)\))?\s+(.+)$/u.exec(trimmed);
    if (!match) continue;
    entries.push({
      word: match[1].toLocaleLowerCase("en-US"),
      cmuVariant: Number(match[2] ?? 1),
      phones: match[3].split(/\s+/u),
    });
  }
  return entries;
}

async function readDictionary(): Promise<CmuEntry[]> {
  if (!dictionaryPromise) {
    dictionaryPromise = readFile(CMUDICT_PATH, "utf8")
      .then(parseDictionary)
      .catch(() => []);
  }
  return dictionaryPromise;
}

function targetPhoneIndex(
  phones: string[],
  soundId: PracticeSoundId,
): number | null {
  const target = PRACTICE_SOUNDS[soundId].arpabet;
  const indexes = phones.flatMap((phone, index) =>
    basePhone(phone) === target ? [index] : [],
  );
  if (indexes.length !== 1) return null;
  const index = indexes[0];
  if (soundId === "light_l" && (!phones[index + 1] || !isVowel(phones[index + 1]))) {
    return null;
  }
  return index;
}

export async function findCustomPronunciations(input: {
  word: string;
  soundId: PracticeSoundId;
}): Promise<CustomPronunciation[]> {
  const word = input.word.trim().toLocaleLowerCase("en-US");
  if (!word || /[\s-]/u.test(word) || !/^[a-z']+$/u.test(word)) return [];

  const entries = await readDictionary();
  return entries
    .filter((entry) => entry.word === word)
    .map((entry) => ({
      entry,
      targetPhoneIndex: targetPhoneIndex(entry.phones, input.soundId),
    }))
    .filter(
      (entry): entry is { entry: CmuEntry; targetPhoneIndex: number } =>
        entry.targetPhoneIndex !== null,
    )
    .map(({ entry, targetPhoneIndex: index }) => ({
      word,
      cmuVariant: entry.cmuVariant,
      phones: entry.phones,
      targetPhoneIndex: index,
    }));
}

export function parseCmudict(source: string): CmuEntry[] {
  return parseDictionary(source);
}

export function findTargetPhoneIndex(
  phones: string[],
  soundId: PracticeSoundId,
): number | null {
  return targetPhoneIndex(phones, soundId);
}
