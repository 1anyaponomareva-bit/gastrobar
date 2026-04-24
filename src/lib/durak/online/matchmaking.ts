import type { SupabaseClient } from "@supabase/supabase-js";
import { userFacingNetworkMessage } from "@/lib/durak/userFacingError";
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
  const net = userFacingNetworkMessage(err);
  if (net) return net;
  if (err == null) return "Неизвестная ошибка";
  if (typeof err === "string") {
    const t = err.trim();
    if (!t) return EMPTY_ERROR_HINT;
    const netS = userFacingNetworkMessage(t);
    if (netS) return netS;
    return t;
  }
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

/**
 * Вызов RPC через `client.rpc` (тот же базовый URL, что в `createClient`).
 * Ручной `fetch` к `/rest/v1/rpc/…` в части Safari давал `TypeError: Load failed` при нормальной сети.
 */
async function rpcPost(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: unknown } | { error: string }> {
  try {
    const { data, error } = await client.rpc(fn, args as object);
    if (error) {
      return { error: formatPostgrestError(error) };
    }
    return { data: data as unknown };
  } catch (e) {
    return { error: formatPostgrestError(e) };
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

/**
 * Финализация комнаты на сервере (бот после дедлайна, старт при 2+ людях и т.д.).
 * Вызывается из: DurakOnlineMatchmaking (после join + в tick), DurakEntryFlow (лobby),
 * триггер `room_players` на INSERT. UI выходит из матчмейкинга только когда `rooms.status` станет `playing`.
 */
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
 * Если в быстрой очереди уже ≥2 живых игрока, а комната ещё waiting — дожать статус playing.
 * Страховка при старом/битом finalize на сервере. Если RPC ещё не залит — 404 игнорируем.
 */
/** Закрыть столы с друзьями без активности ≥20 мин (см. SQL `durak_close_inactive_friend_rooms`). */
export async function durakCloseInactiveFriendRooms(client: SupabaseClient): Promise<void> {
  const out = await rpcPost(client, "durak_close_inactive_friend_rooms", {});
  if ("error" in out) {
    const msg = out.error;
    if (/HTTP 404\b|not find|could not find|does not exist|42883/i.test(msg)) return;
    console.warn("[durak] durak_close_inactive_friend_rooms:", msg);
  }
}

export async function durakForceStartIfTwoHumans(client: SupabaseClient, roomId: string): Promise<void> {
  const out = await rpcPost(client, "durak_force_start_if_two_humans", {
    p_room_id: roomId,
  });
  if ("error" in out) {
    const msg = out.error;
    if (/HTTP 404\b|not find|could not find|does not exist|42883/i.test(msg)) {
      return;
    }
    throw new Error(msg);
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

export async function durakPlayerPing(
  client: SupabaseClient,
  roomId: string,
  playerId: string
): Promise<void> {
  const out = await rpcPost(client, "durak_player_ping", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
  if ("error" in out) throw new Error(out.error);
}

/** Явный выход из партии: last_seen в прошлое — соперник может сразу зачесть форфейт. */
export async function durakPlayerLeftMatch(
  client: SupabaseClient,
  roomId: string,
  playerId: string
): Promise<void> {
  const out = await rpcPost(client, "durak_player_left_match", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
  if ("error" in out) throw new Error(out.error);
}

/**
 * Серверная победа, если все прочие люди не пинговали дольше порога (см. SQL).
 * Вызывать только после мягкой клиентской проверки и при видимой вкладке.
 */
export async function durakForfeitStaleOpponent(
  client: SupabaseClient,
  roomId: string,
  playerId: string
): Promise<string> {
  const out = await rpcPost(client, "durak_forfeit_stale_opponent", {
    p_room_id: roomId,
    p_player_id: playerId,
  });
  if ("error" in out) throw new Error(out.error);
  const row = Array.isArray(out.data)
    ? (out.data[0] as Record<string, unknown> | undefined)
    : (out.data as Record<string, unknown> | null);
  const raw = row?.out_updated_at ?? row?.outUpdatedAt;
  const ts = raw != null ? String(raw).trim() : "";
  if (!ts) throw new Error("Сервер не вернул время обновления стола");
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

/** Синхронно с `durak_forfeit_stale_opponent`: соперник «жив», если пинговал за последние 20 с. */
const STALE_LAST_SEEN_MS = 20_000;
/** Запас, если в строке нет last_seen (редко); колонка в БД обычно NOT NULL. */
const STALE_IF_NEVER_SEEN_AFTER_JOIN_MS = 24_000;

/**
 * Клиент «соперник не на связи» перед RPC форфейта (20 с без пинга).
 * На сервере «caller not active» — см. миграцию (обычно ~45 с без пинга вызывающего).
 */
export function isRoomPlayerLikelyGone(row: RoomPlayerRow, nowMs: number): boolean {
  if (row.is_bot) return false;
  const lastRaw = row.last_seen_at;
  if (lastRaw) {
    const last = Date.parse(lastRaw);
    if (Number.isFinite(last)) return nowMs - last >= STALE_LAST_SEEN_MS;
  }
  const joinedRaw = row.joined_at;
  if (joinedRaw) {
    const joined = Date.parse(joinedRaw);
    if (Number.isFinite(joined)) return nowMs - joined >= STALE_IF_NEVER_SEEN_AFTER_JOIN_MS;
  }
  return false;
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
  await durakCloseInactiveFriendRooms(client);
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
