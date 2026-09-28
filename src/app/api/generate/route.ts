import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ShapesSchema } from "@/editor/schema";
import type { Shape } from "@/editor/types";
import { aiEnabled, generateWithClaude } from "@/lib/aiGenerate";
import { compileToHtml } from "@/lib/compile";
import { rateLimit } from "@/lib/rateLimit";
import { ndjsonResponse, type StreamEvent } from "@/lib/stream";

export const maxDuration = 300;

const BodySchema = z.object({
  image: z.string().max(6_000_000).regex(/^[A-Za-z0-9+/=]+$/),
  description: z.string().max(20_000),
  shapes: ShapesSchema,
  instruction: z.string().max(1_000).optional(),
  previousHtml: z.string().max(200_000).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* offline(html: string, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  yield { type: "status", message: "Inferring layout…" };
  await sleep(250);
  for (let i = 0; i < html.length && !signal.aborted; i += 160) {
    yield { type: "delta", text: html.slice(i, i + 160) };
    await sleep(12);
  }
  yield { type: "done", source: "offline" };
}

async function* safely(events: AsyncGenerator<StreamEvent>): AsyncGenerator<StreamEvent> {
  try {
    yield* events;
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return;
    if (error instanceof Anthropic.RateLimitError) {
      yield { type: "error", message: "The AI is busy right now. Try again in a minute." };
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}:`, error.message);
      yield { type: "error", message: "The AI service returned an error. Please try again." };
    } else {
      console.error(error);
      yield { type: "error", message: "Generation failed unexpectedly." };
    }
  }
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  if (!aiEnabled()) {
    const html = compileToHtml(body.shapes as Shape[]);
    return ndjsonResponse(offline(html, req.signal), req.signal);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(ip, 10, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: `Rate limit reached. Try again in ${limit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  return ndjsonResponse(safely(generateWithClaude(body, req.signal)), req.signal);
}
