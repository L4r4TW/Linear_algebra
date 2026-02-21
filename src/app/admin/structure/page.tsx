import Link from "next/link";
import { redirect } from "next/navigation";
import { StructureManager } from "@/components/admin/structure-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ProfileRole = "student" | "admin";

type UnitRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
};

type ThemeRow = {
  id: string;
  unit_id: string;
  slug: string;
  title: string;
  position: number;
};

type SubthemeRow = {
  id: string;
  theme_id: string;
  slug: string;
  title: string;
  position: number;
};

export default async function AdminStructurePage() {
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

  const [{ data: units }, { data: themes }, { data: subthemes }] = await Promise.all([
    supabase
      .from("units")
      .select("id, slug, title, position")
      .order("position", { ascending: true }),
    supabase
      .from("themes")
      .select("id, unit_id, slug, title, position")
      .order("position", { ascending: true }),
    supabase
      .from("subthemes")
      .select("id, theme_id, slug, title, position")
      .order("position", { ascending: true }),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
              Admin
            </p>
            <h1 className="text-3xl font-semibold">Structure Management</h1>
            <p className="mt-2 text-sm text-slate-600">
              Add, edit, and delete units, themes, and subthemes.
            </p>
          </div>
          <Link href="/admin/exercises" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            Go to Exercise Admin
          </Link>
        </div>

        <StructureManager
          units={(units as UnitRow[]) ?? []}
          themes={(themes as ThemeRow[]) ?? []}
          subthemes={(subthemes as SubthemeRow[]) ?? []}
        />
      </div>
    </main>
  );
}
