import { z } from "zod";

/**
 * Pure AI scene-premise-generation contracts (Coco Chat, Phase 11, SCENE-01).
 *
 * Standalone, net-new module, independent of any prior AI-drafting feature.
 * Mirrors the schema/parse-helper convention established by
 * conversation-generation.ts: keep provider parsing and app decisions here;
 * the server adapter (src/server/ai/scene-premise-generator.ts) lives outside
 * this module.
 */

export const scenePremiseInputSchema = z.object({
  targetPattern: z.string().trim().min(1),
  level: z.string().trim().min(1),
});

export type ScenePremiseInput = z.infer<typeof scenePremiseInputSchema>;

export const generatedScenePremiseSchema = z.object({
  scenePremise: z.string().trim().min(1).max(280),
});

export type GeneratedScenePremise = z.infer<typeof generatedScenePremiseSchema>;

export type ParseGeneratedScenePremiseResult =
  | { ok: true; scenePremise: GeneratedScenePremise }
  | { ok: false; error: "schema_failed" };

/**
 * Validate a provider's structured-output payload against
 * generatedScenePremiseSchema, mirroring parseGeneratedCocoReply's convention
 * (schema_failed on any validation miss, including a missing/empty premise —
 * the premise is part of the contract per D-07/D-08).
 */
export function parseGeneratedScenePremise(
  value: unknown,
): ParseGeneratedScenePremiseResult {
  const parsed = generatedScenePremiseSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "schema_failed" };
  }
  return { ok: true, scenePremise: parsed.data };
}
