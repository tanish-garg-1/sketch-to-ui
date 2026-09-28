import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { StreamEvent } from "./stream";

const SYSTEM = `You are a senior front-end engineer who turns low-fidelity wireframes into polished, working prototypes.

Respond with one complete HTML document and nothing else: start with <!DOCTYPE html>, with no Markdown fences and no commentary.

- Put all CSS in a single <style> tag and all JavaScript in a single <script> tag. Do not load any external scripts, stylesheets, fonts, or images.
- Follow the wireframe's layout, hierarchy and labels. Boxes are tagged with roles (button, input, image, nav, box); build them as those components. Replace placeholder or scribbled text with realistic copy that fits the context.
- For images use CSS gradients or small inline SVG illustrations, never external URLs.
- Make it work: wire up the interactions the sketch implies (navigation, tabs, forms with inline validation, modals, toggles) with plain JavaScript.
- Make it responsive from 360px to 1440px wide and accessible: semantic elements, labels for inputs, visible focus styles, and good contrast.
- Aim for a clean, modern visual design and keep the document under roughly 450 lines.`;

export interface GenerateInput {
  image: string;
  description: string;
  instruction?: string;
  previousHtml?: string;
}

let client: Anthropic | null = null;

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function* generateWithClaude(input: GenerateInput, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  client ??= new Anthropic();

  const sketchTurn: Anthropic.Beta.BetaMessageParam = {
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: input.image } },
      {
        type: "text",
        text: `Here is my wireframe. ${input.description}${
          input.instruction && !input.previousHtml ? `\n\nExtra direction: ${input.instruction}` : ""
        }`,
      },
    ],
  };
  const messages: Anthropic.Beta.BetaMessageParam[] = input.previousHtml
    ? [
        sketchTurn,
        { role: "assistant", content: input.previousHtml },
        {
          role: "user",
          content: `Revise the prototype: ${input.instruction || "improve it"}\nReturn the full updated HTML document.`,
        },
      ]
    : [sketchTurn];

  yield { type: "status", message: "Reading your sketch…" };

  const stream = client.beta.messages.stream(
    {
      model: "claude-opus-5",
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages,
    },
    { signal },
  );

  let announcedWriting = false;
  for await (const event of stream) {
    if (event.type === "content_block_start" && event.content_block.type === "thinking") {
      yield { type: "status", message: "Planning the layout…" };
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      if (!announcedWriting) {
        announcedWriting = true;
        yield { type: "status", message: "Writing HTML…" };
      }
      yield { type: "delta", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield { type: "error", message: "The model declined this request. Try a different sketch or instruction." };
    return;
  }
  yield {
    type: "done",
    source: "claude",
    warning: final.stop_reason === "max_tokens" ? "The output hit the length limit and may be cut off." : undefined,
  };
}
