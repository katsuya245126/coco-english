import { z } from "zod";

// Supabase nested joins come back as an object or a one-element array
// depending on the relationship; accept both and take the first.
export const oneOrMany = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([schema, z.array(schema)]).transform(
    (value): z.infer<T> | undefined =>
      Array.isArray(value) ? value[0] : value,
  );
