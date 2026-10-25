// Domænets klientsikre grænseflade: komponenter og hjælpere, som andre domæners UI må importere (docs/architecture.md 2.1).
export * from "./utils/clinic-links";
// Tallet på fanen Henvendelser (features/clinics/README.md 6.3): samme delte hentning som indbakken.
export { useLeadsNeedingActionCount } from "./utils/clinic-leads-store";
