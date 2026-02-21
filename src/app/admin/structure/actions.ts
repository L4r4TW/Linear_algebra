"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = {
  ok: boolean;
  message: string;
  id?: string;
};

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only");

const unitSchema = z.object({
  id: z.string().uuid().optional(),
  slug: slugSchema,
  title: z.string().trim().min(2).max(120),
  position: z.coerce.number().int().min(1),
});

const themeSchema = z.object({
  id: z.string().uuid().optional(),
  unitId: z.string().uuid(),
  slug: slugSchema,
  title: z.string().trim().min(2).max(120),
  position: z.coerce.number().int().min(1),
});

const subthemeSchema = z.object({
  id: z.string().uuid().optional(),
  themeId: z.string().uuid(),
  slug: slugSchema,
  title: z.string().trim().min(2).max(120),
  position: z.coerce.number().int().min(1),
});

async function assertAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be logged in");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    throw new Error("Admin access required");
  }

  return supabase;
}

function firstZodError(error: z.ZodError) {
  const first = Object.values(error.flatten().fieldErrors).flat().find(Boolean);
  return first || "Invalid input";
}

export async function upsertUnitAction(raw: unknown): Promise<ActionResult> {
  const parsed = unitSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: firstZodError(parsed.error) };
  }

  try {
    const supabase = await assertAdmin();

    if (parsed.data.id) {
      const { data, error } = await supabase
        .from("units")
        .update({
          slug: parsed.data.slug,
          title: parsed.data.title,
          position: parsed.data.position,
        })
        .eq("id", parsed.data.id)
        .select("id")
        .single();

      if (error || !data) {
        return { ok: false, message: error?.message || "Update failed" };
      }

      return { ok: true, message: "Unit updated", id: data.id };
    }

    const { data, error } = await supabase
      .from("units")
      .insert({
        slug: parsed.data.slug,
        title: parsed.data.title,
        position: parsed.data.position,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, message: error?.message || "Create failed" };
    }

    return { ok: true, message: "Unit created", id: data.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteUnitAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const { error } = await supabase.from("units").delete().eq("id", id);
    if (error) {
      return { ok: false, message: error.message || "Delete failed" };
    }
    return { ok: true, message: "Unit deleted", id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function upsertThemeAction(raw: unknown): Promise<ActionResult> {
  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: firstZodError(parsed.error) };
  }

  try {
    const supabase = await assertAdmin();

    if (parsed.data.id) {
      const { data, error } = await supabase
        .from("themes")
        .update({
          unit_id: parsed.data.unitId,
          slug: parsed.data.slug,
          title: parsed.data.title,
          position: parsed.data.position,
        })
        .eq("id", parsed.data.id)
        .select("id")
        .single();

      if (error || !data) {
        return { ok: false, message: error?.message || "Update failed" };
      }

      return { ok: true, message: "Theme updated", id: data.id };
    }

    const { data, error } = await supabase
      .from("themes")
      .insert({
        unit_id: parsed.data.unitId,
        slug: parsed.data.slug,
        title: parsed.data.title,
        position: parsed.data.position,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, message: error?.message || "Create failed" };
    }

    return { ok: true, message: "Theme created", id: data.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteThemeAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const { error } = await supabase.from("themes").delete().eq("id", id);
    if (error) {
      return { ok: false, message: error.message || "Delete failed" };
    }
    return { ok: true, message: "Theme deleted", id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function upsertSubthemeAction(raw: unknown): Promise<ActionResult> {
  const parsed = subthemeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: firstZodError(parsed.error) };
  }

  try {
    const supabase = await assertAdmin();

    if (parsed.data.id) {
      const { data, error } = await supabase
        .from("subthemes")
        .update({
          theme_id: parsed.data.themeId,
          slug: parsed.data.slug,
          title: parsed.data.title,
          position: parsed.data.position,
        })
        .eq("id", parsed.data.id)
        .select("id")
        .single();

      if (error || !data) {
        return { ok: false, message: error?.message || "Update failed" };
      }

      return { ok: true, message: "Subtheme updated", id: data.id };
    }

    const { data, error } = await supabase
      .from("subthemes")
      .insert({
        theme_id: parsed.data.themeId,
        slug: parsed.data.slug,
        title: parsed.data.title,
        position: parsed.data.position,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, message: error?.message || "Create failed" };
    }

    return { ok: true, message: "Subtheme created", id: data.id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteSubthemeAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const { error } = await supabase.from("subthemes").delete().eq("id", id);
    if (error) {
      return { ok: false, message: error.message || "Delete failed" };
    }
    return { ok: true, message: "Subtheme deleted", id };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}
