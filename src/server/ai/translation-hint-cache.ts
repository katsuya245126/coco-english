import { createHash } from "node:crypto";
import {
  parseTranslationHint,
  type TranslationHint,
} from "@/domain/ai/translation-hint";
import type { MissionLevel } from "@/domain/mission/schemas";
import type { Json } from "@/lib/db/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  generateTranslationHint,
  type GenerateTranslationHintResult,
} from "@/server/ai/translation-hint-generator";

export const DEFAULT_TRANSLATION_LOCALE = "ko" as const;
export const TRANSLATION_HINT_POLICY_VERSION =
  "translation-hint-v4-chunked-full-coverage" as const;

export function computeTranslationSourceDigest(sourceText: string): string {
  return createHash("sha256")
    .update(`${TRANSLATION_HINT_POLICY_VERSION}\u0000${sourceText}`, "utf8")
    .digest("hex");
}

export type GetOrCreateTranslationHintResult =
  | {
      ok: true;
      cacheStatus: "hit" | "miss";
      hint: TranslationHint;
    }
  | { ok: false; error: "cache_failed" | "generation_failed" };

export type GetOrCreateTranslationHintInput = {
  sourceText: string;
  studentLevel: MissionLevel;
  targetLocale: string;
};

export type GetOrCreateTranslationHintDeps = {
  generate?: (
    input: GetOrCreateTranslationHintInput,
  ) => Promise<GenerateTranslationHintResult>;
};

export async function getOrCreateTranslationHint(
  input: GetOrCreateTranslationHintInput,
  deps?: GetOrCreateTranslationHintDeps,
): Promise<GetOrCreateTranslationHintResult> {
  const supabase = createSupabaseServiceClient();
  const sourceDigest = computeTranslationSourceDigest(input.sourceText);

  const { data: cached, error: selectError } = await supabase
    .from("translation_hint_cache")
    .select("id, phrases")
    .eq("source_digest", sourceDigest)
    .eq("student_level", input.studentLevel)
    .eq("target_locale", input.targetLocale)
    .maybeSingle();

  if (selectError) return { ok: false, error: "cache_failed" };

  if (cached) {
    const parsed = parseTranslationHint(input.sourceText, {
      phrases: cached.phrases,
    });
    // A dropped phrase means the row predates the current contract or is
    // corrupt — regenerate instead of serving a thinned-out hint.
    if (
      parsed.ok &&
      Array.isArray(cached.phrases) &&
      parsed.hint.phrases.length === cached.phrases.length
    ) {
      await supabase
        .from("translation_hint_cache")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("id", cached.id);
      return { ok: true, cacheStatus: "hit", hint: parsed.hint };
    }
  }

  const generate = deps?.generate ?? generateTranslationHint;
  const generated = await generate(input);
  if (!generated.ok) return { ok: false, error: "generation_failed" };

  const { error: upsertError } = await supabase
    .from("translation_hint_cache")
    .upsert(
      {
        source_digest: sourceDigest,
        student_level: input.studentLevel,
        target_locale: input.targetLocale,
        phrases: generated.hint.phrases satisfies Json,
        last_accessed_at: new Date().toISOString(),
      },
      { onConflict: "source_digest,student_level,target_locale" },
    );

  if (upsertError) return { ok: false, error: "cache_failed" };

  return { ok: true, cacheStatus: "miss", hint: generated.hint };
}
