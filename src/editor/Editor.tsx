"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  GRID,
  fitShape,
  handlePoints,
  intersects,
  normalize,
  resizeBounds,
  screenToWorld,
  shapeAt,
  shapeBounds,
  simplifyPath,
  snap,
  translate,
  unionBounds,
  zoomAt,
} from "./geometry";
import { SCREEN_PALETTE, shapeMarkup, wrapText } from "./render";
import { isBoxLike, newId, type Bounds, type BoxRole, type Camera, type Handle, type Point, type Shape, type Tool } from "./types";

type DrawKind = "box" | "ellipse" | "text" | "arrow";

type Interaction =
  | { type: "pan"; start: Point; cam: Camera }
  | { type: "create"; kind: DrawKind; role: BoxRole; id: string; start: Point; end: Point; base: Shape[] }
  | { type: "pen"; id: string; points: [number, number][]; base: Shape[] }
  | { type: "move"; start: Point; base: Shape[]; ids: Set<string>; hitId: string; moved: boolean; result: Shape[] | null }
  | { type: "resize"; handle: Handle; from: Bounds; base: Shape[]; ids: Set<string>; result: Shape[] | null }
  | { type: "marquee"; start: Point; additive: string[] };

const DEFAULT_SIZE: Record<BoxRole | "ellipse" | "text", [number, number]> = {
  box: [240, 160],
  button: [128, 40],
  input: [240, 40],
  image: [240, 160],
  nav: [640, 56],
  ellipse: [64, 64],
  text: [240, 32],
};

const CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function makeShape(kind: DrawKind, role: BoxRole, id: string, a: Point, b: Point): Shape {
  if (kind === "arrow") return { id, kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const r = normalize(a, b);
  if (kind === "box") return { id, kind, role, ...r, text: "" };
  if (kind === "ellipse") return { id, kind, ...r, text: "" };
  return { id, kind, ...r, text: "", size: 16 };
}

function defaultSized(kind: Exclude<DrawKind, "arrow">, role: BoxRole, id: string, at: Point): Shape {
  const [w, h] = DEFAULT_SIZE[kind === "box" ? role : kind];
  return makeShape(kind, role, id, at, { x: at.x + w, y: at.y + h });
}

const ShapeView = memo(function ShapeView({ shape }: { shape: Shape }) {
  return <g data-id={shape.id} dangerouslySetInnerHTML={{ __html: shapeMarkup(shape, SCREEN_PALETTE) }} />;
});

export interface ToolChoice {
  tool: Tool;
  role: BoxRole;
}

interface Props {
  shapes: Shape[];
  onCommit: (shapes: Shape[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  choice: ToolChoice;
  onChoice: (c: ToolChoice) => void;
  selected: string[];
  onSelect: (ids: string[]) => void;
}

export function Editor({ shapes, onCommit, onUndo, onRedo, choice, onChoice, selected, onSelect }: Props) {
  const [camera, setCamera] = useState<Camera>({ x: 32, y: 112, z: 0.75 });
  const [draft, setDraft] = useState<Shape[] | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [panning, setPanning] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const { tool, role } = choice;

  const view = draft ?? shapes;
  const byId = useMemo(() => new Map(view.map((s) => [s.id, s])), [view]);
  const selectedShapes = selected.map((id) => byId.get(id)).filter((s): s is Shape => Boolean(s));
  const selectionBounds = unionBounds(selectedShapes.map(shapeBounds));
  const editing = editingId ? byId.get(editingId) : undefined;

  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (editingId) return;
    svgRef.current?.focus({ preventScroll: true });
    const screen = screenPoint(e);
    const p = screenToWorld(screen, camera);

    if (e.button === 1 || tool === "hand" || spacePan) {
      e.currentTarget.setPointerCapture(e.pointerId);
      interaction.current = { type: "pan", start: screen, cam: camera };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "select") {
      const handle = (e.target as Element).getAttribute("data-handle") as Handle | null;
      if (handle && selectionBounds) {
        interaction.current = { type: "resize", handle, from: selectionBounds, base: shapes, ids: new Set(selected), result: null };
        return;
      }
      const hit = shapeAt(shapes, p, 6 / camera.z);
      if (hit) {
        if (e.shiftKey) {
          onSelect(selected.includes(hit.id) ? selected.filter((id) => id !== hit.id) : [...selected, hit.id]);
          return;
        }
        const ids = selected.includes(hit.id) ? selected : [hit.id];
        if (ids !== selected) onSelect(ids);
        interaction.current = { type: "move", start: p, base: shapes, ids: new Set(ids), hitId: hit.id, moved: false, result: null };
        return;
      }
      if (!e.shiftKey) onSelect([]);
      interaction.current = { type: "marquee", start: p, additive: e.shiftKey ? selected : [] };
      return;
    }

    if (tool === "pen") {
      const id = newId();
      interaction.current = { type: "pen", id, points: [[p.x, p.y]], base: shapes };
      setDraft([...shapes, { id, kind: "pen", points: [[p.x, p.y]] }]);
      return;
    }

    const sp = snapPoint(p);
    const kind = tool as DrawKind;
    const id = newId();
    interaction.current = { type: "create", kind, role, id, start: sp, end: sp, base: shapes };
    setDraft([...shapes, makeShape(kind, role, id, sp, sp)]);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const it = interaction.current;
    if (!it) return;
    const screen = screenPoint(e);
    const p = screenToWorld(screen, camera);
    switch (it.type) {
      case "pan":
        setCamera({ ...it.cam, x: it.cam.x + screen.x - it.start.x, y: it.cam.y + screen.y - it.start.y });
        break;
      case "create":
        it.end = e.shiftKey && it.kind !== "arrow" ? squareFrom(it.start, snapPoint(p)) : snapPoint(p);
        setDraft([...it.base, makeShape(it.kind, it.role, it.id, it.start, it.end)]);
        break;
      case "pen":
        it.points.push([p.x, p.y]);
        setDraft([...it.base, { id: it.id, kind: "pen", points: [...it.points] }]);
        break;
      case "move": {
        const dx = snap(p.x - it.start.x);
        const dy = snap(p.y - it.start.y);
        if (!it.moved && Math.hypot(p.x - it.start.x, p.y - it.start.y) < 3 / camera.z) return;
        it.moved = true;
        it.result = it.base.map((s) => (it.ids.has(s.id) ? translate(s, dx, dy) : s));
        setDraft(it.result);
        break;
      }
      case "resize": {
        const to = resizeBounds(it.from, it.handle, snapPoint(p));
        it.result = it.base.map((s) => (it.ids.has(s.id) ? fitShape(s, it.from, to) : s));
        setDraft(it.result);
        break;
      }
      case "marquee":
        setMarquee(normalize(it.start, p));
        break;
    }
  }

  function finish(e: React.PointerEvent<SVGSVGElement>, cancelled: boolean) {
    const it = interaction.current;
    interaction.current = null;
    setPanning(false);
    if (!it) return;
    if (cancelled) {
      setDraft(null);
      setMarquee(null);
      return;
    }
    switch (it.type) {
      case "create": {
        const dist = Math.hypot(it.end.x - it.start.x, it.end.y - it.start.y);
        let shape: Shape | null;
        if (it.kind === "arrow") shape = dist < 8 ? null : makeShape("arrow", it.role, it.id, it.start, it.end);
        else shape = dist < 6 ? defaultSized(it.kind, it.role, it.id, it.start) : makeShape(it.kind, it.role, it.id, it.start, it.end);
        if (shape) {
          onCommit([...it.base, shape]);
          onSelect([shape.id]);
          if (shape.kind === "text") setEditingId(shape.id);
        }
        onChoice({ tool: "select", role: it.role });
        break;
      }
      case "pen":
        if (it.points.length > 1) onCommit([...it.base, { id: it.id, kind: "pen", points: simplifyPath(it.points, 2 / camera.z) }]);
        break;
      case "move":
        if (it.moved && it.result) onCommit(it.result);
        else if (!e.shiftKey && selected.length > 1) onSelect([it.hitId]);
        break;
      case "resize":
        if (it.result) onCommit(it.result);
        break;
      case "marquee": {
        const box = normalize(it.start, screenToWorld(screenPoint(e), camera));
        if (box.w > 2 || box.h > 2) {
          const hits = view.filter((s) => intersects(box, shapeBounds(s))).map((s) => s.id);
          onSelect([...new Set([...it.additive, ...hits])]);
        }
        setMarquee(null);
        break;
      }
    }
    setDraft(null);
  }

  function onDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "select") return;
    const p = screenToWorld(screenPoint(e), camera);
    const hit = shapeAt(shapes, p, 6 / camera.z);
    if (hit && isBoxLike(hit)) {
      onSelect([hit.id]);
      setEditingId(hit.id);
    } else if (!hit) {
      const id = newId();
      const shape = defaultSized("text", "box", id, snapPoint(p));
      onCommit([...shapes, shape]);
      onSelect([id]);
      setEditingId(id);
    }
  }

  function commitText(value: string) {
    const target = editingId ? shapes.find((s) => s.id === editingId) : undefined;
    setEditingId(null);
    if (!target || !isBoxLike(target)) return;
    if (target.kind === "text" && !value.trim()) {
      onCommit(shapes.filter((s) => s.id !== target.id));
      onSelect([]);
      return;
    }
    if (value === target.text) return;
    const next =
      target.kind === "text"
        ? { ...target, text: value, h: Math.max(target.h, wrapText(value, target.w, target.size).length * target.size * 1.25) }
        : { ...target, text: value };
    onCommit(shapes.map((s) => (s.id === target.id ? next : s)));
  }

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.ctrlKey || e.metaKey) setCamera((c) => zoomAt(c, s, c.z * Math.exp(-e.deltaY * 0.01)));
      else setCamera((c) => ({ ...c, x: c.x - (e.shiftKey ? e.deltaY : e.deltaX), y: c.y - (e.shiftKey ? 0 : e.deltaY) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (editingId || target.closest("input, textarea, select, [contenteditable='true']")) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const alive = selected.filter((id) => shapes.some((s) => s.id === id));

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
      } else if (mod && key === "y") {
        e.preventDefault();
        onRedo();
      } else if (mod && key === "a") {
        e.preventDefault();
        onSelect(shapes.map((s) => s.id));
      } else if (mod && key === "d" && alive.length) {
        e.preventDefault();
        const copies = shapes.filter((s) => alive.includes(s.id)).map((s) => ({ ...translate(s, GRID * 2, GRID * 2), id: newId() }));
        onCommit([...shapes, ...copies]);
        onSelect(copies.map((c) => c.id));
      } else if ((key === "delete" || key === "backspace") && alive.length) {
        e.preventDefault();
        onCommit(shapes.filter((s) => !alive.includes(s.id)));
        onSelect([]);
      } else if (key === "escape") {
        onSelect([]);
        onChoice({ tool: "select", role });
      } else if (key.startsWith("arrow") && alive.length) {
        e.preventDefault();
        const step = e.shiftKey ? GRID * 2 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        onCommit(shapes.map((s) => (alive.includes(s.id) ? translate(s, dx, dy) : s)));
      } else if (key === "enter" && alive.length === 1) {
        const s = shapes.find((x) => x.id === alive[0]);
        if (s && isBoxLike(s)) {
          e.preventDefault();
          setEditingId(s.id);
        }
      } else if (key === " " && !target.closest("button, a")) {
        e.preventDefault();
        setSpacePan(true);
      } else if (!mod && !e.altKey) {
        const map: Record<string, ToolChoice> = {
          v: { tool: "select", role },
          h: { tool: "hand", role },
          r: { tool: "box", role: "box" },
          b: { tool: "box", role: "button" },
          i: { tool: "box", role: "input" },
          m: { tool: "box", role: "image" },
          n: { tool: "box", role: "nav" },
          o: { tool: "ellipse", role },
          t: { tool: "text", role },
          a: { tool: "arrow", role },
          p: { tool: "pen", role },
        };
        if (map[key]) onChoice(map[key]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpacePan(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  function zoomBy(factor: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    setCamera((c) => zoomAt(c, { x: rect.width / 2, y: rect.height / 2 }, c.z * factor));
  }

  function zoomToFit() {
    const b = unionBounds(shapes.map(shapeBounds));
    const rect = svgRef.current!.getBoundingClientRect();
    if (!b) return setCamera({ x: 48, y: 48, z: 1 });
    const z = Math.min(2, Math.max(0.2, Math.min((rect.width - 96) / b.w, (rect.height - 96) / b.h)));
    setCamera({ z, x: (rect.width - b.w * z) / 2 - b.x * z, y: (rect.height - b.h * z) / 2 - b.y * z });
  }

  const cursor = panning ? "grabbing" : tool === "hand" || spacePan ? "grab" : tool === "select" ? "default" : "crosshair";
  const hs = 8 / camera.z;
  const dotGap = GRID * 3 * camera.z;

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <svg
        ref={svgRef}
        tabIndex={0}
        role="application"
        aria-roledescription="wireframe canvas"
        aria-label="Wireframe canvas. Press R for box, B button, I input, M image, N nav, O circle, T text, A arrow, P pen, V select. Arrow keys move the selection, Delete removes it, Enter edits its text."
        className="h-full w-full touch-none select-none outline-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <pattern id="dots" width={dotGap} height={dotGap} x={camera.x % dotGap} y={camera.y % dotGap} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={1} fill="var(--grid)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
          {view.map((s) => (
            <ShapeView key={s.id} shape={s} />
          ))}

          {selectedShapes.map((s) => {
            const b = shapeBounds(s);
            return (
              <rect
                key={`sel-${s.id}`}
                x={b.x}
                y={b.y}
                width={Math.max(b.w, 1)}
                height={Math.max(b.h, 1)}
                fill="none"
                stroke="var(--select)"
                strokeWidth={1 / camera.z}
                pointerEvents="none"
              />
            );
          })}

          {selectionBounds && tool === "select" && !editingId && (
            <g>
              {selectedShapes.length > 1 && (
                <rect
                  x={selectionBounds.x}
                  y={selectionBounds.y}
                  width={selectionBounds.w}
                  height={selectionBounds.h}
                  fill="none"
                  stroke="var(--select)"
                  strokeDasharray={`${4 / camera.z} ${3 / camera.z}`}
                  strokeWidth={1 / camera.z}
                  pointerEvents="none"
                />
              )}
              {Object.entries(handlePoints(selectionBounds)).map(([h, pt]) => (
                <rect
                  key={h}
                  data-handle={h}
                  x={pt.x - hs / 2}
                  y={pt.y - hs / 2}
                  width={hs}
                  height={hs}
                  rx={1.5 / camera.z}
                  fill="var(--paper)"
                  stroke="var(--select)"
                  strokeWidth={1.5 / camera.z}
                  style={{ cursor: CURSORS[h as Handle] }}
                />
              ))}
            </g>
          )}

          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="var(--select-fill)"
              stroke="var(--select)"
              strokeWidth={1 / camera.z}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {editing && isBoxLike(editing) && (
        <textarea
          key={editing.id}
          autoFocus
          aria-label="Edit text"
          defaultValue={editing.text}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commitText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="absolute resize-none rounded border-2 border-[var(--select)] bg-[var(--paper)] p-1 text-[var(--ink)] outline-none"
          style={{
            left: editing.x * camera.z + camera.x,
            top: editing.y * camera.z + camera.y,
            width: Math.max(120, editing.w * camera.z),
            height: Math.max(36, editing.h * camera.z),
            fontSize: (editing.kind === "text" ? editing.size : 13) * camera.z,
          }}
        />
      )}

      {shapes.length === 0 && !draft && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
          <p>
            Pick a tool above and drag on the canvas, or press <kbd className="rounded border border-line px-1">B</kbd> for a button.
            <br />
            Double-click anywhere to add text.
          </p>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm shadow-sm">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" className="h-7 w-7 rounded hover:bg-surface-2">
          −
        </button>
        <button type="button" onClick={() => setCamera((c) => zoomAt(c, { x: 0, y: 0 }, 1))} className="min-w-12 rounded px-1 tabular-nums hover:bg-surface-2" aria-label="Reset zoom to 100%">
          {Math.round(camera.z * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in" className="h-7 w-7 rounded hover:bg-surface-2">
          +
        </button>
        <button type="button" onClick={zoomToFit} className="rounded px-2 hover:bg-surface-2">
          Fit
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {selectedShapes.length === 0
          ? ""
          : selectedShapes.length === 1
            ? `Selected ${describe(selectedShapes[0])}`
            : `${selectedShapes.length} shapes selected`}
      </p>
    </div>
  );
}

function squareFrom(a: Point, b: Point): Point {
  const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return { x: a.x + Math.sign(b.x - a.x || 1) * d, y: a.y + Math.sign(b.y - a.y || 1) * d };
}

function describe(s: Shape): string {
  if (s.kind === "box") return `${s.role}${s.text ? ` "${s.text}"` : ""}`;
  if (s.kind === "ellipse" || s.kind === "text") return `${s.kind}${s.text ? ` "${s.text}"` : ""}`;
  return s.kind;
}
