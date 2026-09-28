"use client";

import { useState } from "react";
import { isBoxLike, type BoxRole, type Shape } from "./types";

interface Props {
  shapes: Shape[];
  selected: string[];
  onCommit: (shapes: Shape[]) => void;
  onSelect: (ids: string[]) => void;
}

const ROLES: BoxRole[] = ["box", "button", "input", "image", "nav"];

export function Inspector({ shapes, selected, onCommit, onSelect }: Props) {
  const targets = shapes.filter((s) => selected.includes(s.id));
  if (!targets.length) return null;
  const single = targets.length === 1 ? targets[0] : null;

  const update = (patch: Partial<Shape>) =>
    onCommit(shapes.map((s) => (s.id === single?.id ? ({ ...s, ...patch } as Shape) : s)));
  const reorder = (front: boolean) => {
    const rest = shapes.filter((s) => !selected.includes(s.id));
    onCommit(front ? [...rest, ...targets] : [...targets, ...rest]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1 text-sm shadow-sm" aria-label="Selection properties" role="group">
      {single && single.kind === "box" && (
        <label className="flex items-center gap-1.5 text-muted">
          Type
          <select
            value={single.role}
            onChange={(e) => update({ role: e.target.value as BoxRole })}
            className="rounded-md border border-line bg-bg px-1.5 py-1 text-ink"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}
      {single && isBoxLike(single) && <TextField key={single.id} value={single.text} onCommit={(text) => update({ text })} />}
      {single && single.kind === "text" && (
        <label className="flex items-center gap-1.5 text-muted">
          Size
          <select
            value={single.size}
            onChange={(e) => update({ size: Number(e.target.value) })}
            className="rounded-md border border-line bg-bg px-1.5 py-1 text-ink"
          >
            {[12, 14, 16, 20, 24, 32, 40, 48].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {!single && <span className="text-muted">{targets.length} selected</span>}
      <button type="button" onClick={() => reorder(true)} className="rounded-md px-2 py-1 hover:bg-surface-2">
        Bring to front
      </button>
      <button type="button" onClick={() => reorder(false)} className="rounded-md px-2 py-1 hover:bg-surface-2">
        Send to back
      </button>
      <button
        type="button"
        onClick={() => {
          onCommit(shapes.filter((s) => !selected.includes(s.id)));
          onSelect([]);
        }}
        className="rounded-md px-2 py-1 text-danger hover:bg-surface-2"
      >
        Delete
      </button>
    </div>
  );
}

function TextField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(value);
  }
  const commit = () => draft !== value && onCommit(draft);
  return (
    <label className="flex items-center gap-1.5 text-muted">
      Label
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        maxLength={2000}
        className="w-40 rounded-md border border-line bg-bg px-2 py-1 text-ink"
      />
    </label>
  );
}
