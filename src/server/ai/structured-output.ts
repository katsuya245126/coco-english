import OpenAI from "openai";

/**
 * Structured-output provider call seam (issue #69).
 *
 * The single implementation of the plumbing every AI adapter used to
 * copy: API-key resolution, OpenAI client construction, the
 * {responses:{parse}} wire shape, and provider-error normalization.
 * Adapters bring what makes them distinct — prompts, zod text format,
 * domain parsing, log events — and own their public result types.
 *
 * Failure contract:
 * - missing_api_key: no usable key AND no injected client. Adapters that
 *   require a key even with an injected client check that themselves
 *   before calling; this is the backstop for everyone else.
 * - provider_failed: the transport threw. The raw cause is surfaced so
 *   adapters keep their existing (content-free) failure logs.
 * Schema failures are NOT this seam's concern: a successful parse returns
 * outputParsed and the adapter's domain parser decides.
 */

export type StructuredOutputClient = {
  responses: {
    parse(input: {
      model: string;
      input: Array<{
        role: "system" | "user";
        content: string;
      }>;
      text: {
        format: unknown;
      };
    }): Promise<{ output_parsed?: unknown }>;
  };
};

export type StructuredOutputDeps = {
  apiKey?: string;
  model?: string;
  client?: StructuredOutputClient;
};

export type StructuredOutputResult =
  | {
      ok: true;
      outputParsed: unknown; /** Raw provider response, for
      adapter-owned content-free diagnostics. */
      response: unknown;
    }
  | {
      ok: false;
      error: "missing_api_key" | "provider_failed";
      /** Raw thrown error, for adapter-owned content-free logging only. */
      cause?: unknown;
    };

/** True when deps/env yield a usable key. Adapters whose contract requires
 * a key even with an injected client use this for their precondition. */
export function hasApiKey(deps?: StructuredOutputDeps): boolean {
  return !!resolveApiKey(deps);
}

function resolveApiKey(deps?: StructuredOutputDeps): string {
  if (deps && "apiKey" in deps) return deps.apiKey?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

export async function structuredOutputCall(args: {
  deps?: StructuredOutputDeps;
  model: string;
  systemMessage: string;
  userContent: string;
  format: unknown;
}): Promise<StructuredOutputResult> {
  const apiKey = resolveApiKey(args.deps);
  if (!args.deps?.client && !apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  const client =
    args.deps?.client ?? (new OpenAI({ apiKey }) as StructuredOutputClient);
  try {
    const response = await client.responses.parse({
      model: args.model,
      input: [
        { role: "system", content: args.systemMessage },
        { role: "user", content: args.userContent },
      ],
      text: { format: args.format },
    });
    return { ok: true, outputParsed: response.output_parsed, response };
  } catch (cause) {
    return { ok: false, error: "provider_failed", cause };
  }
}
