import "server-only";
import { createSupabaseAdminClient } from "@/models/db/admin";
import { deleteAuthUser } from "@/models/authModel";
import { listRequestIdsForPatient, removeAllObjectsForPrefix } from "@/models/cleanupModel";

// Sletter alt for én bruger: billedmapperne pr. forespørgsel og auth-brugeren. Rækker slettes via cascade
// (architecture 7.7, 9.4). Billedstien er {request_id}/{image_id}.jpg (ikke {patient_id}/...), så mapperne
// slettes pr. forespørgsel, ikke pr. patient. Bruges af patientens egen sletning, samtykketilbagetrækning
// og oprydningsjobbet.
export async function deleteAccountData(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const requestIds = await listRequestIdsForPatient(admin, userId);
  for (const requestId of requestIds) {
    await removeAllObjectsForPrefix(admin, requestId);
  }
  // Rydder også en eventuel ældre mappe {uid}/ fra før sti-ændringen (ingen effekt hvis den ikke findes).
  await removeAllObjectsForPrefix(admin, userId);
  await deleteAuthUser(admin, userId);
}
