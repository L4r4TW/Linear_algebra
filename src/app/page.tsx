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

export default async function Home() {
  const hasSupabaseEnv =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let units: UnitRow[] = [];
  let themes: ThemeRow[] = [];
  let dbError = "";

  if (hasSupabaseEnv) {
    try {
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

      if (unitsResult.error) {
        dbError = unitsResult.error.message;
      } else if (themesResult.error) {
        dbError = themesResult.error.message;
      } else {
        units = (unitsResult.data as UnitRow[]) ?? [];
        themes = (themesResult.data as ThemeRow[]) ?? [];
      }
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Unknown error";
    }
  }

  const themesByUnitId = themes.reduce<Record<string, ThemeRow[]>>((acc, theme) => {
    if (!acc[theme.unit_id]) {
      acc[theme.unit_id] = [];
    }
    acc[theme.unit_id].push(theme);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-[linear-gradient(120deg,#f3f9ff_0%,#fcf8f3_100%)] px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
            Linear Algebra Practice
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Open source exercises for Khan-style linear algebra learning
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-700">
            The course is organized as Units -&gt; Themes -&gt; Exercises.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/practice"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Start practice
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              Login
            </Link>
            <Link
              href="/profile"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
            >
              Profile
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">Quick status</h2>
          {!hasSupabaseEnv && (
            <p className="mt-3 text-slate-700">
              Supabase env vars are not set. Copy <code>.env.example</code> to{" "}
              <code>.env.local</code> and add your project values.
            </p>
          )}
          {hasSupabaseEnv && dbError && (
            <p className="mt-3 text-rose-700">
              Connected to Supabase config, but query failed: {dbError}
            </p>
          )}
          {hasSupabaseEnv && !dbError && (
            <p className="mt-3 text-emerald-700">
              Supabase connection works. Loaded {units.length} unit(s) and {themes.length} theme(s).
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">Course structure</h2>
          {units.length === 0 ? (
            <p className="mt-3 text-slate-700">
              No units found yet. Run the SQL in <code>supabase/seed.sql</code>.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {units.map((unit) => (
                <div key={unit.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm text-slate-500">Unit {unit.position}</p>
                  <p className="font-medium">{unit.title}</p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    {(themesByUnitId[unit.id] ?? []).map((theme) => (
                      <li key={theme.id}>
                        <Link className="underline" href={`/practice/${theme.slug}`}>
                          {theme.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
