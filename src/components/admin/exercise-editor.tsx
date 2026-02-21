"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/admin/markdown-preview";
import {
  exerciseEditorSchema,
  type ExerciseEditorInput,
} from "@/lib/validation/exercise";
import {
  autosaveDraftAction,
  deleteExerciseAction,
  publishExerciseAction,
  upsertExerciseAction,
} from "@/app/admin/exercises/actions";

type SubthemeOption = {
  id: string;
  title: string;
  themeTitle: string;
};

type ExistingExercise = {
  id: string;
  status: "draft" | "published";
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

type ExerciseEditorProps = {
  subthemes: SubthemeOption[];
  existingExercises: ExistingExercise[];
};

function toJsonString(value: unknown): string {
  if (!value) {
    return "[]";
  }
  return JSON.stringify(value, null, 2);
}

function promptPreview(promptMd: string): string {
  const normalized = (promptMd || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No prompt yet";
  }
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
}

export function ExerciseEditor({
  subthemes,
  existingExercises,
}: ExerciseEditorProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>("");
  const [serverMessage, setServerMessage] = useState<string>("");
  const [activePane, setActivePane] = useState<"editor" | "preview">("editor");
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<ExerciseEditorInput>({
    resolver: zodResolver(exerciseEditorSchema),
    defaultValues: {
      id: undefined,
      subthemeId: subthemes[0]?.id || "",
      type: "short_answer",
      difficulty: 1,
      status: "draft",
      promptMd: "",
      solutionMd: "",
      choicesJson: "[]",
      hintsJson: "[]",
      tagsJson: "[]",
    },
    mode: "onChange",
  });

  const watchedValues = useWatch({ control: form.control });
  const watchedPrompt = useWatch({ control: form.control, name: "promptMd" });
  const watchedSolution = useWatch({ control: form.control, name: "solutionMd" });

  const selectedExercise = useMemo(
    () => existingExercises.find((item) => item.id === selectedId),
    [existingExercises, selectedId]
  );

  const subthemeTitleById = useMemo(
    () => new Map(subthemes.map((item) => [item.id, item.title])),
    [subthemes]
  );

  useEffect(() => {
    if (!selectedExercise) {
      return;
    }

    form.reset({
      id: selectedExercise.id,
      subthemeId: selectedExercise.subtheme_id,
      type: selectedExercise.type,
      difficulty: selectedExercise.difficulty,
      status: selectedExercise.status,
      promptMd: selectedExercise.prompt_md,
      solutionMd: selectedExercise.solution_md,
      choicesJson: toJsonString(selectedExercise.choices),
      hintsJson: toJsonString(selectedExercise.hints),
      tagsJson: toJsonString(selectedExercise.tags),
    });
  }, [form, selectedExercise]);

  useEffect(() => {
    if (!form.formState.isDirty) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      const values = watchedValues as ExerciseEditorInput;
      const promptOk = (values.promptMd ?? "").trim().length >= 3;
      const solutionOk = (values.solutionMd ?? "").trim().length >= 3;

      if (!promptOk || !solutionOk) {
        return;
      }

      startTransition(async () => {
        const result = await autosaveDraftAction(values);
        setServerMessage(result.message);
        if (result.ok && result.id && !(watchedValues as ExerciseEditorInput).id) {
          form.setValue("id", result.id);
          setSelectedId(result.id);
          router.refresh();
        }
      });
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [form, router, watchedValues]);

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await upsertExerciseAction(values);
      setServerMessage(result.message);
      if (result.ok && result.id) {
        form.setValue("id", result.id);
        setSelectedId(result.id);
        router.refresh();
      }
    });
  });

  const handlePublish = () => {
    const currentId = form.getValues("id");
    if (!currentId) {
      setServerMessage("Save draft first before publishing.");
      return;
    }

    startTransition(async () => {
      const result = await publishExerciseAction(currentId);
      setServerMessage(result.message);
      if (result.ok) {
        form.setValue("status", "published");
        router.refresh();
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this exercise? This action cannot be undone.")) {
      return;
    }

    startTransition(async () => {
      const result = await deleteExerciseAction(id);
      setServerMessage(result.message);
      if (result.ok) {
        if (selectedId === id) {
          setSelectedId("");
          form.reset({
            id: undefined,
            subthemeId: subthemes[0]?.id || "",
            type: "short_answer",
            difficulty: 1,
            status: "draft",
            promptMd: "",
            solutionMd: "",
            choicesJson: "[]",
            hintsJson: "[]",
            tagsJson: "[]",
          });
        }
        router.refresh();
      }
    });
  };

  const handleNew = () => {
    setSelectedId("");
    form.reset({
      id: undefined,
      subthemeId: subthemes[0]?.id || "",
      type: "short_answer",
      difficulty: 1,
      status: "draft",
      promptMd: "",
      solutionMd: "",
      choicesJson: "[]",
      hintsJson: "[]",
      tagsJson: "[]",
    });
    setServerMessage("New draft");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" variant="secondary" className="w-full" onClick={handleNew}>
            New Exercise
          </Button>
          <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {existingExercises.map((exercise) => (
              <div
                key={exercise.id}
                className={`rounded-lg border p-3 ${
                  selectedId === exercise.id
                    ? "border-slate-900 bg-slate-100"
                    : "border-slate-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(exercise.id)}
                  className="w-full text-left"
                >
                  <p className="font-medium">{subthemeTitleById.get(exercise.subtheme_id) ?? "Unknown subtheme"}</p>
                  <p className="mt-1 text-sm text-slate-700">{promptPreview(exercise.prompt_md)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge variant={exercise.status === "published" ? "success" : "secondary"}>
                      {exercise.status}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {new Date(exercise.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              </div>
            ))}
            {existingExercises.length === 0 && (
              <p className="text-sm text-slate-600">No exercises yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Editor</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={activePane === "editor" ? "default" : "outline"}
              size="sm"
              onClick={() => setActivePane("editor")}
            >
              Editor
            </Button>
            <Button
              type="button"
              variant={activePane === "preview" ? "default" : "outline"}
              size="sm"
              onClick={() => setActivePane("preview")}
            >
              Preview
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {serverMessage && (
            <p className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {serverMessage}
            </p>
          )}

          {activePane === "editor" ? (
            <form onSubmit={onSubmit} className="space-y-5">
              <input type="hidden" {...form.register("id")} />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="subthemeId">Subtheme</Label>
                  <select
                    id="subthemeId"
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                    {...form.register("subthemeId")}
                  >
                    {subthemes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.themeTitle} / {item.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-rose-700">{form.formState.errors.subthemeId?.message}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Input id="type" {...form.register("type")} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty (1-5)</Label>
                  <Input id="difficulty" type="number" min={1} max={5} {...form.register("difficulty")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                    {...form.register("status")}
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promptMd">Prompt (Markdown + LaTeX)</Label>
                <Textarea id="promptMd" rows={8} {...form.register("promptMd")} />
                <p className="text-xs text-rose-700">{form.formState.errors.promptMd?.message}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="solutionMd">Solution (Markdown + LaTeX)</Label>
                <Textarea id="solutionMd" rows={8} {...form.register("solutionMd")} />
                <p className="text-xs text-rose-700">{form.formState.errors.solutionMd?.message}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="choicesJson">Choices JSON</Label>
                  <Textarea id="choicesJson" rows={5} {...form.register("choicesJson")} />
                  <p className="text-xs text-rose-700">{form.formState.errors.choicesJson?.message}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hintsJson">Hints JSON</Label>
                  <Textarea id="hintsJson" rows={5} {...form.register("hintsJson")} />
                  <p className="text-xs text-rose-700">{form.formState.errors.hintsJson?.message}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tagsJson">Tags JSON</Label>
                  <Textarea id="tagsJson" rows={5} {...form.register("tagsJson")} />
                  <p className="text-xs text-rose-700">{form.formState.errors.tagsJson?.message}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isPending}>
                  Save
                </Button>
                <Button type="button" variant="outline" onClick={handlePublish} disabled={isPending}>
                  Publish
                </Button>
                {form.getValues("id") && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDelete(form.getValues("id") || "")}
                    disabled={isPending}
                  >
                    Delete
                  </Button>
                )}
                {isPending && <span className="text-sm text-slate-600">Working...</span>}
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Prompt preview</p>
                <MarkdownPreview markdown={watchedPrompt || ""} />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Solution preview</p>
                <MarkdownPreview markdown={watchedSolution || ""} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
