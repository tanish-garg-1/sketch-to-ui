import { describe, expect, it } from "vitest";
import { fitShape, hitTest, resizeBounds, shapeAt, simplifyPath, zoomAt, screenToWorld } from "@/editor/geometry";
import { historyReducer, initHistory } from "@/editor/history";
import { escapeXml, sketchToSvg, wrapText } from "@/editor/render";
import { parseShapes } from "@/editor/schema";
import type { Shape } from "@/editor/types";

const box = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Shape> = {}): Shape =>
  ({ id, kind: "box", role: "box", x, y, w, h, text: "", ...extra }) as Shape;

describe("geometry", () => {
  it("picks the topmost shape under the pointer", () => {
    const shapes = [box("back", 0, 0, 200, 200), box("front", 50, 50, 50, 50)];
    expect(shapeAt(shapes, { x: 60, y: 60 }, 2)?.id).toBe("front");
    expect(shapeAt(shapes, { x: 10, y: 10 }, 2)?.id).toBe("back");
    expect(shapeAt(shapes, { x: 400, y: 400 }, 2)).toBeNull();
  });

  it("hit-tests arrows by distance to the segment", () => {
    const arrow: Shape = { id: "a", kind: "arrow", x1: 0, y1: 0, x2: 100, y2: 0 };
    expect(hitTest(arrow, { x: 50, y: 3 }, 4)).toBe(true);
    expect(hitTest(arrow, { x: 50, y: 10 }, 4)).toBe(false);
  });

  it("flips when a resize handle is dragged past the opposite edge", () => {
    expect(resizeBounds({ x: 0, y: 0, w: 100, h: 50 }, "e", { x: -40, y: 0 })).toEqual({ x: -40, y: 0, w: 40, h: 50 });
  });

  it("scales grouped shapes proportionally", () => {
    const s = fitShape(box("b", 10, 10, 10, 10), { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 100 });
    expect(s).toMatchObject({ x: 20, y: 10, w: 20, h: 10 });
  });

  it("keeps the world point under the cursor fixed while zooming", () => {
    const cam = { x: 30, y: -20, z: 1 };
    const screen = { x: 200, y: 150 };
    const before = screenToWorld(screen, cam);
    const after = screenToWorld(screen, zoomAt(cam, screen, 2.5));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("thins dense pen strokes but keeps both endpoints", () => {
    const pts: [number, number][] = Array.from({ length: 50 }, (_, i) => [i * 0.5, 0]);
    const out = simplifyPath(pts, 5);
    expect(out.length).toBeLessThan(10);
    expect(out[0]).toEqual([0, 0]);
    expect(out.at(-1)).toEqual([24.5, 0]);
  });
});

describe("history", () => {
  it("undoes and redoes, and a new commit clears the redo stack", () => {
    let h = initHistory([]);
    const a = [box("a", 0, 0, 10, 10)];
    const b = [...a, box("b", 20, 0, 10, 10)];
    h = historyReducer(h, { type: "commit", shapes: a });
    h = historyReducer(h, { type: "commit", shapes: b });
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(a);
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(b);
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "commit", shapes: [] });
    expect(h.future).toHaveLength(0);
    expect(historyReducer(initHistory(), { type: "undo" }).present).toEqual([]);
  });
});

describe("render", () => {
  it("escapes user text in SVG markup", () => {
    const out = sketchToSvg([box("x", 0, 0, 100, 40, { text: `<script>"&'` } as Partial<Shape>)]);
    expect(out?.svg).not.toContain("<script>");
    expect(escapeXml(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
  });

  it("wraps long words across lines", () => {
    expect(wrapText("aaaaaaaaaaaaaaaaaaaa", 50, 10).length).toBeGreaterThan(1);
    expect(wrapText("one\ntwo", 500, 10)).toEqual(["one", "two"]);
  });
});

describe("schema", () => {
  it("rejects malformed persisted shapes", () => {
    expect(parseShapes([{ id: "a", kind: "box", role: "hacker", x: 0, y: 0, w: 1, h: 1, text: "" }])).toBeNull();
    expect(parseShapes("nope")).toBeNull();
    expect(parseShapes([box("ok", 0, 0, 1, 1)])).toHaveLength(1);
  });
});
