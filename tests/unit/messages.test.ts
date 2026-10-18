import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@/middleware/session";
import type { LeadStatus } from "@/lib/types/leads";

// server-only kaster uden for Next.js' server-bundle; i enhedstest erstattes den af en tom modul.
vi.mock("server-only", () => ({}));

const { MessagesRepository, MessageRejectedError } =
  await import("@/models/messagesRepository");
const { MessagesController } = await import("@/controllers/messagesController");

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
