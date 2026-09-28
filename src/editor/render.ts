import { shapeBounds, unionBounds } from "./geometry";
import type { Bounds, Shape } from "./types";

export interface Palette {
  ink: string;
  muted: string;
  paper: string;
  fill: string;
  accent: string;
  onAccent: string;
  font: string;
}

export const SCREEN_PALETTE: Palette = {
  ink: "var(--ink)",
  muted: "var(--muted)",
  paper: "var(--paper)",
  fill: "var(--fill)",
  accent: "var(--accent)",
  onAccent: "var(--on-accent)",
  font: "var(--font-sans), system-ui, sans-serif",
};

export const EXPORT_PALETTE: Palette = {
  ink: "#1f2328",
  muted: "#6e7781",
  paper: "#ffffff",
  fill: "#f3f4f6",
  accent: "#2563eb",
  onAccent: "#ffffff",
  font: "Arial, Helvetica, sans-serif",
};

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const r = (n: number) => Math.round(n * 10) / 10;

/** Greedy word wrap using an average glyph width; good enough for wireframe labels. */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.56)));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= perLine) line += " " + word;
      else {
        lines.push(line);
        line = word;
      }
      while (line.length > perLine) {
        lines.push(line.slice(0, perLine));
        line = line.slice(perLine);
      }
    }
    lines.push(line);
  }
  return lines;
}

function textBlock(
  text: string,
  b: Bounds,
  size: number,
  color: string,
  p: Palette,
  opts: { align?: "start" | "middle"; valign?: "top" | "middle"; pad?: number; weight?: number } = {},
): string {
  if (!text.trim()) return "";
  const pad = opts.pad ?? 8;
  const lines = wrapText(text, Math.max(size, b.w - pad * 2), size);
  const lh = size * 1.25;
  const maxLines = Math.max(1, Math.floor((b.h - (opts.valign === "middle" ? 0 : pad)) / lh) || 1);
  const shown = lines.slice(0, maxLines);
  const x = opts.align === "middle" ? b.x + b.w / 2 : b.x + pad;
  const top = opts.valign === "middle" ? b.y + b.h / 2 - (shown.length * lh) / 2 : b.y + pad;
  const spans = shown
    .map((line, i) => `<tspan x="${r(x)}" y="${r(top + lh * i + size * 0.95)}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text font-family="${p.font}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${color}" text-anchor="${opts.align ?? "start"}">${spans}</text>`;
}

export function shapeMarkup(s: Shape, p: Palette): string {
  const sw = 1.5;
  switch (s.kind) {
    case "box": {
      const b = { x: s.x, y: s.y, w: s.w, h: s.h };
      const rect = (rx: number, fill: string, stroke: string) =>
        `<rect x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      switch (s.role) {
        case "button":
          return rect(Math.min(10, s.h / 2), p.accent, p.accent) + textBlock(s.text || "Button", b, 14, p.onAccent, p, { align: "middle", valign: "middle", weight: 600 });
        case "input":
          return (
            rect(6, p.paper, p.ink) +
            textBlock(s.text || "Input", b, 13, p.muted, p, { valign: "middle", pad: 10 }) +
            `<line x1="${r(s.x + s.w - 14)}" y1="${r(s.y + s.h / 2 - 6)}" x2="${r(s.x + s.w - 14)}" y2="${r(s.y + s.h / 2 + 6)}" stroke="${p.muted}" stroke-width="1.2"/>`
          );
        case "image":
          return (
            rect(4, p.fill, p.ink) +
            `<path d="M${r(s.x)} ${r(s.y)}L${r(s.x + s.w)} ${r(s.y + s.h)}M${r(s.x + s.w)} ${r(s.y)}L${r(s.x)} ${r(s.y + s.h)}" stroke="${p.muted}" stroke-width="1"/>` +
            textBlock(s.text, b, 12, p.ink, p, { align: "middle", valign: "middle" })
          );
        case "nav":
          return rect(4, p.fill, p.ink) + textBlock(s.text, b, 14, p.ink, p, { valign: "middle", pad: 12, weight: 500 });
        default:
          return rect(8, p.paper, p.ink) + textBlock(s.text, b, 13, p.ink, p, { pad: 10 });
      }
    }
    case "ellipse":
      return (
        `<ellipse cx="${r(s.x + s.w / 2)}" cy="${r(s.y + s.h / 2)}" rx="${r(s.w / 2)}" ry="${r(s.h / 2)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="${sw}"/>` +
        textBlock(s.text, s, 13, p.ink, p, { align: "middle", valign: "middle" })
      );
    case "text":
      return textBlock(s.text, s, s.size, p.ink, p, { pad: 0, weight: s.size >= 24 ? 700 : 400 });
    case "arrow": {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = 10;
      const a1 = angle + Math.PI * 0.85;
      const a2 = angle - Math.PI * 0.85;
      return (
        `<path d="M${r(s.x1)} ${r(s.y1)}L${r(s.x2)} ${r(s.y2)}M${r(s.x2 + head * Math.cos(a1))} ${r(s.y2 + head * Math.sin(a1))}L${r(s.x2)} ${r(s.y2)}L${r(s.x2 + head * Math.cos(a2))} ${r(s.y2 + head * Math.sin(a2))}" ` +
        `fill="none" stroke="${p.ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    }
    case "pen": {
      if (!s.points.length) return "";
      const d = s.points.map(([x, y], i) => `${i ? "L" : "M"}${r(x)} ${r(y)}`).join("");
      return `<path d="${d}" fill="none" stroke="${p.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
}

export function sketchToSvg(shapes: Shape[], padding = 24): { svg: string; width: number; height: number } | null {
  const b = unionBounds(shapes.map(shapeBounds));
  if (!b) return null;
  const width = Math.ceil(b.w + padding * 2);
  const height = Math.ceil(b.h + padding * 2);
  const body = shapes.map((s) => shapeMarkup(s, EXPORT_PALETTE)).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${r(b.x - padding)} ${r(b.y - padding)} ${width} ${height}">` +
    `<rect x="${r(b.x - padding)}" y="${r(b.y - padding)}" width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
  return { svg, width, height };
}
