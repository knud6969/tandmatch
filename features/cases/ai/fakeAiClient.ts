import "server-only";
// Falsk modelklient til tests (architecture 7.5, række 9). Kalder aldrig OpenAI og bruger intet netværk.
// To brugsmåder: enhedstests giver en `script`, der bestemmer svaret; API-testene bruger standardadfærden, som styres
// af markører i patientens tekst (se nederst). Kun server-side (import "server-only").
// Vælges kun af createAiClient() (openai.ts) når AI_FAKE_CLIENT=1 og NODE_ENV ikke er production.

import { AiInvalidOutputError, AiTimeoutError } from "./errors";
import type { ModelMessage, StructuredCallParams, StructuredModelClient } from "./modelClient";
import { SUMMARY_SCHEMA_NAME } from "./schemas";

export type FakeScript = (params: StructuredCallParams) => unknown | Promise<unknown>;

export class FakeAiClient implements StructuredModelClient {
  readonly model = "fake-model";
  // Alle kald, så tests kan undersøge, hvad der ville være sendt til modellen.
  readonly calls: StructuredCallParams[] = [];

  constructor(private readonly script?: FakeScript) {}

  async callStructured(params: StructuredCallParams): Promise<unknown> {
    this.calls.push(params);
    if (this.script) return this.script(params);
    return params.schemaName === SUMMARY_SCHEMA_NAME ? fakeSummary(params) : fakeChat(params);
  }
}

function textOf(message: ModelMessage | undefined): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  return message.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
}

// Patientens seneste tekst i en chatkontekst (indpakket i <patient_input>).
function lastPatientText(params: StructuredCallParams): string {
  const users = params.messages.filter((m) => m.role === "user");
  const raw = textOf(users[users.length - 1]);
  return raw.replace(/<\/?patient_input>/g, "").trim().toLowerCase();
}

// Almindelig samtale uden nøgleord (7.9a regel 6): to spørgsmål med hurtigsvar, derefter forslag (som en rigtig AI under chat.v5).
const FAKE_QUESTIONS: readonly { reply: string; quickReplies: string[] }[] = [
  { reply: "Hvor i munden sidder det?", quickReplies: ["Foran", "Bagtil", "Øverst", "Nederst"] },
  { reply: "Hvor længe har du haft det?", quickReplies: ["Et par dage", "Over en uge", "Over en måned", "Ved ikke"] },
];
const QUESTION = FAKE_QUESTIONS[1].reply;

// Antal patientbeskeder i konteksten (den nye besked er med).
function userMessageCount(params: StructuredCallParams): number {
  return params.messages.filter((m) => m.role === "user").length;
}

// Markører i patientens besked (kun i tests):
//   test_price        svar med pris (filteret skal blokere)
//   test_unknown_slug foreslår en slug, der ikke findes
//   test_invalid      ugyldigt format
//   test_timeout      timeout fra modellen
//   blegning / hvidere  foreslår blegning (klar til opsummering)
//   karies            foreløbig, ikke-bindende vurdering
//   undersøgelse      foreslår undersoegelse
//   test_suggest_not_ready   forslag, men readyForSummary = false
//   test_blocked_suggestion  gyldigt forslag, men en pris i reply i begge forsøg (guarden bruger SUGGESTION_FALLBACK_TEXT)
//   test_scenario_<n> realistiske forslag pr. scenarie (se FAKE_SCENARIOS), klar til opsummering
//   (ingen markør)    spørgsmål 1 og 2 med hurtigsvar, fra den tredje patientbesked forslaget undersoegelse
// Realistiske forslag pr. scenarie (kun tests): slugs som en rigtig AI ville vælge fra kataloget.
export const FAKE_SCENARIOS: Readonly<Record<string, readonly string[]>> = {
  tandpine_koldt: ["undersoegelse", "fyldning"],
  skaeve_taender: ["tandregulering_konsultation", "tandreguleringsskinner"],
  bloedende_tandkoed: ["tandkoedsundersoegelse", "tandrensning"],
  manglende_tand: ["implantat_samtale", "bro"],
  blegning: ["blegning"],
  tjek_og_rens: ["undersoegelse", "tandrensning"],
  barn: ["boerneundersoegelse", "tilvaenning_tandlaege"],
  knaekket_tand: ["reparation_knaekket_tand"],
};

function fakeChat(params: StructuredCallParams) {
  const text = lastPatientText(params);
  const turn = {
    reply: QUESTION,
    preliminaryAssessment: null as string | null,
    suggestedServices: [] as string[],
    emergency: false,
    outOfScopeTopics: [] as string[],
    readyForSummary: false,
    quickReplies: ["Et par dage", "Over en uge", "Over en måned"] as string[],
  };
  if (text.includes("test_timeout")) throw new AiTimeoutError();
  if (text.includes("test_invalid")) throw new AiInvalidOutputError();
  if (text.includes("test_price")) return { ...turn, reply: "Det koster ca. 2.500 kr." };
  if (text.includes("test_bad_quick")) return { ...turn, quickReplies: ["Ja", "Til 2.500 kr.", "Nej"] };
  if (text.includes("test_emergency_flag")) return { ...turn, reply: "Søg en akut tid.", emergency: true };
  if (text.includes("test_suggest_not_ready")) {
    return { ...turn, reply: "Så kan en undersøgelse passe godt. Har du noget at tilføje?", suggestedServices: ["undersoegelse"], readyForSummary: false };
  }
  if (text.includes("test_blocked_suggestion")) {
    return { ...turn, reply: "Det koster ca. 2.500 kr.", suggestedServices: ["undersoegelse"], readyForSummary: true, quickReplies: [] };
  }
  if (text.includes("test_unknown_slug")) return { ...turn, suggestedServices: ["findes_ikke"] };
  const scenario = /test_scenario_([a-z_]+)/.exec(text)?.[1];
  if (scenario && FAKE_SCENARIOS[scenario]) {
    return {
      ...turn,
      reply: "Ud fra det, du beskriver, kan behandlingerne nedenfor passe. Du bekræfter selv, og klinikken laver den endelige vurdering.",
      suggestedServices: [...FAKE_SCENARIOS[scenario]],
      readyForSummary: true,
      quickReplies: [],
    };
  }
  if (text.includes("karies")) {
    return {
      ...turn,
      reply: "Kan du beskrive, hvornår det gør ondt?",
      quickReplies: ["Når jeg spiser noget koldt", "Når jeg tygger", "Hele tiden"],
      preliminaryAssessment: "Det du beskriver, kan pege på et hul i en tand. Klinikken laver den endelige vurdering.",
    };
  }
  if (text.includes("blegning") || text.includes("hvidere")) {
    return {
      ...turn,
      reply: "Så kan blegning være relevant. Du kan selv bekræfte behandlingen nedenfor, og klinikken laver den endelige vurdering.",
      suggestedServices: ["blegning"],
      readyForSummary: true,
      quickReplies: [],
    };
  }
  if (text.includes("undersøgelse") || text.includes("tjek")) {
    return {
      ...turn,
      reply: "Så kan en undersøgelse passe godt. Du kan selv bekræfte behandlingen nedenfor, og klinikken laver den endelige vurdering.",
      suggestedServices: ["undersoegelse"],
      readyForSummary: true,
      quickReplies: [],
    };
  }
  const asked = userMessageCount(params);
  if (asked <= FAKE_QUESTIONS.length) return { ...turn, ...FAKE_QUESTIONS[asked - 1] };
  return {
    ...turn,
    reply: "Ud fra det, du fortæller, kan en undersøgelse være en god start. Klinikken laver den endelige vurdering.",
    suggestedServices: ["undersoegelse"],
    readyForSummary: true,
    quickReplies: [],
  };
}

// Opsummeringen genfortæller patientens tekst. Markøren test_dark giver et billede med dårlig kvalitet.
function fakeSummary(params: StructuredCallParams) {
  const parts = typeof params.messages[0]?.content === "string" ? [] : (params.messages[0]?.content ?? []);
  const text = parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
  const patientLines = [...text.matchAll(/^Patient: (.*)$/gm)].map((m) => m[1].trim());
  const confirmed = (/<confirmed_services>\n([\s\S]*?)\n<\/confirmed_services>/.exec(text)?.[1] ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const refs = [...text.matchAll(/Billede (img_\d+):/g)].map((m) => m[1]);
  const dark = text.toLowerCase().includes("test_dark");
  return {
    summaryText: `Patienten oplyser: ${patientLines.join(" ").slice(0, 600) || "ingen oplysninger"}`,
    patientWishes: patientLines.slice(0, 1).map((l) => l.slice(0, 150)),
    patientReportedHistory: [],
    suggestedServices: confirmed.slice(0, 5),
    images: refs.map((imageRef) => ({
      imageRef,
      view: "front",
      visibleArea: "Tænder set forfra",
      observations: [],
      quality: dark ? "too_dark" : "ok",
    })),
    outOfScopeTopics: [],
  };
}
