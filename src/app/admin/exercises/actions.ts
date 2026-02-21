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
