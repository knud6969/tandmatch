import { ApiRequestError } from "~/api/client";
import { sendImageTurn } from "~/api/chat";
import type { AiChatMessageDto, ImageTurnResponse } from "@/lib/cases/types/ai";
import type { ImageDto } from "@/lib/common/types/common";
import { chatImageItems } from "~/utils/chat-images";
import { buildTimeline } from "~/utils/chat-timeline";
import { IMAGE_TURN_TEXTS, runImageTurn } from "~/utils/chat-turn";

const msg = (id: string, createdAt: string, role: "user" | "assistant" = "assistant") => ({ id, role, createdAt, content: id }) as unknown as AiChatMessageDto;
const img = (id: string, createdAt?: string, quality: string | null = null) => ({ id, url: `u/${id}`, view: null, quality, description: null, createdAt }) as ImageDto;
const turn = { assistantMessage: msg("a", "2026-01-01T10:00:00Z"), assessedImages: [], outOfScopeNotice: false, emergency: false, readyForSummary: false, messagesLeft: 20 } as ImageTurnResponse;
const failWith = (code: string, status = 400) => () => Promise.reject(new ApiRequestError(status, code, "Teknisk tekst"));

describe("tidslinje", () => {
  it("sorterer beskeder og billeder efter createdAt", () => {
    const messages = [msg("m1", "2026-01-01T10:00:00Z", "user"), msg("m2", "2026-01-01T10:05:00Z")];
    const items = chatImageItems([img("i1", "2026-01-01T10:02:00Z"), img("i2", "2026-01-01T10:09:00Z")], []);
    expect(buildTimeline(messages, items).map((e) => e.key)).toEqual(["m1", "i1", "m2", "i2"]);
  });
  it("lægger billeder uden createdAt og lokale uploads sidst, med bevaret billedindeks", () => {
    const items = chatImageItems([img("i1"), img("i2", "2026-01-01T10:02:00Z")], [{ key: "lokal-1", uri: "x", status: "uploading", error: null }]);
    const timeline = buildTimeline([msg("m1", "2026-01-01T10:05:00Z")], items);
    expect(timeline.map((e) => e.key)).toEqual(["i2", "m1", "i1", "lokal-1"]);
    expect(timeline.filter((e) => e.kind === "image").map((e) => (e.kind === "image" ? e.index : -1))).toEqual([1, 0, 2]);
  });
  it("er stabil ved ens tid og tåler ugyldig tid", () => {
    const t = "2026-01-01T10:00:00Z";
    expect(buildTimeline([msg("a", t), msg("b", t), msg("c", "")], []).map((e) => e.key)).toEqual(["a", "b", "c"]);
  });
});

describe("billedtur", () => {
  it("giver svaret ved succes", async () => {
    expect(await runImageTurn(() => Promise.resolve(turn))).toEqual({ kind: "ok", turn });
  });
  it("ignorerer NO_NEW_IMAGES og CHAT_LIMIT stille", async () => {
    expect(await runImageTurn(failWith("NO_NEW_IMAGES", 409))).toEqual({ kind: "skipped", chatLimit: false });
    expect(await runImageTurn(failWith("CHAT_LIMIT", 429))).toEqual({ kind: "skipped", chatLimit: true });
  });
  it("viser danske tekster og tillader kun gentagelse ved AI_UNAVAILABLE og samtykke", async () => {
    expect(await runImageTurn(failWith("AI_UNAVAILABLE", 503))).toMatchObject({ kind: "failed", message: IMAGE_TURN_TEXTS.unavailable, retry: true });
    expect(await runImageTurn(failWith("CONSENT_REQUIRED", 403))).toMatchObject({ kind: "failed", message: IMAGE_TURN_TEXTS.consent, retry: true });
    expect(await runImageTurn(failWith("RATE_LIMITED", 429))).toMatchObject({ message: IMAGE_TURN_TEXTS.rateLimited, retry: false });
    expect(await runImageTurn(failWith("ANON_CAP_REACHED", 429))).toMatchObject({ message: IMAGE_TURN_TEXTS.anonCap, retry: false });
  });
  it("falder tilbage til serverens tekst ved ukendt fejl", async () => {
    expect(await runImageTurn(failWith("NOPE"))).toMatchObject({ kind: "failed", code: "NOPE", retry: false });
  });
  it("kalder POST /chat/image-turn med tom body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    jest.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(turn), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    await sendImageTurn("c1").catch(() => undefined);
    expect(calls[0]?.url).toContain("/api/cases/c1/chat/image-turn");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe("{}");
  });
});
