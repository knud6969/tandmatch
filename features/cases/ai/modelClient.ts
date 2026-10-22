import "server-only";
// Grænsefladen til sprogmodellen. AiChatService og AiSummaryService får en StructuredModelClient i constructoren,
// så de kan testes med en falsk klient (architecture 2.1.1). Kun server-side (import "server-only").

export type ModelPart =
  | { type: "text"; text: string }
  | { type: "image_jpeg_base64"; data: string };

export type ModelMessage = {
  role: "user" | "assistant";
  content: string | ModelPart[];
};

export type StructuredCallParams = {
  instructions: string;
  messages: ModelMessage[];
  schemaName: string;
  schema: object;
  maxOutputTokens: number;
  timeoutMs: number;
};

export interface StructuredModelClient {
  // Modellens navn, gemmes på samtalen og sagen for sporbarhed.
  readonly model: string;
  // Returnerer det parsede JSON-svar (uvalideret). Kaster AiTimeoutError, AiUnavailableError eller AiInvalidOutputError.
  callStructured(params: StructuredCallParams): Promise<unknown>;
}
