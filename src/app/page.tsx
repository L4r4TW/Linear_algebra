import { createServerSupabaseClient } from "@/lib/supabase/server";

type UnitRow = {
  id: string;
  title: string;
  slug: string;
  position: number;
};

export default async function Home() {
  const hasSupabaseEnv =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let units: UnitRow[] = [];
  let dbError = "";

  if (hasSupabaseEnv) {
    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase
        .from("units")
        .select("id, title, slug, position")
        .order("position", { ascending: true })
        .limit(6);

      if (error) {
        dbError = error.message;
      } else {
        units = data ?? [];
      }
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Unknown error";
    }
  }

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
            This project is built with Next.js App Router and Supabase
            Postgres. Start by loading the schema and seed files, then add more
            exercises lesson by lesson.
          </p>
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
              Supabase connection works. Loaded {units.length} unit(s).
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">Starter units</h2>
          {units.length === 0 ? (
            <p className="mt-3 text-slate-700">
              No units found yet. Run the SQL in <code>supabase/seed.sql</code>{" "}
              after creating the schema.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {units.map((unit) => (
                <li
                  key={unit.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <p className="text-sm text-slate-500">Unit {unit.position}</p>
                  <p className="font-medium">{unit.title}</p>
                  <p className="text-sm text-slate-600">/{unit.slug}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
