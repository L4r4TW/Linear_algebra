import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { PracticeRunner } from "./practice-runner";

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

export default async function TopicPracticePage({
  params,
}: {
  params: Promise<TopicPageParams>;
}) {
  const { topic } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: topicRow, error: topicError } = await supabase
    .from("topics")
    .select("id, slug, title")
    .eq("slug", topic)
    .single();

  if (topicError || !topicRow) {
    notFound();
  }

  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, type, difficulty, prompt, solution")
    .eq("topic_id", topicRow.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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
              Failed to load exercise: {exerciseError.message}
            </p>
          )}

          {!exerciseError && !exercise && (
            <p className="text-sm text-slate-700">No exercises in this topic yet.</p>
          )}

          {!exerciseError && exercise && (
            <PracticeRunner
              topicSlug={topicRow.slug}
              exercise={exercise as ExerciseRow}
            />
          )}
        </section>
      </div>
    </main>
  );
}
