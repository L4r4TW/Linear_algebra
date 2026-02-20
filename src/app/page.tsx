import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type TopicRow = {
  id: string;
  slug: string;
  title: string;
};

export default async function Home() {
  const hasSupabaseEnv =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let topics: TopicRow[] = [];
  let dbError = "";

  if (hasSupabaseEnv) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from("topics")
        .select("id, slug, title")
        .order("title", { ascending: true })
        .limit(8);

      if (error) {
        dbError = error.message;
      } else {
        topics = data ?? [];
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
            Next.js App Router and Supabase Postgres starter with auth +
            practice flow.
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
              Supabase connection works. Loaded {topics.length} topic(s).
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">Starter topics</h2>
          {topics.length === 0 ? (
            <p className="mt-3 text-slate-700">
              No topics found yet. Run the SQL in <code>supabase/seed.sql</code>{" "}
              after creating the schema.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {topics.map((topic) => (
                <li
                  key={topic.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <p className="font-medium">{topic.title}</p>
                  <p className="text-sm text-slate-600">/{topic.slug}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
