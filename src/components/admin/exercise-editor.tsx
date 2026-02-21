"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownPreview } from "@/components/admin/markdown-preview";
import { VectorPlane } from "@/components/admin/vector-plane";
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

function parseGraphCoords(value: unknown): { x: number; y: number } {
  let source: unknown = value;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) {
      return { x: 0, y: 0 };
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return { x: 0, y: 0 };
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { x: 0, y: 0 };
  }

  const record = source as Record<string, unknown>;
  const maybeCoords = Array.isArray(record.vectorEnd)
    ? record.vectorEnd
    : Array.isArray(record.target)
      ? record.target
      : null;
  if (!maybeCoords || maybeCoords.length < 2) {
    return { x: 0, y: 0 };
  }

  const x = Number(maybeCoords[0]);
  const y = Number(maybeCoords[1]);
  return {
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0,
  };
}

function parseMultipleChoiceConfig(value: unknown): {
  options: [string, string, string, string];
  correct: "a" | "b" | "c" | "d";
} {
  let source: unknown = value;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) {
      return { options: ["", "", "", ""], correct: "a" };
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return { options: ["", "", "", ""], correct: "a" };
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { options: ["", "", "", ""], correct: "a" };
  }

  const optionsMap: Record<"a" | "b" | "c" | "d", string> = {
    a: "",
    b: "",
    c: "",
    d: "",
  };

  const rawOptions = (source as Record<string, unknown>).options;
  if (Array.isArray(rawOptions)) {
    rawOptions.forEach((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return;
      }
      const id = (item as Record<string, unknown>).id;
      const text = (item as Record<string, unknown>).text;
      if (
        (id === "a" || id === "b" || id === "c" || id === "d") &&
        typeof text === "string"
      ) {
        optionsMap[id] = text;
      }
    });
  }

  const rawCorrect = (source as Record<string, unknown>).correctOption;
  const correct =
    rawCorrect === "a" || rawCorrect === "b" || rawCorrect === "c" || rawCorrect === "d"
      ? rawCorrect
      : "a";

  return {
    options: [optionsMap.a, optionsMap.b, optionsMap.c, optionsMap.d],
    correct,
  };
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
  const watchedType = useWatch({ control: form.control, name: "type" });
  const watchedChoices = useWatch({ control: form.control, name: "choicesJson" });

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
      type:
        selectedExercise.type === "multiple_choice"
          ? "single_choice"
          : selectedExercise.type,
      difficulty: selectedExercise.difficulty,
      status: selectedExercise.status,
      promptMd: selectedExercise.prompt_md,
      solutionMd: selectedExercise.solution_md,
      choicesJson: toJsonString(selectedExercise.choices),
      hintsJson: toJsonString(selectedExercise.hints),
      tagsJson: toJsonString(selectedExercise.tags),
    });
  }, [form, selectedExercise]);

  const { x: graphX, y: graphY } = useMemo(
    () => parseGraphCoords(watchedChoices),
    [watchedChoices]
  );
  const { options: mcOptions, correct: mcCorrect } = useMemo(
    () => parseMultipleChoiceConfig(watchedChoices),
    [watchedChoices]
  );

  function applyGraphCoords(next: { x: number; y: number }) {
    if (watchedType === "vector_xy_from_graph") {
      const nextConfig = {
        kind: "vector_xy_from_graph",
        grid: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 1 },
        origin: [0, 0],
        vectorEnd: [next.x, next.y],
      };
      form.setValue("choicesJson", JSON.stringify(nextConfig, null, 2), {
        shouldDirty: true,
      });

      if (!form.getValues("promptMd").trim()) {
        form.setValue(
          "promptMd",
          "Read the vector coordinates from the graph and enter them as (X, Y).",
          { shouldDirty: true }
        );
      }
    }

    if (watchedType === "point_plot_from_coordinates") {
      const nextConfig = {
        kind: "point_plot_from_coordinates",
        grid: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 1 },
        target: [next.x, next.y],
      };
      form.setValue("choicesJson", JSON.stringify(nextConfig, null, 2), {
        shouldDirty: true,
      });

      if (!form.getValues("promptMd").trim()) {
        form.setValue(
          "promptMd",
          `Plot the point (${next.x}, ${next.y}) on the coordinate system.`,
          { shouldDirty: true }
        );
      }
    }

    form.setValue("solutionMd", `(${next.x}, ${next.y})`, { shouldDirty: true });
  }

  const applyMultipleChoiceConfig = useCallback(function applyMultipleChoiceConfig(
    nextOptions: [string, string, string, string],
    nextCorrect: "a" | "b" | "c" | "d"
  ) {
    const config = {
      kind: "single_choice",
      options: [
        { id: "a", text: nextOptions[0] },
        { id: "b", text: nextOptions[1] },
        { id: "c", text: nextOptions[2] },
        { id: "d", text: nextOptions[3] },
      ],
      correctOption: nextCorrect,
    };
    form.setValue("choicesJson", JSON.stringify(config, null, 2), {
      shouldDirty: true,
    });

    if (!form.getValues("promptMd").trim()) {
      form.setValue(
        "promptMd",
        "Choose the correct answer.",
        { shouldDirty: true }
      );
    }

    form.setValue("solutionMd", nextCorrect, { shouldDirty: true });
  }, [form]);

  useEffect(() => {
    if (watchedType !== "single_choice" && watchedType !== "multiple_choice") {
      return;
    }

    const rawChoices = String(form.getValues("choicesJson") ?? "").trim();
    const current = parseMultipleChoiceConfig(form.getValues("choicesJson"));

    if (!rawChoices || rawChoices === "[]") {
      applyMultipleChoiceConfig(current.options, current.correct);
      return;
    }

    if (!String(form.getValues("solutionMd") ?? "").trim()) {
      form.setValue("solutionMd", current.correct, { shouldDirty: true });
    }
  }, [applyMultipleChoiceConfig, form, watchedType]);

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
      const solutionOk = (values.solutionMd ?? "").trim().length >= 1;

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
                  <select
                    id="type"
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                    {...form.register("type")}
                  >
                    <option value="short_answer">short_answer</option>
                    <option value="vector_xy_from_graph">vector_xy_from_graph</option>
                    <option value="point_plot_from_coordinates">
                      point_plot_from_coordinates
                    </option>
                    <option value="single_choice">single_choice</option>
                  </select>
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

              {watchedType !== "single_choice" && watchedType !== "multiple_choice" && (
                <div className="space-y-2">
                  <Label htmlFor="solutionMd">Solution (Markdown + LaTeX)</Label>
                  <Textarea id="solutionMd" rows={8} {...form.register("solutionMd")} />
                  <p className="text-xs text-rose-700">{form.formState.errors.solutionMd?.message}</p>
                </div>
              )}

              {watchedType === "vector_xy_from_graph" && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Vector graph editor</p>
                  <p className="text-sm text-slate-600">
                    Drag the vector endpoint on the grid. It updates the expected answer automatically.
                  </p>
                  <VectorPlane
                    x={graphX}
                    y={graphY}
                    interactive
                    onChange={(next) => applyGraphCoords(next)}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="vectorX">Vector X</Label>
                      <Input
                        id="vectorX"
                        type="number"
                        value={graphX}
                        onChange={(event) =>
                          applyGraphCoords({
                            x: Number(event.target.value) || 0,
                            y: graphY,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vectorY">Vector Y</Label>
                      <Input
                        id="vectorY"
                        type="number"
                        value={graphY}
                        onChange={(event) =>
                          applyGraphCoords({
                            x: graphX,
                            y: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {watchedType === "point_plot_from_coordinates" && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Point target editor</p>
                  <p className="text-sm text-slate-600">
                    Set the target point that users will have to plot on the grid.
                  </p>
                  <VectorPlane
                    x={graphX}
                    y={graphY}
                    mode="point"
                    interactive
                    onChange={(next) => applyGraphCoords(next)}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pointX">Point X</Label>
                      <Input
                        id="pointX"
                        type="number"
                        value={graphX}
                        onChange={(event) =>
                          applyGraphCoords({
                            x: Number(event.target.value) || 0,
                            y: graphY,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pointY">Point Y</Label>
                      <Input
                        id="pointY"
                        type="number"
                        value={graphY}
                        onChange={(event) =>
                          applyGraphCoords({
                            x: graphX,
                            y: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {(watchedType === "single_choice" || watchedType === "multiple_choice") && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Multiple choice editor
                  </p>
                  <div className="grid gap-3">
                    {(["a", "b", "c", "d"] as const).map((id, idx) => (
                      <div key={id} className="space-y-1">
                        <Label htmlFor={`choice-${id}`}>Option {id.toUpperCase()}</Label>
                        <Input
                          id={`choice-${id}`}
                          value={mcOptions[idx]}
                          onChange={(event) => {
                            const next = [...mcOptions] as [
                              string,
                              string,
                              string,
                              string,
                            ];
                            next[idx] = event.target.value;
                            applyMultipleChoiceConfig(next, mcCorrect);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mc-correct">Correct option</Label>
                    <select
                      id="mc-correct"
                      className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                      value={mcCorrect}
                      onChange={(event) =>
                        applyMultipleChoiceConfig(
                          mcOptions,
                          event.target.value as "a" | "b" | "c" | "d"
                        )
                      }
                    >
                      <option value="a">A</option>
                      <option value="b">B</option>
                      <option value="c">C</option>
                      <option value="d">D</option>
                    </select>
                  </div>
                </div>
              )}

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
              {watchedType === "vector_xy_from_graph" && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Graph preview</p>
                  <VectorPlane x={graphX} y={graphY} />
                </div>
              )}
              {watchedType === "point_plot_from_coordinates" && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Graph preview</p>
                  <VectorPlane x={graphX} y={graphY} mode="point" />
                </div>
              )}
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
