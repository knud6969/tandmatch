import "server-only";
import { createSupabaseAdminClient } from "@/server/db/admin";
import { deleteAuthUser, removeAllObjectsForPrefix } from "@/server/models/cleanup";

// Sletter alt for én bruger: storage-mappen {uid}/ og auth-brugeren. Rækker slettes via cascade (architecture 7.7, 9.4).
// Bruges af både patientens egen sletning og oprydningsjobbet.
export async function deleteAccountData(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await removeAllObjectsForPrefix(admin, userId);
  await deleteAuthUser(admin, userId);
}
