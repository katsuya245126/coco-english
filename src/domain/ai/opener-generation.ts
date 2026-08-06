import { z } from "zod";

export const openerGenerationInputSchema = z.object({
  targetPattern: z.string().trim().min(1).max(160),
});

export type OpenerGenerationInput = z.infer<typeof openerGenerationInputSchema>;

export const generatedCocoOpenerSchema = z.object({
  opener: z.string().trim().min(1).max(280),
});

export type GeneratedCocoOpener = z.infer<typeof generatedCocoOpenerSchema>;

export type ParseGeneratedCocoOpenerResult =
  | { ok: true; opener: GeneratedCocoOpener }
  | { ok: false; error: "schema_failed" };

export function parseGeneratedCocoOpener(
  value: unknown,
): ParseGeneratedCocoOpenerResult {
  const parsed = generatedCocoOpenerSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "schema_failed" };
  }

  return { ok: true, opener: parsed.data };
}
