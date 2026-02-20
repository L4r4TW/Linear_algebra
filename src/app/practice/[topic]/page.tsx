import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type TopicPageParams = {
  topic: string;
};

type ExerciseRow = {
  id: string;
  type: string;
  difficulty: number;
  prompt: Json;
  solution: Json;
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

export default async function TopicPracticePage({
  params,
}: {
  params: Promise<TopicPageParams>;
}) {
  const { topic } = await params;
  const supabase = createServerSupabaseClient();

  const { data: topicRow, error: topicError } = await supabase
    .from("topics")
    .select("id, slug, title")
    .eq("slug", topic)
    .single();

  if (topicError || !topicRow) {
    notFound();
  }

  const { data: exercises, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, type, difficulty, prompt, solution")
    .eq("topic_id", topicRow.id)
    .order("difficulty", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Practice Topic
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{topicRow.title}</h1>
          <p className="mt-2 text-sm text-slate-600">/{topicRow.slug}</p>
          <p className="mt-4 text-sm text-slate-600">
            <Link href="/practice" className="underline">
              Back to all topics
            </Link>
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {exerciseError && (
            <p className="text-sm text-rose-700">
              Failed to load exercises: {exerciseError.message}
            </p>
          )}

          {!exerciseError && (!exercises || exercises.length === 0) && (
            <p className="text-sm text-slate-700">No exercises in this topic yet.</p>
          )}

          {!exerciseError && exercises && exercises.length > 0 && (
            <ol className="flex list-decimal flex-col gap-4 pl-6">
              {(exercises as ExerciseRow[]).map((exercise) => (
                <li key={exercise.id} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {exercise.type} - difficulty {exercise.difficulty}
                  </p>
                  <p className="mt-2 font-medium">{getQuestionText(exercise.prompt)}</p>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-slate-700">
                      Show solution
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-3 text-sm text-slate-800">
                      {JSON.stringify(exercise.solution, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
