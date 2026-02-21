"use client";

import { useState } from "react";

type VectorPlaneProps = {
  x: number;
  y: number;
  min?: number;
  max?: number;
  size?: number;
  mode?: "vector" | "point";
  showPoint?: boolean;
  interactive?: boolean;
  onChange?: (next: { x: number; y: number }) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function VectorPlane({
  x,
  y,
  min = -10,
  max = 10,
  size = 420,
  mode = "vector",
  showPoint = true,
  interactive = false,
  onChange,
}: VectorPlaneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const span = max - min;
  const half = size / 2;

  const toPx = (value: number) => ((value - min) / span) * size;
  const toCoord = (px: number) => {
    const raw = min + (px / size) * span;
    return Math.round(raw);
  };

  const arrowX = toPx(clamp(x, min, max));
  const arrowY = toPx(clamp(y, min, max));

  function updateFromPointer(clientX: number, clientY: number, rect: DOMRect) {
    if (!onChange) {
      return;
    }

    const px = clamp(clientX - rect.left, 0, size);
    const py = clamp(clientY - rect.top, 0, size);

    onChange({
      x: clamp(toCoord(px), min, max),
      y: clamp(toCoord(size - py), min, max),
    });
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded-lg border border-slate-300 bg-white ${
        interactive ? "cursor-crosshair touch-none" : ""
      }`}
      onPointerDown={(event) => {
        if (!interactive) {
          return;
        }
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect()
        );
      }}
      onPointerMove={(event) => {
        if (!interactive || !isDragging) {
          return;
        }
        updateFromPointer(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect()
        );
      }}
      onPointerUp={(event) => {
        if (!interactive) {
          return;
        }
        setIsDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => setIsDragging(false)}
    >
      <defs>
        <marker
          id="vector-head"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#0f766e" />
        </marker>
      </defs>

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

      {(mode === "vector" || (mode === "point" && showPoint)) && (
        <line
          x1={half}
          y1={half}
          x2={arrowX}
          y2={size - arrowY}
          stroke="#0f766e"
          strokeWidth={3}
          markerEnd="url(#vector-head)"
        />
      )}
      {mode === "vector" && showPoint && (
        <circle cx={arrowX} cy={size - arrowY} r={4} fill="#0f766e" />
      )}
    </svg>
  );
}
