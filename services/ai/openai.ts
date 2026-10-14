import "server-only";
import { AiInvalidOutputError, AiTimeoutError, AiUnavailableError } from "./errors";
import { FakeAiClient } from "./fakeAiClient";
import type { ModelPart, StructuredCallParams, StructuredModelClient } from "./modelClient";

// Eneste sted der kalder OpenAI. Kun server-side. Nøglen læses fra miljøet og logges aldrig.
// Bruger Responses API med strict JSON Schema. store: false, så OpenAI ikke gemmer kaldet.
// Fejl kastes uden indhold (ingen tekst, billeder eller svar i fejlbeskeder).

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

function toInputContent(content: string | ModelPart[]) {
  if (typeof content === "string") return content;
  return content.map((part) =>
    part.type === "text"
      ? { type: "input_text", text: part.text }
      : { type: "input_image", image_url: `data:image/jpeg;base64,${part.data}`, detail: "low" },
  );
}

function extractText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const direct = (data as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const type = (part as { type?: unknown }).type;
      if (type === "refusal") throw new AiInvalidOutputError();
      if (type === "output_text" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

export async function callStructured(params: StructuredCallParams): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiUnavailableError();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: params.instructions,
          input: params.messages.map((m) => ({ role: m.role, content: toInputContent(m.content) })),
          text: {
            format: { type: "json_schema", name: params.schemaName, schema: params.schema, strict: true },
          },
          store: false,
          max_output_tokens: params.maxOutputTokens,
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new AiTimeoutError();
      throw new AiUnavailableError();
    }

    if (!response.ok) {
      // Kun statuskoden logges (af kalderen). Svarteksten fra OpenAI læses ikke ind i fejlen.
      throw new AiUnavailableError();
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (controller.signal.aborted) throw new AiTimeoutError();
      throw new AiInvalidOutputError();
    }

    const text = extractText(data);
    if (text === null) throw new AiInvalidOutputError();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiInvalidOutputError();
    }
  } finally {
    clearTimeout(timer);
  }
}

// Klienten, som AiChatService og AiSummaryService får i constructoren (architecture 2.1.1).
export class OpenAiClient implements StructuredModelClient {
  get model(): string {
    return process.env.OPENAI_MODEL || DEFAULT_MODEL;
  }

  callStructured(params: StructuredCallParams): Promise<unknown> {
    return callStructured(params);
  }
}

// Vælger klienten. TEST-MULIGHED: AI_FAKE_CLIENT=1 giver en deterministisk falsk klient uden netværkskald, men kun uden for
// produktion. Variablen sættes kun af tests/api/run.sh; i produktion ignoreres den, og der returneres altid OpenAI-klienten.
export function createAiClient(): StructuredModelClient {
  if (process.env.AI_FAKE_CLIENT === "1" && process.env.NODE_ENV !== "production") {
    return new FakeAiClient();
  }
  return new OpenAiClient();
}
