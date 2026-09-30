export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "done"; source: "groq" | "offline"; warning?: string }
  | { type: "error"; message: string };

export function ndjsonResponse(events: AsyncIterable<StreamEvent>, signal?: AbortSignal): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (e) {
        if (signal?.aborted) return controller.close();
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: (e as Error).message }) + "\n"));
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

/** Reads newline-delimited JSON, buffering partial lines that are split across network chunks. */
export async function* readNdjson(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line) as StreamEvent;
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield JSON.parse(rest) as StreamEvent;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fixes a narrow, observed model mistake: a CSS rule that opens with a stray comma right after
 * the previous rule's closing brace, e.g. "}\n, body * { ... }" instead of "body, body * { ... }".
 * A "}" is never followed by a bare "," in valid CSS, so dropping that comma always makes the
 * next rule parse correctly on its own, with no change in meaning. Only ever touches text inside
 * <style> tags — "}, {" is completely normal, valid JavaScript inside <script>, and must not be
 * touched there. Applied server- and client-side wherever we hand generated HTML to an iframe, so
 * a still-broken assumption anywhere in the pipeline can't reach what a visitor sees.
 */
/**
 * Strips pure indentation and collapses blank lines before sending a previous version back to the
 * model as context on a refine turn. Only ever removes whitespace that is insignificant in
 * HTML/CSS/JS (leading indent, extra blank lines) — never touches text mid-line, so it can't alter
 * a string literal or visible copy. This meaningfully shrinks the token cost of a refine turn
 * without changing the document's meaning; the version actually shown to the visitor is never
 * touched by this, only the copy of it fed back to the model.
 */
export function compactForContext(html: string): string {
  return html
    .split("\n")
    .map((line) => line.replace(/^[ \t]+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function repairStyleBlocks(html: string): string {
  return html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => {
    const fixed = css.replace(/}(\s*),(\s*)(?=[a-zA-Z*.:#[&])/g, "}$1$2");
    return open + fixed + close;
  });
}

/** Pulls the HTML document out of model output that may include fences or stray prose. */
export function extractHtml(raw: string): string {
  let text = raw.replace(/^\s*```(?:html)?\s*\n?/i, "");
  const fenceEnd = text.lastIndexOf("```");
  if (fenceEnd >= 0 && /<\/html>\s*$/i.test(text.slice(0, fenceEnd).trimEnd())) text = text.slice(0, fenceEnd);
  const start = text.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) text = text.slice(start);
  const end = text.search(/<\/html>/i);
  if (end >= 0) text = text.slice(0, end + "</html>".length);
  return repairStyleBlocks(text.trim());
}
