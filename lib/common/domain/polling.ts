// Ren hjælper til polling (kan testes uden React), delt af weben og appen: kalder `tick` hvert `intervalMs`, men kun mens kilden er
// synlig, og straks, når den bliver synlig igen. Returnerer en funktion, der stopper det hele.
export type VisibilitySource = {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
};

export function startVisiblePolling(tick: () => void, intervalMs: number, doc: VisibilitySource): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  const start = () => {
    if (timer === null) timer = setInterval(tick, intervalMs);
  };
  const onVisibility = () => {
    if (doc.visibilityState === "visible") {
      stop();
      tick();
      start();
    } else {
      stop();
    }
  };

  if (doc.visibilityState === "visible") start();
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
