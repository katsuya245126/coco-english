import { z } from "zod";

export const DEFAULT_CHARACTER_ID = "default-buddy";

export const missionLevelSchema = z.enum([
  "beginner",
  "elementary",
  "intermediate",
]);

export type MissionLevel = z.infer<typeof missionLevelSchema>;

export const answerShapeSchema = z.enum(["fixed", "open"]);
export type AnswerShape = z.infer<typeof answerShapeSchema>;

export const hintLadderSchema = z.object({
  tier1: z
    .string()
    .trim()
    .min(1, "Hint 1: Target pattern is required."),
  tier2: z.string().trim().min(1, "Hint 2: Word bank is required."),
  tier3: z.string().trim().min(1, "Hint 3: Full example is required."),
});

export type HintLadder = z.infer<typeof hintLadderSchema>;

export const missionTurnInputSchema = z.object({
  prompt: z.string().trim().min(1, "Buddy question is required."),
  targetPattern: z.string().trim().min(1).max(160).optional(),
  targetExample: z
    .string()
    .trim()
    .min(1, "Example answer is required."),
  hintLadder: hintLadderSchema,
  answerShape: answerShapeSchema.default("open"),
});

export type MissionTurnInput = z.infer<typeof missionTurnInputSchema>;

export const missionFormSchema = z
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
    level: missionLevelSchema,
    requiredTurns: z.coerce
      .number()
      .int("Required turns must be a whole number.")
      .min(1, "Add at least one turn.")
      .max(12, "Use 12 or fewer turns."),
    characterId: z
      .string()
      .trim()
      .min(1)
      .default(DEFAULT_CHARACTER_ID),
    conversationMode: z.boolean().default(false),
    requireCompleteSentenceAnswers: z.boolean().default(true),
    turns: z.array(missionTurnInputSchema).default([]),
  })
  .refine(
    (value) =>
      value.conversationMode || value.requiredTurns === value.turns.length,
    {
      path: ["requiredTurns"],
      message: "Required turns must match the number of authored turns.",
    },
  )
  .refine((value) => value.conversationMode || value.turns.length >= 1, {
    path: ["turns"],
    message: "Add at least one turn.",
  })
  .refine(
    (value) => !value.conversationMode || Boolean(value.turns[0]?.prompt.trim()),
    {
      path: ["turns"],
      message: "Coco opening line is required.",
    },
  )
  .refine(
    (value) =>
      !value.conversationMode ||
      (value.requiredTurns >= 3 && value.requiredTurns <= 8),
    {
      path: ["requiredTurns"],
      message: "Choose between 3 and 8 turns.",
    },
  );

export type MissionFormInput = z.infer<typeof missionFormSchema>;

export const missionSnapshotTurnSchema = missionTurnInputSchema.extend({
  turnOrder: z.number().int().min(1),
});

export type MissionSnapshotTurn = z.infer<typeof missionSnapshotTurnSchema>;

export const missionSnapshotSchema = z
  .object({
    missionId: z.string().uuid("Invalid mission reference."),
    title: z.string().trim().min(1),
    targetPattern: z.string().trim().min(1),
    level: missionLevelSchema,
    requiredTurns: z.number().int().min(1),
    characterId: z.string().trim().min(1).default(DEFAULT_CHARACTER_ID),
    conversationMode: z.boolean().default(false),
    requireCompleteSentenceAnswers: z.boolean().default(true),
    turns: z.array(missionSnapshotTurnSchema).default([]),
  })
  .refine(
    (value) =>
      value.conversationMode || value.requiredTurns === value.turns.length,
    {
      path: ["requiredTurns"],
      message: "Snapshot required turns must match turn count.",
    },
  )
  .refine((value) => value.conversationMode || value.turns.length >= 1, {
    path: ["turns"],
    message: "Snapshot must include at least one turn.",
  })
  .refine(
    (value) => !value.conversationMode || Boolean(value.turns[0]?.prompt.trim()),
    {
      path: ["turns"],
      message: "Snapshot Coco opening line is required.",
    },
  );

export type MissionSnapshot = z.infer<typeof missionSnapshotSchema>;

export const missionIdSchema = z.object({
  missionId: z.string().uuid("Invalid mission reference."),
});

export type MissionIdInput = z.infer<typeof missionIdSchema>;

export const assignMissionSchema = z.object({
  missionId: z.string().uuid("Invalid mission reference."),
  classId: z.string().uuid("Invalid class reference."),
  dueAt: z
    .union([
      z.string().trim().datetime({ offset: true }),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((value) => (value ? value : null)),
});

export type AssignMissionInput = z.infer<typeof assignMissionSchema>;
