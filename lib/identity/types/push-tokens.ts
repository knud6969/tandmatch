import type { PUSH_PLATFORMS } from "@/lib/identity/constants/push-tokens";

export type PushPlatform = (typeof PUSH_PLATFORMS)[number];
export type RegisterPushTokenInput = { token: string; platform: PushPlatform };

// Patientens enheder i dataeksporten (identity 10.2). Aldrig selve tokenet.
export type PushDeviceExportDto = { platform: PushPlatform; createdAt: string; lastSeenAt: string };
