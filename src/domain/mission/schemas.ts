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

export const missionPictureDescriptionSchema = z
  .string()
  .trim()
  .min(1, "Picture description is required.")
  .max(300, "Picture description is too long.");

export const missionPictureSchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  description: missionPictureDescriptionSchema,
});

export type MissionPicture = z.infer<typeof missionPictureSchema>;

export const missionTurnInputSchema = z.object({
  prompt: z.string().trim().min(1, "Buddy question is required."),
  targetPattern: z.string().trim().min(1).max(160).optional(),
  targetExample: z
    .string()
    .trim()
    .min(1, "Example answer is required."),
  hintLadder: hintLadderSchema,
  answerShape: answerShapeSchema.default("open"),
  picture: z.preprocess(
    (value) => (value === null ? undefined : value),
    missionPictureSchema.optional(),
  ),
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
      .min(1, "Conversation context pattern is required.")
      .max(160, "Conversation context pattern is too long.")
      .optional(),
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
  .superRefine((value, context) => {
    if (value.conversationMode) {
      if (!value.targetPattern) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetPattern"],
          message: "Conversation context pattern is required.",
        });
      }
      value.turns.forEach((turn, index) => {
        if (turn.picture) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["turns", index, "picture"],
            message: "Conversation missions do not support pictures.",
          });
        }
      });
      return;
    }

    if (value.targetPattern !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetPattern"],
        message: "Preset missions do not use a mission-level target pattern.",
      });
    }

    value.turns.forEach((turn, index) => {
      if (!turn.targetPattern) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["turns", index, "targetPattern"],
          message: "Turn target pattern is required.",
        });
      }
    });
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

type MissionSnapshotBase = {
  missionId: string;
  title: string;
  level: MissionLevel;
  requiredTurns: number;
  characterId: string;
  requireCompleteSentenceAnswers: boolean;
};

export type PresetMissionSnapshot = MissionSnapshotBase & {
  conversationMode: false;
  targetPattern?: string;
  turns: Array<MissionSnapshotTurn & { targetPattern: string }>;
};

export type ConversationMissionSnapshot = MissionSnapshotBase & {
  conversationMode: true;
  targetPattern: string;
  turns: MissionSnapshotTurn[];
};

export type MissionSnapshot =
  | PresetMissionSnapshot
  | ConversationMissionSnapshot;

export const missionSnapshotSchema = z
  .object({
    missionId: z.string().uuid("Invalid mission reference."),
    title: z.string().trim().min(1),
    targetPattern: z.string().trim().min(1).max(160).optional(),
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
  )
  .superRefine((value, context) => {
    if (!value.conversationMode) return;
    value.turns.forEach((turn, index) => {
      if (turn.picture) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["turns", index, "picture"],
          message: "Conversation missions do not support pictures.",
        });
      }
    });
  })
  .transform((snapshot, context): MissionSnapshot => {
    // Sole owner of the target-pattern requirement: report every missing
    // pattern as an issue and abort instead of fabricating one.
    if (snapshot.conversationMode) {
      const targetPattern = snapshot.targetPattern;
      if (!targetPattern) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetPattern"],
          message: "Conversation context pattern is required.",
        });
        return z.NEVER;
      }
      return { ...snapshot, conversationMode: true, targetPattern };
    }
    const turns: Array<MissionSnapshotTurn & { targetPattern: string }> = [];
    let missingPattern = false;
    for (const [index, turn] of snapshot.turns.entries()) {
      const targetPattern = turn.targetPattern ?? snapshot.targetPattern;
      if (!targetPattern) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["turns", index, "targetPattern"],
          message: "Turn target pattern is required.",
        });
        missingPattern = true;
        continue;
      }
      turns.push({ ...turn, targetPattern });
    }
    if (missingPattern) return z.NEVER;
    return { ...snapshot, conversationMode: false, turns };
  });

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
