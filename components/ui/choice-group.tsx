import { useId } from "react";
import { cx } from "@/components/ui/cx";

export type ChoiceOption<T extends string> = { value: T; label: string };

type ChoiceGroupProps<T extends string> = {
  legend: string;
  hint?: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
};

// Radioknapper som store kort. Hele kortet er trykflade og labelled af teksten.
export function ChoiceGroup<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  error,
}: ChoiceGroupProps<T>) {
  const name = useId();
  const errorId = error ? `${name}-error` : undefined;

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={errorId}>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="-mt-2 text-sm text-ink-muted">{hint}</p>}
      <div className="grid gap-2.5">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-base text-ink",
                checked
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                  : error
                    ? "border-danger-line hover:border-brand-400"
                    : "border-line hover:border-brand-400",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="size-5 shrink-0 accent-brand-600"
              />
              <span className="font-medium">{option.label}</span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}
