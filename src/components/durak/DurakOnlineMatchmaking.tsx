"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import {
  durakFinalizeRoomIfReady,
  durakForceStartIfTwoHumans,
  durakJoinQueue,
  fetchRoom,
  fetchRoomPlayers,
  formatPostgrestError,
} from "@/lib/durak/online/matchmaking";
import type { RoomRow } from "@/lib/durak/online/types";

type Props = {
  playerName: string;
  onRoomPlaying: (roomId: string) => void;
  onCancel: () => void;
};

/** Статусы без секунд — таймер на сервере у всех разный, цифры только путают. */
const WAITING_STATUS_LINES: { text: string; emoji: string }[] = [
  { text: "Подбираем партию у бара…", emoji: "🎴" },
  { text: "Ищем соперника за стойкой…", emoji: "🥃" },
  { text: "Стол почти свободен…", emoji: "✨" },
  { text: "Собираем компанию у сукна…", emoji: "🃏" },
  { text: "Скоро усадим за игру…", emoji: "🪑" },
];

const WAITING_HINTS: string[] = [
  "Можешь пока выпить что-нибудь бархатное 🍺",
  "Закажи джерки к напитку — хватит до первого хода 🥩",
  "Глянь меню бара у бармена — мы пока мешаем колоду 😉",
  "Открой барную карту: найди свой вечерний дринк 🍸",
  "Пока ждём — настройся на музыку и свет зала 🔊",
  "Колода тасуется, стаканы звенят — остынь и расслабься ✨",
];

/**
 * Онлайн-очередь: поиск комнаты + realtime.
 * Matchmaking: этот компонент + `durakJoinQueue` / `durakFinalizeRoomIfReady`.
 */
function isPlayingStatus(r: RoomRow | null | undefined): boolean {
  return String(r?.status ?? "").toLowerCase() === "playing";
}

export function DurakOnlineMatchmaking({ playerName, onRoomPlaying, onCancel }: Props) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  const onRoomPlayingRef = useRef(onRoomPlaying);
  onRoomPlayingRef.current = onRoomPlaying;

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

  useEffect(() => {
    const c = createSupabaseBrowserClient();
    setSupabase(c);
    if (!c) {
      setError(
        "Нет Supabase: задайте NEXT_PUBLIC_SUPABASE_URL и ключ (NEXT_PUBLIC_SUPABASE_ANON_KEY или NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
      );
    }
  }, []);

  const tick = useCallback(async () => {
    if (!supabase || !roomId) return;
    try {
      const players = await fetchRoomPlayers(supabase, roomId);
      const humans = players.filter((p) => !p.is_bot).length;
      setPlayerCount(humans);

      await durakFinalizeRoomIfReady(supabase, roomId);
      if (humans >= 2) {
        await durakForceStartIfTwoHumans(supabase, roomId);
      }

      const r = await fetchRoom(supabase, roomId);
      setRoom(r);
      if (isPlayingStatus(r)) {
        onRoomPlayingRef.current(roomId);
        return;
      }
    } catch (e) {
      console.error(e);
      setError(formatPostgrestError(e));
    }
  }, [supabase, roomId]);

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
        let players = await fetchRoomPlayers(supabase, j.roomId);
        let humans = players.filter((p) => !p.is_bot).length;
        if (humans >= 2) {
          await durakForceStartIfTwoHumans(supabase, j.roomId);
        }
        const r = await fetchRoom(supabase, j.roomId);
        if (cancelled) return;
        setRoom(r);
        if (isPlayingStatus(r)) {
          onRoomPlayingRef.current(j.roomId);
          return;
        }
        players = await fetchRoomPlayers(supabase, j.roomId);
        humans = players.filter((p) => !p.is_bot).length;
        setPlayerCount(humans);
      } catch (e) {
        if (!cancelled) setError(formatPostgrestError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, playerName]);

  useEffect(() => {
    if (!supabase || !roomId) return;
    /* В фоновой вкладке таймеры троттлятся — при возврате сразу дергаем сервер. */
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    /* Без Realtime/WebSocket: в части браузеров wss даёт TypeError: Load failed. */
    const interval = window.setInterval(() => {
      void tick();
    }, 700);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [supabase, roomId, tick]);

  useEffect(() => {
    if (isPlayingStatus(room) && roomId) {
      onRoomPlayingRef.current(roomId);
    }
  }, [room, roomId]);

  const line = WAITING_STATUS_LINES[statusIdx]!;
  const hint = WAITING_HINTS[hintIdx]!;

  if (error) {
    return (
      <div
        className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100"
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
        className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100"
      >
        <div className="flex flex-1 items-center justify-center py-20 text-sm text-white/50">
          Подключение…
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-12 text-center">
        <p className="text-lg font-medium text-white/95">Ищем пару за столом в баре…</p>
        <div className="rounded-2xl border border-amber-400/35 bg-amber-950/40 px-6 py-8 sm:px-10">
          <p className="text-4xl leading-none" aria-hidden>
            {line.emoji}
          </p>
          <p className="mt-4 text-base font-medium leading-snug text-amber-50 sm:text-lg">{line.text}</p>
          <p className="mt-5 max-w-[22rem] text-sm leading-relaxed text-amber-100/75">{hint}</p>
        </div>
        <p className="max-w-[20rem] text-sm text-white/55">
          Уже за столом: <span className="text-white/90">{playerCount}</span>. Подключим к сопернику или начнём партию,
          как только будет готово.
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
