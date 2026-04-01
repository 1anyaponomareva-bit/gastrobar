import type { GameTable } from "@/games/durak/types";

/** Строка из `public.rooms` (миграция `20260331120000_durak_online.sql`). */
export type RoomRow = {
  id: string;
  status: "waiting" | "playing" | "finished";
  max_players: number;
  search_deadline: string;
  started_with_bot: boolean;
  created_at?: string;
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
