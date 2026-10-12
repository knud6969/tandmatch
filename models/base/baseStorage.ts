import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK = 100;

// Fælles grundlag for storage-repositories (architecture 2.1.1, 9). Får service role-klienten i constructoren,
// fordi ingen bucket har policies for authenticated/anon (9.2). Kalderen har selv tjekket ejerskab først.
// Fejl kastes som almindelige Error uden stier eller persondata og bliver til 500.
export abstract class BaseStorage {
  protected abstract readonly bucket: string;

  constructor(protected readonly admin: SupabaseClient) {}

  async upload(path: string, data: Buffer | Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.admin.storage.from(this.bucket).upload(path, data, { contentType, upsert: false });
    if (error) throw new Error("storage: upload fejlede");
  }

  // Sletter flere filer; ingen fejl for stier, der ikke findes.
  async remove(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += CHUNK) {
      const { error } = await this.admin.storage.from(this.bucket).remove(paths.slice(i, i + CHUNK));
      if (error) throw new Error("storage: slet fejlede");
    }
  }

  // Sletter alle filer under en mappe (Storage API har ingen rekursiv sletning).
  async removePrefix(prefix: string): Promise<void> {
    await this.remove(await this.listFiles(prefix));
  }

  async signedUrl(path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.admin.storage.from(this.bucket).createSignedUrl(path, ttlSeconds);
    if (error || !data) throw new Error("storage: signering fejlede");
    return data.signedUrl;
  }

  // Signerer flere stier i ét kald. Resultatet har samme rækkefølge som `paths`.
  async signedUrls(paths: string[], ttlSeconds: number): Promise<string[]> {
    if (paths.length === 0) return [];
    const { data, error } = await this.admin.storage.from(this.bucket).createSignedUrls(paths, ttlSeconds);
    if (error || !data) throw new Error("storage: signering fejlede");
    return data.map((entry) => {
      if (!entry.signedUrl) throw new Error("storage: signering fejlede");
      return entry.signedUrl;
    });
  }

  // Lister alle filer under en mappe rekursivt.
  protected async listFiles(prefix: string): Promise<string[]> {
    const files: string[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await this.admin.storage
        .from(this.bucket)
        .list(prefix, { limit: CHUNK, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error("storage: list fejlede");
      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id === null) files.push(...(await this.listFiles(path)));
        else files.push(path);
      }
      if (entries.length < CHUNK) break;
      offset += CHUNK;
    }
    return files;
  }
}
