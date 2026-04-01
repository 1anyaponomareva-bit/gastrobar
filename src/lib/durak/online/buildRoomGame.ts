import { newGameForPlayers } from "@/games/durak/engine";
import type { GameTable, PlayerType } from "@/games/durak/types";
import { stableBotDisplayName } from "./botDisplayNames";
import type { RoomPlayerRow } from "./types";

function displayNameForRoomPlayer(r: RoomPlayerRow): string {
  const raw = r.player_name?.trim() || "";
  if (!r.is_bot) return raw || "Игрок";
  if (raw.length > 0 && raw.toLowerCase() !== "бот") return raw;
  return stableBotDisplayName(`${r.room_id}:${r.player_id}`);
}

/** Совпадает ли сохранённая партия с текущим составом мест (иначе нельзя доверять JSON в `room_state`). */
export function roomStateMatchesRoomPlayers(
  rows: RoomPlayerRow[],
  game: GameTable
): boolean {
  if (rows.length !== game.players.length) return false;
  const fromRoom = new Set(rows.map((r) => r.player_id));
  if (fromRoom.size !== game.players.length) return false;
  for (const p of game.players) {
    if (!fromRoom.has(p.id)) return false;
  }
  return true;
}

/** Собрать стол из строк `room_players` (порядок по seat_index). */
export function buildGameFromRoomPlayers(
  rows: RoomPlayerRow[],
  localPlayerId: string
): GameTable {
  const sorted = [...rows].sort((a, b) => a.seat_index - b.seat_index);
  const slots = sorted.map((r) => {
    let type: PlayerType;
    if (r.is_bot) type = "bot";
    else if (r.player_id === localPlayerId) type = "human";
    else type = "remote";
    return {
      id: r.player_id,
      name: displayNameForRoomPlayer(r),
      type,
    };
  });
  return newGameForPlayers(slots);
}
