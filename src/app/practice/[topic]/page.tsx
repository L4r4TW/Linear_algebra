import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { ExerciseAttemptCard } from "./exercise-attempt-card";

type ThemePageParams = {
  topic: string;
};

type ThemeSearchParams = {
  subtheme?: string;
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

type SubthemeRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
  theme_id: string;
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
  searchParams,
}: {
  params: Promise<ThemePageParams>;
  searchParams: Promise<ThemeSearchParams>;
}) {
  const { topic } = await params;
  const { subtheme: selectedSubthemeSlug } = await searchParams;

  const supabase = await createServerSupabaseClient();

  const { data: themeRow, error: themeError } = await supabase
    .from("themes")
    .select("id, slug, title, position, unit_id")
    .eq("slug", topic)
    .single();

  if (themeError || !themeRow) {
    notFound();
  }

  const typedTheme = themeRow as ThemeRow;

  const [{ data: unitRow }, { data: subthemes, error: subthemesError }] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, title, position")
        .eq("id", typedTheme.unit_id)
        .maybeSingle(),
      supabase
        .from("subthemes")
        .select("id, slug, title, position, theme_id")
        .eq("theme_id", typedTheme.id)
        .order("position", { ascending: true }),
    ]);

  const typedUnit = (unitRow as UnitRow | null) ?? null;
  const typedSubthemes = (subthemes as SubthemeRow[]) ?? [];

  const selectedSubtheme =
    typedSubthemes.find((item) => item.slug === selectedSubthemeSlug) ??
    typedSubthemes[0] ??
    null;

  let exercises: ExerciseRow[] = [];
  let exercisesErrorMessage = "";

  if (selectedSubtheme) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, type, difficulty, prompt, solution")
      .eq("subtheme_id", selectedSubtheme.id)
      .order("created_at", { ascending: true });

    if (error) {
      exercisesErrorMessage = error.message;
    } else {
      exercises = (data as ExerciseRow[]) ?? [];
    }
  }

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
          <h2 className="text-xl font-semibold">Subthemes</h2>

          {subthemesError && (
            <p className="mt-3 text-sm text-rose-700">
              Failed to load subthemes: {subthemesError.message}
            </p>
          )}

          {!subthemesError && typedSubthemes.length === 0 && (
            <p className="mt-3 text-sm text-slate-700">No subthemes in this theme yet.</p>
          )}

          {!subthemesError && typedSubthemes.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {typedSubthemes.map((subtheme) => {
                const isActive = selectedSubtheme?.id === subtheme.id;
                return (
                  <Link
                    key={subtheme.id}
                    href={`/practice/${typedTheme.slug}?subtheme=${subtheme.slug}`}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      isActive
                        ? "border-teal-600 bg-teal-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <p className="text-sm font-medium">{subtheme.title}</p>
                    <p className="text-xs text-slate-600">/{subtheme.slug}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {selectedSubtheme && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold">
              Exercises: {selectedSubtheme.title}
            </h2>

            {exercisesErrorMessage && (
              <p className="mt-3 text-sm text-rose-700">
                Failed to load exercises: {exercisesErrorMessage}
              </p>
            )}

            {!exercisesErrorMessage && exercises.length === 0 && (
              <p className="mt-3 text-sm text-slate-700">
                No exercises for this subtheme yet.
              </p>
            )}

            {!exercisesErrorMessage && exercises.length > 0 && (
              <ol className="mt-4 flex list-decimal flex-col gap-4 pl-6">
                {exercises.map((exercise) => (
                  <li key={exercise.id}>
                    <ExerciseAttemptCard
                      exerciseId={exercise.id}
                      type={exercise.type}
                      difficulty={exercise.difficulty}
                      prompt={exercise.prompt}
                      solution={exercise.solution}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
