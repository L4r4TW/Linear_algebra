"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Stats = {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  streak: number;
};

type AttemptRow = {
  id: string;
  is_correct: boolean;
  created_at: string;
  exercise_id: string;
};

type ProfileRow = {
  id: string;
  username: string;
  created_at: string;
};

function computeStreak(attempts: AttemptRow[]): number {
  let streak = 0;

  for (const attempt of attempts) {
    if (!attempt.is_correct) {
      break;
    }
    streak += 1;
  }

  return streak;
}

export default function ProfilePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<AttemptRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalAttempts: 0,
    correctAttempts: 0,
    accuracy: 0,
    streak: 0,
  });

  useEffect(() => {
    async function loadProfileAndStats() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMessage("You are not logged in.");
        setLoading(false);
        return;
      }

      setEmail(user.email ?? "");

      const [profileResult, attemptsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, created_at")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("attempts")
          .select("id, is_correct, created_at, exercise_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (profileResult.error) {
        setErrorMessage(profileResult.error.message);
        setLoading(false);
        return;
      }

      if (attemptsResult.error) {
        setErrorMessage(attemptsResult.error.message);
        setLoading(false);
        return;
      }

      setProfile((profileResult.data as ProfileRow | null) ?? null);

      const attempts = (attemptsResult.data as AttemptRow[]) ?? [];
      const totalAttempts = attempts.length;
      const correctAttempts = attempts.filter((attempt) => attempt.is_correct).length;
      const accuracy =
        totalAttempts === 0 ? 0 : Math.round((correctAttempts / totalAttempts) * 100);
      const streak = computeStreak(attempts);

      setRecentAttempts(attempts.slice(0, 10));
      setStats({ totalAttempts, correctAttempts, accuracy, streak });
      setLoading(false);
    }

    void loadProfileAndStats();
  }, [supabase]);

  async function handleLogout() {
    setIsLoggingOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      setIsLoggingOut(false);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
        <div className="mx-auto w-full max-w-3xl">Loading profile...</div>
      </main>
    );
  }

  const displayName = profile?.username || email || "unknown user";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                Profile
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Your stats</h1>
            </div>
            {!errorMessage && (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            )}
          </div>

          {errorMessage && (
            <p className="mt-4 text-sm text-rose-700">
              {errorMessage} <Link className="underline" href="/login">Go to login</Link>
            </p>
          )}

          {!errorMessage && (
            <>
              <p className="mt-4 text-sm font-medium text-slate-800">
                You are logged in as {displayName}.
              </p>
              <p className="mt-2 text-sm text-slate-700">Email: {email || "unknown"}</p>
              <p className="mt-1 text-sm text-slate-700">
                Username: {profile?.username ?? "No profile row yet"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Profile created: {profile?.created_at ?? "-"}
              </p>
            </>
          )}
        </section>

        {!errorMessage && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold">Progress summary</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Attempts</p>
                <p className="mt-1 text-2xl font-semibold">{stats.totalAttempts}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Correct</p>
                <p className="mt-1 text-2xl font-semibold">{stats.correctAttempts}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Accuracy</p>
                <p className="mt-1 text-2xl font-semibold">{stats.accuracy}%</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Streak</p>
                <p className="mt-1 text-2xl font-semibold">{stats.streak}</p>
              </div>
            </div>
          </section>
        )}

        {!errorMessage && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold">Last 10 attempts</h2>

            {recentAttempts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-700">No attempts yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {recentAttempts.map((attempt) => (
                  <li
                    key={attempt.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        Exercise {attempt.exercise_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-slate-600">
                        {new Date(attempt.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        attempt.is_correct ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {attempt.is_correct ? "Correct" : "Incorrect"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
