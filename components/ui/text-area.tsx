import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type TextAreaProps = Omit<ComponentProps<"textarea">, "id"> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
  // Skjul labelen visuelt, men behold den for skærmlæsere.
  labelHidden?: boolean;
};

// Flerlinjet felt med synlig label, hjælpetekst og fejlbesked (samme mønster som TextField).
export function TextArea({ label, hint, error, id, labelHidden, className, ...props }: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className={cx("text-sm font-semibold text-ink", labelHidden && "sr-only")}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "min-h-32 w-full rounded-lg border bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-muted/70",
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
