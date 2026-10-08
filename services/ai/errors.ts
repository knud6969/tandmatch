// Fejltyper for AI-laget. Ingen fejlbesked indeholder patienttekst, nøgler eller billed-data.

export class AiTimeoutError extends Error {
  constructor() {
    super("AI-kaldet fik timeout");
    this.name = "AiTimeoutError";
  }
}

// Netværksfejl, manglende nøgle eller fejlsvar fra OpenAI.
export class AiUnavailableError extends Error {
  constructor() {
    super("AI-tjenesten er ikke tilgængelig");
    this.name = "AiUnavailableError";
  }
}

// Modellens svar kunne ikke parses som JSON eller havde en ugyldig form.
export class AiInvalidOutputError extends Error {
  constructor() {
    super("AI-svaret var ugyldigt");
    this.name = "AiInvalidOutputError";
  }
}
