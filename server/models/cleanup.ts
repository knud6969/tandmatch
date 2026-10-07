import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REQUEST_BUCKET } from "@/lib/constants/limits";

// Bruges kun med service role (createSupabaseAdminClient). Ingen persondata logges herfra.

export async function listExpiredAnonymousUserIds(
  admin: SupabaseClient,
  cutoffIso: string,
  limit: number,
): Promise<string[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("is_anonymous", true)
    .lt("last_active_at", cutoffIso)
    .limit(limit);
  if (error) throw new Error("profiles: udløbne sessioner kunne ikke læses");
  return (data as { id: string }[]).map((row) => row.id);
}

// Lister alle filer under en mappe rekursivt (Storage API har ingen rekursiv liste).
async function listFilesRecursive(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const pageSize = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage
      .from(REQUEST_BUCKET)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error("storage: list fejlede");
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        files.push(...(await listFilesRecursive(admin, path)));
      } else {
        files.push(path);
      }
    }
    if (entries.length < pageSize) break;
    offset += pageSize;
  }
  return files;
}

export async function removeAllObjectsForPrefix(admin: SupabaseClient, prefix: string): Promise<void> {
  const paths = await listFilesRecursive(admin, prefix);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(REQUEST_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error("storage: slet fejlede");
  }
}

// Billedstien er nu {request_id}/{image_id}.jpg (ikke {patient_id}/...), så oprydning skal ske pr. forespørgsel.
export async function listRequestIdsForPatient(admin: SupabaseClient, patientId: string): Promise<string[]> {
  const { data, error } = await admin.from("requests").select("id").eq("patient_id", patientId);
  if (error) throw new Error("requests: kunne ikke læses til oprydning");
  return (data as { id: string }[]).map((row) => row.id);
}

export async function deleteAuthUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error("auth: slet bruger fejlede");
}
