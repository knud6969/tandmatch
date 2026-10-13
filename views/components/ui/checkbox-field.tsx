import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/views/components/ui/cx";

type CheckboxFieldProps = Omit<ComponentProps<"input">, "type" | "id"> & {
  label: ReactNode;
  error?: string;
  id?: string;
};

// Hele feltet er trykflade. Afkrydsningsfelter er aldrig forudafkrydsede (samtykke, architecture 4.3).
export function CheckboxField({ label, error, id, className, ...props }: CheckboxFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className={cx(
          "flex min-h-12 cursor-pointer items-start gap-3 rounded-control border bg-surface p-4",
          error ? "border-danger-line" : "border-line hover:border-brand-400",
          className,
        )}
      >
        <input
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 size-5 shrink-0 accent-brand-600"
          {...props}
        />
        <span className="text-base leading-relaxed text-ink">{label}</span>
      </label>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
