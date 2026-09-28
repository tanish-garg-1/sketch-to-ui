export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "delta"; text: string }
  | { type: "done"; source: "claude" | "offline"; warning?: string }
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

/** Pulls the HTML document out of model output that may include fences or stray prose. */
export function extractHtml(raw: string): string {
  let text = raw.replace(/^\s*```(?:html)?\s*\n?/i, "");
  const fenceEnd = text.lastIndexOf("```");
  if (fenceEnd >= 0 && /<\/html>\s*$/i.test(text.slice(0, fenceEnd).trimEnd())) text = text.slice(0, fenceEnd);
  const start = text.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) text = text.slice(start);
  const end = text.search(/<\/html>/i);
  if (end >= 0) text = text.slice(0, end + "</html>".length);
  return text.trim();
}
