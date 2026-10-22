"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";
import { TextField } from "@/components/ui/text-field";
import { LoadState } from "@/components/ui/load-state";
import { useLoad } from "@/platform/ui-utils/use-load";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useAction } from "@/platform/ui-utils/use-action";
import { formatDateTime, fromDateTimeLocal } from "@/platform/ui-utils/format";
import { TIME_BLOCK_NOTE_MAX_CHARS } from "@/lib/clinics/constants/clinics";
import { createTimeBlockSchema } from "@/lib/clinics/schemas/clinics";
import type { TimeBlockDto } from "@/lib/clinics/types/clinics";

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
  const { busy, message, run, fail } = useAction();

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTimeBlockSchema.safeParse({
      startsAt: fromDateTimeLocal(startsAt),
      endsAt: fromDateTimeLocal(endsAt),
      note,
    });
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Tjek tidspunkterne.");
      return;
    }
    await run(async () => {
      const created = await apiRequest<TimeBlockDto>("/api/clinics/me/time-blocks", { method: "POST", body: parsed.data });
      setBlocks((current) => [...current, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setStartsAt("");
      setEndsAt("");
      setNote("");
      return "Tiden er blokeret og gemt.";
    });
  }

  const onRemove = (id: string) =>
    run(async () => {
      await apiRequest<void>(`/api/clinics/me/time-blocks/${id}`, { method: "DELETE" });
      setBlocks((current) => current.filter((b) => b.id !== id));
      return "Blokeringen er fjernet.";
    });

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Blokerede tider</h2>
        <p className="text-base text-ink-muted">
          Luk af til ferie, kurser eller tider, der er booket i et andet system. Patienter kan ikke booke i blokerede tider.
        </p>
      </div>

      <form onSubmit={onAdd} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField label="Fra" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <TextField label="Til" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        <div className="sm:col-span-2">
          <TextField
            label="Note (kun synlig for dig)"
            maxLength={TIME_BLOCK_NOTE_MAX_CHARS}
            placeholder="Fx sommerferie"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy} className="sm:col-span-2 sm:self-start">
          Blokér tid
        </Button>
      </form>

      <StatusMessage message={message} />

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
