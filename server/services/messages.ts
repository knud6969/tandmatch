import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageDto } from "@/lib/types/messages";
import { ApiError, notFound } from "@/server/http/api";
import { getResponse } from "@/server/models/responses";
import { insertMessage, listMessages, markReceivedAsRead, type MessageRow } from "@/server/models/messages";

function toDto(row: MessageRow, userId: string): MessageDto {
  return {
    id: row.id,
    fromMe: row.senderId === userId,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

// Begge parter (RLS: is_response_participant) kan læse. Henter tråden og markerer modtagne beskeder som læst.
export async function getThread(supabase: SupabaseClient, userId: string, responseId: string): Promise<MessageDto[]> {
  const response = await getResponse(supabase, responseId);
  if (!response) throw notFound();
  await markReceivedAsRead(supabase, responseId, userId);
  const rows = await listMessages(supabase, responseId);
  return rows.map((row) => toDto(row, userId));
}

// Kun permanente deltagere kan skrive (is_permanent_user() i policyen). Dagligt loft håndhæves i databasen.
export async function sendMessage(
  supabase: SupabaseClient,
  userId: string,
  responseId: string,
  body: string,
): Promise<MessageDto> {
  const response = await getResponse(supabase, responseId);
  if (!response) throw notFound();
  // getResponse() ovenfor bruger samme RLS-betingelse som is_response_participant(), så en 42501 her
  // (insert-policyen) kan kun skyldes det daglige loft, ikke manglende deltagelse.
  try {
    const row = await insertMessage(supabase, { responseId, senderId: userId, body });
    return toDto(row, userId);
  } catch (err) {
    if (err instanceof ApiError && err.code === "FORBIDDEN") {
      throw new ApiError(429, "RATE_LIMITED", "Du har sendt mange beskeder i dag. Prøv igen i morgen.");
    }
    throw err;
  }
}
