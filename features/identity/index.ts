// Domænets offentlige servergrænseflade: det andre domæner må importere (docs/oprydning-features.md, trin 4).
// Kun serverkode og typer. Komponenter til andre domæner eksporteres fra ui.ts, så klientkode aldrig trækker server-only med.
export * from "./accountDeletionService";
export * from "./consentsRepository";
export * from "./authRepository";
export * from "./profilesRepository";
export * from "./termsRepository";
