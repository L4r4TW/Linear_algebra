"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteSubthemeAction,
  deleteThemeAction,
  deleteUnitAction,
  upsertSubthemeAction,
  upsertThemeAction,
  upsertUnitAction,
} from "@/app/admin/structure/actions";

type UnitItem = {
  id: string;
  slug: string;
  title: string;
  position: number;
};

type ThemeItem = {
  id: string;
  unit_id: string;
  slug: string;
  title: string;
  position: number;
};

type SubthemeItem = {
  id: string;
  theme_id: string;
  slug: string;
  title: string;
  position: number;
};

type StructureManagerProps = {
  units: UnitItem[];
  themes: ThemeItem[];
  subthemes: SubthemeItem[];
};

export function StructureManager({ units, themes, subthemes }: StructureManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const [newUnit, setNewUnit] = useState({ slug: "", title: "", position: 1 });
  const [newTheme, setNewTheme] = useState({
    unitId: units[0]?.id || "",
    slug: "",
    title: "",
    position: 1,
  });
  const [newSubtheme, setNewSubtheme] = useState({
    themeId: themes[0]?.id || "",
    slug: "",
    title: "",
    position: 1,
  });

  const [unitEdits, setUnitEdits] = useState(() =>
    Object.fromEntries(
      units.map((item) => [item.id, { slug: item.slug, title: item.title, position: item.position }])
    )
  );

  const [themeEdits, setThemeEdits] = useState(() =>
    Object.fromEntries(
      themes.map((item) => [
        item.id,
        { unitId: item.unit_id, slug: item.slug, title: item.title, position: item.position },
      ])
    )
  );

  const [subthemeEdits, setSubthemeEdits] = useState(() =>
    Object.fromEntries(
      subthemes.map((item) => [
        item.id,
        {
          themeId: item.theme_id,
          slug: item.slug,
          title: item.title,
          position: item.position,
        },
      ])
    )
  );

  const unitTitleById = useMemo(
    () => new Map(units.map((item) => [item.id, item.title])),
    [units]
  );
  const themeTitleById = useMemo(
    () => new Map(themes.map((item) => [item.id, item.title])),
    [themes]
  );

  function refreshWithMessage(text: string) {
    setMessage(text);
    router.refresh();
  }

  function handleCreateUnit() {
    startTransition(async () => {
      const result = await upsertUnitAction(newUnit);
      refreshWithMessage(result.message);
    });
  }

  function handleSaveUnit(id: string) {
    startTransition(async () => {
      const edit = unitEdits[id];
      const result = await upsertUnitAction({ id, ...edit });
      refreshWithMessage(result.message);
    });
  }

  function handleDeleteUnit(id: string) {
    if (!window.confirm("Delete this unit? Related themes/subthemes/exercises will be removed.")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteUnitAction(id);
      refreshWithMessage(result.message);
    });
  }

  function handleCreateTheme() {
    startTransition(async () => {
      const result = await upsertThemeAction(newTheme);
      refreshWithMessage(result.message);
    });
  }

  function handleSaveTheme(id: string) {
    startTransition(async () => {
      const edit = themeEdits[id];
      const result = await upsertThemeAction({ id, ...edit });
      refreshWithMessage(result.message);
    });
  }

  function handleDeleteTheme(id: string) {
    if (!window.confirm("Delete this theme? Related subthemes/exercises will be removed.")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteThemeAction(id);
      refreshWithMessage(result.message);
    });
  }

  function handleCreateSubtheme() {
    startTransition(async () => {
      const result = await upsertSubthemeAction(newSubtheme);
      refreshWithMessage(result.message);
    });
  }

  function handleSaveSubtheme(id: string) {
    startTransition(async () => {
      const edit = subthemeEdits[id];
      const result = await upsertSubthemeAction({ id, ...edit });
      refreshWithMessage(result.message);
    });
  }

  function handleDeleteSubtheme(id: string) {
    if (!window.confirm("Delete this subtheme? Related exercises will be removed.")) {
      return;
    }
    startTransition(async () => {
      const result = await deleteSubthemeAction(id);
      refreshWithMessage(result.message);
    });
  }

  return (
    <div className="space-y-6">
      {message && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px_auto]">
            <Input
              placeholder="slug"
              value={newUnit.slug}
              onChange={(e) => setNewUnit((p) => ({ ...p, slug: e.target.value }))}
            />
            <Input
              placeholder="title"
              value={newUnit.title}
              onChange={(e) => setNewUnit((p) => ({ ...p, title: e.target.value }))}
            />
            <Input
              type="number"
              min={1}
              value={newUnit.position}
              onChange={(e) => setNewUnit((p) => ({ ...p, position: Number(e.target.value) || 1 }))}
            />
            <Button type="button" onClick={handleCreateUnit} disabled={isPending}>Add unit</Button>
          </div>

          {units.map((unit) => (
            <div key={unit.id} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_120px_auto_auto]">
              <Input
                value={unitEdits[unit.id]?.slug ?? ""}
                onChange={(e) =>
                  setUnitEdits((p) => ({
                    ...p,
                    [unit.id]: { ...p[unit.id], slug: e.target.value },
                  }))
                }
              />
              <Input
                value={unitEdits[unit.id]?.title ?? ""}
                onChange={(e) =>
                  setUnitEdits((p) => ({
                    ...p,
                    [unit.id]: { ...p[unit.id], title: e.target.value },
                  }))
                }
              />
              <Input
                type="number"
                min={1}
                value={unitEdits[unit.id]?.position ?? 1}
                onChange={(e) =>
                  setUnitEdits((p) => ({
                    ...p,
                    [unit.id]: { ...p[unit.id], position: Number(e.target.value) || 1 },
                  }))
                }
              />
              <Button type="button" variant="outline" onClick={() => handleSaveUnit(unit.id)} disabled={isPending}>
                Save
              </Button>
              <Button type="button" variant="destructive" onClick={() => handleDeleteUnit(unit.id)} disabled={isPending}>
                Delete
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Themes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px_auto]">
            <select
              className="h-11 rounded-md border border-slate-300 px-3"
              value={newTheme.unitId}
              onChange={(e) => setNewTheme((p) => ({ ...p, unitId: e.target.value }))}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.title}</option>
              ))}
            </select>
            <Input
              placeholder="slug"
              value={newTheme.slug}
              onChange={(e) => setNewTheme((p) => ({ ...p, slug: e.target.value }))}
            />
            <Input
              placeholder="title"
              value={newTheme.title}
              onChange={(e) => setNewTheme((p) => ({ ...p, title: e.target.value }))}
            />
            <Input
              type="number"
              min={1}
              value={newTheme.position}
              onChange={(e) => setNewTheme((p) => ({ ...p, position: Number(e.target.value) || 1 }))}
            />
            <Button type="button" onClick={handleCreateTheme} disabled={isPending}>Add theme</Button>
          </div>

          {themes.map((theme) => (
            <div key={theme.id} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_1fr_120px_auto_auto]">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Unit</Label>
                <select
                  className="h-11 w-full rounded-md border border-slate-300 px-3"
                  value={themeEdits[theme.id]?.unitId ?? ""}
                  onChange={(e) =>
                    setThemeEdits((p) => ({
                      ...p,
                      [theme.id]: { ...p[theme.id], unitId: e.target.value },
                    }))
                  }
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.title}</option>
                  ))}
                </select>
              </div>
              <Input
                value={themeEdits[theme.id]?.slug ?? ""}
                onChange={(e) =>
                  setThemeEdits((p) => ({
                    ...p,
                    [theme.id]: { ...p[theme.id], slug: e.target.value },
                  }))
                }
              />
              <Input
                value={themeEdits[theme.id]?.title ?? ""}
                onChange={(e) =>
                  setThemeEdits((p) => ({
                    ...p,
                    [theme.id]: { ...p[theme.id], title: e.target.value },
                  }))
                }
              />
              <Input
                type="number"
                min={1}
                value={themeEdits[theme.id]?.position ?? 1}
                onChange={(e) =>
                  setThemeEdits((p) => ({
                    ...p,
                    [theme.id]: { ...p[theme.id], position: Number(e.target.value) || 1 },
                  }))
                }
              />
              <Button type="button" variant="outline" onClick={() => handleSaveTheme(theme.id)} disabled={isPending}>
                Save
              </Button>
              <Button type="button" variant="destructive" onClick={() => handleDeleteTheme(theme.id)} disabled={isPending}>
                Delete
              </Button>
              <p className="text-xs text-slate-500 md:col-span-6">
                Current unit: {unitTitleById.get(theme.unit_id) ?? "Unknown"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subthemes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_120px_auto]">
            <select
              className="h-11 rounded-md border border-slate-300 px-3"
              value={newSubtheme.themeId}
              onChange={(e) => setNewSubtheme((p) => ({ ...p, themeId: e.target.value }))}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.title}</option>
              ))}
            </select>
            <Input
              placeholder="slug"
              value={newSubtheme.slug}
              onChange={(e) => setNewSubtheme((p) => ({ ...p, slug: e.target.value }))}
            />
            <Input
              placeholder="title"
              value={newSubtheme.title}
              onChange={(e) => setNewSubtheme((p) => ({ ...p, title: e.target.value }))}
            />
            <Input
              type="number"
              min={1}
              value={newSubtheme.position}
              onChange={(e) => setNewSubtheme((p) => ({ ...p, position: Number(e.target.value) || 1 }))}
            />
            <Button type="button" onClick={handleCreateSubtheme} disabled={isPending}>Add subtheme</Button>
          </div>

          {subthemes.map((subtheme) => (
            <div key={subtheme.id} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_1fr_120px_auto_auto]">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Theme</Label>
                <select
                  className="h-11 w-full rounded-md border border-slate-300 px-3"
                  value={subthemeEdits[subtheme.id]?.themeId ?? ""}
                  onChange={(e) =>
                    setSubthemeEdits((p) => ({
                      ...p,
                      [subtheme.id]: { ...p[subtheme.id], themeId: e.target.value },
                    }))
                  }
                >
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.title}</option>
                  ))}
                </select>
              </div>
              <Input
                value={subthemeEdits[subtheme.id]?.slug ?? ""}
                onChange={(e) =>
                  setSubthemeEdits((p) => ({
                    ...p,
                    [subtheme.id]: { ...p[subtheme.id], slug: e.target.value },
                  }))
                }
              />
              <Input
                value={subthemeEdits[subtheme.id]?.title ?? ""}
                onChange={(e) =>
                  setSubthemeEdits((p) => ({
                    ...p,
                    [subtheme.id]: { ...p[subtheme.id], title: e.target.value },
                  }))
                }
              />
              <Input
                type="number"
                min={1}
                value={subthemeEdits[subtheme.id]?.position ?? 1}
                onChange={(e) =>
                  setSubthemeEdits((p) => ({
                    ...p,
                    [subtheme.id]: { ...p[subtheme.id], position: Number(e.target.value) || 1 },
                  }))
                }
              />
              <Button type="button" variant="outline" onClick={() => handleSaveSubtheme(subtheme.id)} disabled={isPending}>
                Save
              </Button>
              <Button type="button" variant="destructive" onClick={() => handleDeleteSubtheme(subtheme.id)} disabled={isPending}>
                Delete
              </Button>
              <p className="text-xs text-slate-500 md:col-span-6">
                Current theme: {themeTitleById.get(subtheme.theme_id) ?? "Unknown"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
