import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { PracticeRunner } from "./practice-runner";

type ThemePageParams = {
  topic: string;
};

type ThemeRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
  unit_id: string;
};

type UnitRow = {
  id: string;
  title: string;
  position: number;
};

type ExerciseRow = {
  id: string;
  type: string;
  difficulty: number;
  prompt: Json;
  solution: Json;
};

export default async function ThemePracticePage({
  params,
}: {
  params: Promise<ThemePageParams>;
}) {
  const { topic } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: themeRow, error: themeError } = await supabase
    .from("themes")
    .select("id, slug, title, position, unit_id")
    .eq("slug", topic)
    .single();

  if (themeError || !themeRow) {
    notFound();
  }

  const { data: unitRow } = await supabase
    .from("units")
    .select("id, title, position")
    .eq("id", (themeRow as ThemeRow).unit_id)
    .maybeSingle();

  const { data: exercise, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, type, difficulty, prompt, solution")
    .eq("theme_id", (themeRow as ThemeRow).id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const typedTheme = themeRow as ThemeRow;
  const typedUnit = (unitRow as UnitRow | null) ?? null;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Practice Theme
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{typedTheme.title}</h1>
          <p className="mt-2 text-sm text-slate-600">/{typedTheme.slug}</p>
          {typedUnit && (
            <p className="mt-1 text-sm text-slate-600">
              Unit {typedUnit.position}: {typedUnit.title}
            </p>
          )}
          <p className="mt-4 text-sm text-slate-600">
            <Link href="/practice" className="underline">
              Back to all themes
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
            <p className="text-sm text-slate-700">No exercises in this theme yet.</p>
          )}

          {!exerciseError && exercise && (
            <PracticeRunner
              themeSlug={typedTheme.slug}
              exercise={exercise as ExerciseRow}
            />
          )}
        </section>
      </div>
    </main>
  );
}
