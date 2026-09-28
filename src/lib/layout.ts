import { contains, shapeBounds, unionBounds } from "@/editor/geometry";
import { isBoxLike, type BoxLike, type Bounds, type Shape } from "@/editor/types";

export interface LayoutNode {
  shape: BoxLike | null;
  bounds: Bounds;
  children: LayoutNode[];
}

const area = (b: Bounds) => b.w * b.h;
const TOLERANCE = 4;

function canContain(s: BoxLike): boolean {
  return s.kind === "box" && (s.role === "box" || s.role === "nav");
}

function padded(b: Bounds): Bounds {
  return { x: b.x - TOLERANCE, y: b.y - TOLERANCE, w: b.w + TOLERANCE * 2, h: b.h + TOLERANCE * 2 };
}

/** Builds a containment tree: each element is nested under the smallest container box that encloses it. */
export function buildTree(shapes: Shape[]): LayoutNode | null {
  const boxes = shapes.filter(isBoxLike).filter((s) => s.w > 0 && s.h > 0);
  const rootBounds = unionBounds(boxes.map(shapeBounds));
  if (!rootBounds) return null;
  const root: LayoutNode = { shape: null, bounds: rootBounds, children: [] };

  const sorted = [...boxes].sort((a, b) => area(shapeBounds(b)) - area(shapeBounds(a)));
  for (const s of sorted) {
    const b = shapeBounds(s);
    let parent = root;
    for (;;) {
      const next = parent.children.find((c) => c.shape && canContain(c.shape) && contains(padded(c.bounds), b));
      if (!next) break;
      parent = next;
    }
    parent.children.push({ shape: s, bounds: b, children: [] });
  }
  return root;
}

/** Groups siblings into visual rows: elements whose vertical extents overlap enough share a row. */
export function toRows(nodes: LayoutNode[]): LayoutNode[][] {
  const sorted = [...nodes].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const rows: { top: number; bottom: number; items: LayoutNode[] }[] = [];
  for (const n of sorted) {
    const top = n.bounds.y;
    const bottom = n.bounds.y + n.bounds.h;
    const row = rows[rows.length - 1];
    const overlap = row ? Math.min(row.bottom, bottom) - Math.max(row.top, top) : 0;
    if (row && overlap > 0.3 * Math.min(row.bottom - row.top, bottom - top)) {
      row.items.push(n);
      row.bottom = Math.max(row.bottom, bottom);
    } else {
      rows.push({ top, bottom, items: [n] });
    }
  }
  return rows.map((row) => row.items.sort((a, b) => a.bounds.x - b.bounds.x));
}

/** Within one row, merges items that overlap horizontally (i.e. are stacked) into columns. */
export function toColumns(row: LayoutNode[]): LayoutNode[][] {
  const sorted = [...row].sort((a, b) => a.bounds.x - b.bounds.x);
  const cols: { right: number; items: LayoutNode[] }[] = [];
  for (const n of sorted) {
    const col = cols[cols.length - 1];
    if (col && n.bounds.x < col.right - TOLERANCE) {
      col.items.push(n);
      col.right = Math.max(col.right, n.bounds.x + n.bounds.w);
    } else {
      cols.push({ right: n.bounds.x + n.bounds.w, items: [n] });
    }
  }
  return cols.map((c) => c.items);
}

const pct = (n: number) => Math.round(n * 1000) / 10;

/** Plain-language element list sent to the model alongside the image. */
export function describeSketch(shapes: Shape[]): string {
  const tree = buildTree(shapes);
  if (!tree) return "The canvas is empty.";
  const root = tree.bounds;
  const lines: string[] = [];
  const walk = (node: LayoutNode, depth: number) => {
    for (const row of toRows(node.children)) {
      for (const child of row) {
        const s = child.shape!;
        const kind = s.kind === "box" ? s.role : s.kind === "ellipse" ? "circle/avatar" : s.size >= 24 ? "heading" : "text";
        const b = child.bounds;
        const pos = `x ${pct((b.x - root.x) / root.w)}%, y ${pct((b.y - root.y) / root.h)}%, w ${pct(b.w / root.w)}%, h ${pct(b.h / root.h)}%`;
        const label = s.text.trim() ? ` "${s.text.trim().replace(/\s+/g, " ").slice(0, 200)}"` : "";
        lines.push(`${"  ".repeat(depth)}- ${kind}${label} (${pos})`);
        walk(child, depth + 1);
      }
    }
  };
  walk(tree, 0);
  const extras = shapes.filter((s) => s.kind === "arrow" || s.kind === "pen").length;
  if (extras) lines.push(`(${extras} arrows/freehand strokes are annotations; see the image.)`);
  return `Sketch is ${Math.round(root.w)}×${Math.round(root.h)} px. Elements, top to bottom, nested by containment:\n${lines.join("\n")}`;
}
