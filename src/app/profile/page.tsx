"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Stats = {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
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

export default function ProfilePage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalAttempts: 0,
    correctAttempts: 0,
    accuracy: 0,
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
          .eq("user_id", user.id),
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

      setStats({ totalAttempts, correctAttempts, accuracy });
      setLoading(false);
    }

    void loadProfileAndStats();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
        <div className="mx-auto w-full max-w-3xl">Loading profile...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Your stats</h1>

          {errorMessage && (
            <p className="mt-4 text-sm text-rose-700">
              {errorMessage} <Link className="underline" href="/login">Go to login</Link>
            </p>
          )}

          {!errorMessage && (
            <>
              <p className="mt-3 text-sm text-slate-700">Email: {email || "unknown"}</p>
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
            <h2 className="text-xl font-semibold">Attempt summary</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
