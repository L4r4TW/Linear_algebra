"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

type ExerciseAttemptCardProps = {
  exerciseId: string;
  prompt: Json;
  solution: Json;
  initialSolved?: boolean;
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
    const parsedInput = parseInput(answer);
    const expected = expectedAnswer(solution);

    const correctness = normalize(parsedInput) === normalize(expected);

    setSubmitted(true);
    setIsCorrect(correctness);
    setFeedbackMessage(correctness ? "Correct" : "Incorrect");
    if (correctness) {
      setIsSolved(true);
    }

    await saveAttempt(correctness, answer);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      {isSolved && (
        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
          Solved
        </span>
      )}
      <p className="font-medium">{getQuestionText(prompt)}</p>

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

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!answer.trim() || isSaving}
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
          <p className="mt-2 text-sm text-slate-700">Correct solution:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-sm text-slate-800">
            {JSON.stringify(solution, null, 2)}
          </pre>
        </div>
      )}

      {saveMessage && <p className="mt-2 text-sm text-slate-700">{saveMessage}</p>}
    </div>
  );
}
