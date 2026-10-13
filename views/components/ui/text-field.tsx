import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/views/components/ui/cx";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
};

// Felt med synlig label, hjælpetekst og fejlbesked, koblet med aria-describedby og aria-invalid.
export function TextField({ label, hint, error, id, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "min-h-12 w-full rounded-control border bg-surface px-3.5 py-2 text-base text-ink placeholder:text-ink-muted/70",
          error ? "border-danger-line" : "border-field-border",
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
