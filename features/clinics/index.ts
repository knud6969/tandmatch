// Domænets offentlige servergrænseflade: det andre domæner må importere (docs/oprydning-features.md, trin 4).
// Kun serverkode og typer. Komponenter til andre domæner eksporteres fra ui.ts, så klientkode aldrig trækker server-only med.
export * from "./availabilityRepository";
export * from "./availabilityService";
export * from "./clinicDirectoryRepository";
export * from "./clinicsRepository";
export * from "./publicMediaStorage";
export * from "./servicesRepository";
