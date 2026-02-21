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

export default async function PracticePage() {
  const supabase = await createServerSupabaseClient();

  const [unitsResult, themesResult] = await Promise.all([
    supabase
      .from("units")
      .select("id, slug, title, position")
      .order("position", { ascending: true }),
    supabase
      .from("themes")
      .select("id, slug, title, position, unit_id")
      .order("position", { ascending: true }),
  ]);

  const error = unitsResult.error ?? themesResult.error;
  const units = (unitsResult.data as UnitRow[]) ?? [];
  const themes = (themesResult.data as ThemeRow[]) ?? [];

  const themesByUnitId = themes.reduce<Record<string, ThemeRow[]>>((acc, theme) => {
    if (!acc[theme.unit_id]) {
      acc[theme.unit_id] = [];
    }
    acc[theme.unit_id].push(theme);
    return acc;
  }, {});

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
                          <Link
                            href={`/practice/${theme.slug}`}
                            className="block rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
                          >
                            <p className="text-sm font-medium">{theme.title}</p>
                            <p className="text-xs text-slate-600">/{theme.slug}</p>
                          </Link>
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
