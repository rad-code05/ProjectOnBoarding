"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent,
  type Ref,
} from "react";
import { cn } from "@/lib/cn";

type Point = { x: number; y: number };
export type Stroke = Point[];

/** At least 2× the CSS size, so the PNG stays sharp and above the minimum size. */
const MIN_SCALE = 2;
const LINE_WIDTH = 2.6;

export type SignaturePadHandle = {
  /** The drawing as a transparent PNG (whole pad), or null when empty. */
  toPng: () => Promise<Blob | null>;
};

/** Draws strokes, smoothed through the midpoints between points. */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  scale: number,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = LINE_WIDTH * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#000000";
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    if (rest.length === 0) {
      // A tap is a dot.
      ctx.beginPath();
      ctx.arc(
        first.x * scale,
        first.y * scale,
        (LINE_WIDTH * scale) / 2,
        0,
        2 * Math.PI,
      );
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(first.x * scale, first.y * scale);
    for (let i = 0; i < rest.length - 1; i++) {
      const mid = {
        x: (rest[i].x + rest[i + 1].x) / 2,
        y: (rest[i].y + rest[i + 1].y) / 2,
      };
      ctx.quadraticCurveTo(
        rest[i].x * scale,
        rest[i].y * scale,
        mid.x * scale,
        mid.y * scale,
      );
    }
    const last = rest[rest.length - 1];
    ctx.lineTo(last.x * scale, last.y * scale);
    ctx.stroke();
  }
}

/**
 * Signature pad for finger, stylus or mouse (design: Phone · Draw signature).
 * Points are kept in CSS pixels, so the pad can be redrawn at any size —
 * e.g. after turning the phone sideways. The parent owns the strokes
 * (for Undo / Clear).
 */
export function SignaturePad({
  strokes,
  onChange,
  label,
  className,
  ref,
}: {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  label: string;
  className?: string;
  ref?: Ref<SignaturePadHandle>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(MIN_SCALE);
  const current = useRef<Stroke | null>(null);
  const strokesRef = useRef(strokes);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const all = current.current
      ? [...strokesRef.current, current.current]
      : strokesRef.current;
    drawStrokes(ctx, all, scaleRef.current);
  }, []);

  // Match the bitmap to the pad's size; again whenever it changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const scale = Math.max(MIN_SCALE, window.devicePixelRatio || 1);
      scaleRef.current = scale;
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      redraw();
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
  }, [strokes, redraw]);

  useImperativeHandle(ref, () => ({
    toPng: () =>
      new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas || strokesRef.current.length === 0) return resolve(null);
        canvas.toBlob(resolve, "image/png");
      }),
  }));

  const point = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={cn("block w-full touch-none select-none", className)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        current.current = [point(e)];
        redraw();
      }}
      onPointerMove={(e) => {
        if (!current.current) return;
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const rect = e.currentTarget.getBoundingClientRect();
        if (events.length > 0) {
          for (const ev of events) {
            current.current.push({
              x: ev.clientX - rect.left,
              y: ev.clientY - rect.top,
            });
          }
        } else {
          current.current.push(point(e));
        }
        redraw();
      }}
      onPointerUp={() => {
        if (!current.current) return;
        const done = current.current;
        current.current = null;
        onChange([...strokesRef.current, done]);
      }}
      onPointerCancel={() => {
        current.current = null;
        redraw();
      }}
    />
  );
}
