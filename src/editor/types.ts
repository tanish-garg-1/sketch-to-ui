export type BoxRole = "box" | "button" | "input" | "image" | "nav";

export interface BoxShape {
  id: string;
  kind: "box";
  role: BoxRole;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface EllipseShape {
  id: string;
  kind: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface TextShape {
  id: string;
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
}

export interface ArrowShape {
  id: string;
  kind: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PenShape {
  id: string;
  kind: "pen";
  points: [number, number][];
}

export type Shape = BoxShape | EllipseShape | TextShape | ArrowShape | PenShape;
export type BoxLike = BoxShape | EllipseShape | TextShape;

export type Tool = "select" | "box" | "ellipse" | "text" | "arrow" | "pen" | "hand";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function isBoxLike(s: Shape): s is BoxLike {
  return s.kind === "box" || s.kind === "ellipse" || s.kind === "text";
}

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
