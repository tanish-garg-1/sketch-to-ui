import type { Shape } from "./types";

export const EXAMPLE_SKETCH: Shape[] = [
  { id: "ex-nav", kind: "box", role: "nav", x: 0, y: 0, w: 960, h: 56, text: "Brewlab | Menu | Locations | Rewards | Order now" },
  { id: "ex-h1", kind: "text", x: 0, y: 104, w: 440, h: 104, text: "Coffee roasted this week, delivered tomorrow", size: 40 },
  { id: "ex-sub", kind: "text", x: 0, y: 224, w: 420, h: 48, text: "Pick a roast, set a schedule, pause anytime.", size: 16 },
  { id: "ex-email", kind: "box", role: "input", x: 0, y: 296, w: 272, h: 44, text: "Your email" },
  { id: "ex-cta", kind: "box", role: "button", x: 288, y: 296, w: 152, h: 44, text: "Start my plan" },
  { id: "ex-hero", kind: "box", role: "image", x: 512, y: 96, w: 448, h: 280, text: "coffee bag photo" },
  { id: "ex-c1", kind: "box", role: "box", x: 0, y: 424, w: 296, h: 200, text: "" },
  { id: "ex-c1-img", kind: "box", role: "image", x: 16, y: 440, w: 264, h: 96, text: "light roast" },
  { id: "ex-c1-t", kind: "text", x: 16, y: 552, w: 264, h: 28, text: "Ethiopia Yirgacheffe · $18", size: 16 },
  { id: "ex-c1-b", kind: "box", role: "button", x: 16, y: 584, w: 112, h: 32, text: "Add" },
  { id: "ex-c2", kind: "box", role: "box", x: 332, y: 424, w: 296, h: 200, text: "" },
  { id: "ex-c2-img", kind: "box", role: "image", x: 348, y: 440, w: 264, h: 96, text: "medium roast" },
  { id: "ex-c2-t", kind: "text", x: 348, y: 552, w: 264, h: 28, text: "Colombia Huila · $16", size: 16 },
  { id: "ex-c2-b", kind: "box", role: "button", x: 348, y: 584, w: 112, h: 32, text: "Add" },
  { id: "ex-c3", kind: "box", role: "box", x: 664, y: 424, w: 296, h: 200, text: "" },
  { id: "ex-c3-img", kind: "box", role: "image", x: 680, y: 440, w: 264, h: 96, text: "dark roast" },
  { id: "ex-c3-t", kind: "text", x: 680, y: 552, w: 264, h: 28, text: "Sumatra Mandheling · $17", size: 16 },
  { id: "ex-c3-b", kind: "box", role: "button", x: 680, y: 584, w: 112, h: 32, text: "Add" },
  { id: "ex-note", kind: "arrow", x1: 1040, y1: 330, x2: 952, y2: 310 },
  { id: "ex-note-t", kind: "text", x: 1048, y: 316, w: 200, h: 44, text: "carousel of 3 photos", size: 14 },
];
