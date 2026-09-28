"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Editor, type ToolChoice } from "@/editor/Editor";
import { EXAMPLE_SKETCH } from "@/editor/example";
import { sketchToPng } from "@/editor/exportImage";
import { historyReducer, initHistory } from "@/editor/history";
import { Inspector } from "@/editor/Inspector";
import { Toolbar } from "@/editor/Toolbar";
import type { Shape } from "@/editor/types";
import { describeSketch } from "@/lib/layout";
import { extractHtml, readNdjson } from "@/lib/stream";
import { loadShapes, loadVersions, saveShapes, saveVersions, type Version } from "@/lib/storage";
import { Preview } from "./Preview";

type Gen =
  | { phase: "idle" }
  | { phase: "streaming"; status: string }
  | { phase: "error"; message: string };

const PREVIEW_THROTTLE_MS = 450;

export default function Studio({ aiEnabled }: { aiEnabled: boolean }) {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initHistory(loadShapes() ?? EXAMPLE_SKETCH));
  const [choice, setChoice] = useState<ToolChoice>({ tool: "select", role: "box" });
  const [selected, setSelected] = useState<string[]>([]);
  const [versions, setVersions] = useState<Version[]>(loadVersions);
  const [activeId, setActiveId] = useState<string | null>(() => versions.at(-1)?.id ?? null);
  const [gen, setGen] = useState<Gen>({ phase: "idle" });
  const [live, setLive] = useState({ html: "", raw: "" });
  const [instruction, setInstruction] = useState("");
  const [split, setSplit] = useState(56);
  const controller = useRef<AbortController | null>(null);
  const pendingRaw = useRef("");
  const timer = useRef<number | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const shapes = history.present;
  const active = versions.find((v) => v.id === activeId) ?? null;
  const streaming = gen.phase === "streaming";

  const commit = useCallback((next: Shape[]) => dispatch({ type: "commit", shapes: next }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  useEffect(() => {
    saveShapes(shapes);
  }, [shapes]);
  useEffect(() => {
    saveVersions(versions);
  }, [versions]);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function schedulePreview(raw: string) {
    pendingRaw.current = raw;
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setLive({ raw: pendingRaw.current, html: extractHtml(pendingRaw.current) });
    }, PREVIEW_THROTTLE_MS);
  }

  function stopTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  async function generate(mode: "new" | "refine") {
    if (!shapes.length) {
      setGen({ phase: "error", message: "Draw something on the canvas first." });
      return;
    }
    const base = mode === "refine" ? active : null;
    const note = instruction.trim();
    if (mode === "refine" && (!base || !note)) return;

    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    stopTimer();
    setLive({ html: "", raw: "" });
    setGen({ phase: "streaming", status: "Capturing sketch…" });

    try {
      const image = await sketchToPng(shapes);
      if (!image) throw new Error("Couldn't capture the sketch.");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          description: describeSketch(shapes),
          shapes,
          instruction: note || undefined,
          previousHtml: base?.html,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }

      let raw = "";
      let finished = false;
      for await (const ev of readNdjson(res)) {
        if (ctrl.signal.aborted) return;
        if (ev.type === "status") setGen({ phase: "streaming", status: ev.message });
        else if (ev.type === "delta") {
          raw += ev.text;
          schedulePreview(raw);
        } else if (ev.type === "error") throw new Error(ev.message);
        else if (ev.type === "done") {
          finished = true;
          stopTimer();
          const html = extractHtml(raw);
          if (!/<(html|body|div|main|section)[\s>]/i.test(html)) throw new Error("The response didn't contain an HTML page.");
          const version: Version = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            html,
            instruction: note,
            source: ev.source,
            parentId: base?.id ?? null,
          };
          setVersions((prev) => [...prev, version]);
          setActiveId(version.id);
          setLive({ html: "", raw: "" });
          setInstruction("");
          setGen(ev.warning ? { phase: "error", message: ev.warning } : { phase: "idle" });
        }
      }
      if (!finished && !ctrl.signal.aborted) throw new Error("The connection closed before the prototype finished.");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      stopTimer();
      setLive({ html: "", raw: "" });
      setGen({ phase: "error", message: (e as Error).message });
    } finally {
      if (controller.current === ctrl) controller.current = null;
    }
  }

  function stop() {
    controller.current?.abort();
    controller.current = null;
    stopTimer();
    setLive({ html: "", raw: "" });
    setGen({ phase: "idle" });
  }

  function onSplitPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onSplitPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    setSplit(Math.min(75, Math.max(30, ((e.clientX - rect.left) / rect.width) * 100)));
  }
  function onSplitKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") setSplit((s) => Math.max(30, s - 2));
    else if (e.key === "ArrowRight") setSplit((s) => Math.min(75, s + 2));
  }

  const previewHtml = streaming ? live.html : active?.html ?? "";
  const previewCode = streaming ? live.raw : active?.html ?? "";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-bold text-on-accent">S↗</span>
          <h1 className="font-semibold tracking-tight">Sketch to UI</h1>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{aiEnabled ? "Claude" : "offline compiler"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => commit(EXAMPLE_SKETCH)} className="rounded-lg px-2 py-1 text-muted hover:text-ink">
            Load example
          </button>
          <button
            type="button"
            onClick={() => {
              commit([]);
              setSelected([]);
            }}
            disabled={!shapes.length}
            className="rounded-lg px-2 py-1 text-muted hover:text-ink disabled:opacity-40"
          >
            Clear canvas
          </button>
        </div>
      </header>

      <div ref={mainRef} className="flex min-h-0 flex-1 flex-col lg:flex-row" style={{ ["--split" as string]: `${split}%` }}>
        <section aria-label="Sketch" className="relative h-[55vh] min-h-0 lg:h-auto lg:w-[var(--split)]">
          <div className="absolute left-3 right-3 top-3 z-10 flex flex-col items-start gap-2">
            <Toolbar choice={choice} onChoice={setChoice} onUndo={undo} onRedo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} />
            <Inspector shapes={shapes} selected={selected} onCommit={commit} onSelect={setSelected} />
          </div>
          <Editor
            shapes={shapes}
            onCommit={commit}
            onUndo={undo}
            onRedo={redo}
            choice={choice}
            onChoice={setChoice}
            selected={selected}
            onSelect={setSelected}
          />
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          aria-valuenow={Math.round(split)}
          aria-valuemin={30}
          aria-valuemax={75}
          tabIndex={0}
          onPointerDown={onSplitPointerDown}
          onPointerMove={onSplitPointerMove}
          onKeyDown={onSplitKey}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-line outline-none hover:bg-accent focus-visible:bg-accent lg:block"
        />

        <section aria-label="Prototype" className="flex min-h-[60vh] flex-1 flex-col border-t border-line bg-surface lg:min-h-0 lg:border-t-0">
          <div className="space-y-2 border-b border-line p-3">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                generate(active && instruction.trim() ? "refine" : "new");
              }}
            >
              <label htmlFor="instruction" className="sr-only">
                Instructions for the AI
              </label>
              <input
                id="instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={1000}
                disabled={!aiEnabled}
                placeholder={
                  !aiEnabled
                    ? "Offline mode: set ANTHROPIC_API_KEY to add direction and refine"
                    : active
                      ? "Refine: “make it dark mode”, “add a pricing section”…"
                      : "Optional direction: “playful brand, rounded corners”"
                }
                className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
              />
              {streaming ? (
                <button type="button" onClick={stop} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">
                  Stop
                </button>
              ) : (
                <div className="flex gap-2">
                  {active && instruction.trim() && (
                    <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
                      Refine
                    </button>
                  )}
                  <button
                    type={active && instruction.trim() ? "button" : "submit"}
                    onClick={active && instruction.trim() ? () => generate("new") : undefined}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${active && instruction.trim() ? "border border-line" : "bg-accent text-on-accent"}`}
                  >
                    {active ? "Regenerate" : "Generate"}
                  </button>
                </div>
              )}
            </form>

            <div className="flex min-h-5 flex-wrap items-center gap-2 text-xs" aria-live="polite">
              {gen.phase === "streaming" && (
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
                  {gen.status}
                  {live.raw && <span className="tabular-nums">· {(live.raw.length / 1000).toFixed(1)}k chars</span>}
                </span>
              )}
              {gen.phase === "error" && <span className="text-danger">{gen.message}</span>}
              {gen.phase === "idle" && versions.length > 0 && (
                <>
                  <span className="text-muted">Versions:</span>
                  {versions.map((v, i) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={v.id === activeId}
                      title={v.instruction || "Generated from sketch"}
                      onClick={() => setActiveId(v.id)}
                      className={`rounded-full border px-2 py-0.5 ${v.id === activeId ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink"}`}
                    >
                      v{i + 1}
                      {v.parentId ? " ↺" : ""}
                    </button>
                  ))}
                  {active && <span className="truncate text-muted">{active.instruction ? `“${active.instruction}”` : "from sketch"} · {active.source}</span>}
                </>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Preview html={previewHtml} code={previewCode} streaming={streaming} />
          </div>
        </section>
      </div>
    </div>
  );
}
