import type { SessionStatus } from "./session-status";

// Hvad en skærm, der kræver konto, skal vise ud fra den fælles loginstatus (serveren afviser anonyme med
// ACCOUNT_REQUIRED/ANONYMOUS_NOT_ALLOWED, så skærmen må aldrig hente noget, før status er `account`).
//   spinner = vent; content = vis skærmen; login = kort med "Log ind" og "Opret konto"; retry = "Prøv igen"
export type AccountGate = "spinner" | "content" | "login" | "retry";

export function accountGate(status: SessionStatus): AccountGate {
  switch (status) {
    case "loading":
      return "spinner";
    case "account":
      return "content";
    case "unavailable":
      return "retry";
    case "anonymous":
    case "none":
      return "login";
  }
}
