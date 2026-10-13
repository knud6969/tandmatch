import { Button } from "@/views/components/ui/button";
import { cx } from "@/views/components/ui/cx";

type SaveBarProps = {
  // Der er ændringer, som ikke er gemt.
  dirty: boolean;
  saving: boolean;
  // Tidspunkt for seneste vellykkede gem.
  savedAt: Date | null;
  error: string | null;
  label?: string;
  // Klæber til bunden af skærmen. Slå fra, når flere gem-linjer står på samme side.
  sticky?: boolean;
};

const timeFormat = new Intl.DateTimeFormat("da-DK", { timeStyle: "short", timeZone: "Europe/Copenhagen" });

// Gem-linje i bunden af en klinikformular: tydelig status (ikke gemt / gemmer / gemt kl. …) og én gem-knap.
// Linjen klæber til bunden af skærmen, så knappen altid er inden for rækkevidde på mobil.
export function SaveBar({ dirty, saving, savedAt, error, label = "Gem", sticky = true }: SaveBarProps) {
  let status = "Ingen ændringer";
  let tone = "text-ink-muted";
  if (saving) {
    status = "Gemmer …";
  } else if (error) {
    status = error;
    tone = "text-danger-ink";
  } else if (dirty) {
    status = "Du har ændringer, som ikke er gemt";
    tone = "text-warning-ink";
  } else if (savedAt) {
    status = `Gemt kl. ${timeFormat.format(savedAt)}`;
    tone = "text-success-ink";
  }

  return (
    <div className={cx(
        "flex flex-col gap-3 border-line bg-surface sm:flex-row sm:items-center sm:justify-between",
        sticky
          ? "sticky bottom-0 z-10 -mx-4 border-t px-4 py-3 shadow-raised sm:mx-0 sm:rounded-card sm:border"
          : "pt-1",
      )}>
      <p role={error ? "alert" : "status"} aria-live="polite" className={cx("text-base font-medium", tone)}>
        {status}
      </p>
      <Button type="submit" disabled={saving || !dirty} className="sm:min-w-40">
        {saving ? "Gemmer …" : label}
      </Button>
    </div>
  );
}
