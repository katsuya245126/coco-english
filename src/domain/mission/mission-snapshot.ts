import { z } from "zod";
import {
  missionSnapshotSchema,
  type MissionSnapshot,
} from "@/domain/mission/schemas";

const legacyMissionSnapshotSchema = z
  .object({
    missionId: z.string().uuid(),
    title: z.string().trim().min(1),
    characterId: z.string().trim().min(1),
    requiredTurns: z.number().int().min(1),
    turns: z
      .array(
        z
          .object({
            order: z.number().int().min(1),
            prompt: z.string().trim().min(1),
            targetExample: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine((snapshot) => snapshot.requiredTurns === snapshot.turns.length);

export type LegacyMissionSnapshot = {
  missionId: string;
  title: string;
  characterId: string;
  requiredTurns: number;
  turns: Array<{
    turnOrder: number;
    prompt: string;
    targetExample: string;
  }>;
};

export type MissionSnapshotInterpretation =
  | { kind: "complete"; snapshot: MissionSnapshot }
  | { kind: "legacy"; snapshot: LegacyMissionSnapshot }
  | { kind: "invalid" };

export function interpretMissionSnapshot(
  value: unknown,
): MissionSnapshotInterpretation {
  const complete = missionSnapshotSchema.safeParse(value);
  if (complete.success) {
    return { kind: "complete", snapshot: complete.data };
  }

  const legacy = legacyMissionSnapshotSchema.safeParse(value);
  if (!legacy.success) return { kind: "invalid" };

  return {
    kind: "legacy",
    snapshot: {
      ...legacy.data,
      turns: legacy.data.turns.map(({ order, ...turn }) => ({
        ...turn,
        turnOrder: order,
      })),
    },
  };
}

export function resolveMissionSnapshotTargetPattern(
  snapshot: MissionSnapshot,
  turnOrder: number,
): string | null {
  if (snapshot.conversationMode) return snapshot.targetPattern;
  return (
    snapshot.turns.find((turn) => turn.turnOrder === turnOrder)
      ?.targetPattern ?? null
  );
}
