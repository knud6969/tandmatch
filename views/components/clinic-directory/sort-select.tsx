import { CLINIC_SORTS, CLINIC_SORT_LABEL } from "@/lib/constants/clinics";
import type { ClinicSort } from "@/lib/types/clinics";
import { SelectField } from "@/views/components/ui/select-field";

type SortSelectProps = {
  value: ClinicSort;
  onChange: (sort: ClinicSort) => void;
  hasOrigin: boolean;
  hasServices: boolean;
};

// Sortering efter ét kriterium ad gangen (architecture 6.6). Kriterier, der kræver et valg, er slået fra, til det er truffet.
export function SortSelect({ value, onChange, hasOrigin, hasServices }: SortSelectProps) {
  return (
    <SelectField label="Sortér efter" value={value} onChange={(event) => onChange(event.target.value as ClinicSort)}>
      {CLINIC_SORTS.map((sort) => {
        const disabled = (sort === "distance" && !hasOrigin) || (sort === "price" && !hasServices);
        const note = sort === "distance" && !hasOrigin ? " (angiv postnummer)" : sort === "price" && !hasServices ? " (vælg behandling)" : "";
        return (
          <option key={sort} value={sort} disabled={disabled}>
            {CLINIC_SORT_LABEL[sort]}
            {note}
          </option>
        );
      })}
    </SelectField>
  );
}
