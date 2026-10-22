import { describe, expect, it } from "vitest";
import { nextCaseFlowStep } from "@/lib/cases/domain/case-flow";
import type { AiChatMessageDto } from "@/lib/cases/types/ai";

type CaseArg = Parameters<typeof nextCaseFlowStep>[0];
type ChatArg = Parameters<typeof nextCaseFlowStep>[1];

const service = { id: "s1", suggestedByAi: true } as unknown as CaseArg["services"][number];
const complete: CaseArg = {
  status: "draft",
  services: [service],
  suggestedServices: [],
  preferredTimeframe: "asap",
  postalCode: "2100",
  summaryApprovedAt: "2026-10-19T10:00:00Z",
};
const empty: CaseArg = { ...complete, services: [], preferredTimeframe: null, postalCode: null, summaryApprovedAt: null };
const chat: ChatArg = { messages: [], status: "active", readyForSummary: false };

function assistant(emergency: boolean): AiChatMessageDto {
  return {
    id: "m", role: "assistant", content: "x", preliminaryAssessment: null, suggestedServices: [],
    emergency, outOfScopeTopics: [], blocked: false, quickReplies: [], createdAt: "2026-10-19T10:00:00Z",
  };
}

describe("nextCaseFlowStep", () => {
  it("submitted for sager, der ikke er kladder, også ved akut", () => {
    expect(nextCaseFlowStep({ ...complete, status: "submitted" }, chat)).toBe("submitted");
    expect(nextCaseFlowStep({ ...empty, status: "closed" }, { ...chat, messages: [assistant(true)] })).toBe("submitted");
  });
  it("emergency går forud for alt andet end submitted", () => {
    const state = { ...chat, readyForSummary: true, messages: [assistant(true)] };
    expect(nextCaseFlowStep(empty, state)).toBe("emergency");
    expect(nextCaseFlowStep(complete, state)).toBe("emergency");
  });
  it("kun den seneste assistentbesked tæller for akut", () => {
    expect(nextCaseFlowStep(empty, { ...chat, messages: [assistant(true), assistant(false)] })).toBe("chat");
  });
  it("chat uden bekræftede ydelser og uden klar-signal", () => {
    expect(nextCaseFlowStep(empty, chat)).toBe("chat");
  });
  it("services når readyForSummary er sand", () => {
    expect(nextCaseFlowStep(empty, { ...chat, readyForSummary: true })).toBe("services");
  });
  it("services ved lukket samtale uden forslag", () => {
    expect(nextCaseFlowStep(empty, { ...chat, status: "closed" })).toBe("services");
  });
  it("timeframe, postal_code og summary i rækkefølge", () => {
    const withServices = { ...empty, services: [service] };
    expect(nextCaseFlowStep(withServices, chat)).toBe("timeframe");
    expect(nextCaseFlowStep({ ...withServices, preferredTimeframe: "flexible" }, chat)).toBe("postal_code");
    expect(nextCaseFlowStep({ ...withServices, preferredTimeframe: "flexible", postalCode: "8000" }, chat)).toBe("summary");
  });
  it("ready når alt er udfyldt og godkendt", () => {
    expect(nextCaseFlowStep(complete, chat)).toBe("ready");
  });
  it("billede efter godkendelse (summaryApprovedAt = null) giver summary igen", () => {
    expect(nextCaseFlowStep({ ...complete, summaryApprovedAt: null }, chat)).toBe("summary");
  });
  it("services ved forslag uden readyForSummary (7.9a regel 1)", () => {
    expect(nextCaseFlowStep({ ...empty, suggestedServices: [service as never] }, chat)).toBe("services");
  });
  it("5 patientbeskeder uden forslag giver chat, 6 giver services", () => {
    const users = (n: number) => Array.from({ length: n }, () => ({ ...assistant(false), role: "user" as const }));
    const five = [...users(5), assistant(false)];
    expect(nextCaseFlowStep(empty, { ...chat, messages: five })).toBe("chat");
    expect(nextCaseFlowStep(empty, { ...chat, messages: [...users(6), assistant(false)] })).toBe("services");
  });
  it("bekræftede ydelser går forud for forslag og beskedtælling", () => {
    const users = Array.from({ length: 6 }, () => ({ ...assistant(false), role: "user" as const }));
    expect(nextCaseFlowStep({ ...empty, services: [service], suggestedServices: [service as never] }, { ...chat, messages: users })).toBe("timeframe");
  });
  it("bekræftede ydelser gør chatten færdig, selv om samtalen er aktiv", () => {
    expect(nextCaseFlowStep(complete, { ...chat, readyForSummary: false })).toBe("ready");
  });
});
