import { sketchToSvg } from "./render";
import type { Shape } from "./types";

const MAX_SIDE = 1568;

/** Rasterizes the sketch to a base64 PNG (no data: prefix), capped at the vision model's useful resolution. */
export async function sketchToPng(shapes: Shape[]): Promise<string | null> {
  const result = sketchToSvg(shapes);
  if (!result) return null;
  const scale = Math.min(2, MAX_SIDE / Math.max(result.width, result.height));
  const url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(result.width * scale);
    canvas.height = Math.round(result.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1] ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
