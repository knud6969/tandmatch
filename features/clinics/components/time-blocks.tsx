"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { StatusMessage } from "@/components/ui/status-message";
import { TextField } from "@/components/ui/text-field";
import { LoadState } from "@/components/ui/load-state";
import { useLoad } from "@/platform/ui-utils/use-load";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useAction } from "@/platform/ui-utils/use-action";
import { formatDate, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from "@/lib/common/domain/format";
import { TIME_BLOCK_NOTE_MAX_CHARS } from "@/lib/clinics/constants/clinics";
import { createTimeBlockSchema } from "@/lib/clinics/schemas/clinics";
import type { TimeBlockDto } from "@/lib/clinics/types/clinics";

// Blokerede tider: ferie, lukkedage eller tider, der er booket via klinikkens eget system (architecture 4.3).
// Klinikken kan have mange blokeringer på én gang (fx alle årets ferier i god tid), redigere og fjerne dem. Hver ændring gemmes
// straks. "Hele dage" er standard: fra og med første dag til og med sidste dag.
export function TimeBlocks() {
  const loader = useCallback(async () => {
    const from = new Date().toISOString();
    const result = await apiRequest<{ blocks: TimeBlockDto[] }>(`/api/clinics/me/time-blocks?from=${encodeURIComponent(from)}`);
    return result.blocks;
  }, []);
  const { data, error, loading, reload } = useLoad(loader);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <BlockList initial={data} />;
}

type Draft = { wholeDays: boolean; fromDay: string; toDay: string; startsAt: string; endsAt: string; note: string };

const EMPTY_DRAFT: Draft = { wholeDays: true, fromDay: "", toDay: "", startsAt: "", endsAt: "", note: "" };

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const nextDay = (day: string) => {
  const date = new Date(`${day}T00:00`);
  date.setDate(date.getDate() + 1);
  return localDay(date);
};

// En blokering, der går fra midnat til midnat, vises og redigeres som hele dage.
function draftFrom(block: TimeBlockDto): Draft {
  const start = new Date(block.startsAt);
  const end = new Date(block.endsAt);
  const midnight = (d: Date) => d.getHours() === 0 && d.getMinutes() === 0;
  if (midnight(start) && midnight(end)) {
    const lastDay = new Date(end);
    lastDay.setDate(lastDay.getDate() - 1);
    return { ...EMPTY_DRAFT, fromDay: localDay(start), toDay: localDay(lastDay), note: block.note ?? "" };
  }
  return { ...EMPTY_DRAFT, wholeDays: false, startsAt: toDateTimeLocal(block.startsAt), endsAt: toDateTimeLocal(block.endsAt), note: block.note ?? "" };
}

function isWholeDays(block: TimeBlockDto): boolean {
  return draftFrom(block).wholeDays;
}

// Teksten for en blokering: "24. december 2026 til 2. januar 2027" for hele dage, ellers tidspunkter.
function blockText(block: TimeBlockDto): string {
  if (!isWholeDays(block)) return `${formatDateTime(block.startsAt)} til ${formatDateTime(block.endsAt)}`;
  const draft = draftFrom(block);
  const first = formatDate(new Date(`${draft.fromDay}T12:00`).toISOString());
  const last = formatDate(new Date(`${draft.toDay}T12:00`).toISOString());
  return draft.fromDay === draft.toDay ? `Hele dagen ${first}` : `${first} til og med ${last}`;
}

function parseDraft(draft: Draft) {
  const range = draft.wholeDays
    ? draft.fromDay && draft.toDay
      ? { startsAt: fromDateTimeLocal(`${draft.fromDay}T00:00`), endsAt: fromDateTimeLocal(`${nextDay(draft.toDay)}T00:00`) }
      : { startsAt: "", endsAt: "" }
    : { startsAt: fromDateTimeLocal(draft.startsAt), endsAt: fromDateTimeLocal(draft.endsAt) };
  return createTimeBlockSchema.safeParse({ ...range, note: draft.note });
}

function BlockList({ initial }: { initial: TimeBlockDto[] }) {
  const [blocks, setBlocks] = useState(initial);
  // null: ingen formular åben; "new": ny blokering; ellers id'et på den, der redigeres.
  const [editing, setEditing] = useState<string | null>(initial.length === 0 ? "new" : null);
  const { busy, message, run, fail, clear } = useAction();

  const sorted = (list: TimeBlockDto[]) => [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  async function save(draft: Draft, blockId: string | null) {
    const parsed = parseDraft(draft);
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Tjek datoerne.");
      return;
    }
    await run(async () => {
      if (blockId) {
        const updated = await apiRequest<TimeBlockDto>(`/api/clinics/me/time-blocks/${blockId}`, { method: "PATCH", body: parsed.data });
        setBlocks((current) => sorted(current.map((b) => (b.id === blockId ? updated : b))));
        setEditing(null);
        return "Blokeringen er ændret og gemt.";
      }
      const created = await apiRequest<TimeBlockDto>("/api/clinics/me/time-blocks", { method: "POST", body: parsed.data });
      setBlocks((current) => sorted([...current, created]));
      setEditing(null);
      return "Tiden er blokeret og gemt.";
    });
  }

  const onRemove = (id: string) =>
    run(async () => {
      await apiRequest<void>(`/api/clinics/me/time-blocks/${id}`, { method: "DELETE" });
      setBlocks((current) => current.filter((b) => b.id !== id));
      if (editing === id) setEditing(null);
      return "Blokeringen er fjernet.";
    });

  function open(next: string | null) {
    clear();
    setEditing(next);
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Blokerede tider</h2>
        <p className="text-sm text-ink-muted">Fx ferie, lukkedage eller kurser. Du kan lægge alle årets ferier ind i god tid. Patienter kan ikke booke i blokerede tider.</p>
      </div>

      <StatusMessage message={message} />

      {blocks.length === 0 ? (
        <p className="text-base text-ink-muted">Ingen kommende blokeringer.</p>
      ) : (
        <ul className="grid gap-3" data-testid="blokeringer">
          {blocks.map((block) =>
            editing === block.id ? (
              <li key={block.id}>
                <BlockForm initial={draftFrom(block)} busy={busy} submitLabel="Gem ændringer" onSubmit={(draft) => save(draft, block.id)} onCancel={() => open(null)} />
              </li>
            ) : (
              <li key={block.id} className="flex flex-col gap-2 rounded-control border border-line p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="blokering">
                <div className="flex flex-col gap-0.5">
                  <p className="text-base font-semibold text-ink">{blockText(block)}</p>
                  {block.note && <p className="text-sm text-ink-muted">{block.note}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  <Button variant="secondary" disabled={busy} onClick={() => open(block.id)} className="min-h-11">
                    Rediger
                  </Button>
                  <Button variant="danger-outline" disabled={busy} onClick={() => onRemove(block.id)} className="min-h-11">
                    Fjern
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {editing === "new" ? (
        <BlockForm
          initial={EMPTY_DRAFT}
          busy={busy}
          submitLabel="Blokér tid"
          onSubmit={(draft) => save(draft, null)}
          onCancel={blocks.length > 0 ? () => open(null) : undefined}
        />
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => open("new")} className="self-start">
          {blocks.length === 0 ? "+ Tilføj blokeret tid" : "+ Tilføj flere blokerede tider"}
        </Button>
      )}
    </Card>
  );
}

function BlockForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: Draft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(draft);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-control border border-line bg-surface-muted p-3 sm:grid-cols-2" aria-label={submitLabel}>
      <div className="sm:col-span-2">
        <CheckboxField
          label="Hele dage"
          description="Fx en ferie: fra og med første dag til og med sidste dag."
          checked={draft.wholeDays}
          selected={draft.wholeDays}
          onChange={(e) => set({ wholeDays: e.target.checked })}
        />
      </div>
      {draft.wholeDays ? (
        <>
          <TextField label="Fra og med" type="date" value={draft.fromDay} onChange={(e) => set({ fromDay: e.target.value, toDay: draft.toDay || e.target.value })} required />
          <TextField label="Til og med" type="date" value={draft.toDay} min={draft.fromDay || undefined} onChange={(e) => set({ toDay: e.target.value })} required />
        </>
      ) : (
        <>
          <TextField label="Fra" type="datetime-local" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} required />
          <TextField label="Til" type="datetime-local" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} required />
        </>
      )}
      <div className="sm:col-span-2">
        <TextField
          label="Note (kun synlig for dig)"
          maxLength={TIME_BLOCK_NOTE_MAX_CHARS}
          placeholder="Fx sommerferie"
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Gemmer …" : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Annuller
          </Button>
        )}
      </div>
    </form>
  );
}
