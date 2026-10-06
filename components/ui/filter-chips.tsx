import { cx } from "@/components/ui/cx";

export type FilterOption<T extends string> = { value: T; label: string };

type FilterChipsProps<T extends string> = {
  label: string;
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

// Filterknapper med aria-pressed. Hver knap er mindst 44 px høj, så den er nem at trykke på mobil.
export function FilterChips<T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-11 rounded-full px-4 text-base font-semibold ring-1 ring-inset transition-colors",
              active
                ? "bg-brand-600 text-white ring-brand-600"
                : "bg-surface text-ink ring-field-border hover:bg-brand-50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
