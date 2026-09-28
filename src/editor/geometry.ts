import { isBoxLike, type Bounds, type Camera, type Handle, type Point, type Shape } from "./types";

export const GRID = 8;
export const MIN_SIZE = 8;

export const snap = (v: number, on = true) => (on ? Math.round(v / GRID) * GRID : v);

export function normalize(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function shapeBounds(s: Shape): Bounds {
  if (isBoxLike(s)) return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.kind === "arrow") return normalize({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of s.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function unionBounds(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  const minX = Math.min(...list.map((b) => b.x));
  const minY = Math.min(...list.map((b) => b.y));
  const maxX = Math.max(...list.map((b) => b.x + b.w));
  const maxY = Math.max(...list.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function intersects(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTest(s: Shape, p: Point, tolerance: number): boolean {
  if (s.kind === "arrow") return distToSegment(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= tolerance;
  if (s.kind === "pen") {
    for (let i = 1; i < s.points.length; i++) {
      const [ax, ay] = s.points[i - 1];
      const [bx, by] = s.points[i];
      if (distToSegment(p, { x: ax, y: ay }, { x: bx, y: by }) <= tolerance) return true;
    }
    return s.points.length === 1 && Math.hypot(p.x - s.points[0][0], p.y - s.points[0][1]) <= tolerance;
  }
  if (s.kind === "ellipse") {
    const rx = s.w / 2 + tolerance;
    const ry = s.h / 2 + tolerance;
    const nx = (p.x - (s.x + s.w / 2)) / rx;
    const ny = (p.y - (s.y + s.h / 2)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return p.x >= s.x - tolerance && p.x <= s.x + s.w + tolerance && p.y >= s.y - tolerance && p.y <= s.y + s.h + tolerance;
}

/** Topmost shape under the point (later shapes render on top). */
export function shapeAt(shapes: Shape[], p: Point, tolerance: number): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i], p, tolerance)) return shapes[i];
  return null;
}

export function translate(s: Shape, dx: number, dy: number): Shape {
  if (isBoxLike(s)) return { ...s, x: s.x + dx, y: s.y + dy };
  if (s.kind === "arrow") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

/** Resize bounds by dragging a handle; flips cleanly when dragged past the opposite edge. */
export function resizeBounds(b: Bounds, handle: Handle, p: Point): Bounds {
  let left = b.x, top = b.y, right = b.x + b.w, bottom = b.y + b.h;
  if (handle.includes("w")) left = p.x;
  if (handle.includes("e")) right = p.x;
  if (handle.includes("n")) top = p.y;
  if (handle.includes("s")) bottom = p.y;
  const r = normalize({ x: left, y: top }, { x: right, y: bottom });
  return { ...r, w: Math.max(MIN_SIZE, r.w), h: Math.max(MIN_SIZE, r.h) };
}

/** Maps a shape from one bounding box into another (used for group resize). */
export function fitShape(s: Shape, from: Bounds, to: Bounds): Shape {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const mx = (x: number) => to.x + (x - from.x) * sx;
  const my = (y: number) => to.y + (y - from.y) * sy;
  if (isBoxLike(s)) return { ...s, x: mx(s.x), y: my(s.y), w: Math.max(MIN_SIZE / 2, s.w * sx), h: Math.max(MIN_SIZE / 2, s.h * sy) };
  if (s.kind === "arrow") return { ...s, x1: mx(s.x1), y1: my(s.y1), x2: mx(s.x2), y2: my(s.y2) };
  return { ...s, points: s.points.map(([x, y]) => [mx(x), my(y)] as [number, number]) };
}

export function handlePoints(b: Bounds): Record<Handle, Point> {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return {
    nw: { x: b.x, y: b.y },
    n: { x: cx, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    e: { x: b.x + b.w, y: cy },
    se: { x: b.x + b.w, y: b.y + b.h },
    s: { x: cx, y: b.y + b.h },
    sw: { x: b.x, y: b.y + b.h },
    w: { x: b.x, y: cy },
  };
}

export const screenToWorld = (p: Point, cam: Camera): Point => ({ x: (p.x - cam.x) / cam.z, y: (p.y - cam.y) / cam.z });

/** Zoom while keeping the world point under the cursor fixed. */
export function zoomAt(cam: Camera, screen: Point, nextZ: number): Camera {
  const z = Math.min(4, Math.max(0.2, nextZ));
  const world = screenToWorld(screen, cam);
  return { z, x: screen.x - world.x * z, y: screen.y - world.y * z };
}

export function simplifyPath(points: [number, number][], minDist: number): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = out[out.length - 1];
    if (Math.hypot(points[i][0] - px, points[i][1] - py) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}
