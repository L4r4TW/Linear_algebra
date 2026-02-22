"use client";

import { useMemo, useState } from "react";
import {
  MultiVectorPlane,
  type PlaneVector,
} from "@/components/admin/multi-vector-plane";
import { VectorPlane } from "@/components/admin/vector-plane";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

type ExerciseAttemptCardProps = {
  exerciseId: string;
  prompt: Json;
  solution: Json;
  initialSolved?: boolean;
};

type VectorPrompt = {
  kind: "vector_xy_from_graph";
  question?: string;
  grid?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    step?: number;
  };
  vectorEnd?: [number, number];
};

type PointPrompt = {
  kind: "point_plot_from_coordinates";
  question?: string;
  grid?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    step?: number;
  };
  target?: [number, number];
};

type MultipleChoicePrompt = {
  kind: "single_choice" | "multiple_choice";
  question?: string;
  options?: Array<{ id: string; text: string }>;
};

type EqualVectorsPrompt = {
  kind: "equal_vectors_pick";
  question?: string;
  grid?: {
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    step?: number;
  };
  vectors?: PlaneVector[];
};

function getQuestionText(prompt: Json): string {
  if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
    const maybeQuestion = (prompt as Record<string, unknown>).question;
    if (typeof maybeQuestion === "string") {
      return maybeQuestion;
    }
  }

  return JSON.stringify(prompt);
}

function normalize(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value).trim().toLowerCase();
  }

  return JSON.stringify(value).trim().toLowerCase();
}

function parseInput(rawInput: string): unknown {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function expectedAnswer(solution: Json): unknown {
  if (solution && typeof solution === "object" && !Array.isArray(solution)) {
    const maybeResult = (solution as Record<string, unknown>).result;
    if (typeof maybeResult !== "undefined") {
      return maybeResult;
    }
  }

  return solution;
}

function getVectorPrompt(prompt: Json): VectorPrompt | null {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    return null;
  }

  const obj = prompt as Record<string, unknown>;
  if (obj.kind !== "vector_xy_from_graph") {
    return null;
  }

  return obj as unknown as VectorPrompt;
}

function getPointPrompt(prompt: Json): PointPrompt | null {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    return null;
  }

  const obj = prompt as Record<string, unknown>;
  if (obj.kind !== "point_plot_from_coordinates") {
    return null;
  }

  return obj as unknown as PointPrompt;
}

function getMultipleChoicePrompt(prompt: Json): MultipleChoicePrompt | null {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    return null;
  }

  const obj = prompt as Record<string, unknown>;
  if (obj.kind !== "multiple_choice" && obj.kind !== "single_choice") {
    return null;
  }

  return obj as unknown as MultipleChoicePrompt;
}

function getExpectedVector(solution: Json): { x: number; y: number } | null {
  if (!solution || typeof solution !== "object" || Array.isArray(solution)) {
    return null;
  }

  const maybeResult = (solution as Record<string, unknown>).result;
  if (!maybeResult || typeof maybeResult !== "object" || Array.isArray(maybeResult)) {
    return null;
  }

  const x = Number((maybeResult as Record<string, unknown>).x);
  const y = Number((maybeResult as Record<string, unknown>).y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function getEqualVectorsPrompt(prompt: Json): EqualVectorsPrompt | null {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    return null;
  }

  const obj = prompt as Record<string, unknown>;
  if (obj.kind !== "equal_vectors_pick") {
    return null;
  }

  return obj as unknown as EqualVectorsPrompt;
}

function getExpectedIdSet(solution: Json): string[] {
  if (!solution || typeof solution !== "object" || Array.isArray(solution)) {
    return [];
  }

  const maybeResult = (solution as Record<string, unknown>).result;
  if (!Array.isArray(maybeResult)) {
    return [];
  }

  return maybeResult
    .map((item) => (typeof item === "string" ? item : ""))
    .filter(Boolean)
    .sort();
}

function VectorLabel({ id }: { id: string }) {
  return (
    <span className="relative inline-flex items-center px-1">
      <span className="font-semibold">{id}</span>
      <span className="absolute -top-2 left-0 h-[2px] w-full rounded bg-current" />
      <span className="absolute -top-[11px] right-[-3px] text-[10px] leading-none">▶</span>
    </span>
  );
}

export function ExerciseAttemptCard({
  exerciseId,
  prompt,
  solution,
  initialSolved = false,
}: ExerciseAttemptCardProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSolved, setIsSolved] = useState(initialSolved);
  const [vectorXInput, setVectorXInput] = useState("");
  const [vectorYInput, setVectorYInput] = useState("");
  const [plottedPoint, setPlottedPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [selectedChoice, setSelectedChoice] = useState("");
  const [selectedEqualIds, setSelectedEqualIds] = useState<string[]>([]);

  const vectorPrompt = getVectorPrompt(prompt);
  const pointPrompt = getPointPrompt(prompt);
  const multipleChoicePrompt = getMultipleChoicePrompt(prompt);
  const equalVectorsPrompt = getEqualVectorsPrompt(prompt);
  const expectedVector = getExpectedVector(solution);

  async function saveAttempt(correctness: boolean, rawAnswer: string) {
    setIsSaving(true);
    setSaveMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaveMessage("Login required to save this attempt.");
      setIsSaving(false);
      return;
    }

    const fallbackUsername = `user_${user.id.slice(0, 8)}`;

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        username: fallbackUsername,
      },
      {
        onConflict: "id",
        ignoreDuplicates: true,
      }
    );

    if (profileError) {
      setSaveMessage(`Attempt not saved: ${profileError.message}`);
      setIsSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("attempts").insert({
      user_id: user.id,
      exercise_id: exerciseId,
      is_correct: correctness,
      answer: {
        raw: rawAnswer,
      },
    });

    if (insertError) {
      setSaveMessage(`Attempt not saved: ${insertError.message}`);
      setIsSaving(false);
      return;
    }

    setSaveMessage("Attempt saved.");
    setIsSaving(false);
  }

  async function handleSubmit() {
    let correctness = false;
    let rawAnswer = answer;

    if (equalVectorsPrompt) {
      const expected = getExpectedIdSet(solution);
      const actual = [...selectedEqualIds].sort();
      correctness =
        expected.length === actual.length &&
        expected.every((id, index) => id === actual[index]);
      rawAnswer = actual.join(", ");
    } else if (multipleChoicePrompt) {
      const expected = String(expectedAnswer(solution));
      correctness = selectedChoice === expected;
      rawAnswer = selectedChoice;
    } else if (pointPrompt && expectedVector) {
      correctness = Boolean(
        plottedPoint &&
          plottedPoint.x === expectedVector.x &&
          plottedPoint.y === expectedVector.y
      );
      rawAnswer = plottedPoint ? `(${plottedPoint.x}, ${plottedPoint.y})` : "";
    } else if (vectorPrompt && expectedVector) {
      const x = Number(vectorXInput.trim());
      const y = Number(vectorYInput.trim());
      correctness =
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x === expectedVector.x &&
        y === expectedVector.y;
      rawAnswer = `(${vectorXInput.trim()}, ${vectorYInput.trim()})`;
    } else {
      const parsedInput = parseInput(answer);
      const expected = expectedAnswer(solution);
      correctness = normalize(parsedInput) === normalize(expected);
    }

    setSubmitted(true);
    setIsCorrect(correctness);
    setFeedbackMessage(correctness ? "Correct" : "Incorrect");
    if (correctness) {
      setIsSolved(true);
    }

    await saveAttempt(correctness, rawAnswer);
  }

  return (
    <div className="rounded-none border-0 bg-transparent p-0 sm:rounded-lg sm:border sm:border-slate-200 sm:bg-white sm:p-4">
      {isSolved && (
        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
          Solved
        </span>
      )}
      <p className="font-medium">{getQuestionText(prompt)}</p>

      {equalVectorsPrompt ? (
        <div className="mt-4 space-y-4">
          <MultiVectorPlane
            vectors={equalVectorsPrompt.vectors ?? []}
            min={Number(equalVectorsPrompt.grid?.xMin ?? -10)}
            max={Number(equalVectorsPrompt.grid?.xMax ?? 10)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(equalVectorsPrompt.vectors ?? []).map((vector) => {
              const checked = selectedEqualIds.includes(vector.id);
              return (
                <label
                  key={`pick-${vector.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedEqualIds((prev) =>
                        event.target.checked
                          ? [...prev, vector.id]
                          : prev.filter((id) => id !== vector.id)
                      );
                    }}
                  />
                  <VectorLabel id={vector.id} />
                </label>
              );
            })}
          </div>
        </div>
      ) : multipleChoicePrompt ? (
        <div className="mt-4 space-y-3">
          {(multipleChoicePrompt.options ?? []).map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <input
                type="radio"
                name={`mc-${exerciseId}`}
                value={option.id}
                checked={selectedChoice === option.id}
                onChange={(event) => setSelectedChoice(event.target.value)}
                className="mt-1"
              />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">{option.id.toUpperCase()}.</span>{" "}
                {option.text}
              </span>
            </label>
          ))}
        </div>
      ) : pointPrompt ? (
        <div className="mt-4 space-y-4">
          <VectorPlane
            x={plottedPoint?.x ?? 0}
            y={plottedPoint?.y ?? 0}
            min={Number(pointPrompt.grid?.xMin ?? -10)}
            max={Number(pointPrompt.grid?.xMax ?? 10)}
            mode="point"
            interactive
            showPoint={Boolean(plottedPoint)}
            onChange={(next) => setPlottedPoint(next)}
          />
          <p className="text-sm text-slate-700">
            Plotted point:{" "}
            {plottedPoint ? `(${plottedPoint.x}, ${plottedPoint.y})` : "not selected"}
          </p>
        </div>
      ) : vectorPrompt ? (
        <div className="mt-4 space-y-4">
          <VectorPlane
            x={Number(vectorPrompt.vectorEnd?.[0] ?? 0)}
            y={Number(vectorPrompt.vectorEnd?.[1] ?? 0)}
            min={Number(vectorPrompt.grid?.xMin ?? -10)}
            max={Number(vectorPrompt.grid?.xMax ?? 10)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-slate-700">X</span>
              <input
                value={vectorXInput}
                onChange={(event) => setVectorXInput(event.target.value)}
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="X coordinate"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-slate-700">Y</span>
              <input
                value={vectorYInput}
                onChange={(event) => setVectorYInput(event.target.value)}
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Y coordinate"
              />
            </label>
          </div>
        </div>
      ) : (
        <label className="mt-3 flex flex-col gap-2">
          <span className="text-sm text-slate-700">Your answer</span>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Type a number, text, or JSON."
          />
        </label>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          isSaving ||
          (equalVectorsPrompt
            ? selectedEqualIds.length === 0
            : multipleChoicePrompt
            ? !selectedChoice
            : pointPrompt
            ? !plottedPoint
            : vectorPrompt
            ? !vectorXInput.trim() || !vectorYInput.trim()
            : !answer.trim())
        }
        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Submit answer
      </button>

      {submitted && (
        <div className="mt-3 rounded bg-slate-50 p-3">
          <p
            className={`text-sm font-semibold ${
              isCorrect ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {feedbackMessage}
          </p>
        </div>
      )}

      {saveMessage && <p className="mt-2 text-sm text-slate-700">{saveMessage}</p>}
    </div>
  );
}
