import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BaseStorage } from "@/platform/base/baseStorage";
import {
  PendingStoragePathsRepository,
  type PendingStoragePath,
  type StorageBucket,
} from "@/platform/pendingStoragePathsRepository";

// Generisk adgang til en bucket (arver sletning og mappesletning fra BaseStorage); domænernes egne storage-klasser kender stier.
class BucketStorage extends BaseStorage {
  constructor(admin: SupabaseClient, protected readonly bucket: StorageBucket) {
    super(admin);
  }
}

export type DrainResult = { removed: number; failed: number };

// Sletter filer, uden at de kan blive forældreløse (platform/README.md 4.3, security M4). Rækken, der pegede på filen, er
// normalt allerede slettet, og en trigger har lagt stien i pending_storage_paths i samme transaktion. Servicen forsøger at
// slette filen straks og fjerner derefter posten; lykkes det ikke, bliver posten liggende (eller lægges i køen, hvis filen
// aldrig havde en række), og cronjobbet tømmer køen. Metoderne `discard*` kaster aldrig: kalderen har allerede gjort sit arbejde.
// Får service role-klienten i constructoren (architecture 2.3 c, g). Ingen tilstand mellem kald; kun fejltyper logges.
export class StorageCleanupService {
  private readonly queue: PendingStoragePathsRepository;
  private readonly buckets = new Map<StorageBucket, BucketStorage>();

  constructor(private readonly admin: SupabaseClient) {
    this.queue = new PendingStoragePathsRepository(admin);
  }

  private storage(bucket: StorageBucket): BucketStorage {
    let storage = this.buckets.get(bucket);
    if (!storage) {
      storage = new BucketStorage(this.admin, bucket);
      this.buckets.set(bucket, storage);
    }
    return storage;
  }

  private static logFailure(what: string, error: unknown): void {
    console.error(`storage-oprydning: ${what} fejlede:`, error instanceof Error ? error.name : "ukendt");
  }

  // Sletter filerne nu. Lykkes det, fjernes posterne fra køen; ellers lægges stierne i køen (ingen kast).
  async discard(bucket: StorageBucket, paths: readonly string[]): Promise<void> {
    if (paths.length === 0) return;
    try {
      await this.storage(bucket).remove([...paths]);
    } catch (error) {
      StorageCleanupService.logFailure("sletning af filer", error);
      await this.queue.enqueue(bucket, paths).catch((e) => StorageCleanupService.logFailure("køning af stier", e));
      return;
    }
    await this.queue.forget(bucket, paths).catch((e) => StorageCleanupService.logFailure("oprydning af kø", e));
  }

  // Som discard, for en hel mappe (fx {case_id}/ eller messages/{lead_id}/).
  async discardPrefix(bucket: StorageBucket, prefix: string): Promise<void> {
    try {
      await this.storage(bucket).removePrefix(prefix);
    } catch (error) {
      StorageCleanupService.logFailure("sletning af mappe", error);
      await this.queue.enqueue(bucket, [prefix], true).catch((e) => StorageCleanupService.logFailure("køning af mappe", e));
      return;
    }
    await this.queue.forgetPrefix(bucket, prefix).catch((e) => StorageCleanupService.logFailure("oprydning af kø", e));
  }

  // Lægger en mappe i køen uden at slette den nu (kontosletning: rækkerne og brugeren er allerede væk, så ingen kan bruge mappen).
  enqueuePrefix(bucket: StorageBucket, prefix: string): Promise<void> {
    return this.queue.enqueue(bucket, [prefix], true);
  }

  // Filerne er slettet af kalderen selv (fx tilbagetrukket samtykke): fjern kun posterne.
  async forget(bucket: StorageBucket, paths: readonly string[]): Promise<void> {
    await this.queue.forget(bucket, paths).catch((e) => StorageCleanupService.logFailure("oprydning af kø", e));
  }

  // Cronjobbet: sletter køens ældste poster. En post, der fejler, får et forsøg mere og forsøges igen næste gang.
  async drain(limit: number): Promise<DrainResult> {
    const items = await this.queue.listBatch(limit);
    const done: string[] = [];
    let failed = 0;
    for (const item of items) {
      if (await this.process(item)) done.push(item.id);
      else {
        failed += 1;
        await this.queue.markFailed(item).catch((e) => StorageCleanupService.logFailure("opdatering af forsøg", e));
      }
    }
    await this.queue.forgetIds(done);
    return { removed: done.length, failed };
  }

  private async process(item: PendingStoragePath): Promise<boolean> {
    try {
      const storage = this.storage(item.bucket);
      if (item.isPrefix) await storage.removePrefix(item.path);
      else await storage.remove([item.path]);
      return true;
    } catch (error) {
      StorageCleanupService.logFailure("tømning af kø", error);
      return false;
    }
  }
}
