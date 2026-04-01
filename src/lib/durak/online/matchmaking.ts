import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomPlayerRow, RoomRow } from "./types";

/** Текст ошибки PostgREST / Supabase / сети для UI (без «[object Object]»). */
export function formatPostgrestError(err: unknown): string {
  if (err == null) return "Неизвестная ошибка";
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);

  if (err instanceof Error) {
    const any = err as Error & {
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts = [
      any.message,
      typeof any.code === "string" && any.code ? `[${any.code}]` : "",
      typeof any.details === "string" ? any.details : "",
      typeof any.hint === "string" ? any.hint : "",
    ].filter((s) => typeof s === "string" && s.length > 0);
    if (parts.length) return parts.join(" — ");
    return any.name && any.name !== "Error" ? any.name : "Ошибка";
  }

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    const push = (s: unknown) => {
      if (typeof s === "string" && s.length > 0) parts.push(s);
    };
    push(o.message);
    push(o.details);
    push(o.hint);
    if (typeof o.code === "string" && o.code.length > 0) parts.push(`[${o.code}]`);
    if (typeof o.status === "number") parts.push(`HTTP ${o.status}`);
    const nested = o.error;
    if (typeof nested === "string") push(nested);
    else if (nested != null && typeof nested === "object") {
      parts.push(formatPostgrestError(nested));
    }
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(o);
    } catch {
      return "Ошибка сервера или сети";
    }
  }

  return String(err);
}

function parseJoinQueueResult(data: unknown): {
  roomId: string;
  searchDeadline: string;
  rejoined: boolean;
} {
  const row =
    data == null
      ? null
      : Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)
        : (data as Record<string, unknown>);

  if (!row || typeof row !== "object") {
    throw new Error(
      "Пустой ответ сервера. Убедитесь, что в Supabase применена миграция с функцией durak_join_queue."
    );
  }

  const roomId = String(
    row.out_room_id ?? row.outRoomId ?? ""
  ).trim();
  const rawDeadline = row.out_search_deadline ?? row.outSearchDeadline;
  const searchDeadline =
    typeof rawDeadline === "string"
      ? rawDeadline
      : rawDeadline instanceof Date
        ? rawDeadline.toISOString()
        : String(rawDeadline ?? "");

  const rj = row.out_rejoined ?? row.outRejoined;
  const rejoined = rj === true;

  if (!roomId) {
    throw new Error(
      "В ответе нет идентификатора комнаты. Проверьте сигнатуру RPC durak_join_queue в Supabase."
    );
  }

  return { roomId, searchDeadline, rejoined };
}

/** Matchmaking: RPC `durak_join_queue` в Supabase. */
export async function durakJoinQueue(
  client: SupabaseClient,
  playerId: string,
  displayName: string
): Promise<{ roomId: string; searchDeadline: string; rejoined: boolean }> {
  const { data, error } = await client.rpc("durak_join_queue", {
    payload: {
      player_id: playerId,
      display_name: displayName,
    },
  });
  if (error) {
    throw new Error(formatPostgrestError(error));
  }
  return parseJoinQueueResult(data);
}

/** Таймаут очереди: вызывать периодически, пока комната в `waiting`. */
export async function durakFinalizeRoomIfReady(
  client: SupabaseClient,
  roomId: string
): Promise<void> {
  const { error } = await client.rpc("durak_finalize_room_if_ready", {
    p_room_id: roomId,
  });
  if (error) throw new Error(formatPostgrestError(error));
}

export async function fetchRoom(
  client: SupabaseClient,
  roomId: string
): Promise<RoomRow | null> {
  const { data, error } = await client
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw new Error(formatPostgrestError(error));
  return data as RoomRow | null;
}

export async function fetchRoomPlayers(
  client: SupabaseClient,
  roomId: string
): Promise<RoomPlayerRow[]> {
  const { data, error } = await client
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index", { ascending: true });
  if (error) throw new Error(formatPostgrestError(error));
  return (data ?? []) as RoomPlayerRow[];
}
