import { z } from "zod";
import {
  missionLevelSchema,
  missionTurnInputSchema,
} from "@/domain/mission/schemas";

export const missionDraftInputSchema = z.object({
  targetPattern: z
    .string()
    .trim()
    .min(1, "Target pattern is required before generating.")
    .max(160, "Target pattern is too long."),
  topic: z
    .string()
    .trim()
    .min(1, "Topic is required before generating.")
    .max(120, "Topic is too long."),
  level: missionLevelSchema,
  requiredTurns: z.coerce
    .number()
    .int("Required turns must be a whole number.")
    .min(1, "Add at least one turn.")
    .max(12, "Use 12 or fewer turns."),
  dueAt: z
    .union([
      z.string().trim().datetime({ offset: true }),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((value) => (value ? value : null)),
});

export type GenerateMissionDraftInput = z.input<typeof missionDraftInputSchema>;
export type ParsedGenerateMissionDraftInput = z.infer<
  typeof missionDraftInputSchema
>;

export const generatedMissionDraftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Mission title is required.")
      .max(120, "Mission title is too long."),
    targetPattern: z
      .string()
      .trim()
      .min(1, "Target pattern is required.")
      .max(160, "Target pattern is too long."),
    topic: z
      .string()
      .trim()
      .min(1, "Topic is required.")
      .max(120, "Topic is too long."),
    level: missionLevelSchema,
    requiredTurns: z.coerce
      .number()
      .int("Required turns must be a whole number.")
      .min(1, "Add at least one turn.")
      .max(12, "Use 12 or fewer turns."),
    turns: z.array(missionTurnInputSchema).min(1, "Add at least one turn."),
    targetExamples: z
      .array(z.string().trim().min(1, "Target example is required."))
      .min(1, "Add at least one target example."),
  })
  .refine((value) => value.requiredTurns === value.turns.length, {
    path: ["requiredTurns"],
    message: "Required turns must match the number of generated turns.",
  })
  .refine((value) => value.targetExamples.length >= value.turns.length, {
    path: ["targetExamples"],
    message: "Generated draft must include target examples for the turns.",
  });

export type GeneratedMissionDraft = z.infer<typeof generatedMissionDraftSchema>;

export type ParseGeneratedMissionDraftResult =
  | { ok: true; draft: GeneratedMissionDraft }
  | { ok: false; error: "schema_failed" };

export function parseGeneratedMissionDraft(
  value: unknown,
): ParseGeneratedMissionDraftResult {
  const parsed = generatedMissionDraftSchema.safeParse(value);

  if (!parsed.success) {
    return { ok: false, error: "schema_failed" };
  }

  return { ok: true, draft: parsed.data };
}
