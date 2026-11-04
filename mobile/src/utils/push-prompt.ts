// Hvornår appen viser kortet "Få besked, når klinikken svarer" (mobile 13.10). Ren logik.
export type PushPermission = "undetermined" | "granted" | "denied";

export function shouldShowPushPrompt(input: { permission: PushPermission | null; dismissed: boolean; hasProjectId: boolean; hasAccount: boolean }): boolean {
  return input.hasProjectId && input.hasAccount && input.permission === "undetermined" && !input.dismissed;
}
