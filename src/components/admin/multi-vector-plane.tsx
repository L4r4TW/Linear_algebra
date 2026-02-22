"use client";

import { useState } from "react";

export type PlaneVector = {
  id: string;
  color: string;
  start: [number, number];
  end: [number, number];
};

type MultiVectorPlaneProps = {
  vectors: PlaneVector[];
  min?: number;
  max?: number;
  size?: number;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChangeVector?: (
    id: string,
    next: { start?: [number, number]; end?: [number, number] }
  ) => void;
};

type DragTarget = {
  id: string;
  handle: "start" | "end";
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toArrowhead(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): [number, number][] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const size = 10;
  const width = 5;

  const tip: [number, number] = [x2, y2];
  const baseX = x2 - ux * size;
  const baseY = y2 - uy * size;
  const left: [number, number] = [baseX - uy * width, baseY + ux * width];
  const right: [number, number] = [baseX + uy * width, baseY - ux * width];

  return [tip, left, right];
}

export function MultiVectorPlane({
  vectors,
  min = -10,
  max = 10,
  size = 420,
  interactive = false,
  selectedId = null,
  onSelect,
  onChangeVector,
}: MultiVectorPlaneProps) {
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const span = max - min;
  const half = size / 2;

  const toPx = (value: number) => ((value - min) / span) * size;
  const toCoord = (px: number) => {
    const raw = min + (px / size) * span;
    return Math.round(raw);
  };

  function toPoint(clientX: number, clientY: number, rect: DOMRect): [number, number] {
    const px = clamp(clientX - rect.left, 0, size);
    const py = clamp(clientY - rect.top, 0, size);
    return [clamp(toCoord(px), min, max), clamp(toCoord(size - py), min, max)];
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded-lg border border-slate-300 bg-white ${
        interactive ? "cursor-crosshair touch-none" : ""
      }`}
      onPointerMove={(event) => {
        if (!interactive || !dragTarget || !onChangeVector) {
          return;
        }

        const [x, y] = toPoint(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect()
        );
        onChangeVector(dragTarget.id, {
          [dragTarget.handle]: [x, y],
        });
      }}
      onPointerUp={(event) => {
        if (!interactive) {
          return;
        }
        setDragTarget(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => setDragTarget(null)}
    >
      {Array.from({ length: span + 1 }).map((_, idx) => {
        const value = min + idx;
        const p = toPx(value);
        const major = value === 0;
        const showLabel =
          value !== 0 && value % 2 === 0 && value !== max && value !== min;
        const strokeColor = major
          ? "#94a3b8"
          : showLabel
            ? "#cbd5e1"
            : "#e2e8f0";
        const strokeWidth = major ? 1.2 : showLabel ? 1.1 : 1;
        return (
          <g key={value}>
            <line
              x1={0}
              y1={size - p}
              x2={size}
              y2={size - p}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            <line
              x1={p}
              y1={0}
              x2={p}
              y2={size}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {showLabel && (
              <>
                <text
                  x={p}
                  y={half - 6}
                  textAnchor="middle"
                  fontSize="14"
                  fill="#64748b"
                >
                  {value}
                </text>
                <text
                  x={half + 6}
                  y={size - p + 3}
                  fontSize="14"
                  fill="#64748b"
                >
                  {value}
                </text>
              </>
            )}
          </g>
        );
      })}

      {vectors.map((vector) => {
        const isSelected = selectedId === vector.id;
        const sx = toPx(vector.start[0]);
        const sy = size - toPx(vector.start[1]);
        const ex = toPx(vector.end[0]);
        const ey = size - toPx(vector.end[1]);
        const [tip, left, right] = toArrowhead(sx, sy, ex, ey);
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;

        return (
          <g key={vector.id}>
            <line
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke={vector.color}
              strokeWidth={isSelected ? 4 : 3}
              className={interactive ? "cursor-pointer" : ""}
              onClick={() => onSelect?.(vector.id)}
            />
            <polygon
              points={`${tip[0]},${tip[1]} ${left[0]},${left[1]} ${right[0]},${right[1]}`}
              fill={vector.color}
              className={interactive ? "cursor-pointer" : ""}
              onClick={() => onSelect?.(vector.id)}
            />
            <text
              x={mx + 6}
              y={my - 8}
              fontSize="16"
              fontWeight="600"
              fill={vector.color}
            >
              {vector.id}
            </text>
            <line
              x1={mx + 3}
              y1={my - 20}
              x2={mx + 15}
              y2={my - 20}
              stroke={vector.color}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <polygon
              points={`${mx + 15},${my - 20} ${mx + 10},${my - 23} ${mx + 10},${my - 17}`}
              fill={vector.color}
            />

            {interactive && isSelected && (
              <>
                <circle
                  cx={sx}
                  cy={sy}
                  r={7}
                  fill="white"
                  stroke={vector.color}
                  strokeWidth={2}
                  className="cursor-grab"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.ownerSVGElement?.setPointerCapture(
                      event.pointerId
                    );
                    setDragTarget({ id: vector.id, handle: "start" });
                    onSelect?.(vector.id);
                  }}
                />
                <circle
                  cx={ex}
                  cy={ey}
                  r={7}
                  fill="white"
                  stroke={vector.color}
                  strokeWidth={2}
                  className="cursor-grab"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.ownerSVGElement?.setPointerCapture(
                      event.pointerId
                    );
                    setDragTarget({ id: vector.id, handle: "end" });
                    onSelect?.(vector.id);
                  }}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
