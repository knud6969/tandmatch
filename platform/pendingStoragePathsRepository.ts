import "server-only";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";

export type StorageBucket = "case-images" | "public-media";

type PendingRow = Pick<Tables<"pending_storage_paths">, "id" | "bucket" | "path" | "is_prefix" | "attempts">;

// En fil (eller mappe), der skal slettes fra storage.
export type PendingStoragePath = { id: string; bucket: StorageBucket; path: string; isPrefix: boolean; attempts: number };

// Posterne slettes efter så mange mislykkede forsøg ikke længere af jobbet; de bliver stående til manuel oprydning.
export const PENDING_STORAGE_MAX_ATTEMPTS = 5;

// Køen af filer, der skal slettes (platform/README.md 4.3, security M4). Kun service role: tabellen har ingen policies. Triggere i
// databasen lægger stierne i køen, når rækker, der peger på filer, slettes; serveren lægger selv filer uden række i køen, hvis
// den direkte sletning fejler. Ingen persondata: kun bucket og sti.
export class PendingStoragePathsRepository extends BaseRepository<PendingRow, PendingStoragePath> {
  protected toDto(row: PendingRow): PendingStoragePath {
    return { id: row.id, bucket: row.bucket as StorageBucket, path: row.path, isPrefix: row.is_prefix, attempts: row.attempts };
  }

  // Lægger stier i køen; en sti, der allerede ligger der (fx lagt af triggeren), er uændret.
  async enqueue(bucket: StorageBucket, paths: readonly string[], isPrefix = false): Promise<void> {
    if (paths.length === 0) return;
    await this.run(
      this.db
        .from("pending_storage_paths")
        .upsert(paths.map((path) => ({ bucket, path, is_prefix: isPrefix })), { onConflict: "bucket,path", ignoreDuplicates: true }),
      "pending_storage_paths: insert fejlede",
    );
  }

  // Fjerner stierne fra køen, når filerne er slettet.
  async forget(bucket: StorageBucket, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.run(this.db.from("pending_storage_paths").delete().eq("bucket", bucket).in("path", [...paths]), "pending_storage_paths: delete fejlede");
  }

  // Fjerner en mappe og alt under den fra køen (præfikset er altid et id eller en fast sti, aldrig brugerinput).
  async forgetPrefix(bucket: StorageBucket, prefix: string): Promise<void> {
    await this.run(
      this.db.from("pending_storage_paths").delete().eq("bucket", bucket).or(`path.eq.${prefix},path.like.${prefix}/*`),
      "pending_storage_paths: delete fejlede",
    );
  }

  // De ældste poster, der endnu ikke har opbrugt deres forsøg.
  async listBatch(limit: number): Promise<PendingStoragePath[]> {
    return this.toDtos(
      await this.runList<PendingRow>(
        this.db
          .from("pending_storage_paths")
          .select("id, bucket, path, is_prefix, attempts")
          .lt("attempts", PENDING_STORAGE_MAX_ATTEMPTS)
          .order("created_at")
          .limit(limit),
        "pending_storage_paths: select fejlede",
      ),
    );
  }

  async forgetIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.run(this.db.from("pending_storage_paths").delete().in("id", [...ids]), "pending_storage_paths: delete fejlede");
  }

  async markFailed(item: PendingStoragePath): Promise<void> {
    await this.run(
      this.db.from("pending_storage_paths").update({ attempts: item.attempts + 1 }).eq("id", item.id),
      "pending_storage_paths: update fejlede",
    );
  }

  async count(): Promise<number> {
    const { count, error } = await this.db.from("pending_storage_paths").select("id", { count: "exact", head: true });
    if (error) throw new Error("pending_storage_paths: count fejlede");
    return count ?? 0;
  }
}
