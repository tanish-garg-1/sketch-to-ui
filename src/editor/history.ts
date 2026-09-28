import type { Shape } from "./types";

const LIMIT = 100;

export interface History {
  past: Shape[][];
  present: Shape[];
  future: Shape[][];
}

export type HistoryAction =
  | { type: "commit"; shapes: Shape[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; shapes: Shape[] };

export const initHistory = (shapes: Shape[] = []): History => ({ past: [], present: shapes, future: [] });

export function historyReducer(h: History, action: HistoryAction): History {
  switch (action.type) {
    case "commit":
      if (action.shapes === h.present) return h;
      return { past: [...h.past, h.present].slice(-LIMIT), present: action.shapes, future: [] };
    case "undo": {
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    }
    case "redo": {
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    }
    case "reset":
      return initHistory(action.shapes);
  }
}
