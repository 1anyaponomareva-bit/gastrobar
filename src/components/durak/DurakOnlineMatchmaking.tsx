"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import {
  durakFinalizeRoomIfReady,
  durakJoinQueue,
  fetchRoom,
  fetchRoomPlayers,
  formatPostgrestError,
} from "@/lib/durak/online/matchmaking";
import type { RoomRow } from "@/lib/durak/online/types";
import { HEADER_OFFSET_TOP } from "./durakLayoutConstants";

type Props = {
  playerName: string;
  onRoomPlaying: (roomId: string) => void;
  onCancel: () => void;
};

/** Статусы без секунд — таймер на сервере у всех разный, цифры только путают. */
const WAITING_STATUS_LINES: { text: string; emoji: string }[] = [
  { text: "Подбираем пару за столом…", emoji: "🎴" },
  { text: "Ищем достойного соперника…", emoji: "✨" },
  { text: "Связываем столы, почти готово…", emoji: "🔗" },
  { text: "Собираем компанию за сукном…", emoji: "🃏" },
  { text: "Подключаем к столу следующего игрока…", emoji: "🪑" },
];

const WAITING_HINTS: string[] = [
  "Можешь пока выпить что-нибудь бархатное ☕",
  "Можешь пока расслабиться и просто подождать 🌿",
  "Можешь пока сделать заказ с меню — мы подождём 😉",
  "Можешь пока выбрать десерт — игра не убежит 🍰",
  "Можешь пока открыть барную карту — время есть 🍸",
  "Можешь пока потянуться — карты ещё тасуются 🤙",
];

/**
 * Онлайн-очередь: поиск комнаты + realtime.
 * Matchmaking: этот компонент + `durakJoinQueue` / `durakFinalizeRoomIfReady`.
 */
export function DurakOnlineMatchmaking({ playerName, onRoomPlaying, onCancel }: Props) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % WAITING_STATUS_LINES.length);
    }, 4200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setHintIdx((i) => (i + 1) % WAITING_HINTS.length);
    }, 5300);
    return () => window.clearInterval(t);
  }, []);

  const tick = useCallback(async () => {
    if (!supabase || !roomId) return;
    try {
      await durakFinalizeRoomIfReady(supabase, roomId);
      const r = await fetchRoom(supabase, roomId);
      setRoom(r);
      if (r?.status === "playing") {
        onRoomPlaying(roomId);
        return;
      }
      const players = await fetchRoomPlayers(supabase, roomId);
      setPlayerCount(players.filter((p) => !p.is_bot).length);
    } catch (e) {
      console.error(e);
      setError(formatPostgrestError(e));
    }
  }, [supabase, roomId, onRoomPlaying]);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    setSupabase(client);
    if (!client) {
      setError(
        "Нет Supabase: задайте NEXT_PUBLIC_SUPABASE_URL и ключ (NEXT_PUBLIC_SUPABASE_ANON_KEY или NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
      );
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const pid = getOrCreateDurakPlayerId();
        const j = await durakJoinQueue(supabase, pid, playerName);
        if (cancelled) return;
        setRoomId(j.roomId);
        await durakFinalizeRoomIfReady(supabase, j.roomId);
        const r = await fetchRoom(supabase, j.roomId);
        if (cancelled) return;
        setRoom(r);
        if (r?.status === "playing") {
          onRoomPlaying(j.roomId);
          return;
        }
        const players = await fetchRoomPlayers(supabase, j.roomId);
        setPlayerCount(players.filter((p) => !p.is_bot).length);
      } catch (e) {
        if (!cancelled) setError(formatPostgrestError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, playerName, onRoomPlaying]);

  useEffect(() => {
    if (!supabase || !roomId) return;
    /* Без Realtime/WebSocket: в части браузеров wss даёт TypeError: Load failed. */
    const interval = window.setInterval(() => {
      void tick();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [supabase, roomId, tick]);

  useEffect(() => {
    if (room?.status === "playing" && roomId) {
      onRoomPlaying(roomId);
    }
  }, [room?.status, roomId, onRoomPlaying]);

  const line = WAITING_STATUS_LINES[statusIdx]!;
  const hint = WAITING_HINTS[hintIdx]!;

  if (error) {
    return (
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-sm text-amber-200/90">{error}</p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/25 px-5 py-2.5 text-sm text-white/90 hover:bg-white/10"
          >
            Назад
          </button>
        </div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
      >
        <div className="flex flex-1 items-center justify-center py-20 text-sm text-white/50">
          Подключение…
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100 ${HEADER_OFFSET_TOP}`}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
        <p className="text-lg font-medium text-white/95">Онлайн-стол</p>
        <div className="rounded-2xl border border-amber-400/35 bg-amber-950/40 px-6 py-8 sm:px-10">
          <p className="text-4xl leading-none" aria-hidden>
            {line.emoji}
          </p>
          <p className="mt-4 text-base font-medium leading-snug text-amber-50 sm:text-lg">{line.text}</p>
          <p className="mt-5 max-w-[22rem] text-sm leading-relaxed text-amber-100/75">{hint}</p>
        </div>
        <p className="max-w-[20rem] text-sm text-white/55">
          Игроков в комнате: <span className="text-white/90">{playerCount}</span> (макс. 3). Трое — старт сразу;
          иначе подберём пару или соперника за столом.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm text-white/75 hover:bg-white/10"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
