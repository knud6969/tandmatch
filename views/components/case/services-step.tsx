"use client";

import { useMemo, useState } from "react";
import { EXAMINATION_SERVICE_SLUG } from "@/lib/constants/services";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/constants/limits";
import type { CaseDto } from "@/lib/types/cases";
import type { ServiceGroupDto } from "@/lib/types/services";
import { Alert } from "@/views/components/ui/alert";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import { LoadState } from "@/views/components/ui/load-state";
import { StatusMessage } from "@/views/components/ui/status-message";
import { apiRequest } from "@/views/utils/api-client";
import { loadServiceGroups } from "@/views/utils/clinic-loaders";
import { useAction } from "@/views/utils/use-action";
import { useLoad } from "@/views/utils/use-load";

type Props = {
  caseDto: CaseDto;
  onSaved: () => void;
  onBack: () => void;
  onContinue: () => void;
};

// Patienten bekræfter selv behandlingerne (højst 5), grupperet efter kategori. AI-forslagene er forvalgt, men er kun forslag.
// "Jeg er ikke sikker" vælger en undersøgelse (architecture 7.3).
export function ServicesStep({ caseDto, onSaved, onBack, onContinue }: Props) {
  const catalog = useLoad(loadServiceGroups);
  const suggestedIds = useMemo(() => new Set(caseDto.suggestedServices.map((s) => s.id)), [caseDto.suggestedServices]);
  const [selected, setSelected] = useState<string[]>(() =>
    caseDto.services.length > 0 ? caseDto.services.map((s) => s.id) : caseDto.suggestedServices.map((s) => s.id),
  );
  const action = useAction();
  const full = selected.length >= MAX_CONFIRMED_SERVICES_PER_CASE;

  const groups: ServiceGroupDto[] = catalog.data ?? [];
  const examination = groups.flatMap((g) => g.services).find((s) => s.slug === EXAMINATION_SERVICE_SLUG);

  function toggle(id: string, on: boolean) {
    setSelected((current) => (on ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id)));
    action.clear();
  }

  async function save() {
    const ok = await action.run(async () => {
      await apiRequest(`/api/cases/${caseDto.id}/services`, {
        method: "PUT",
        body: { services: selected.map((serviceId) => ({ serviceId, suggestedByAi: suggestedIds.has(serviceId) })) },
      });
      onSaved();
    });
    if (ok) onContinue();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-ink">Bekræft behandlinger</h2>
        <p className="text-base leading-relaxed text-ink-muted">
          Vælg de behandlinger, du vil have hjælp til (højst {MAX_CONFIRMED_SERVICES_PER_CASE}). Du bestemmer selv. Markeringerne
          nedenfor er kun forslag ud fra din beskrivelse, og klinikken vurderer, hvad der faktisk passer.
        </p>
      </div>

      <LoadState loading={catalog.loading} error={catalog.error} onRetry={catalog.reload} />

      {examination && (
        <Alert tone="info">
          <p>Er du i tvivl om, hvad du har brug for? Så vælg en undersøgelse, og lad klinikken vurdere det.</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setSelected([examination.id])}
            aria-pressed={selected.length === 1 && selected[0] === examination.id}
          >
            Jeg er ikke sikker
          </Button>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {groups.map((group) => {
          const hasPick = group.services.some((s) => selected.includes(s.id) || suggestedIds.has(s.id));
          return (
            <details key={group.id} open={hasPick} className="rounded-card border border-line bg-surface p-4">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-base font-semibold text-ink">
                <span>{group.name}</span>
                <span className="text-sm font-normal text-ink-muted">
                  {group.services.filter((s) => selected.includes(s.id)).length || ""}
                </span>
              </summary>
              {group.description && <p className="mt-1 text-sm text-ink-muted">{group.description}</p>}
              <div className="mt-3 flex flex-col gap-2">
                {group.services.map((service) => {
                  const checked = selected.includes(service.id);
                  return (
                    <CheckboxField
                      key={service.id}
                      label={
                        <span className="flex flex-wrap items-center gap-2">
                          {service.name}
                          {suggestedIds.has(service.id) && <Badge tone="brand">Foreslået ud fra din beskrivelse</Badge>}
                        </span>
                      }
                      description={service.description}
                      selected={checked}
                      checked={checked}
                      disabled={!checked && full}
                      onChange={(event) => toggle(service.id, event.target.checked)}
                    />
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <StatusMessage message={action.message} />
      <p className="text-sm text-ink-muted" aria-live="polite">
        {selected.length === 0 ? "Vælg mindst én behandling." : `${selected.length} valgt.`}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack}>
          Tilbage
        </Button>
        <Button onClick={save} disabled={selected.length === 0 || action.busy}>
          {action.busy ? "Gemmer …" : "Bekræft og fortsæt"}
        </Button>
      </div>
    </div>
  );
}
