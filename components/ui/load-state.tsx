import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Fælles visning, mens en klinikside henter data, eller hvis hentningen fejler.
export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <Alert tone="danger" role="alert">
        <p>{error}</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Prøv igen
        </Button>
      </Alert>
    );
  }
  if (loading) {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser …
      </p>
    );
  }
  return null;
}
