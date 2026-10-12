import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Role } from "@/lib/types/common";

const profileRowSchema = z.object({
  role: z.enum(["patient", "clinic", "admin"]),
  is_anonymous: z.boolean(),
  last_active_at: z.string(),
});

export type ProfileRow = {
  role: Role;
  isAnonymous: boolean;
  lastActiveAt: string;
};

export async function getProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, is_anonymous, last_active_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("profiles: select fejlede");
  }
  if (!data) return null;
  const parsed = profileRowSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("profiles: uventet format");
  }
  return {
    role: parsed.data.role,
    isAnonymous: parsed.data.is_anonymous,
    lastActiveAt: parsed.data.last_active_at,
  };
}

export async function touchLastActive(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("touch_last_active");
  if (error) {
    throw new Error("touch_last_active fejlede");
  }
}

export async function getPatientFirstName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("first_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("patients: select fejlede");
  return (data?.first_name as string | null | undefined) ?? null;
}
