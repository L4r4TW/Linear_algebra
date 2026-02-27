"use server";

import { ZodError } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  exerciseEditorSchema,
  type ExerciseEditorInput,
} from "@/lib/validation/exercise";

type ActionResult = {
  ok: boolean;
  message: string;
  id?: string;
};

type VectorPromptConfig = {
  kind: "vector_xy_from_graph";
  grid?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    step?: number;
  };
  origin?: [number, number];
  vectorEnd?: [number, number];
};

type PointPromptConfig = {
  kind: "point_plot_from_coordinates";
  grid?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    step?: number;
  };
  target?: [number, number];
  vectors?: Array<{
    id?: string;
    color?: string;
    target?: [number, number];
  }>;
};

type MultipleChoicePromptConfig = {
  kind: "single_choice" | "multiple_choice";
  options?: Array<{ id: string; text: string }>;
  correctOption?: string;
};

type MultiSelectPromptConfig = {
  kind: "multi_select";
  options?: Array<{ id: string; text: string }>;
  correctOptions?: string[];
};

type EqualVectorsPromptConfig = {
  kind: "equal_vectors_pick";
  grid?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    step?: number;
  };
  vectors?: Array<{
    id: string;
    color: string;
    start: [number, number];
    end: [number, number];
  }>;
  correctIds?: string[];
};

type MultiPartPromptConfig = {
  kind: "multi_part";
  parts?: Array<{
    id?: string;
    type?: "short_answer" | "single_choice" | "multi_select" | "open_text" | "vector_xy_from_graph" | "point_plot_from_coordinates";
    prompt?: string;
    options?: Array<{ id: string; text: string }>;
    correctOption?: string;
    correctOptions?: string[];
    correctText?: string;
    x?: number;
    y?: number;
  }>;
};

function getValidationMessage(error: ZodError) {
  const flattened = error.flatten().fieldErrors;
  const firstMessage = Object.values(flattened).flat().find(Boolean);
  return firstMessage || "Please complete required fields before saving.";
}

async function assertAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be logged in");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    throw new Error("Admin access required");
  }

  return { supabase, userId: user.id };
}

function toExercisePayload(parsed: ReturnType<typeof exerciseEditorSchema.parse>) {
  if (parsed.type === "vector_xy_from_graph") {
    const rawConfig =
      parsed.choicesJson && typeof parsed.choicesJson === "object"
        ? (parsed.choicesJson as VectorPromptConfig)
        : null;
    const vectorEnd = rawConfig?.vectorEnd ?? [0, 0];
    const x = Number(vectorEnd[0]) || 0;
    const y = Number(vectorEnd[1]) || 0;
    const prompt = {
      kind: "vector_xy_from_graph",
      question: parsed.promptMd,
      grid: {
        xMin: Number(rawConfig?.grid?.xMin ?? -10),
        xMax: Number(rawConfig?.grid?.xMax ?? 10),
        yMin: Number(rawConfig?.grid?.yMin ?? -10),
        yMax: Number(rawConfig?.grid?.yMax ?? 10),
        step: Number(rawConfig?.grid?.step ?? 1),
      },
      origin: rawConfig?.origin ?? [0, 0],
      vectorEnd: [x, y],
      showLabels: true,
    };

    return {
      subtheme_id: parsed.subthemeId,
      type: parsed.type,
      difficulty: parsed.difficulty,
      prompt_md: parsed.promptMd,
      solution_md: parsed.solutionMd,
      choices: parsed.choicesJson,
      hints: parsed.hintsJson,
      tags: parsed.tagsJson,
      status: parsed.status,
      prompt,
      solution: { result: { x, y } },
      updated_at: new Date().toISOString(),
    };
  }

  if (parsed.type === "point_plot_from_coordinates") {
    const rawConfig =
      parsed.choicesJson && typeof parsed.choicesJson === "object"
        ? (parsed.choicesJson as PointPromptConfig)
        : null;
    const fallbackTarget = rawConfig?.target ?? [0, 0];
    const fallbackVectors = [
      {
        id: "a",
        color: "#3b82f6",
        target: [Number(fallbackTarget[0]) || 0, Number(fallbackTarget[1]) || 0] as [
          number,
          number,
        ],
      },
    ];
    const vectors =
      rawConfig?.vectors && rawConfig.vectors.length > 0
        ? rawConfig.vectors.map((vector, index) => ({
            id: vector.id?.trim() || String.fromCharCode(97 + index),
            color: vector.color || "#3b82f6",
            target: [
              Number(vector.target?.[0] ?? 0) || 0,
              Number(vector.target?.[1] ?? 0) || 0,
            ] as [number, number],
          }))
        : fallbackVectors;

    const solutionRows = vectors.map((vector) => ({
      id: vector.id,
      x: vector.target[0],
      y: vector.target[1],
    }));
    const prompt = {
      kind: "point_plot_from_coordinates",
      question: parsed.promptMd || "Plot all required vectors on the coordinate system.",
      grid: {
        xMin: Number(rawConfig?.grid?.xMin ?? -10),
        xMax: Number(rawConfig?.grid?.xMax ?? 10),
        yMin: Number(rawConfig?.grid?.yMin ?? -10),
        yMax: Number(rawConfig?.grid?.yMax ?? 10),
        step: Number(rawConfig?.grid?.step ?? 1),
      },
      vectors: vectors.map((vector) => ({
        id: vector.id,
        color: vector.color,
        start: [0, 0] as [number, number],
        end: vector.target,
      })),
      showLabels: true,
    };

    return {
      subtheme_id: parsed.subthemeId,
      type: parsed.type,
      difficulty: parsed.difficulty,
      prompt_md: parsed.promptMd,
      solution_md: parsed.solutionMd,
      choices: parsed.choicesJson,
      hints: parsed.hintsJson,
      tags: parsed.tagsJson,
      status: parsed.status,
      prompt,
      solution: { result: solutionRows },
      updated_at: new Date().toISOString(),
    };
  }

  if (parsed.type === "single_choice" || parsed.type === "multiple_choice") {
    const rawConfig =
      parsed.choicesJson && typeof parsed.choicesJson === "object"
        ? (parsed.choicesJson as MultipleChoicePromptConfig)
        : null;
    const fallbackOptions = [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
      { id: "c", text: "Option C" },
      { id: "d", text: "Option D" },
    ];
    const options =
      rawConfig?.options && rawConfig.options.length >= 2
        ? rawConfig.options
            .filter((item) => item && typeof item.id === "string")
            .map((item) => ({ id: item.id, text: item.text ?? "" }))
        : fallbackOptions;
    const validIds = new Set(options.map((item) => item.id));
    const correctOption =
      rawConfig?.correctOption && validIds.has(rawConfig.correctOption)
        ? rawConfig.correctOption
        : options[0]?.id ?? "a";

    return {
      subtheme_id: parsed.subthemeId,
      type: "single_choice",
      difficulty: parsed.difficulty,
      prompt_md: parsed.promptMd,
      solution_md: parsed.solutionMd,
      choices: parsed.choicesJson,
      hints: parsed.hintsJson,
      tags: parsed.tagsJson,
      status: parsed.status,
      prompt: {
        kind: "single_choice",
        question: parsed.promptMd,
        options,
      },
      solution: { result: correctOption },
      updated_at: new Date().toISOString(),
    };
  }

  if (parsed.type === "multi_select") {
    const rawConfig =
      parsed.choicesJson && typeof parsed.choicesJson === "object"
        ? (parsed.choicesJson as MultiSelectPromptConfig)
        : null;
    const fallbackOptions = [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
      { id: "c", text: "Option C" },
      { id: "d", text: "Option D" },
    ];
    const options =
      rawConfig?.options && rawConfig.options.length >= 2
        ? rawConfig.options
            .filter((item) => item && typeof item.id === "string")
            .map((item) => ({ id: item.id, text: item.text ?? "" }))
        : fallbackOptions;
    const validIds = new Set(options.map((item) => item.id));
    const correctOptions = [
      ...new Set(
        (rawConfig?.correctOptions ?? [])
          .filter((id): id is string => typeof id === "string")
          .filter((id) => validIds.has(id))
      ),
    ].sort();

    return {
      subtheme_id: parsed.subthemeId,
      type: "multi_select",
      difficulty: parsed.difficulty,
      prompt_md: parsed.promptMd,
      solution_md: parsed.solutionMd,
      choices: parsed.choicesJson,
      hints: parsed.hintsJson,
      tags: parsed.tagsJson,
      status: parsed.status,
      prompt: {
        kind: "multi_select",
        question: parsed.promptMd,
        options,
      },
      solution: { result: correctOptions },
      updated_at: new Date().toISOString(),
    };
  }

  if (parsed.type === "equal_vectors_pick") {
    const rawConfig =
      parsed.choicesJson && typeof parsed.choicesJson === "object"
        ? (parsed.choicesJson as EqualVectorsPromptConfig)
        : null;

    const fallbackVectors = [
      { id: "a", color: "#ef4444", start: [0, 0] as [number, number], end: [3, 2] as [number, number] },
      { id: "b", color: "#3b82f6", start: [2, -1] as [number, number], end: [5, 1] as [number, number] },
      { id: "c", color: "#10b981", start: [-3, 0] as [number, number], end: [0, 2] as [number, number] },
      { id: "d", color: "#f59e0b", start: [1, 3] as [number, number], end: [4, 5] as [number, number] },
    ];

    const vectors =
      rawConfig?.vectors && rawConfig.vectors.length >= 2
        ? rawConfig.vectors.map((vector) => ({
            id: vector.id,
            color: vector.color || "#0f172a",
            start: [Number(vector.start?.[0] ?? 0), Number(vector.start?.[1] ?? 0)] as [number, number],
            end: [Number(vector.end?.[0] ?? 0), Number(vector.end?.[1] ?? 0)] as [number, number],
          }))
        : fallbackVectors;

    const validIds = new Set(vectors.map((vector) => vector.id));
    const correctIds =
      rawConfig?.correctIds?.filter((id) => validIds.has(id)) ?? [];

    return {
      subtheme_id: parsed.subthemeId,
      type: parsed.type,
      difficulty: parsed.difficulty,
      prompt_md: parsed.promptMd,
      solution_md: parsed.solutionMd,
      choices: parsed.choicesJson,
      hints: parsed.hintsJson,
      tags: parsed.tagsJson,
      status: parsed.status,
      prompt: {
        kind: "equal_vectors_pick",
        question: parsed.promptMd,
        grid: {
          xMin: Number(rawConfig?.grid?.xMin ?? -10),
          xMax: Number(rawConfig?.grid?.xMax ?? 10),
          yMin: Number(rawConfig?.grid?.yMin ?? -10),
          yMax: Number(rawConfig?.grid?.yMax ?? 10),
          step: Number(rawConfig?.grid?.step ?? 1),
        },
        vectors,
      },
      solution: { result: correctIds.sort() },
      updated_at: new Date().toISOString(),
    };
  }

  if (parsed.type === "multi_part") {
    const rawConfig =
      parsed.choicesJson && typeof parsed.choicesJson === "object"
        ? (parsed.choicesJson as MultiPartPromptConfig)
        : null;
    const fallbackParts = [
      {
        id: "part-1",
        type: "short_answer" as const,
        prompt: "Part 1",
        correctText: "",
      },
    ];
    const rawParts = rawConfig?.parts && rawConfig.parts.length > 0 ? rawConfig.parts : fallbackParts;
    const parts = rawParts.map((part, index) => {
      const id = part.id?.trim() || `part-${index + 1}`;
      const type = part.type ?? "short_answer";
      const prompt = part.prompt?.trim() || `Part ${index + 1}`;
      const options = (part.options ?? [])
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({ id: item.id, text: item.text ?? "" }));

      if (type === "single_choice") {
        const fallbackOptions = options.length >= 2
          ? options
          : [
              { id: "a", text: "Option A" },
              { id: "b", text: "Option B" },
              { id: "c", text: "Option C" },
              { id: "d", text: "Option D" },
            ];
        const validIds = new Set(fallbackOptions.map((item) => item.id));
        return {
          id,
          type,
          prompt,
          options: fallbackOptions,
          correctOption:
            part.correctOption && validIds.has(part.correctOption)
              ? part.correctOption
              : fallbackOptions[0].id,
        };
      }

      if (type === "multi_select") {
        const fallbackOptions = options.length >= 2
          ? options
          : [
              { id: "a", text: "Option A" },
              { id: "b", text: "Option B" },
              { id: "c", text: "Option C" },
              { id: "d", text: "Option D" },
            ];
        const validIds = new Set(fallbackOptions.map((item) => item.id));
        const correctOptions = [
          ...new Set(
            (part.correctOptions ?? [])
              .filter((id): id is string => typeof id === "string")
              .filter((id) => validIds.has(id))
          ),
        ];
        return {
          id,
          type,
          prompt,
          options: fallbackOptions,
          correctOptions: correctOptions.length > 0 ? correctOptions : [fallbackOptions[0].id],
        };
      }

      if (type === "open_text") {
        return {
          id,
          type,
          prompt,
        };
      }

      if (type === "vector_xy_from_graph" || type === "point_plot_from_coordinates") {
        const x = Number(part.x ?? 0);
        const y = Number(part.y ?? 0);
        return {
          id,
          type,
          prompt,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
        };
      }

      return {
        id,
        type: "short_answer" as const,
        prompt,
        correctText: part.correctText ?? "",
      };
    });

    return {
      subtheme_id: parsed.subthemeId,
      type: "multi_part",
      difficulty: parsed.difficulty,
      prompt_md: parsed.promptMd,
      solution_md: parsed.solutionMd,
      choices: parsed.choicesJson,
      hints: parsed.hintsJson,
      tags: parsed.tagsJson,
      status: parsed.status,
      prompt: {
        kind: "multi_part",
        question: parsed.promptMd,
        parts: parts.map((part) => {
          if (part.type === "single_choice" || part.type === "multi_select") {
            return {
              id: part.id,
              type: part.type,
              prompt: part.prompt,
              options: part.options,
            };
          }
          if (part.type === "vector_xy_from_graph") {
            return {
              id: part.id,
              type: part.type,
              prompt: part.prompt,
              grid: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 1 },
              origin: [0, 0] as [number, number],
              vectorEnd: [Number(part.x ?? 0), Number(part.y ?? 0)] as [number, number],
            };
          }
          if (part.type === "point_plot_from_coordinates") {
            return {
              id: part.id,
              type: part.type,
              prompt: part.prompt,
              grid: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 1 },
              target: [Number(part.x ?? 0), Number(part.y ?? 0)] as [number, number],
            };
          }
          return {
            id: part.id,
            type: part.type,
            prompt: part.prompt,
          };
        }),
      },
      solution: {
        result: parts.map((part) => {
          if (part.type === "single_choice") {
            return { id: part.id, type: part.type, correctOption: part.correctOption };
          }
          if (part.type === "multi_select") {
            return {
              id: part.id,
              type: part.type,
              correctOptions: [...(part.correctOptions ?? [])].sort(),
            };
          }
          if (part.type === "short_answer") {
            return { id: part.id, type: part.type, correctText: part.correctText ?? "" };
          }
          if (part.type === "vector_xy_from_graph" || part.type === "point_plot_from_coordinates") {
            return {
              id: part.id,
              type: part.type,
              x: Number(part.x ?? 0),
              y: Number(part.y ?? 0),
            };
          }
          return { id: part.id, type: part.type };
        }),
      },
      updated_at: new Date().toISOString(),
    };
  }

  return {
    subtheme_id: parsed.subthemeId,
    type: parsed.type,
    difficulty: parsed.difficulty,
    prompt_md: parsed.promptMd,
    solution_md: parsed.solutionMd,
    choices: parsed.choicesJson,
    hints: parsed.hintsJson,
    tags: parsed.tagsJson,
    status: parsed.status,
    prompt: { question: parsed.promptMd },
    solution: { result: parsed.solutionMd },
    updated_at: new Date().toISOString(),
  };
}

export async function upsertExerciseAction(
  rawInput: ExerciseEditorInput
): Promise<ActionResult> {
  try {
    const parsedResult = exerciseEditorSchema.safeParse(rawInput);
    if (!parsedResult.success) {
      return { ok: false, message: getValidationMessage(parsedResult.error) };
    }

    const parsed = parsedResult.data;
    const { supabase, userId } = await assertAdmin();
    const payload = toExercisePayload(parsed);

    if (parsed.id) {
      const { data, error } = await supabase
        .from("exercises")
        .update(payload)
        .eq("id", parsed.id)
        .select("id")
        .single();

      if (error || !data) {
        return { ok: false, message: error?.message || "Update failed" };
      }

      return { ok: true, message: "Exercise updated", id: data.id };
    }

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        ...payload,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, message: error?.message || "Create failed" };
    }

    return { ok: true, message: "Exercise created", id: data.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function autosaveDraftAction(
  rawInput: ExerciseEditorInput
): Promise<ActionResult> {
  const draftInput = {
    ...rawInput,
    status: "draft" as const,
  };

  const result = await upsertExerciseAction(draftInput);
  return {
    ...result,
    message: result.ok ? "Draft autosaved" : result.message,
  };
}

export async function publishExerciseAction(
  id: string
): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin();
    const { data, error } = await supabase
      .from("exercises")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, message: error?.message || "Publish failed" };
    }

    return { ok: true, message: "Exercise published", id: data.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteExerciseAction(
  id: string
): Promise<ActionResult> {
  try {
    const { supabase } = await assertAdmin();
    const { error } = await supabase.from("exercises").delete().eq("id", id);

    if (error) {
      return { ok: false, message: error.message || "Delete failed" };
    }

    return { ok: true, message: "Exercise deleted", id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
