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
import {
  MultiVectorPlane,
  type PlaneVector,
} from "@/components/admin/multi-vector-plane";
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

type EqualVectorsConfig = {
  vectors: PlaneVector[];
  correctIds: string[];
};

type PointPlotVectorsConfig = {
  vectors: PlaneVector[];
};

type MultiPartPartType =
  | "short_answer"
  | "single_choice"
  | "multi_select"
  | "open_text"
  | "vector_xy_from_graph"
  | "point_plot_from_coordinates";

type MultiPartPart = {
  id: string;
  type: MultiPartPartType;
  prompt: string;
  correctText?: string;
  options?: [string, string, string, string];
  correctOption?: "a" | "b" | "c" | "d";
  correctOptions?: Array<"a" | "b" | "c" | "d">;
  coord?: { x: number; y: number };
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

function parsePointPlotVectorsConfig(value: unknown): PointPlotVectorsConfig {
  const fallback: PointPlotVectorsConfig = {
    vectors: [{ id: "a", color: "#3b82f6", start: [0, 0], end: [2, 1] }],
  };

  let source: unknown = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed || trimmed === "[]") {
      return fallback;
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return fallback;
  }

  const row = source as Record<string, unknown>;
  const rawVectors = row.vectors;
  if (!Array.isArray(rawVectors) || rawVectors.length === 0) {
    const rawTarget = Array.isArray(row.target) ? row.target : [2, 1];
    return {
      vectors: [
        {
          id: "a",
          color: "#3b82f6",
          start: [0, 0],
          end: [Number(rawTarget[0] ?? 0) || 0, Number(rawTarget[1] ?? 0) || 0],
        },
      ],
    };
  }

  const vectors = rawVectors
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const vector = item as Record<string, unknown>;
      const id =
        typeof vector.id === "string" && vector.id.trim()
          ? vector.id.trim().toLowerCase()
          : String.fromCharCode(97 + index);
      const color =
        typeof vector.color === "string" && vector.color.trim()
          ? vector.color
          : ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"][
              index % 6
            ];
      const maybeTarget = Array.isArray(vector.target)
        ? vector.target
        : Array.isArray(vector.end)
          ? vector.end
          : [0, 0];
      return {
        id,
        color,
        start: [0, 0] as [number, number],
        end: [Number(maybeTarget[0] ?? 0) || 0, Number(maybeTarget[1] ?? 0) || 0] as [
          number,
          number,
        ],
      };
    })
    .filter(Boolean) as PlaneVector[];

  return vectors.length > 0 ? { vectors } : fallback;
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

function parseMultiSelectConfig(value: unknown): {
  options: [string, string, string, string];
  correct: Array<"a" | "b" | "c" | "d">;
} {
  let source: unknown = value;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) {
      return { options: ["", "", "", ""], correct: ["a"] };
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return { options: ["", "", "", ""], correct: ["a"] };
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { options: ["", "", "", ""], correct: ["a"] };
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

  const rawCorrect = (source as Record<string, unknown>).correctOptions;
  const correct = Array.isArray(rawCorrect)
    ? [
        ...new Set(
          rawCorrect.filter(
            (id): id is "a" | "b" | "c" | "d" =>
              id === "a" || id === "b" || id === "c" || id === "d"
          )
        ),
      ]
    : [];

  return {
    options: [optionsMap.a, optionsMap.b, optionsMap.c, optionsMap.d],
    correct: correct.length > 0 ? correct : ["a"],
  };
}

function parseEqualVectorsConfig(value: unknown): EqualVectorsConfig {
  const fallback: EqualVectorsConfig = {
    vectors: [
      { id: "a", color: "#ef4444", start: [0, 0], end: [3, 2] },
      { id: "b", color: "#3b82f6", start: [2, -1], end: [5, 1] },
      { id: "c", color: "#10b981", start: [-3, 0], end: [0, 2] },
      { id: "d", color: "#f59e0b", start: [1, 3], end: [4, 5] },
    ],
    correctIds: ["a", "b"],
  };

  let source: unknown = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed || trimmed === "[]") {
      return fallback;
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return fallback;
  }

  const rawVectors = (source as Record<string, unknown>).vectors;
  if (!Array.isArray(rawVectors) || rawVectors.length < 2) {
    return fallback;
  }

  const vectors = rawVectors
    .map((vector, index) => {
      if (!vector || typeof vector !== "object" || Array.isArray(vector)) {
        return null;
      }
      const row = vector as Record<string, unknown>;
      const id =
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim().toLowerCase()
          : String.fromCharCode(97 + index);
      const color =
        typeof row.color === "string" && row.color.trim()
          ? row.color
          : "#0f766e";
      const start = Array.isArray(row.start) ? row.start : [0, 0];
      const end = Array.isArray(row.end) ? row.end : [0, 0];
      return {
        id,
        color,
        start: [Number(start[0] ?? 0), Number(start[1] ?? 0)] as [number, number],
        end: [Number(end[0] ?? 0), Number(end[1] ?? 0)] as [number, number],
      };
    })
    .filter(Boolean) as PlaneVector[];

  if (vectors.length < 2) {
    return fallback;
  }

  const ids = new Set(vectors.map((vector) => vector.id));
  const rawCorrectIds = (source as Record<string, unknown>).correctIds;
  const correctIds = Array.isArray(rawCorrectIds)
    ? rawCorrectIds
        .map((id) => (typeof id === "string" ? id : ""))
        .filter((id) => ids.has(id))
    : [];

  return {
    vectors,
    correctIds,
  };
}

function parseMultiPartConfig(value: unknown): MultiPartPart[] {
  const fallback: MultiPartPart[] = [
    {
      id: "part-1",
      type: "short_answer",
      prompt: "Part 1",
      correctText: "",
    },
  ];

  let source: unknown = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed || trimmed === "[]") {
      return fallback;
    }
    try {
      source = JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return fallback;
  }

  const rawParts = (source as Record<string, unknown>).parts;
  if (!Array.isArray(rawParts) || rawParts.length === 0) {
    return fallback;
  }

  const parsed = rawParts
    .map((rawPart, idx): MultiPartPart | null => {
      if (!rawPart || typeof rawPart !== "object" || Array.isArray(rawPart)) {
        return null;
      }
      const row = rawPart as Record<string, unknown>;
      const id = (typeof row.id === "string" && row.id.trim()) || `part-${idx + 1}`;
      const type = row.type;
      const prompt = (typeof row.prompt === "string" && row.prompt) || `Part ${idx + 1}`;

      if (type === "single_choice") {
        const optionMap: Record<"a" | "b" | "c" | "d", string> = {
          a: "",
          b: "",
          c: "",
          d: "",
        };
        const rawOptions = row.options;
        if (Array.isArray(rawOptions)) {
          rawOptions.forEach((option) => {
            if (!option || typeof option !== "object" || Array.isArray(option)) {
              return;
            }
            const optionId = (option as Record<string, unknown>).id;
            const optionText = (option as Record<string, unknown>).text;
            if (
              (optionId === "a" || optionId === "b" || optionId === "c" || optionId === "d") &&
              typeof optionText === "string"
            ) {
              optionMap[optionId] = optionText;
            }
          });
        }
        const correctOption =
          row.correctOption === "a" ||
          row.correctOption === "b" ||
          row.correctOption === "c" ||
          row.correctOption === "d"
            ? row.correctOption
            : "a";
        return {
          id,
          type,
          prompt,
          options: [optionMap.a, optionMap.b, optionMap.c, optionMap.d],
          correctOption,
        };
      }

      if (type === "multi_select") {
        const optionMap: Record<"a" | "b" | "c" | "d", string> = {
          a: "",
          b: "",
          c: "",
          d: "",
        };
        const rawOptions = row.options;
        if (Array.isArray(rawOptions)) {
          rawOptions.forEach((option) => {
            if (!option || typeof option !== "object" || Array.isArray(option)) {
              return;
            }
            const optionId = (option as Record<string, unknown>).id;
            const optionText = (option as Record<string, unknown>).text;
            if (
              (optionId === "a" || optionId === "b" || optionId === "c" || optionId === "d") &&
              typeof optionText === "string"
            ) {
              optionMap[optionId] = optionText;
            }
          });
        }
        const rawCorrect = row.correctOptions;
        const correctOptions = Array.isArray(rawCorrect)
          ? [
              ...new Set(
                rawCorrect.filter(
                  (id): id is "a" | "b" | "c" | "d" =>
                    id === "a" || id === "b" || id === "c" || id === "d"
                )
              ),
            ]
          : [];
        return {
          id,
          type,
          prompt,
          options: [optionMap.a, optionMap.b, optionMap.c, optionMap.d],
          correctOptions: correctOptions.length > 0 ? correctOptions : ["a"],
        };
      }

      if (type === "open_text") {
        return { id, type, prompt };
      }

      if (type === "vector_xy_from_graph" || type === "point_plot_from_coordinates") {
        const x = Number(row.x ?? 0);
        const y = Number(row.y ?? 0);
        return {
          id,
          type,
          prompt,
          coord: {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
          },
        };
      }

      return {
        id,
        type: "short_answer",
        prompt,
        correctText: typeof row.correctText === "string" ? row.correctText : "",
      };
    })
    .filter(Boolean) as MultiPartPart[];

  return parsed.length > 0 ? parsed : fallback;
}

function VectorLabel({ id }: { id: string }) {
  return (
    <span className="relative inline-flex items-center px-1">
      <span className="font-semibold">{id}</span>
      <span className="absolute -top-2 left-0 h-[2px] w-full rounded bg-current" />
      <span className="absolute -top-[11px] right-[-3px] text-[10px] leading-none">▶</span>
    </span>
  );
}

export function ExerciseEditor({
  subthemes,
  existingExercises,
}: ExerciseEditorProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedVectorId, setSelectedVectorId] = useState<string>("a");
  const [selectedPointVectorId, setSelectedPointVectorId] = useState<string>("a");
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
  const { options: msOptions, correct: msCorrect } = useMemo(
    () => parseMultiSelectConfig(watchedChoices),
    [watchedChoices]
  );
  const { vectors: equalVectors, correctIds: equalCorrectIds } = useMemo(
    () => parseEqualVectorsConfig(watchedChoices),
    [watchedChoices]
  );
  const { vectors: pointPlotVectors } = useMemo(
    () => parsePointPlotVectorsConfig(watchedChoices),
    [watchedChoices]
  );
  const multiPartParts = useMemo(
    () => parseMultiPartConfig(watchedChoices),
    [watchedChoices]
  );
  const activeEqualVectorId =
    selectedVectorId && equalVectors.some((vector) => vector.id === selectedVectorId)
      ? selectedVectorId
      : equalVectors[0]?.id ?? "";
  const activePointVectorId =
    selectedPointVectorId &&
    pointPlotVectors.some((vector) => vector.id === selectedPointVectorId)
      ? selectedPointVectorId
      : pointPlotVectors[0]?.id ?? "";
  const isSingleChoiceType =
    watchedType === "single_choice" || watchedType === "multiple_choice";
  const isChoiceType = isSingleChoiceType || watchedType === "multi_select";
  const isMultiPartType = watchedType === "multi_part";

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
      form.setValue("solutionMd", `(${next.x}, ${next.y})`, { shouldDirty: true });
    }
  }

  const applyPointPlotVectorsConfig = useCallback(function applyPointPlotVectorsConfig(
    nextVectors: PlaneVector[]
  ) {
    const vectorsWithOrigin = nextVectors.map((vector) => ({
      id: vector.id,
      color: vector.color,
      start: [0, 0] as [number, number],
      end: vector.end,
    }));
    const config = {
      kind: "point_plot_from_coordinates",
      grid: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 1 },
      vectors: vectorsWithOrigin.map((vector) => ({
        id: vector.id,
        color: vector.color,
        target: [Number(vector.end[0] ?? 0), Number(vector.end[1] ?? 0)],
      })),
    };
    form.setValue("choicesJson", JSON.stringify(config, null, 2), {
      shouldDirty: true,
    });
    if (!form.getValues("promptMd").trim()) {
      form.setValue("promptMd", "Plot all required vectors on the coordinate system.", {
        shouldDirty: true,
      });
    }
    form.setValue(
      "solutionMd",
      vectorsWithOrigin
        .map((vector) => `${vector.id}: (${vector.end[0]}, ${vector.end[1]})`)
        .join(", "),
      { shouldDirty: true }
    );
  }, [form]);

  function updatePointPlotVector(
    id: string,
    next: { start?: [number, number]; end?: [number, number] }
  ) {
    const nextVectors = pointPlotVectors.map((vector) =>
      vector.id === id
        ? {
            ...vector,
            start: [0, 0] as [number, number],
            end: next.end ?? vector.end,
          }
        : vector
    );
    applyPointPlotVectorsConfig(nextVectors);
  }

  function addPointPlotVector() {
    const nextId = String.fromCharCode(97 + pointPlotVectors.length);
    const palette = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
    const nextVector: PlaneVector = {
      id: nextId,
      color: palette[pointPlotVectors.length % palette.length],
      start: [0, 0],
      end: [2, 1],
    };
    const nextVectors = [...pointPlotVectors, nextVector];
    setSelectedPointVectorId(nextId);
    applyPointPlotVectorsConfig(nextVectors);
  }

  function removePointPlotVector() {
    if (pointPlotVectors.length <= 1) {
      return;
    }
    const toRemove =
      activePointVectorId || pointPlotVectors[pointPlotVectors.length - 1]?.id;
    const nextVectors = pointPlotVectors.filter((vector) => vector.id !== toRemove);
    setSelectedPointVectorId(nextVectors[0]?.id ?? "a");
    applyPointPlotVectorsConfig(nextVectors);
  }

  const applyEqualVectorsConfig = useCallback(function applyEqualVectorsConfig(
    nextVectors: PlaneVector[],
    nextCorrectIds: string[]
  ) {
    const uniqueCorrect = [...new Set(nextCorrectIds)].filter((id) =>
      nextVectors.some((vector) => vector.id === id)
    );
    const config = {
      kind: "equal_vectors_pick",
      grid: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, step: 1 },
      vectors: nextVectors,
      correctIds: uniqueCorrect,
    };
    form.setValue("choicesJson", JSON.stringify(config, null, 2), {
      shouldDirty: true,
    });
    if (!form.getValues("promptMd").trim()) {
      form.setValue(
        "promptMd",
        "Pick the equal vectors.",
        { shouldDirty: true }
      );
    }
    form.setValue("solutionMd", uniqueCorrect.join(", "), { shouldDirty: true });
  }, [form]);

  function updateEqualVector(
    id: string,
    next: { start?: [number, number]; end?: [number, number] }
  ) {
    const nextVectors = equalVectors.map((vector) =>
      vector.id === id
        ? {
            ...vector,
            start: next.start ?? vector.start,
            end: next.end ?? vector.end,
          }
        : vector
    );
    applyEqualVectorsConfig(nextVectors, equalCorrectIds);
  }

  function addEqualVector() {
    const nextId = String.fromCharCode(97 + equalVectors.length);
    const palette = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
    const nextVector: PlaneVector = {
      id: nextId,
      color: palette[equalVectors.length % palette.length],
      start: [0, 0],
      end: [2, 1],
    };
    const nextVectors = [...equalVectors, nextVector];
    setSelectedVectorId(nextId);
    applyEqualVectorsConfig(nextVectors, equalCorrectIds);
  }

  function removeSelectedEqualVector() {
    if (equalVectors.length <= 2) {
      return;
    }
    const toRemove = activeEqualVectorId || equalVectors[equalVectors.length - 1]?.id;
    const nextVectors = equalVectors.filter((vector) => vector.id !== toRemove);
    const nextSelected = nextVectors[0]?.id ?? "a";
    setSelectedVectorId(nextSelected);
    applyEqualVectorsConfig(nextVectors, equalCorrectIds.filter((id) => id !== toRemove));
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

  const applyMultiSelectConfig = useCallback(function applyMultiSelectConfig(
    nextOptions: [string, string, string, string],
    nextCorrect: Array<"a" | "b" | "c" | "d">
  ) {
    const uniqueCorrect = [...new Set(nextCorrect)].sort() as Array<
      "a" | "b" | "c" | "d"
    >;
    const config = {
      kind: "multi_select",
      options: [
        { id: "a", text: nextOptions[0] },
        { id: "b", text: nextOptions[1] },
        { id: "c", text: nextOptions[2] },
        { id: "d", text: nextOptions[3] },
      ],
      correctOptions: uniqueCorrect,
    };
    form.setValue("choicesJson", JSON.stringify(config, null, 2), {
      shouldDirty: true,
    });

    if (!form.getValues("promptMd").trim()) {
      form.setValue("promptMd", "Select all correct answers.", { shouldDirty: true });
    }

    form.setValue("solutionMd", uniqueCorrect.join(", "), { shouldDirty: true });
  }, [form]);

  const applyMultiPartConfig = useCallback(function applyMultiPartConfig(
    nextParts: MultiPartPart[]
  ) {
    const parts = nextParts.map((part, index) => {
      const id = part.id || `part-${index + 1}`;
      const prompt = (part.prompt || `Part ${index + 1}`).trim();

      if (part.type === "single_choice") {
        const options = part.options ?? ["", "", "", ""];
        return {
          id,
          type: "single_choice" as const,
          prompt,
          options: [
            { id: "a", text: options[0] ?? "" },
            { id: "b", text: options[1] ?? "" },
            { id: "c", text: options[2] ?? "" },
            { id: "d", text: options[3] ?? "" },
          ],
          correctOption: part.correctOption ?? "a",
        };
      }

      if (part.type === "multi_select") {
        const options = part.options ?? ["", "", "", ""];
        return {
          id,
          type: "multi_select" as const,
          prompt,
          options: [
            { id: "a", text: options[0] ?? "" },
            { id: "b", text: options[1] ?? "" },
            { id: "c", text: options[2] ?? "" },
            { id: "d", text: options[3] ?? "" },
          ],
          correctOptions: [...new Set(part.correctOptions ?? ["a"])],
        };
      }

      if (part.type === "open_text") {
        return {
          id,
          type: "open_text" as const,
          prompt,
        };
      }

      if (part.type === "vector_xy_from_graph") {
        return {
          id,
          type: "vector_xy_from_graph" as const,
          prompt,
          x: Number(part.coord?.x ?? 0),
          y: Number(part.coord?.y ?? 0),
        };
      }

      if (part.type === "point_plot_from_coordinates") {
        return {
          id,
          type: "point_plot_from_coordinates" as const,
          prompt,
          x: Number(part.coord?.x ?? 0),
          y: Number(part.coord?.y ?? 0),
        };
      }

      return {
        id,
        type: "short_answer" as const,
        prompt,
        correctText: part.correctText ?? "",
      };
    });

    form.setValue(
      "choicesJson",
      JSON.stringify({ kind: "multi_part", parts }, null, 2),
      { shouldDirty: true }
    );

    if (!form.getValues("promptMd").trim()) {
      form.setValue("promptMd", "Solve all parts of the exercise.", {
        shouldDirty: true,
      });
    }

    form.setValue("solutionMd", "Auto-generated from multi-part builder.", {
      shouldDirty: true,
    });
  }, [form]);

  function updateMultiPartPart(id: string, patch: Partial<MultiPartPart>) {
    const nextParts = multiPartParts.map((part) =>
      part.id === id ? { ...part, ...patch } : part
    );
    applyMultiPartConfig(nextParts);
  }

  function addMultiPartPart() {
    const nextId = `part-${multiPartParts.length + 1}`;
    const nextParts = [
      ...multiPartParts,
      {
        id: nextId,
        type: "short_answer" as const,
        prompt: `Part ${multiPartParts.length + 1}`,
        correctText: "",
      },
    ];
    applyMultiPartConfig(nextParts);
  }

  function removeMultiPartPart(id: string) {
    if (multiPartParts.length <= 1) {
      return;
    }
    const nextParts = multiPartParts.filter((part) => part.id !== id);
    applyMultiPartConfig(nextParts);
  }

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
    if (watchedType !== "multi_select") {
      return;
    }

    const rawChoices = String(form.getValues("choicesJson") ?? "").trim();
    const current = parseMultiSelectConfig(form.getValues("choicesJson"));

    if (!rawChoices || rawChoices === "[]") {
      applyMultiSelectConfig(current.options, current.correct);
      return;
    }

    if (!String(form.getValues("solutionMd") ?? "").trim()) {
      form.setValue("solutionMd", current.correct.join(", "), { shouldDirty: true });
    }
  }, [applyMultiSelectConfig, form, watchedType]);

  useEffect(() => {
    if (watchedType !== "equal_vectors_pick") {
      return;
    }

    const rawChoices = String(form.getValues("choicesJson") ?? "").trim();
    const parsed = parseEqualVectorsConfig(form.getValues("choicesJson"));
    if (!rawChoices || rawChoices === "[]") {
      applyEqualVectorsConfig(parsed.vectors, parsed.correctIds);
      return;
    }

    if (!String(form.getValues("solutionMd") ?? "").trim()) {
      form.setValue("solutionMd", parsed.correctIds.join(", "), { shouldDirty: true });
    }
  }, [applyEqualVectorsConfig, form, watchedType]);

  useEffect(() => {
    if (watchedType !== "multi_part") {
      return;
    }

    const rawChoices = String(form.getValues("choicesJson") ?? "").trim();
    const parsed = parseMultiPartConfig(form.getValues("choicesJson"));
    if (!rawChoices || rawChoices === "[]") {
      applyMultiPartConfig(parsed);
      return;
    }

    if (!String(form.getValues("solutionMd") ?? "").trim()) {
      form.setValue("solutionMd", "Auto-generated from multi-part builder.", {
        shouldDirty: true,
      });
    }
  }, [applyMultiPartConfig, form, watchedType]);

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
                    <option value="multi_select">multi_select</option>
                    <option value="equal_vectors_pick">equal_vectors_pick</option>
                    <option value="multi_part">multi_part</option>
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

              {!isChoiceType && !isMultiPartType && (
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
                  <p className="text-sm font-semibold text-slate-800">Point/vector target editor</p>
                  <p className="text-sm text-slate-600">
                    Set one or more vectors (from origin) that users must draw.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pointPlotVectors.map((vector) => (
                      <Button
                        key={`ppv-${vector.id}`}
                        type="button"
                        variant={activePointVectorId === vector.id ? "default" : "outline"}
                        onClick={() => setSelectedPointVectorId(vector.id)}
                      >
                        <VectorLabel id={vector.id} />
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={addPointPlotVector}>
                      Add vector
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={removePointPlotVector}
                      disabled={pointPlotVectors.length <= 1}
                    >
                      Remove selected
                    </Button>
                  </div>
                  <MultiVectorPlane
                    vectors={pointPlotVectors}
                    interactive
                    selectedId={activePointVectorId}
                    onSelect={(id) => setSelectedPointVectorId(id)}
                    onChangeVector={(id, next) => updatePointPlotVector(id, next)}
                  />
                  {activePointVectorId && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pointX">Vector X</Label>
                        <Input
                          id="pointX"
                          type="number"
                          value={
                            pointPlotVectors.find((vector) => vector.id === activePointVectorId)
                              ?.end[0] ?? 0
                          }
                          onChange={(event) =>
                            updatePointPlotVector(activePointVectorId, {
                              end: [
                                Number(event.target.value) || 0,
                                pointPlotVectors.find(
                                  (vector) => vector.id === activePointVectorId
                                )?.end[1] ?? 0,
                              ],
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pointY">Vector Y</Label>
                        <Input
                          id="pointY"
                          type="number"
                          value={
                            pointPlotVectors.find((vector) => vector.id === activePointVectorId)
                              ?.end[1] ?? 0
                          }
                          onChange={(event) =>
                            updatePointPlotVector(activePointVectorId, {
                              end: [
                                pointPlotVectors.find(
                                  (vector) => vector.id === activePointVectorId
                                )?.end[0] ?? 0,
                                Number(event.target.value) || 0,
                              ],
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isSingleChoiceType && (
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

              {watchedType === "multi_select" && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    Multi select editor
                  </p>
                  <div className="grid gap-3">
                    {(["a", "b", "c", "d"] as const).map((id, idx) => (
                      <div key={id} className="space-y-1">
                        <Label htmlFor={`ms-choice-${id}`}>Option {id.toUpperCase()}</Label>
                        <Input
                          id={`ms-choice-${id}`}
                          value={msOptions[idx]}
                          onChange={(event) => {
                            const next = [...msOptions] as [
                              string,
                              string,
                              string,
                              string,
                            ];
                            next[idx] = event.target.value;
                            applyMultiSelectConfig(next, msCorrect);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-700">
                      Correct options
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(["a", "b", "c", "d"] as const).map((id) => {
                        const checked = msCorrect.includes(id);
                        return (
                          <label
                            key={`ms-correct-${id}`}
                            className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [...msCorrect, id]
                                  : msCorrect.filter((item) => item !== id);
                                applyMultiSelectConfig(msOptions, next.length > 0 ? next : [id]);
                              }}
                            />
                            <span>{id.toUpperCase()}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {watchedType === "equal_vectors_pick" && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Equal vectors editor</p>
                  <p className="text-sm text-slate-600">
                    Select a vector, then drag both handles to set start/end points.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={addEqualVector}>
                      Add vector
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={removeSelectedEqualVector}
                      disabled={equalVectors.length <= 2}
                    >
                      Remove selected
                    </Button>
                  </div>
                  <MultiVectorPlane
                    vectors={equalVectors}
                    interactive
                    selectedId={activeEqualVectorId}
                    onSelect={(id) => setSelectedVectorId(id)}
                    onChangeVector={(id, next) => updateEqualVector(id, next)}
                  />

                  <div className="space-y-3">
                    {equalVectors.map((vector) => {
                      const isSelected = activeEqualVectorId === vector.id;
                      return (
                        <div
                          key={vector.id}
                          className={`rounded-lg border p-3 ${
                            isSelected
                              ? "border-slate-900 bg-white"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setSelectedVectorId(vector.id)}
                              className="cursor-pointer text-sm font-semibold"
                            >
                              <VectorLabel id={vector.id} />
                            </button>
                            <input
                              type="color"
                              value={vector.color}
                              onChange={(event) =>
                                applyEqualVectorsConfig(
                                  equalVectors.map((item) =>
                                    item.id === vector.id
                                      ? { ...item, color: event.target.value }
                                      : item
                                  ),
                                  equalCorrectIds
                                )
                              }
                              className="h-8 w-12 cursor-pointer rounded border border-slate-300"
                            />
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-4">
                            <Input
                              type="number"
                              value={vector.start[0]}
                              onChange={(event) =>
                                updateEqualVector(vector.id, {
                                  start: [Number(event.target.value) || 0, vector.start[1]],
                                })
                              }
                            />
                            <Input
                              type="number"
                              value={vector.start[1]}
                              onChange={(event) =>
                                updateEqualVector(vector.id, {
                                  start: [vector.start[0], Number(event.target.value) || 0],
                                })
                              }
                            />
                            <Input
                              type="number"
                              value={vector.end[0]}
                              onChange={(event) =>
                                updateEqualVector(vector.id, {
                                  end: [Number(event.target.value) || 0, vector.end[1]],
                                })
                              }
                            />
                            <Input
                              type="number"
                              value={vector.end[1]}
                              onChange={(event) =>
                                updateEqualVector(vector.id, {
                                  end: [vector.end[0], Number(event.target.value) || 0],
                                })
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Mark equal vectors (correct answers)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {equalVectors.map((vector) => {
                        const checked = equalCorrectIds.includes(vector.id);
                        return (
                          <label
                            key={`correct-${vector.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const nextCorrect = event.target.checked
                                  ? [...equalCorrectIds, vector.id]
                                  : equalCorrectIds.filter((id) => id !== vector.id);
                                applyEqualVectorsConfig(equalVectors, nextCorrect);
                              }}
                            />
                            <VectorLabel id={vector.id} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {watchedType === "multi_part" && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Multi-part builder
                    </p>
                    <Button type="button" variant="outline" onClick={addMultiPartPart}>
                      Add part
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {multiPartParts.map((part, index) => (
                      <div key={part.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Part {index + 1}</p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeMultiPartPart(part.id)}
                            disabled={multiPartParts.length <= 1}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor={`mp-type-${part.id}`}>Type</Label>
                            <select
                              id={`mp-type-${part.id}`}
                              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                              value={part.type}
                              onChange={(event) => {
                                const nextType = event.target.value as MultiPartPartType;
                                if (nextType === "single_choice") {
                                  updateMultiPartPart(part.id, {
                                    type: nextType,
                                    options: ["", "", "", ""],
                                    correctOption: "a",
                                    correctText: undefined,
                                    correctOptions: undefined,
                                  });
                                  return;
                                }
                                if (nextType === "multi_select") {
                                  updateMultiPartPart(part.id, {
                                    type: nextType,
                                    options: ["", "", "", ""],
                                    correctOptions: ["a"],
                                    correctOption: undefined,
                                    correctText: undefined,
                                  });
                                  return;
                                }
                                if (nextType === "open_text") {
                                  updateMultiPartPart(part.id, {
                                    type: nextType,
                                    options: undefined,
                                    correctOption: undefined,
                                    correctOptions: undefined,
                                    correctText: undefined,
                                  });
                                  return;
                                }
                                if (nextType === "vector_xy_from_graph") {
                                  updateMultiPartPart(part.id, {
                                    type: nextType,
                                    options: undefined,
                                    correctOption: undefined,
                                    correctOptions: undefined,
                                    correctText: undefined,
                                    coord: { x: 0, y: 0 },
                                  });
                                  return;
                                }
                                if (nextType === "point_plot_from_coordinates") {
                                  updateMultiPartPart(part.id, {
                                    type: nextType,
                                    options: undefined,
                                    correctOption: undefined,
                                    correctOptions: undefined,
                                    correctText: undefined,
                                    coord: { x: 0, y: 0 },
                                  });
                                  return;
                                }
                                updateMultiPartPart(part.id, {
                                  type: "short_answer",
                                  options: undefined,
                                  correctOption: undefined,
                                  correctOptions: undefined,
                                  correctText: "",
                                });
                              }}
                            >
                              <option value="short_answer">short_answer</option>
                              <option value="single_choice">single_choice</option>
                              <option value="multi_select">multi_select</option>
                              <option value="open_text">open_text</option>
                              <option value="vector_xy_from_graph">
                                vector_xy_from_graph
                              </option>
                              <option value="point_plot_from_coordinates">
                                point_plot_from_coordinates
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1">
                          <Label htmlFor={`mp-prompt-${part.id}`}>Prompt</Label>
                          <Textarea
                            id={`mp-prompt-${part.id}`}
                            rows={2}
                            value={part.prompt}
                            onChange={(event) =>
                              updateMultiPartPart(part.id, { prompt: event.target.value })
                            }
                          />
                        </div>

                        {part.type === "short_answer" && (
                          <div className="mt-3 space-y-1">
                            <Label htmlFor={`mp-answer-${part.id}`}>Expected answer</Label>
                            <Input
                              id={`mp-answer-${part.id}`}
                              value={part.correctText ?? ""}
                              onChange={(event) =>
                                updateMultiPartPart(part.id, {
                                  correctText: event.target.value,
                                })
                              }
                            />
                          </div>
                        )}

                        {(part.type === "vector_xy_from_graph" ||
                          part.type === "point_plot_from_coordinates") && (
                          <div className="mt-3 space-y-3">
                            <VectorPlane
                              x={Number(part.coord?.x ?? 0)}
                              y={Number(part.coord?.y ?? 0)}
                              mode={
                                part.type === "point_plot_from_coordinates"
                                  ? "point"
                                  : "vector"
                              }
                              interactive={part.type === "point_plot_from_coordinates"}
                              onChange={(next) =>
                                updateMultiPartPart(part.id, { coord: next })
                              }
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label htmlFor={`mp-coord-x-${part.id}`}>X</Label>
                                <Input
                                  id={`mp-coord-x-${part.id}`}
                                  type="number"
                                  value={Number(part.coord?.x ?? 0)}
                                  onChange={(event) =>
                                    updateMultiPartPart(part.id, {
                                      coord: {
                                        x: Number(event.target.value) || 0,
                                        y: Number(part.coord?.y ?? 0),
                                      },
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`mp-coord-y-${part.id}`}>Y</Label>
                                <Input
                                  id={`mp-coord-y-${part.id}`}
                                  type="number"
                                  value={Number(part.coord?.y ?? 0)}
                                  onChange={(event) =>
                                    updateMultiPartPart(part.id, {
                                      coord: {
                                        x: Number(part.coord?.x ?? 0),
                                        y: Number(event.target.value) || 0,
                                      },
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {(part.type === "single_choice" || part.type === "multi_select") && (
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-2">
                              {(["a", "b", "c", "d"] as const).map((id, idx) => (
                                <div key={`mp-${part.id}-${id}`} className="space-y-1">
                                  <Label htmlFor={`mp-option-${part.id}-${id}`}>
                                    Option {id.toUpperCase()}
                                  </Label>
                                  <Input
                                    id={`mp-option-${part.id}-${id}`}
                                    value={part.options?.[idx] ?? ""}
                                    onChange={(event) => {
                                      const next = [...(part.options ?? ["", "", "", ""])] as [
                                        string,
                                        string,
                                        string,
                                        string,
                                      ];
                                      next[idx] = event.target.value;
                                      updateMultiPartPart(part.id, { options: next });
                                    }}
                                  />
                                </div>
                              ))}
                            </div>

                            {part.type === "single_choice" && (
                              <div className="space-y-1">
                                <Label htmlFor={`mp-correct-${part.id}`}>Correct option</Label>
                                <select
                                  id={`mp-correct-${part.id}`}
                                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3"
                                  value={part.correctOption ?? "a"}
                                  onChange={(event) =>
                                    updateMultiPartPart(part.id, {
                                      correctOption: event.target.value as "a" | "b" | "c" | "d",
                                    })
                                  }
                                >
                                  <option value="a">A</option>
                                  <option value="b">B</option>
                                  <option value="c">C</option>
                                  <option value="d">D</option>
                                </select>
                              </div>
                            )}

                            {part.type === "multi_select" && (
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-slate-700">
                                  Correct options
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {(["a", "b", "c", "d"] as const).map((id) => {
                                    const checked = (part.correctOptions ?? []).includes(id);
                                    return (
                                      <label
                                        key={`mp-correct-many-${part.id}-${id}`}
                                        className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) => {
                                            const current = part.correctOptions ?? [];
                                            const next = event.target.checked
                                              ? [...current, id]
                                              : current.filter((item) => item !== id);
                                            updateMultiPartPart(part.id, {
                                              correctOptions: next.length > 0 ? next : [id],
                                            });
                                          }}
                                        />
                                        <span>{id.toUpperCase()}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
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
                  <MultiVectorPlane vectors={pointPlotVectors} />
                </div>
              )}
              {watchedType === "equal_vectors_pick" && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-700">Graph preview</p>
                  <MultiVectorPlane vectors={equalVectors} />
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
