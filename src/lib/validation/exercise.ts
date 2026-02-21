import { z } from "zod";

const jsonbArrayStringField = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  }, "Must be a JSON array")
  .transform((value) => JSON.parse(value || "[]") as unknown[]);

export const jsonbArrayField = z.union([
  jsonbArrayStringField,
  z.array(z.unknown()),
]);

export const exerciseEditorSchema = z.object({
  id: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().uuid().optional()
  ),
  subthemeId: z.string().uuid("Select a subtheme"),
  type: z.string().min(2).max(60),
  difficulty: z.coerce.number().int().min(1).max(5),
  status: z.enum(["draft", "published"]),
  promptMd: z.string().min(3, "Prompt is required"),
  solutionMd: z.string().min(3, "Solution is required"),
  choicesJson: jsonbArrayField,
  hintsJson: jsonbArrayField,
  tagsJson: jsonbArrayField,
});

export type ExerciseEditorInput = z.input<typeof exerciseEditorSchema>;
export type ExerciseEditorData = z.output<typeof exerciseEditorSchema>;
