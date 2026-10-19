import type { MeDto } from "@/lib/types/auth";
import { apiRequest } from "./client";

export function getMe(): Promise<MeDto> {
  return apiRequest<MeDto>("/api/me");
}
