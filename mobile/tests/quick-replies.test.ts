import type { AiChatMessageDto } from "@/lib/types/ai";
import { cardModes, flowStepForApp, quickRepliesOf, visibleQuickReplies } from "~/utils/case-cards";

const msg = (over: object = {}) =>
  ({ id: "m", role: "assistant", content: "x", preliminaryAssessment: null, suggestedServices: [], emergency: false, outOfScopeTopics: [], blocked: false, createdAt: "", ...over }) as AiChatMessageDto;
const draftCase = { status: "draft", services: [], preferredTimeframe: null, postalCode: null, summaryApprovedAt: null } as never;

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

describe("hurtigsvar", () => {
  const base = { pending: false, finished: false, cardActive: false, typing: false };
  it("læses defensivt", () => {
    expect(quickRepliesOf(msg())).toEqual([]);
    expect(quickRepliesOf(msg({ quickReplies: ["Ja", "Nej", ""] }))).toEqual(["Ja", "Nej"]);
  });
  it("vises kun under det seneste AI-svar", () => {
    const withReplies = msg({ quickReplies: ["Ja", "Nej"] });
    expect(visibleQuickReplies({ ...base, messages: [withReplies] })).toEqual(["Ja", "Nej"]);
    expect(visibleQuickReplies({ ...base, messages: [withReplies, msg({ role: "user" })] })).toEqual([]);
  });
  it("skjules ved afsendelse, kort, lukket samtale og eget input", () => {
    const messages = [msg({ quickReplies: ["Ja"] })];
    for (const off of [{ pending: true }, { finished: true }, { cardActive: true }, { typing: true }]) {
      expect(visibleQuickReplies({ ...base, ...off, messages })).toEqual([]);
    }
  });
});
