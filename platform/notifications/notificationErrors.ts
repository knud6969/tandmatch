import "server-only";

// Fejl fra en afsendelse. `code` er en kort, ufarlig fejlkode (store bogstaver, tal og understreg; gemmes i
// notification_outbox.last_error). Aldrig svarets indhold, adresse eller token. `retryable` afgør, om dispatcheren
// prøver igen senere (retry) eller opgiver rækken (failed).
export class NotificationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "NotificationDeliveryError";
  }
}

// Tjenesten er ikke sat op (fx ingen Resend-nøgle i produktion): beskeden blev ikke sendt, og rækken markeres `skipped` med
// koden, aldrig `sent` (security L4). Koden følger samme format som NotificationDeliveryError.
export class NotificationSkippedError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "NotificationSkippedError";
  }
}

// Resultat pr. modtager (push og web push). Aldrig noget om indholdet.
export type DeliveryResult =
  | { status: "ok" }
  | { status: "invalid_target" } // tokenet eller abonnementet findes ikke mere og slettes
  | { status: "error"; code: string; retryable: boolean };

// Gør en vilkårlig tekst til en fejlkode, der opfylder databasens krav (^[A-Z0-9_]{1,100}$).
export function toErrorCode(prefix: string, raw: string | number): string {
  const body = String(raw).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return `${prefix}_${body || "UNKNOWN"}`.slice(0, 100);
}
