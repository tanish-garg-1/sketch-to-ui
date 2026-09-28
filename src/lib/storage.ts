import { z } from "zod";
import { parseShapes } from "@/editor/schema";
import type { Shape } from "@/editor/types";

export interface Version {
  id: string;
  createdAt: number;
  html: string;
  instruction: string;
  source: "claude" | "offline";
  parentId: string | null;
}

const VersionSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  html: z.string(),
  instruction: z.string(),
  source: z.enum(["claude", "offline"]),
  parentId: z.string().nullable(),
});

const KEYS = { shapes: "sketch2ui:shapes", versions: "sketch2ui:versions" };
const MAX_VERSIONS = 12;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadShapes = (): Shape[] | null => parseShapes(read(KEYS.shapes));
export const saveShapes = (shapes: Shape[]) => write(KEYS.shapes, shapes);

export function loadVersions(): Version[] {
  const r = z.array(VersionSchema).safeParse(read(KEYS.versions));
  return r.success ? r.data : [];
}

/** Keeps the newest versions, dropping older ones if storage quota is exceeded. */
export function saveVersions(versions: Version[]) {
  let list = versions.slice(-MAX_VERSIONS);
  while (list.length && !write(KEYS.versions, list)) list = list.slice(1);
}
