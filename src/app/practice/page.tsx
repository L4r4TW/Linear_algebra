import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type TopicRow = {
  id: string;
  slug: string;
  title: string;
};

export default async function PracticePage() {
  const supabase = createServerSupabaseClient();
  const { data: topics, error } = await supabase
    .from("topics")
    .select("id, slug, title")
    .order("title", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Practice
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Pick a topic</h1>
          <p className="mt-2 text-sm text-slate-600">
            Choose a topic to start solving exercises.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {error && (
            <p className="text-sm text-rose-700">
              Failed to load topics: {error.message}
            </p>
          )}

          {!error && (!topics || topics.length === 0) && (
            <p className="text-sm text-slate-700">
              No topics found. Run <code>supabase/seed.sql</code>.
            </p>
          )}

          {!error && topics && topics.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {(topics as TopicRow[]).map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`/practice/${topic.slug}`}
                    className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-slate-300"
                  >
                    <p className="font-medium">{topic.title}</p>
                    <p className="text-sm text-slate-600">/{topic.slug}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
