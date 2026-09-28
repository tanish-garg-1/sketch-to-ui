"use client";

import type { ToolChoice } from "./Editor";
import type { BoxRole, Tool } from "./types";

interface Item {
  label: string;
  key: string;
  tool: Tool;
  role?: BoxRole;
  icon: React.ReactNode;
}

const I = (d: string) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const ITEMS: Item[] = [
  { label: "Select", key: "V", tool: "select", icon: I("M5 3l10 6-4.5 1.5L8.5 15z") },
  { label: "Hand (pan)", key: "H", tool: "hand", icon: I("M7 10V5.5a1.2 1.2 0 012.4 0V9m0-4a1.2 1.2 0 012.4 0V9m0-2.5a1.2 1.2 0 012.4 0V12a5 5 0 01-5 5H9a4 4 0 01-3.2-1.6L3.6 12.4a1.2 1.2 0 011.9-1.4L7 12.5") },
  { label: "Box / card", key: "R", tool: "box", role: "box", icon: I("M3.5 4.5h13v11h-13z") },
  { label: "Button", key: "B", tool: "box", role: "button", icon: I("M3 7h14a0 0 0 010 0v6H3zM7.5 10h5") },
  { label: "Input", key: "I", tool: "box", role: "input", icon: I("M3 6.5h14v7H3zM6 8.5v3") },
  { label: "Image", key: "M", tool: "box", role: "image", icon: I("M3.5 4.5h13v11h-13zM3.5 4.5l13 11M16.5 4.5l-13 11") },
  { label: "Nav bar", key: "N", tool: "box", role: "nav", icon: I("M2.5 6h15v5h-15zM5 8.5h3m2 0h2m2 0h2") },
  { label: "Circle / avatar", key: "O", tool: "ellipse", icon: I("M10 3.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13z") },
  { label: "Text", key: "T", tool: "text", icon: I("M5 5h10M10 5v10M8 15h4") },
  { label: "Arrow", key: "A", tool: "arrow", icon: I("M4 16L16 4M9 4h7v7") },
  { label: "Pen", key: "P", tool: "pen", icon: I("M4 16c3-1 4-6 6-6s1 4 3 4 2-3 3-5") },
];

interface Props {
  choice: ToolChoice;
  onChoice: (c: ToolChoice) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function Toolbar({ choice, onChoice, onUndo, onRedo, canUndo, canRedo }: Props) {
  const isActive = (it: Item) => it.tool === choice.tool && (it.tool !== "box" || it.role === choice.role);
  return (
    <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm">
      {ITEMS.map((it) => (
        <button
          key={it.label}
          type="button"
          aria-pressed={isActive(it)}
          aria-label={`${it.label} (${it.key})`}
          title={`${it.label} — ${it.key}`}
          onClick={() => onChoice({ tool: it.tool, role: it.role ?? choice.role })}
          className={`grid h-8 w-8 place-items-center rounded-lg ${isActive(it) ? "bg-accent text-on-accent" : "text-ink hover:bg-surface-2"}`}
        >
          {it.icon}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo (Ctrl+Z)" title="Undo — Ctrl+Z" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-30">
        {I("M7 5L3 9l4 4M3 9h9a5 5 0 010 10h-2")}
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo — Ctrl+Shift+Z" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-30">
        {I("M13 5l4 4-4 4M17 9H8a5 5 0 000 10h2")}
      </button>
    </div>
  );
}
