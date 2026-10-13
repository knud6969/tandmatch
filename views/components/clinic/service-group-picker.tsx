import { cx } from "@/views/components/ui/cx";
import type { ServiceGroupDto } from "@/lib/types/services";

type ServiceGroupPickerProps = {
  groups: ServiceGroupDto[];
  selectedIds: string[];
  onToggle: (group: ServiceGroupDto, selected: boolean) => void;
  disabled?: boolean;
};

// Kort til valg af behandlingskategorier (architecture 6.3, 10.8). Hele kortet er trykflade og et ægte afkrydsningsfelt.
export function ServiceGroupPicker({ groups, selectedIds, onToggle, disabled }: ServiceGroupPickerProps) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="text-xl font-semibold text-ink">1. Hvilke kategorier tilbyder I?</legend>
      <p className="text-base text-ink-muted">
        Vælg de kategorier, klinikken arbejder med. Under hver valgt kategori kan I derefter sætte pris på behandlingerne.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((group) => {
          const selected = selectedIds.includes(group.id);
          return (
            <li key={group.id}>
              <label
                className={cx(
                  "flex h-full min-h-14 cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors",
                  selected ? "border-brand-500 bg-brand-50" : "border-line bg-surface hover:border-brand-400",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => onToggle(group, e.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-brand-600"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-ink">{group.name}</span>
                  <span className="text-sm text-ink-muted">{group.description}</span>
                  <span className="text-sm text-ink-muted">
                    {group.services.length} {group.services.length === 1 ? "behandling" : "behandlinger"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
