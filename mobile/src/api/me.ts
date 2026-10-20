// Hvem er jeg? Bruges af SessionProvider til at se, om tokens er gyldige, og om kontoen er en patient.
import type { MeDto } from "@/lib/types/auth";
import { apiRequest } from "./client";

export function getMe(): Promise<MeDto> {
  return apiRequest<MeDto>("/api/me");
}
