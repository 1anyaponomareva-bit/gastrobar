import type { GameTable } from "@/games/durak/types";

/** Строка из `public.rooms` (миграция `20260331120000_durak_online.sql`). */
export type RoomRow = {
  id: string;
  status: "waiting" | "playing" | "finished";
  max_players: number;
  search_deadline: string;
  started_with_bot: boolean;
  created_at?: string;
  /** true — быстрая очередь; false — стол с друзьями */
  matchmaking_pool?: boolean;
  table_name?: string | null;
  owner_player_id?: string | null;
  is_public?: boolean;
  join_code?: string | null;
};

/** Стол в списке «кто играет» */
export type PublicFriendTableRow = {
  id: string;
  table_name: string | null;
  max_players: number;
  join_code: string | null;
  player_count: number;
};

export type RoomPlayerRow = {
  id: string;
  room_id: string;
  /** Публичный id игрока (строка из localStorage), колонка в БД: `player_id`. */
  player_id: string;
  /** Имя в UI; колонка в Supabase: `player_name`. */
  player_name: string;
  is_bot: boolean;
  seat_index: number;
  joined_at?: string;
  /** Активность клиента (RPC `durak_player_ping`), для порога «соперник вышел». */
  last_seen_at?: string;
};

/** `room_state.state` — обёртка над JSON партии. */
export type RoomStatePayload = {
  game?: GameTable;
};

export type RoomStateRow = {
  room_id: string;
  state: RoomStatePayload;
  updated_at: string;
};
