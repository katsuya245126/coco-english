"use server";

import { revalidatePath } from "next/cache";
import { requireTeacherProfile } from "@/server/auth/teacher-profile";
import {
  PRACTICE_DIFFICULTIES,
  PRACTICE_SOUND_IDS,
  type PracticeDifficulty,
  type PracticeSoundId,
} from "@/domain/pronunciation/practice";
import {
  assignPronunciationPractice,
  lookupCustomWord,
  previewPronunciationWord,
  suggestPronunciationWords,
  type AssignPronunciationPracticeInput,
  type PronunciationAssignmentWordInput,
} from "@/server/pronunciation/teacher-service";
import type { CustomPronunciation } from "@/server/pronunciation/cmudict";
import type { PronunciationWordBankEntry } from "@/domain/pronunciation/word-bank.generated";
import { z } from "zod";

const genericFailure = "We could not save pronunciation practice. Please try again.";
const lookupFailure = "We could not find a safe pronunciation for that word.";
const previewFailure = "We could not prepare that word's audio. Please try again.";
const providerRateLimitFailure =
  "You’ve made several AI requests. Wait a few minutes and try again.";

const studentIdSchema = z.string().trim().min(1, "Invalid student reference.");
const soundIdSchema = z.enum(PRACTICE_SOUND_IDS);
const difficultySchema = z.enum(PRACTICE_DIFFICULTIES);
const wordSchema = z.object({
  text: z.string().trim().min(1).max(64),
  source: z.enum(["verified", "custom"]),
  cmuVariant: z.coerce.number().int().nonnegative(),
  highlightStart: z.coerce.number().int().nonnegative(),
  highlightLength: z.coerce.number().int().min(1),
});

const lookupSchema = z.object({
  studentId: studentIdSchema,
  word: z.string().trim().min(1).max(64),
  soundId: soundIdSchema,
});

const practiceWordInputSchema = z.object({
  studentId: studentIdSchema,
  soundId: soundIdSchema,
  difficulty: difficultySchema,
  word: wordSchema,
});

const assignSchema = z.object({
  studentId: studentIdSchema,
  soundId: soundIdSchema,
  difficulty: difficultySchema,
  dueAt: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), z.literal(""), z.null()])
    .transform((value) => (value ? `${value}T23:59:59.999Z` : null)),
  words: z.array(wordSchema).length(5),
});

export type PronunciationLookupActionResult =
  | { ok: true; choices: CustomPronunciation[] }
  | { ok: false; error: string };

export type PronunciationSuggestionActionResult =
  | { ok: true; words: PronunciationWordBankEntry[] }
  | { ok: false; error: string };

export type PronunciationPreviewActionResult =
  | { ok: true; audioUrl: string; word: unknown }
  | { ok: false; error: string };

export type PronunciationAssignActionResult =
  | { ok: true; assignmentId: string; assignmentStudentId: string }
  | { ok: false; error: string };

export async function suggestPronunciationWordsAction(
  input: unknown,
): Promise<PronunciationSuggestionActionResult> {
  const teacher = await requireTeacherProfile();
  const parsed = z
    .object({
      studentId: studentIdSchema,
      soundId: soundIdSchema,
      difficulty: difficultySchema,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: genericFailure };

  try {
    const result = await suggestPronunciationWords({
      teacherId: teacher.id,
      ...parsed.data,
    });
    return result.ok ? result : { ok: false, error: genericFailure };
  } catch {
    return { ok: false, error: genericFailure };
  }
}

export async function lookupCustomWordAction(
  input: unknown,
): Promise<PronunciationLookupActionResult> {
  const teacher = await requireTeacherProfile();
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: lookupFailure };

  try {
    const result = await lookupCustomWord({ teacherId: teacher.id, ...parsed.data });
    return result.ok ? result : { ok: false, error: lookupFailure };
  } catch {
    return { ok: false, error: lookupFailure };
  }
}

export async function previewPronunciationWordAction(
  input: unknown,
): Promise<PronunciationPreviewActionResult> {
  const teacher = await requireTeacherProfile();
  const parsed = practiceWordInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: previewFailure };

  try {
    const result = await previewPronunciationWord({
      teacherId: teacher.id,
      ...parsed.data,
    });
    if (result.ok) return result;
    if (result.error === "rate_limited") {
      return { ok: false, error: providerRateLimitFailure };
    }
    return { ok: false, error: previewFailure };
  } catch {
    return { ok: false, error: previewFailure };
  }
}

export async function assignPronunciationPracticeAction(
  input: unknown,
): Promise<PronunciationAssignActionResult> {
  const teacher = await requireTeacherProfile();
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: genericFailure };

  try {
    const result = await assignPronunciationPractice({
      teacherId: teacher.id,
      ...parsed.data,
    } satisfies AssignPronunciationPracticeInput);
    if (!result.ok) {
      if (result.error === "rate_limited") {
        return { ok: false, error: providerRateLimitFailure };
      }
      return { ok: false, error: genericFailure };
    }
    revalidatePath(`/teacher/students/${parsed.data.studentId}`);
    revalidatePath("/student/home");
    return result;
  } catch {
    return { ok: false, error: genericFailure };
  }
}

export type { PracticeDifficulty, PracticeSoundId, PronunciationAssignmentWordInput };
