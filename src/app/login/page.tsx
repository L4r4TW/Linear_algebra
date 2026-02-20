"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const authCall =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error } = await authCall;
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (mode === "signup") {
      setMessage(
        "Sign-up succeeded. If email confirmation is enabled, confirm your email then log in."
      );
      return;
    }

    setMessage("Logged in successfully.");
    router.push("/profile");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-14 text-slate-900">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Account
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Login</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use email and password to continue. New users can sign up here.
        </p>

        <div className="mt-6 flex gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === "login" ? "bg-white shadow-sm" : "text-slate-600"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === "signup" ? "bg-white shadow-sm" : "text-slate-600"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? "Working..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>

        {errorMessage && <p className="mt-4 text-sm text-rose-700">{errorMessage}</p>}
        {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}

        <p className="mt-6 text-sm text-slate-600">
          Back to <Link className="underline" href="/">home</Link>
        </p>
      </div>
    </main>
  );
}
