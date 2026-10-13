"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { LoadState } from "@/views/components/clinic/load-state";
import { useLoad } from "@/views/components/clinic/use-load";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { formatDateTime, fromDateTimeLocal } from "@/views/utils/format";
import { TIME_BLOCK_NOTE_MAX_CHARS } from "@/lib/constants/clinics";
import { createTimeBlockSchema } from "@/lib/schemas/clinics";
import type { TimeBlockDto } from "@/lib/types/clinics";

// Blokerede tider: ferie, lukkedage eller tider, der er booket via klinikkens eget system (architecture 4.3).
// Hver blokering gemmes straks, når den tilføjes eller fjernes.
export function TimeBlocks() {
  const loader = useCallback(async () => {
    const from = new Date().toISOString();
    const result = await apiRequest<{ blocks: TimeBlockDto[] }>(`/api/clinics/me/time-blocks?from=${encodeURIComponent(from)}`);
    return result.blocks;
  }, []);
  const { data, error, loading, reload } = useLoad(loader);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <BlockEditor initial={data} />;
}

function BlockEditor({ initial }: { initial: TimeBlockDto[] }) {
  const [blocks, setBlocks] = useState(initial);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTimeBlockSchema.safeParse({
      startsAt: fromDateTimeLocal(startsAt),
      endsAt: fromDateTimeLocal(endsAt),
      note,
    });
    if (!parsed.success) {
      setMessage({ tone: "danger", text: parsed.error.issues[0]?.message ?? "Tjek tidspunkterne." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await apiRequest<TimeBlockDto>("/api/clinics/me/time-blocks", { method: "POST", body: parsed.data });
      setBlocks((current) => [...current, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setStartsAt("");
      setEndsAt("");
      setNote("");
      setMessage({ tone: "success", text: "Tiden er blokeret og gemt." });
    } catch (e) {
      setMessage({ tone: "danger", text: apiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest<void>(`/api/clinics/me/time-blocks/${id}`, { method: "DELETE" });
      setBlocks((current) => current.filter((b) => b.id !== id));
      setMessage({ tone: "success", text: "Blokeringen er fjernet." });
    } catch (e) {
      setMessage({ tone: "danger", text: apiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "min-h-12 w-full rounded-control border border-field-border bg-surface px-3 py-2 text-base text-ink";

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Blokerede tider</h2>
        <p className="text-base text-ink-muted">
          Luk af til ferie, kurser eller tider, der er booket i et andet system. Patienter kan ikke booke i blokerede tider.
        </p>
      </div>

      <form onSubmit={onAdd} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="block-start" className="text-sm font-semibold text-ink">Fra</label>
          <input id="block-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={fieldClass} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="block-end" className="text-sm font-semibold text-ink">Til</label>
          <input id="block-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={fieldClass} required />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="block-note" className="text-sm font-semibold text-ink">Note (kun synlig for jer)</label>
          <input id="block-note" type="text" maxLength={TIME_BLOCK_NOTE_MAX_CHARS} placeholder="Fx sommerferie" value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
        </div>
        <Button type="submit" disabled={busy} className="sm:col-span-2 sm:self-start">
          Blokér tid
        </Button>
      </form>

      {message && (
        <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </Alert>
      )}

      {blocks.length === 0 ? (
        <p className="text-base text-ink-muted">Ingen kommende blokeringer.</p>
      ) : (
        <ul className="grid gap-3">
          {blocks.map((block) => (
            <li key={block.id} className="flex flex-col gap-2 rounded-control border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-base font-semibold text-ink">
                  {formatDateTime(block.startsAt)} til {formatDateTime(block.endsAt)}
                </p>
                {block.note && <p className="text-sm text-ink-muted">{block.note}</p>}
              </div>
              <Button variant="danger-outline" disabled={busy} onClick={() => onRemove(block.id)} className="min-h-11 sm:shrink-0">
                Fjern
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
