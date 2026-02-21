import { redirect } from "next/navigation";
import { ExerciseEditor } from "@/components/admin/exercise-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRole = "student" | "admin";

type AdminExerciseRow = {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  subtheme_id: string;
  type: string;
  difficulty: number;
  prompt_md: string;
  solution_md: string;
  choices: unknown;
  hints: unknown;
  tags: unknown;
  updated_at: string;
};

export default async function AdminExercisesPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role as ProfileRole) !== "admin") {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <div className="mx-auto w-full max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>Admin access required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">
                Your profile role is not <code>admin</code>. Set your row in
                <code>profiles.role</code> to <code>admin</code> to access this panel.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const [{ data: subthemes }, { data: themes }, { data: exercises }] = await Promise.all([
    supabase
      .from("subthemes")
      .select("id, title, theme_id, position")
      .order("position", { ascending: true }),
    supabase.from("themes").select("id, title"),
    supabase
      .from("exercises")
      .select(
        "id, title, status, subtheme_id, type, difficulty, prompt_md, solution_md, choices, hints, tags, updated_at"
      )
      .order("updated_at", { ascending: false }),
  ]);

  const themeTitleById = new Map((themes ?? []).map((item) => [item.id, item.title]));

  const subthemeOptions = (subthemes ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    themeTitle: themeTitleById.get(item.theme_id) ?? "Unknown theme",
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            Admin
          </p>
          <h1 className="text-3xl font-semibold">Exercise Management</h1>
          <p className="mt-2 text-sm text-slate-600">
            Draft and publish exercises with markdown + LaTeX, metadata, and live preview.
          </p>
        </div>

        <ExerciseEditor
          subthemes={subthemeOptions}
          existingExercises={(exercises as AdminExerciseRow[]) ?? []}
        />
      </div>
    </main>
  );
}
