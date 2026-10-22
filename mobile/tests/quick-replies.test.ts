import type { AiChatMessageDto } from "@/lib/cases/types/ai";
import { SERVICE_CARD_AFTER_USER_MESSAGES } from "@/lib/cases/constants/case-flow";
import { cardModes, flowStepForApp, quickRepliesOf, stickyReady, visibleQuickReplies } from "~/utils/case-cards";

const msg = (over: object = {}) =>
  ({ id: "m", role: "assistant", content: "x", preliminaryAssessment: null, suggestedServices: [], emergency: false, outOfScopeTopics: [], blocked: false, quickReplies: [], createdAt: "", ...over }) as AiChatMessageDto;
const draftCase = { status: "draft", services: [], suggestedServices: [], preferredTimeframe: null, postalCode: null, summaryApprovedAt: null } as never;

// Sikrer, at en akut-markering ikke skjuler kortene (brugerens beslutning, 8.6h).
describe("akut-markering blokerer ikke kortene", () => {
  it("viser behandlingskortet trods emergency=true", () => {
    const step = flowStepForApp(draftCase, { messages: [msg({ emergency: true })], status: "active", readyForSummary: true });
    expect(step).toBe("services");
    expect(cardModes(step).services).toBe("current");
  });
  it("er stadig chat uden klar opsummering", () => {
    expect(flowStepForApp(draftCase, { messages: [msg({ emergency: true })], status: "active", readyForSummary: false })).toBe("chat");
  });
});

// Sikrer, at hurtigsvar kun vises under det seneste AI-svar, når patienten kan bruge dem.
describe("hurtigsvar", () => {
  const base = { pending: false, finished: false, typing: false };
  it("læses defensivt", () => {
    expect(quickRepliesOf(msg())).toEqual([]);
    expect(quickRepliesOf(msg({ quickReplies: ["Ja", "Nej", ""] }))).toEqual(["Ja", "Nej"]);
  });
  it("vises kun under det seneste AI-svar", () => {
    const withReplies = msg({ quickReplies: ["Ja", "Nej"] });
    expect(visibleQuickReplies({ ...base, messages: [withReplies] })).toEqual(["Ja", "Nej"]);
    expect(visibleQuickReplies({ ...base, messages: [withReplies, msg({ role: "user" })] })).toEqual([]);
  });
  it("vises også, når behandlingskortet er åbent (7.9a regel 5)", () => {
    const messages = [msg({ quickReplies: ["Ja", "Nej"], suggestedServices: [{ id: "s" }] })];
    const caseDto = { ...(draftCase as object), suggestedServices: [{ id: "s" }] } as never;
    expect(flowStepForApp(caseDto, { messages, status: "active", readyForSummary: false })).toBe("services");
    expect(visibleQuickReplies({ ...base, messages })).toEqual(["Ja", "Nej"]);
  });
  it("skjules ved afsendelse, lukket samtale og eget input", () => {
    const messages = [msg({ quickReplies: ["Ja"] })];
    for (const off of [{ pending: true }, { finished: true }, { typing: true }]) {
      expect(visibleQuickReplies({ ...base, ...off, messages })).toEqual([]);
    }
  });
});

// Sikrer 7.9a regel 1-3: kortet kommer frem ved forslag, nok beskeder eller blokeret tur med forslag, og klar-signalet forbliver.
describe("behandlingskortet (7.9a)", () => {
  const withSuggestion = { ...(draftCase as object), suggestedServices: [{ id: "s" }] } as never;
  const users = (n: number) => Array.from({ length: n }, () => msg({ role: "user" }));

  it("forslag uden flag giver kortet", () => {
    expect(flowStepForApp(withSuggestion, { messages: [msg()], status: "active", readyForSummary: false })).toBe("services");
  });
  it("giver ikke kort uden forslag og under grænsen", () => {
    expect(flowStepForApp(draftCase, { messages: users(SERVICE_CARD_AFTER_USER_MESSAGES - 1), status: "active", readyForSummary: false })).toBe("chat");
  });
  it("giver kort efter 6 patientbeskeder uden forslag", () => {
    expect(SERVICE_CARD_AFTER_USER_MESSAGES).toBe(6);
    expect(flowStepForApp(draftCase, { messages: users(6), status: "active", readyForSummary: false })).toBe("services");
  });
  it("blokeret tur med forslag giver kort", () => {
    const messages = [msg({ blocked: true, suggestedServices: [{ id: "s" }] })];
    expect(flowStepForApp(withSuggestion, { messages, status: "active", readyForSummary: true })).toBe("services");
    expect(flowStepForApp(withSuggestion, { messages, status: "active", readyForSummary: false })).toBe("services");
  });
  it("readyForSummary forbliver efter en ekstra besked uden flag", () => {
    let ready = stickyReady(null, true);
    expect(ready).toBe(true);
    ready = stickyReady(ready, false);
    expect(ready).toBe(true);
    const messages = [msg(), msg({ role: "user" }), msg()];
    expect(flowStepForApp(draftCase, { messages, status: "active", readyForSummary: ready })).toBe("services");
    expect(stickyReady(null, false)).toBe(false);
  });
});
