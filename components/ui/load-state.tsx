import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Indlæsningsfejl med "Prøv igen": den ene måde at vise, at noget ikke kunne hentes, eller at en handling kan gentages.
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert tone="danger">
      <p>{message}</p>
      <Button variant="secondary" className="mt-3" onClick={onRetry}>
        Prøv igen
      </Button>
    </Alert>
  );
}

// Fælles visning, mens en klinikside henter data, eller hvis hentningen fejler.
export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (error) return <LoadError message={error} onRetry={onRetry} />;
  if (loading) {
    return (
      <p role="status" className="text-base text-ink-muted">
        Indlæser …
      </p>
    );
  }
  return null;
}
