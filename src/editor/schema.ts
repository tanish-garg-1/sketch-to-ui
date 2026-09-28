import { z } from "zod";
import type { Shape } from "./types";

const n = z.number().finite().min(-1e6).max(1e6);
const size = z.number().finite().min(0).max(1e6);
const text = z.string().max(2_000);

export const ShapeSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().max(64), kind: z.literal("box"), role: z.enum(["box", "button", "input", "image", "nav"]), x: n, y: n, w: size, h: size, text }),
  z.object({ id: z.string().max(64), kind: z.literal("ellipse"), x: n, y: n, w: size, h: size, text }),
  z.object({ id: z.string().max(64), kind: z.literal("text"), x: n, y: n, w: size, h: size, text, size: z.number().min(8).max(96) }),
  z.object({ id: z.string().max(64), kind: z.literal("arrow"), x1: n, y1: n, x2: n, y2: n }),
  z.object({ id: z.string().max(64), kind: z.literal("pen"), points: z.array(z.tuple([n, n])).max(5_000) }),
]);

export const ShapesSchema = z.array(ShapeSchema).max(500);

export function parseShapes(data: unknown): Shape[] | null {
  const r = ShapesSchema.safeParse(data);
  return r.success ? (r.data as Shape[]) : null;
}
