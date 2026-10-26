import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/platform/middleware/session";
import type { LeadStatus } from "@/lib/leads/types/leads";

// server-only kaster uden for Next.js' server-bundle; i enhedstest erstattes den af en tom modul.
vi.mock("server-only", () => ({}));

const { MessagesRepository, MessageRejectedError } =
  await import("@/features/leads/messagesRepository");
const { MessagesController } = await import("@/features/leads/messagesController");

// RLS-grenen (databasen afviser indsættelsen, efter at controllerens forhåndstjek er bestået) kan ikke rammes
// deterministisk fra en API-test: det kræver, at tråden lukkes eller døgnloftet nås mellem to kald i samme request.
// Derfor testes grenen med falske repositories: repositoriet kaster den navngivne fejl, controlleren slår status op.

const patient = {
  role: "patient",
  userId: "u1",
  isAnonymous: false,
} as unknown as Session;

function controller(
  statuses: LeadStatus[],
  opts: { role?: string; rejected?: boolean } = {},
) {
  const requireStatus = vi.fn();
  for (const s of statuses) requireStatus.mockResolvedValueOnce(s);
  const create = vi.fn(async () => {
    if (opts.rejected) throw new MessageRejectedError();
    return { id: "m1" };
  });
  const deps = {
    leads: { requireStatus },
    messages: { sentLastDay: vi.fn(async () => 0), create },
  };
  const session = {
    ...patient,
    role: opts.role ?? "patient",
  } as unknown as Session;
  return {
    requireStatus,
    create,
    ctrl: new MessagesController({} as SupabaseClient, session, deps as never),
  };
}

describe("MessagesController.send ved RLS-afvisning", () => {
  it("giver THREAD_CLOSED, når leadet blev lukket mellem tjek og indsættelse", async () => {
    const { ctrl, requireStatus } = controller(["sent", "withdrawn"], {
      rejected: true,
    });
    await expect(ctrl.send("l1", { body: "Hej" })).rejects.toMatchObject({
      status: 409,
      code: "THREAD_CLOSED",
    });
    expect(requireStatus).toHaveBeenCalledTimes(2);
  });

  it("giver MESSAGE_LIMIT, når leadet stadig er aktivt", async () => {
    const { ctrl } = controller(["sent", "accepted"], { rejected: true });
    await expect(ctrl.send("l1", { body: "Hej" })).rejects.toMatchObject({
      status: 429,
      code: "MESSAGE_LIMIT",
    });
  });

  it("giver THREAD_CLOSED i forhåndstjekket for et afvist lead", async () => {
    const { ctrl, create } = controller(["declined"]);
    await expect(ctrl.send("l1", { body: "Hej" })).rejects.toMatchObject({
      code: "THREAD_CLOSED",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("sender uden fejl, når RLS tillader det", async () => {
    const { ctrl } = controller(["sent"]);
    await expect(ctrl.send("l1", { body: "Hej" })).resolves.toEqual({
      id: "m1",
    });
  });

  it("afviser andre roller end patient og klinik med 403", async () => {
    const { ctrl } = controller(["sent"], { role: "admin" });
    await expect(ctrl.send("l1", { body: "Hej" })).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    await expect(ctrl.list("l1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("MessagesRepository.create", () => {
  function clientRejecting(message: string) {
    const result = { data: null, error: { message } };
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => result }),
      then: (r: (v: unknown) => unknown) => r(result),
    }));
    return { from: () => ({ insert }) } as unknown as SupabaseClient;
  }

  it("kaster MessageRejectedError ved RLS-afvisning (patient og klinik)", async () => {
    const db = clientRejecting(
      'new row violates row-level security policy for table "messages"',
    );
    const repo = new MessagesRepository(db);
    await expect(
      repo.create("patient", "l1", "u1", "Hej"),
    ).rejects.toBeInstanceOf(MessageRejectedError);
    await expect(
      repo.create("clinic", "l1", "u1", "Hej"),
    ).rejects.toBeInstanceOf(MessageRejectedError);
  });

  it("lader andre databasefejl være almindelige fejl", async () => {
    const repo = new MessagesRepository(clientRejecting("connection lost"));
    const error = await repo
      .create("patient", "l1", "u1", "Hej")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MessageRejectedError);
  });
});

describe("MessagesController.sendWithImages (10.12)", () => {
  function imagesController(opts: { role?: string; status?: LeadStatus; consent?: boolean; failInsert?: boolean } = {}) {
    const order: string[] = [];
    const readForm = vi.fn(async () => {
      order.push("form");
      return { files: [new File([new Uint8Array([1])], "a.jpg")], fields: { body: "Hej" } };
    });
    const requireCurrentActive = vi.fn(async () => {
      order.push("consent");
      if (opts.consent === false) throw Object.assign(new Error("samtykke"), { status: 403, code: "CONSENT_REQUIRED" });
      return { id: "c1" };
    });
    const remove = vi.fn(async () => {});
    const storageApi = {
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => {
        remove();
        return { error: null };
      }),
      createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ signedUrl: `https://x/${p}?token=t` })), error: null })),
    };
    const rpc = vi.fn(async () =>
      opts.failInsert ? { data: null, error: { message: "THREAD_CLOSED" } } : { data: "2026-10-26T10:00:00Z", error: null },
    );
    const admin = { storage: { from: () => storageApi }, rpc } as unknown as SupabaseClient;
    const deps = {
      leads: { requireStatus: vi.fn(async () => opts.status ?? "sent") },
      messages: { sentLastDay: vi.fn(async () => 0) },
      consents: { requireCurrentActive },
      processing: { reencode: vi.fn(async () => ({ data: Buffer.from([1, 2, 3]), width: 10, height: 20 })) },
      admin: () => admin,
    };
    const session = { ...patient, role: opts.role ?? "patient" } as unknown as Session;
    return { ctrl: new MessagesController({} as SupabaseClient, session, deps as never), readForm, order, requireCurrentActive, remove };
  }

  it("tjekker samtykket, før formularen læses, og returnerer billeder med signerede URL'er", async () => {
    const { ctrl, readForm, order } = imagesController();
    const dto = await ctrl.sendWithImages("l1", readForm);
    expect(order).toEqual(["consent", "form"]);
    expect(dto).toMatchObject({ fromMe: true, senderRole: "patient", body: "Hej", readAt: null });
    expect(dto.images).toHaveLength(1);
    expect(dto.images[0]).toMatchObject({ width: 10, height: 20 });
    expect(dto.images[0].url).toContain("messages/l1/");
  });

  it("læser ikke formularen uden samtykke", async () => {
    const { ctrl, readForm } = imagesController({ consent: false });
    await expect(ctrl.sendWithImages("l1", readForm)).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(readForm).not.toHaveBeenCalled();
  });

  it("klinikken behøver intet samtykke", async () => {
    const { ctrl, readForm, requireCurrentActive } = imagesController({ role: "clinic" });
    await expect(ctrl.sendWithImages("l1", readForm)).resolves.toMatchObject({ senderRole: "clinic" });
    expect(requireCurrentActive).not.toHaveBeenCalled();
  });

  it("lukket tråd giver 409 før samtykke og formular", async () => {
    const { ctrl, readForm, requireCurrentActive } = imagesController({ status: "withdrawn" });
    await expect(ctrl.sendWithImages("l1", readForm)).rejects.toMatchObject({ status: 409, code: "THREAD_CLOSED" });
    expect(requireCurrentActive).not.toHaveBeenCalled();
    expect(readForm).not.toHaveBeenCalled();
  });

  it("sletter de uploadede filer igen, når databasen afviser beskeden", async () => {
    const { ctrl, readForm, remove } = imagesController({ failInsert: true });
    await expect(ctrl.sendWithImages("l1", readForm)).rejects.toMatchObject({ code: "THREAD_CLOSED" });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("beskedregler i lib/leads/domain/messages.ts", async () => {
  const { canSendMessage, isEmptyMessage, keepImageUrls } = await import("@/lib/leads/domain/messages");
  const message = (id: string, images: { id: string; url: string }[], body = "") => ({
    id, fromMe: false, senderRole: "clinic" as const, body, createdAt: "2026-10-26T10:00:00Z", readAt: null,
    images: images.map((i) => ({ ...i, width: 1, height: 1 })),
  });

  it("en besked kræver tekst eller billeder", () => {
    expect(canSendMessage("  ", 0)).toBe(false);
    expect(canSendMessage("", 1)).toBe(true);
    expect(canSendMessage("Hej", 0)).toBe(true);
    expect(isEmptyMessage(message("m", []))).toBe(true);
    expect(isEmptyMessage(message("m", [], "Hej"))).toBe(false);
  });

  it("genbruger signerede URL'er inden for grænsen og fornyer dem bagefter", () => {
    const first = keepImageUrls(new Map(), [message("m1", [{ id: "i1", url: "u1" }])], 0, 1000);
    expect(first.messages[0].images[0].url).toBe("u1");
    const second = keepImageUrls(first.cache, [message("m1", [{ id: "i1", url: "u2" }]), message("m2", [{ id: "i2", url: "v1" }])], 500, 1000);
    expect(second.messages[0].images[0].url).toBe("u1");
    expect(second.messages[1].images[0].url).toBe("v1");
    const third = keepImageUrls(second.cache, [message("m1", [{ id: "i1", url: "u3" }])], 1500, 1000);
    expect(third.messages[0].images[0].url).toBe("u3");
    expect([...third.cache.keys()]).toEqual(["i1"]);
  });
});
