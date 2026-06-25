import { z } from "zod";

export const foundationSmokeResponseSchema = z.object({
  className: z.string(),
  assignmentTitle: z.string(),
  assignmentStudentStatus: z.string(),
  dataMode: z.literal("demo"),
});

export type FoundationSmokeResponse = z.infer<
  typeof foundationSmokeResponseSchema
>;
