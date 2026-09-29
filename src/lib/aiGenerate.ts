import "server-only";
import Groq from "groq-sdk";
import type { StreamEvent } from "./stream";

const SYSTEM = `You are a senior front-end engineer who turns low-fidelity wireframes into polished, working prototypes.

Respond with one complete HTML document and nothing else: start with <!DOCTYPE html>, with no Markdown fences and no commentary.

- Put all CSS in a single <style> tag and all JavaScript in a single <script> tag. Do not load any external scripts, stylesheets, fonts, or images.
- Follow the wireframe's layout, hierarchy and labels. Boxes are tagged with roles (button, input, image, nav, box); build them as those components. Replace placeholder or scribbled text with realistic copy that fits the context.
- For images use CSS gradients or small inline SVG illustrations, never external URLs.
- Make it work: wire up the interactions the sketch implies (navigation, tabs, forms with inline validation, modals, toggles) with plain JavaScript.
- Make it responsive from 360px to 1440px wide and accessible: semantic elements, labels for inputs, visible focus styles, and good contrast.
- Aim for a clean, modern visual design and keep the document under roughly 450 lines.`;

/** Groq's only vision model at time of writing; see console.groq.com/docs/vision. */
const MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

export interface GenerateInput {
  image: string;
  description: string;
  instruction?: string;
  previousHtml?: string;
}

let client: Groq | null = null;

export function aiEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

type ChatMessage = Groq.Chat.Completions.ChatCompletionMessageParam;

export async function* generateWithGroq(input: GenerateInput, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY });

  const sketchTurn: ChatMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: `Here is my wireframe. ${input.description}${
          input.instruction && !input.previousHtml ? `\n\nExtra direction: ${input.instruction}` : ""
        }`,
      },
      { type: "image_url", image_url: { url: `data:image/png;base64,${input.image}` } },
    ],
  };
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    sketchTurn,
    ...(input.previousHtml
      ? ([
          { role: "assistant", content: input.previousHtml },
          {
            role: "user",
            content: `Revise the prototype: ${input.instruction || "improve it"}\nReturn the full updated HTML document.`,
          },
        ] satisfies ChatMessage[])
      : []),
  ];

  yield { type: "status", message: "Reading your sketch…" };

  const stream = await client.chat.completions.create(
    { model: MODEL, messages, stream: true, max_completion_tokens: 12000 },
    { signal },
  );

  let announcedWriting = false;
  let finishReason: string | null = null;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    const text = choice?.delta?.content;
    if (text) {
      if (!announcedWriting) {
        announcedWriting = true;
        yield { type: "status", message: "Writing HTML…" };
      }
      yield { type: "delta", text };
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  }

  yield {
    type: "done",
    source: "groq",
    warning: finishReason === "length" ? "The output hit the length limit and may be cut off." : undefined,
  };
}
