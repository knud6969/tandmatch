import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/server/http/api";

// Beskedtråd (architecture 4.3, 10.7). RLS (is_response_participant) afgør synlighed; denne fil tilføjer
// kun ejerskabstjek. Kolonnenavne forlader ikke denne fil.

const MESSAGE_COLUMNS = "id, sender_id, body, read_at, created_at";

export type MessageRow = {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

function toRow(row: { id: string; sender_id: string; body: string; read_at: string | null; created_at: string }): MessageRow {
  return {
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

// Tomt resultat betyder: svaret findes ikke, eller den indloggede er ikke en af de to parter. Begge giver 404
// i routen (vi skelner ikke, for ikke at lække eksistens).
export async function listMessages(supabase: SupabaseClient, responseId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("response_id", responseId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("messages: select fejlede");
  return (data ?? []).map(toRow);
}

export async function insertMessage(
  supabase: SupabaseClient,
  params: { responseId: string; senderId: string; body: string },
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ response_id: params.responseId, sender_id: params.senderId, body: params.body })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    // 42501: ikke en del af tråden, eller det daglige loft er nået (samme RLS-check).
    if (error.code === "42501") {
      throw new ApiError(403, "FORBIDDEN", "Du kan ikke skrive i denne beskedtråd lige nu.");
    }
    throw new Error("messages: insert fejlede");
  }
  if (!data) throw new Error("messages: insert uden række");
  return toRow(data);
}

// Markerer modtagne (ikke egne) beskeder som læst. Policyen tillader kun dette for den anden part.
export async function markReceivedAsRead(
  supabase: SupabaseClient,
  responseId: string,
  readerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("response_id", responseId)
    .neq("sender_id", readerId)
    .is("read_at", null);
  if (error) throw new Error("messages: markering som læst fejlede");
}
