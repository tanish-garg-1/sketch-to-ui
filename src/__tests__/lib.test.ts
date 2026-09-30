import { describe, expect, it } from "vitest";
import { EXAMPLE_SKETCH } from "@/editor/example";
import type { Shape } from "@/editor/types";
import { injectBridge, isBridgeMessage, BRIDGE_SOURCE } from "@/lib/bridge";
import { compileToHtml } from "@/lib/compile";
import { buildTree, describeSketch, toColumns, toRows } from "@/lib/layout";
import { rateLimit } from "@/lib/rateLimit";
import { compactForContext, extractHtml, readNdjson } from "@/lib/stream";

const box = (id: string, role: string, x: number, y: number, w: number, h: number, text = ""): Shape =>
  ({ id, kind: "box", role, x, y, w, h, text }) as Shape;

describe("layout inference", () => {
  it("nests elements under the smallest enclosing container", () => {
    const tree = buildTree([
      box("page", "box", 0, 0, 500, 500),
      box("card", "box", 20, 20, 200, 200),
      box("btn", "button", 40, 40, 80, 30, "Go"),
    ])!;
    expect(tree.children.map((c) => c.shape?.id)).toEqual(["page"]);
    expect(tree.children[0].children[0].shape?.id).toBe("card");
    expect(tree.children[0].children[0].children[0].shape?.id).toBe("btn");
  });

  it("never nests inside non-container roles", () => {
    const tree = buildTree([box("img", "image", 0, 0, 300, 300), box("btn", "button", 10, 10, 50, 20)])!;
    expect(tree.children).toHaveLength(2);
  });

  it("groups vertically overlapping siblings into left-to-right rows", () => {
    const tree = buildTree([
      box("c", "button", 300, 0, 100, 40),
      box("a", "button", 0, 5, 100, 40),
      box("below", "input", 0, 100, 400, 40),
    ])!;
    const rows = toRows(tree.children);
    expect(rows.map((r) => r.map((n) => n.shape?.id))).toEqual([["a", "c"], ["below"]]);
  });

  it("splits a row into columns when items are stacked beside a tall element", () => {
    const tree = buildTree([
      box("title", "input", 0, 0, 300, 40),
      box("cta", "button", 0, 60, 120, 40),
      box("hero", "image", 400, 0, 300, 200),
    ])!;
    const [row] = toRows(tree.children);
    expect(toColumns(row).map((c) => c.map((n) => n.shape?.id))).toEqual([["title", "cta"], ["hero"]]);
  });

  it("keeps column widths within the row", () => {
    const html = compileToHtml(EXAMPLE_SKETCH);
    const widths = [...html.matchAll(/flex:0 0 ([\d.]+)%;margin-left:([\d.]+)%/g)].map((m) => Number(m[1]) + Number(m[2]));
    expect(Math.max(...widths)).toBeLessThanOrEqual(100);
  });

  it("describes the example sketch with roles and labels", () => {
    const text = describeSketch(EXAMPLE_SKETCH);
    expect(text).toContain('button "Start my plan"');
    expect(text).toContain("  - image");
    expect(describeSketch([])).toBe("The canvas is empty.");
  });
});

describe("offline compiler", () => {
  it("produces a complete, escaped HTML document", () => {
    const html = compileToHtml([box("b", "button", 0, 0, 100, 40, `<img src=x onerror=alert(1)>`)]);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("handles partially overlapping shapes without recursing forever", () => {
    const html = compileToHtml([box("a", "button", 0, 0, 100, 100, "A"), box("b", "button", 50, 50, 100, 100, "B")]);
    expect(html).toContain(">A</button>");
    expect(html).toContain(">B</button>");
  });

  it("maps roles to semantic elements", () => {
    const html = compileToHtml(EXAMPLE_SKETCH);
    expect(html).toContain("<nav>");
    expect(html).toContain('<input placeholder="Your email">');
    expect(html).toContain("<h1>");
  });
});

describe("stream helpers", () => {
  it("reassembles NDJSON lines split across chunks", async () => {
    const enc = new TextEncoder();
    const chunks = ['{"type":"delta","te', 'xt":"<h"}\n{"type":"de', 'lta","text":"1>"}\n{"type":"done","source":"offline"}'];
    const body = new ReadableStream({
      start(c) {
        chunks.forEach((s) => c.enqueue(enc.encode(s)));
        c.close();
      },
    });
    const events = [];
    for await (const ev of readNdjson(new Response(body))) events.push(ev);
    expect(events).toEqual([
      { type: "delta", text: "<h" },
      { type: "delta", text: "1>" },
      { type: "done", source: "offline" },
    ]);
  });

  it("extracts HTML from fenced or chatty model output", () => {
    expect(extractHtml("```html\n<!DOCTYPE html><html><body>hi</body></html>\n```")).toBe("<!DOCTYPE html><html><body>hi</body></html>");
    expect(extractHtml("Sure! Here it is:\n<!doctype html><html></html>\nEnjoy")).toBe("<!doctype html><html></html>");
    expect(extractHtml("<!DOCTYPE html><html><body>partial")).toBe("<!DOCTYPE html><html><body>partial");
  });

  it("repairs a stray comma the model sometimes leaves before a selector, without touching <script>", () => {
    const html =
      "<!doctype html><html><head><style>\n" +
      "body { color: red }\n\n" +
      ", body * { font-family: inherit; }\n" +
      "</style></head><body><script>\n" +
      "const items = [{ a: 1 }, { b: 2 }];\n" +
      "</script></body></html>";
    const out = extractHtml(html);
    expect(out).toContain("body * { font-family: inherit; }");
    expect(out).not.toMatch(/}\s*,\s*body \*/);
    // The identical-looking ", {" inside <script> is valid JS and must survive untouched.
    expect(out).toContain("const items = [{ a: 1 }, { b: 2 }];");
  });
});

describe("compactForContext", () => {
  it("strips leading indentation and blank lines, never touching text mid-line", () => {
    const html = "<div>\n    <p>  Log in  </p>\n\n\n\n    <span>a string with \"  spaces  \"</span>\n</div>";
    const out = compactForContext(html);
    expect(out).toBe('<div>\n<p>  Log in  </p>\n<span>a string with "  spaces  "</span>\n</div>');
  });
});

describe("preview bridge", () => {
  it("injects the bridge right after <head>", () => {
    const out = injectBridge("<html><head><title>x</title></head></html>");
    expect(out.indexOf("<script>")).toBe("<html><head>".length);
  });

  it("only accepts messages tagged with the bridge source", () => {
    expect(isBridgeMessage({ source: BRIDGE_SOURCE, type: "ready" })).toBe(true);
    expect(isBridgeMessage({ source: "evil", type: "error" })).toBe(false);
    expect(isBridgeMessage("string")).toBe(false);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and recovers after the window", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 1000, 0).ok).toBe(true);
    expect(rateLimit(key, 2, 1000, 10).ok).toBe(true);
    const blocked = rateLimit(key, 2, 1000, 20);
    expect(blocked).toEqual({ ok: false, retryAfter: 1 });
    expect(rateLimit(key, 2, 1000, 1500).ok).toBe(true);
  });
});
