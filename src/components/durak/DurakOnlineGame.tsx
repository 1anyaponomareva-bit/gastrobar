"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { GameTable } from "@/games/durak/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import {
  buildGameFromRoomPlayers,
  roomStateMatchesRoomPlayers,
} from "@/lib/durak/online/buildRoomGame";
import { fetchRoomPlayers } from "@/lib/durak/online/matchmaking";
import type { RoomStatePayload } from "@/lib/durak/online/types";
import type { DurakGameEmbeddedProps } from "./DurakGame";

type Props = {
  roomId: string;
  playerName: string;
  onLeave: () => void;
  /** Рендер стола без циклического import — иначе dynamic chunk и «TypeError: Load failed» на проде/Safari. */
  renderGame: (embedded: DurakGameEmbeddedProps) => ReactNode;
};

/** Сравнение стола без `message` — чтобы «только очистка сообщения» не затирала чужой отбой из realtime. */
function durakGameMaterialSignature(gt: GameTable): string {
  const { message: _m, ...rest } = gt;
  return JSON.stringify(rest);
}

/**
 * Онлайн-партия: `room_state` в Supabase, realtime, сидирование стола лидером.
 * Старт игры: после `rooms.status === 'playing'` + запись в `room_state`.
 * Добавление бота: RPC `durak_finalize_room_if_ready` (см. SQL) при 1 игроке после дедлайна.
 *
 * Синхронизация ходов: upsert в `room_state` + опрос по HTTP (без Supabase Realtime/WebSocket:
 * в Safari / встроенных браузерах и при блокировке wss часто «TypeError: Load failed»).
 * Persist не должен захватывать `game` в замыкание debounce — иначе поздний upsert затирает отбой соперника.
 * Сброс только `message` в DurakGame не должен подставлять целиком устаревший `embedded.game` — иначе пропадает отбой соперника.
 */
export function DurakOnlineGame({ roomId, playerName, onLeave, renderGame }: Props) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const playerId = useMemo(() => getOrCreateDurakPlayerId(), []);

  useEffect(() => {
    const c = createSupabaseBrowserClient();
    setSupabase(c);
    if (!c) setError("Нет настроек Supabase");
  }, []);
  const [game, setGame] = useState<GameTable | null>(null);
  /** После первого не-null стола — реже опрашивать БД (не привязывать интервал к каждому ходу). */
  const [tableHydrated, setTableHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Актуальный стол (в т.ч. после realtime); persist читает отсюда, иначе debounce затирает чужой ход старым замыканием. */
  const gameRef = useRef<GameTable | null>(null);
  /** Время последнего применённого с сервера `room_state.updated_at` (чтобы не откатывать ход по опросу). */
  const lastAppliedServerTsRef = useRef(0);

  useEffect(() => {
    gameRef.current = game;
    if (game !== null) setTableHydrated(true);
  }, [game]);

  useEffect(() => {
    setTableHydrated(false);
    lastAppliedServerTsRef.current = 0;
    gameRef.current = null;
    setGame(null);
  }, [roomId]);

  /**
   * @param mode
   *   poll — только ts > lastRef (старый JSON при том же updated_at).
   *   realtime — если ts < lastRef, но JSON стола уже другой (подкинул соперник), всё равно применяем:
   *   иначе при рассинхроне часов/своем persist lastRef может быть «новее» строки в БД от партнёра.
   */
  const applyRemoteRow = useCallback(
    (
      row: { state?: RoomStatePayload; updated_at?: string } | null,
      mode: "realtime" | "poll" = "realtime"
    ) => {
      const g = row?.state?.game;
      const raw = row?.updated_at;
      if (!g || !raw) return;
      const ts = Date.parse(raw);
      if (Number.isNaN(ts)) return;
      const last = lastAppliedServerTsRef.current;
      if (mode === "poll") {
        if (ts <= last) return;
      } else {
        const cur = gameRef.current;
        if (ts < last && cur) {
          const sameSnapshot =
            durakGameMaterialSignature(g) === durakGameMaterialSignature(cur);
          if (sameSnapshot) return;
        }
      }
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      lastAppliedServerTsRef.current = Math.max(last, ts);
      gameRef.current = g;
      setGame(g);
    },
    []
  );

  const persistGame = useCallback(() => {
    if (!supabase) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void (async () => {
        let g = gameRef.current;
        if (!g) return;
        const { data: row, error: selErr } = await supabase
          .from("room_state")
          .select("state, updated_at")
          .eq("room_id", roomId)
          .maybeSingle();
        if (selErr) {
          console.warn("[durak] room_state pre-upsert select:", selErr.message);
        }
        g = gameRef.current;
        if (!g) return;
        const sGame = row?.state?.game as GameTable | undefined;
        const raw = row?.updated_at;
        const tsS = raw != null ? Date.parse(String(raw)) : NaN;
        const last = lastAppliedServerTsRef.current;
        const sigG = durakGameMaterialSignature(g);
        const sigS = sGame != null ? durakGameMaterialSignature(sGame) : "";
        /* Только tsS > last: нельзя сравнивать «число отбоев» при смене фазы (напр. «Бито» чистит стол —
           у g 0 пар, у sGame ещё полный стол — ложно принимали бы сервер и откатывали ход). */
        if (
          sGame &&
          !Number.isNaN(tsS) &&
          sigS !== sigG &&
          tsS > last
        ) {
          applyRemoteRow(
            { state: row?.state as RoomStatePayload, updated_at: raw },
            "realtime"
          );
          return;
        }
        g = gameRef.current;
        if (!g) return;
        const { data: upData, error: upErr } = await supabase
          .from("room_state")
          .upsert(
            {
              room_id: roomId,
              state: { game: g } satisfies RoomStatePayload,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "room_id" }
          )
          .select("updated_at")
          .single();
        if (upErr) {
          console.warn("[durak] room_state upsert:", upErr.message);
          return;
        }
        const upRaw = upData?.updated_at;
        if (upRaw) {
          const ts = Date.parse(String(upRaw));
          if (!Number.isNaN(ts)) {
            lastAppliedServerTsRef.current = Math.max(
              lastAppliedServerTsRef.current,
              ts
            );
          }
        }
      })();
    }, 80);
  }, [supabase, roomId, applyRemoteRow]);

  const onRemoteGameChange = useCallback(
    (update: SetStateAction<GameTable>) => {
      setGame((current) => {
        if (!current) {
          return typeof update === "function" ? null : update;
        }
        const next =
          typeof update === "function"
            ? (update as (g: GameTable) => GameTable)(current)
            : update;
        const material =
          durakGameMaterialSignature(current) !== durakGameMaterialSignature(next);
        if (material) {
          gameRef.current = next;
          persistGame();
          return next;
        }
        return { ...current, message: next.message };
      });
    },
    [persistGame]
  );

  useEffect(() => {
    if (!supabase) {
      setError("Нет настроек Supabase");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const rows = await fetchRoomPlayers(supabase, roomId);
        if (cancelled) return;

        const { data: stateRow } = await supabase
          .from("room_state")
          .select("state, updated_at")
          .eq("room_id", roomId)
          .maybeSingle();

        const existing = stateRow?.state as RoomStatePayload | undefined;
        const existingGame = existing?.game;
        const existingMatches =
          existingGame != null && roomStateMatchesRoomPlayers(rows, existingGame);

        if (existingMatches && stateRow?.updated_at && existing) {
          applyRemoteRow({
            state: existing,
            updated_at: stateRow.updated_at,
          });
          return;
        }
        if (existingMatches && existingGame) {
          setGame(existingGame);
          lastAppliedServerTsRef.current = 0;
          return;
        }

        const sorted = [...rows].sort((a, b) => a.seat_index - b.seat_index);
        const leaderId = sorted.find((r) => !r.is_bot)?.player_id ?? sorted[0]?.player_id;
        const initial = buildGameFromRoomPlayers(rows, playerId);

        if (leaderId === playerId) {
          const { data: upData, error: upErr } = await supabase
            .from("room_state")
            .upsert(
              {
                room_id: roomId,
                state: { game: initial },
                updated_at: new Date().toISOString(),
              },
              { onConflict: "room_id" }
            )
            .select("updated_at")
            .single();
          if (upErr && !String(upErr.message).includes("duplicate")) {
            console.warn(upErr);
          }
          const raw = upData?.updated_at;
          if (raw) {
            const ts = Date.parse(String(raw));
            if (!Number.isNaN(ts)) lastAppliedServerTsRef.current = ts;
          }
        }

        const { data: after } = await supabase
          .from("room_state")
          .select("state, updated_at")
          .eq("room_id", roomId)
          .maybeSingle();
        const g = (after?.state as RoomStatePayload | undefined)?.game;
        const gOk = g != null && roomStateMatchesRoomPlayers(rows, g);
        let next: GameTable | null;
        if (gOk) {
          next = g;
        } else if (leaderId === playerId) {
          next = initial;
        } else {
          next = null;
        }
        if (next) {
          setGame(next);
          const raw = after?.updated_at;
          if (raw) {
            const ts = Date.parse(String(raw));
            if (!Number.isNaN(ts)) lastAppliedServerTsRef.current = ts;
          } else {
            lastAppliedServerTsRef.current = 0;
          }
        } else if (!cancelled && !gameRef.current) {
          /* Не затирать стол, если poll/realtime уже применили room_state, а init завершился позже (медленный fetch). */
          setGame(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, roomId, playerId, applyRemoteRow]);

  /** Опрос `room_state` по HTTP (без Realtime — см. комментарий к модулю). До первой загрузки стола — чаще. */
  useEffect(() => {
    if (!supabase) return;
    const tickMs = tableHydrated ? 1500 : 450;
    const id = window.setInterval(() => {
      void (async () => {
        const { data, error } = await supabase
          .from("room_state")
          .select("state, updated_at")
          .eq("room_id", roomId)
          .maybeSingle();
        if (error) return;
        applyRemoteRow(data, "poll");
      })();
    }, tickMs);
    return () => window.clearInterval(id);
  }, [supabase, roomId, applyRemoteRow, tableHydrated]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center text-amber-200">
        <p className="text-sm">{error}</p>
        <button type="button" onClick={onLeave} className="rounded-full border border-white/25 px-4 py-2 text-sm text-white/90">
          Назад
        </button>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-sm text-white/50">
        Подключение…
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-sm text-white/50">
        Загрузка стола…
      </div>
    );
  }

  return renderGame({
    roomId,
    localPlayerId: playerId,
    playerName,
    game,
    onGameChange: onRemoteGameChange,
    onLeave,
  });
}
