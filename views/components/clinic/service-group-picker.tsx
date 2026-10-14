"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/views/components/ui/badge";
import { Button } from "@/views/components/ui/button";
import { CheckboxField } from "@/views/components/ui/checkbox-field";
import type { ServiceGroupDto } from "@/lib/types/services";

type ServiceGroupPickerProps = {
  groups: ServiceGroupDto[];
  selectedIds: string[];
  onToggle: (group: ServiceGroupDto, selected: boolean) => void;
  // Bekræftelse, der vises i selve kategorikortet (fx ved fravalg af en kategori med priser).
  confirmation?: { groupId: string; content: ReactNode } | null;
  disabled?: boolean;
};

// Kort til valg af behandlingskategorier (architecture 6.3, 10.8). Hele kortet er trykflade og et ægte afkrydsningsfelt.
// Er der valgt kategorier, når siden åbnes, foldes valget sammen til de valgte, så man ikke skal scrolle forbi alle kort.
export function ServiceGroupPicker({ groups, selectedIds, onToggle, confirmation, disabled }: ServiceGroupPickerProps) {
  const [expanded, setExpanded] = useState(selectedIds.length === 0);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const selectedGroups = groups.filter((g) => selectedIds.includes(g.id));
  const confirmationGroupId = confirmation?.groupId;

  // Bekræftelsen ligger i kortet; flyt den ind i billedet, hvis den ellers falder uden for skærmen.
  useEffect(() => {
    if (confirmationGroupId) confirmationRef.current?.scrollIntoView({ block: "center" });
  }, [confirmationGroupId]);

  const open = expanded || confirmation != null;

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-xl font-semibold text-ink">1. Hvilke kategorier tilbyder du?</legend>
      <p className="text-base text-ink-muted">
        Vælg de kategorier, klinikken arbejder med. Under hver valgt kategori kan du derefter sætte pris på behandlingerne.
      </p>

      {!open ? (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface-muted p-4">
          <p className="text-sm font-semibold text-ink">
            Valgt: {selectedGroups.length} {selectedGroups.length === 1 ? "kategori" : "kategorier"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {selectedGroups.map((group) => (
              <li key={group.id}>
                <Badge tone="brand">{group.name}</Badge>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="self-start" onClick={() => setExpanded(true)}>
            Ændr kategorier
          </Button>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => {
              const selected = selectedIds.includes(group.id);
              const count = `${group.services.length} ${group.services.length === 1 ? "behandling" : "behandlinger"}`;
              return (
                <li key={group.id} className="flex flex-col gap-2">
                  <CheckboxField
                    label={group.name}
                    description={`${group.description} ${count}`}
                    selected={selected}
                    checked={selected}
                    onChange={(e) => onToggle(group, e.target.checked)}
                    className="h-full rounded-card"
                  />
                  {confirmation?.groupId === group.id && <div ref={confirmationRef}>{confirmation.content}</div>}
                </li>
              );
            })}
          </ul>
          {selectedIds.length > 0 && (
            <Button variant="secondary" className="self-start" onClick={() => setExpanded(false)}>
              Fold sammen
            </Button>
          )}
        </>
      )}
    </fieldset>
  );
}
