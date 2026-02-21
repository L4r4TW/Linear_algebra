import { z } from "zod";

const jsonbStringField = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => {
    try {
      JSON.parse(value || "null");
      return true;
    } catch {
      return false;
    }
  }, "Must be valid JSON")
  .transform((value) => JSON.parse(value || "null") as unknown);

export const jsonbField = z.union([
  jsonbStringField,
  z.unknown(),
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
  choicesJson: jsonbField,
  hintsJson: jsonbField,
  tagsJson: jsonbField,
});

export type ExerciseEditorInput = z.input<typeof exerciseEditorSchema>;
export type ExerciseEditorData = z.output<typeof exerciseEditorSchema>;
