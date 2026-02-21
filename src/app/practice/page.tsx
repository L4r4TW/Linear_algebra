import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UnitRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
};

type ThemeRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
  unit_id: string;
};

type SubthemeRow = {
  id: string;
  theme_id: string;
};

type ExerciseRefRow = {
  id: string;
  subtheme_id: string;
};

type AttemptRefRow = {
  exercise_id: string;
};

export default async function PracticePage() {
  const supabase = await createServerSupabaseClient();

  const [
    userResult,
    unitsResult,
    themesResult,
    subthemesResult,
    exerciseRefsResult,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("units")
      .select("id, slug, title, position")
      .order("position", { ascending: true }),
    supabase
      .from("themes")
      .select("id, slug, title, position, unit_id")
      .order("position", { ascending: true }),
    supabase.from("subthemes").select("id, theme_id"),
    supabase
      .from("exercises")
      .select("id, subtheme_id")
      .eq("status", "published"),
  ]);

  const {
    data: { user },
  } = userResult;

  const error =
    unitsResult.error ??
    themesResult.error ??
    subthemesResult.error ??
    exerciseRefsResult.error;
  const units = (unitsResult.data as UnitRow[]) ?? [];
  const themes = (themesResult.data as ThemeRow[]) ?? [];
  const subthemes = (subthemesResult.data as SubthemeRow[]) ?? [];
  const exerciseRefs = (exerciseRefsResult.data as ExerciseRefRow[]) ?? [];

  const themesByUnitId = themes.reduce<Record<string, ThemeRow[]>>((acc, theme) => {
    if (!acc[theme.unit_id]) {
      acc[theme.unit_id] = [];
    }
    acc[theme.unit_id].push(theme);
    return acc;
  }, {});

  const subthemeToThemeId = new Map<string, string>();
  const exerciseToThemeId = new Map<string, string>();
  const totalByTheme = new Map<string, number>();
  const solvedByTheme = new Map<string, number>();

  themes.forEach((theme) => {
    totalByTheme.set(theme.id, 0);
    solvedByTheme.set(theme.id, 0);
  });

  subthemes.forEach((subtheme) => {
    subthemeToThemeId.set(subtheme.id, subtheme.theme_id);
  });

  exerciseRefs.forEach((exercise) => {
    const themeId = subthemeToThemeId.get(exercise.subtheme_id);
    if (!themeId) {
      return;
    }

    exerciseToThemeId.set(exercise.id, themeId);
    totalByTheme.set(themeId, (totalByTheme.get(themeId) ?? 0) + 1);
  });

  if (user && exerciseRefs.length > 0) {
    const exerciseIds = exerciseRefs.map((exercise) => exercise.id);
    const { data: solvedAttempts } = await supabase
      .from("attempts")
      .select("exercise_id")
      .eq("user_id", user.id)
      .eq("is_correct", true)
      .in("exercise_id", exerciseIds);

    const solvedExerciseIds = new Set(
      ((solvedAttempts as AttemptRefRow[]) ?? []).map((attempt) => attempt.exercise_id)
    );

    solvedExerciseIds.forEach((exerciseId) => {
      const themeId = exerciseToThemeId.get(exerciseId);
      if (!themeId) {
        return;
      }
      solvedByTheme.set(themeId, (solvedByTheme.get(themeId) ?? 0) + 1);
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Practice
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Pick a theme</h1>
          <p className="mt-2 text-sm text-slate-600">
            Choose a theme inside a unit to start solving exercises.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {error && (
            <p className="text-sm text-rose-700">
              Failed to load course structure: {error.message}
            </p>
          )}

          {!error && units.length === 0 && (
            <p className="text-sm text-slate-700">
              No units found. Run <code>supabase/seed.sql</code>.
            </p>
          )}

          {!error && units.length > 0 && (
            <div className="space-y-4">
              {units.map((unit) => (
                <div
                  key={unit.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <p className="text-sm text-slate-500">Unit {unit.position}</p>
                  <p className="font-medium">{unit.title}</p>

                  {(themesByUnitId[unit.id] ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">No themes yet.</p>
                  ) : (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(themesByUnitId[unit.id] ?? []).map((theme) => (
                        <li key={theme.id}>
                          {(() => {
                            const solved = solvedByTheme.get(theme.id) ?? 0;
                            const total = totalByTheme.get(theme.id) ?? 0;
                            const percentage =
                              total > 0 ? Math.round((solved / total) * 100) : 0;

                            return (
                          <Link
                            href={`/practice/${theme.slug}`}
                            className="block rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
                          >
                            <p className="text-sm font-medium">{theme.title}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              Solved: {solved}/{total}
                            </p>
                            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-700">
                              {percentage}% complete
                            </p>
                          </Link>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
