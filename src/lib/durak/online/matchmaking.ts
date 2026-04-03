import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicFriendTableRow, RoomPlayerRow, RoomRow, RoomStatePayload } from "./types";

const EMPTY_ERROR_HINT =
  "Ошибка без текста от сервера. В Supabase проверьте RLS на rooms, room_players, room_state и права на RPC durak_join_queue / durak_finalize_room_if_ready (SQL + Logs).";

function hasMeaningfulString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** Все значения пустые строки / null — как типичный { message: "" } от API. */
function isEmptyErrorPayload(o: Record<string, unknown>): boolean {
  return Object.values(o).every((v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === "string") return v.trim() === "";
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      return isEmptyErrorPayload(v as Record<string, unknown>);
    }
    return false;
  });
}

/** Текст ошибки PostgREST / Supabase / сети для UI (без «[object Object]» и {\"message\":\"\"}). */
export function formatPostgrestError(err: unknown): string {
  if (err == null) return "Неизвестная ошибка";
  if (typeof err === "string") return err.trim() || EMPTY_ERROR_HINT;
  if (typeof err === "number" || typeof err === "boolean") return String(err);

  if (err instanceof Error) {
    const any = err as Error & {
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts: string[] = [];
    if (hasMeaningfulString(any.message)) parts.push(any.message.trim());
    if (typeof any.code === "string" && any.code) parts.push(`[${any.code}]`);
    if (hasMeaningfulString(any.details)) parts.push(String(any.details));
    if (hasMeaningfulString(any.hint)) parts.push(String(any.hint));
    if (parts.length) return parts.join(" — ");
    return any.name && any.name !== "Error" ? any.name : EMPTY_ERROR_HINT;
  }

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    const push = (s: unknown) => {
      if (hasMeaningfulString(s)) parts.push(String(s).trim());
    };
    push(o.message);
    push(o.details);
    push(o.hint);
    push(o.msg);
    push(o.error_description);
    push(o.reason);
    if (typeof o.code === "string" && o.code.length > 0) parts.push(`[${o.code}]`);
    if (typeof o.status === "number") parts.push(`HTTP ${o.status}`);
    if (typeof o.statusCode === "number") parts.push(`код ${o.statusCode}`);
    push(o.statusText);
    const nested = o.error;
    if (typeof nested === "string") push(nested);
    else if (nested != null && typeof nested === "object") {
      const inner = formatPostgrestError(nested);
      if (inner !== EMPTY_ERROR_HINT) parts.push(inner);
    }
    if (parts.length) return parts.join(" — ");
    if (isEmptyErrorPayload(o)) return EMPTY_ERROR_HINT;
    try {
      const raw = JSON.stringify(o);
      if (raw === "{}" || raw.length <= 2) return EMPTY_ERROR_HINT;
      return raw;
    } catch {
      return EMPTY_ERROR_HINT;
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

type ClientKeys = { supabaseUrl: string; supabaseKey: string };

function getClientKeys(client: SupabaseClient): ClientKeys {
  return client as unknown as ClientKeys;
}

/** Смени число при следующем изменении текста ошибок — по нему видно, что задеплоена свежая сборка. */
const DURAK_NET_HINT_REV = 3;

/** Прямой POST к PostgREST RPC — в ошибке всегда есть HTTP status и сырое тело (client.rpc часто даёт { message: "" }). */
function formatRpcHttpFailure(status: number, statusText: string, body: string): string {
  const head = `HTTP ${status} ${statusText}`;
  const t = body.trim();
  const emptyHint =
    `[durak-net-v${DURAK_NET_HINT_REV}] ${head}, тело ответа пустое. ` +
    `1) SQL: supabase/sql/durak_grant_schema_only.sql затем целиком supabase/sql/durak_queue_functions_only.sql. ` +
    `2) Проверка: supabase/sql/durak_debug_test_rpc.sql. ` +
    `3) Supabase → Logs → Postgres. ` +
    `4) Запушь этот репозиторий и сделай Redeploy на Vercel, на телефоне открой сайт в приватном окне (иначе старый JS). ` +
    `Если в ошибке НЕТ префикса [durak-net-v${DURAK_NET_HINT_REV}] — ты всё ещё на старой версии сайта.`;

  if (t) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const parts: string[] = [head];
      if (hasMeaningfulString(j.message)) parts.push(String(j.message));
      if (typeof j.error === "string" && j.error.trim()) parts.push(j.error.trim());
      const code = j.code;
      if (typeof code === "string" && code) parts.push(`[${code}]`);
      else if (typeof code === "number") parts.push(`[${code}]`);
      if (hasMeaningfulString(j.details)) parts.push(String(j.details));
      if (hasMeaningfulString(j.hint)) parts.push(String(j.hint));
      if (parts.length > 1) return parts.join(" — ");
      return `${head} — ${t.slice(0, 500)}`;
    } catch {
      return `${head}: ${t.slice(0, 500)}`;
    }
  }
  return emptyHint;
}

async function rpcPost(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: unknown } | { error: string }> {
  const { supabaseUrl, supabaseKey } = getClientKeys(client);
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${encodeURIComponent(fn)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    return {
      error: formatPostgrestError(e),
    };
  }
  const text = await res.text();
  if (!res.ok) {
    return { error: formatRpcHttpFailure(res.status, res.statusText, text) };
  }
  if (!text.trim()) {
    return { data: null };
  }
  try {
    return { data: JSON.parse(text) as unknown };
  } catch {
    return {
      error: `Некорректный JSON ответа: ${text.slice(0, 200)}`,
    };
  }
}

/** Matchmaking: RPC `durak_join_queue` в Supabase. */
export async function durakJoinQueue(
  client: SupabaseClient,
  playerId: string,
  displayName: string
): Promise<{ roomId: string; searchDeadline: string; rejoined: boolean }> {
  const out = await rpcPost(client, "durak_join_queue", {
    payload: {
      player_id: playerId,
      display_name: displayName,
    },
  });
  if ("error" in out) {
    throw new Error(out.error);
  }
  return parseJoinQueueResult(out.data);
}

/** Таймаут очереди: вызывать периодически, пока комната в `waiting`. */
export async function durakFinalizeRoomIfReady(
  client: SupabaseClient,
  roomId: string
): Promise<void> {
  const out = await rpcPost(client, "durak_finalize_room_if_ready", {
    p_room_id: roomId,
  });
  if ("error" in out) {
    throw new Error(out.error);
  }
}

/**
 * Запись `room_state` только через RPC: проверка membership и статуса комнаты на сервере.
 * Прямой upsert с клиента после миграции RLS недоступен.
 */
export async function durakSaveRoomState(
  client: SupabaseClient,
  roomId: string,
  playerId: string,
  state: RoomStatePayload
): Promise<string> {
  const out = await rpcPost(client, "durak_save_room_state", {
    payload: {
      room_id: roomId,
      player_id: playerId,
      state,
    },
  });
  if ("error" in out) throw new Error(out.error);
  const row = Array.isArray(out.data)
    ? (out.data[0] as Record<string, unknown> | undefined)
    : (out.data as Record<string, unknown> | null);
  const raw = row?.out_updated_at ?? row?.outUpdatedAt;
  const ts = raw != null ? String(raw).trim() : "";
  if (!ts) throw new Error("Сервер не вернул время сохранения стола");
  return ts;
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

function parseSingleRoomId(data: unknown): string {
  const row =
    data == null
      ? null
      : Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)
        : (data as Record<string, unknown>);
  const id = String(row?.out_room_id ?? row?.outRoomId ?? "").trim();
  if (!id) throw new Error("Пустой ответ: нет номера стола");
  return id;
}

/** Стол с друзьями: создатель получает ссылку с кодом. */
export async function durakCreateFriendRoom(
  client: SupabaseClient,
  playerId: string,
  displayName: string,
  tableName: string,
  maxPlayers: number
): Promise<{ roomId: string; joinCode: string }> {
  const out = await rpcPost(client, "durak_create_friend_room", {
    payload: {
      player_id: playerId,
      display_name: displayName,
      table_name: tableName,
      max_players: maxPlayers,
    },
  });
  if ("error" in out) throw new Error(out.error);
  const row = Array.isArray(out.data) ? (out.data[0] as Record<string, unknown>) : (out.data as Record<string, unknown>);
  const roomId = String(row?.out_room_id ?? "").trim();
  const joinCode = String(row?.out_join_code ?? "").trim();
  if (!roomId || !joinCode) throw new Error("Сервер не вернул код стола");
  return { roomId, joinCode };
}

export async function durakJoinFriendRoom(
  client: SupabaseClient,
  playerId: string,
  displayName: string,
  opts: { joinCode?: string; roomId?: string }
): Promise<{ roomId: string }> {
  const payload: Record<string, string> = {
    player_id: playerId,
    display_name: displayName,
  };
  if (opts.joinCode?.trim()) payload.join_code = opts.joinCode.trim().toUpperCase();
  else if (opts.roomId?.trim()) payload.room_id = opts.roomId.trim();
  else throw new Error("Нужен код или номер стола");

  const out = await rpcPost(client, "durak_join_friend_room", { payload });
  if ("error" in out) throw new Error(out.error);
  return { roomId: parseSingleRoomId(out.data) };
}

export async function durakStartFriendRoom(
  client: SupabaseClient,
  playerId: string,
  roomId: string
): Promise<void> {
  const out = await rpcPost(client, "durak_start_friend_room", {
    payload: { player_id: playerId, room_id: roomId },
  });
  if ("error" in out) throw new Error(out.error);
}

/** Активные столы (ожидают игроков), только «с друзьями», публичные. */
export async function fetchPublicFriendTables(client: SupabaseClient): Promise<PublicFriendTableRow[]> {
  const { data: rooms, error: rErr } = await client
    .from("rooms")
    .select("id, table_name, max_players, join_code")
    .eq("status", "waiting")
    .eq("is_public", true)
    .eq("matchmaking_pool", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (rErr) throw new Error(formatPostgrestError(rErr));
  const list = (rooms ?? []) as Pick<RoomRow, "id" | "table_name" | "max_players" | "join_code">[];
  if (list.length === 0) return [];

  const ids = list.map((r) => r.id);
  const { data: rp, error: pErr } = await client.from("room_players").select("room_id").in("room_id", ids);
  if (pErr) throw new Error(formatPostgrestError(pErr));

  const countBy = new Map<string, number>();
  for (const row of rp ?? []) {
    const rid = String((row as { room_id: string }).room_id);
    countBy.set(rid, (countBy.get(rid) ?? 0) + 1);
  }

  return list
    .map((r) => ({
      id: r.id,
      table_name: r.table_name ?? null,
      max_players: r.max_players,
      join_code: r.join_code ?? null,
      player_count: countBy.get(r.id) ?? 0,
    }))
    .filter((r) => r.player_count < r.max_players);
}
