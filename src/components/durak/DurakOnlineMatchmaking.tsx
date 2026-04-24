"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import { abandonDurakStoredRoom } from "@/lib/durak/activeRoomStorage";
import {
  durakCloseInactiveFriendRooms,
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
 *
 * Переход в игру (вызывается `onRoomPlaying`): как минимум **два человека** в `room_players`
 * (не боты), или если сервер уже выставил у комнаты `status === 'playing'`.
 *
 * Отладка в консоли: localStorage.setItem('durak_matchmaking_debug','1'); location.reload()
 */
function mmDebug(...args: unknown[]) {
  if (typeof window === "undefined") return;
  const on =
    process.env.NODE_ENV === "development" ||
    window.localStorage?.getItem("durak_matchmaking_debug") === "1";
  if (!on) return;
  console.log("[durak-mm]", ...args);
}

function isPlayingStatus(r: RoomRow | null | undefined): boolean {
  return String(r?.status ?? "").toLowerCase() === "playing";
}

/** `playerCount` в UI = число людей (не ботов); переход также если комната уже `playing`. */
function shouldTransitionToGame(
  room: RoomRow | null | undefined,
  humansCount: number,
): boolean {
  return humansCount >= 2 || isPlayingStatus(room);
}

/** Явные логи для «висим на Ищем пару…» — смотри [durak-mm-ui] в консоли. */
function logMmUi(payload: Record<string, unknown>) {
  console.log("[durak-mm-ui]", payload);
}

function isProxyRateLimitError(message: string): boolean {
  return /429|PROXY_RATE_LIMIT|Too Many Requests/i.test(message);
}

/** Не чаще: иначе упираемся в rate limit прокси/PostgREST на одного клиента. */
const MATCHMAKING_RPC_MIN_INTERVAL_MS = 2200;
/** После server search_deadline чаще дергаем finalize — партия с ботом должна стартовать сразу. */
const MATCHMAKING_RPC_AFTER_DEADLINE_MS = 700;
/** Два живых за столом — чаще finalize/force, чтобы сразу уйти в playing. */
const MATCHMAKING_RPC_TWO_HUMANS_MS = 450;

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
  const lastMatchmakingRpcAtRef = useRef(0);
  /** Клиентский ориентир (~10 с окна + запас), если search_deadline с API не парсится или зона времени багает. */
  const matchmakingSinceRef = useRef<number | null>(null);

  const screenState = useMemo<"connecting" | "error" | "searching">(() => {
    if (!supabase) return "connecting";
    if (error) return "error";
    return "searching";
  }, [supabase, error]);

  useEffect(() => {
    logMmUi({
      where: "state/render snapshot",
      currentRoomId: roomId,
      roomStatusFromState: room?.status ?? null,
      playersCount: playerCount,
      humansCount: playerCount,
      botsCountNote:
        "в state только число людей; bots = room_players − humans см. tick where=tick end",
      screenState,
      transitionSearchingToGameRule:
        "onRoomPlaying(roomId): humans >= 2 или isPlayingStatus(room) — см. shouldTransitionToGame",
      wouldFireTransitionEffect: Boolean(
        roomId && shouldTransitionToGame(room, playerCount),
      ),
      rawStatusInState: room?.status,
    });
  }, [roomId, room, playerCount, screenState]);

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
    } else {
      void durakCloseInactiveFriendRooms(c);
    }
  }, []);

  const tick = useCallback(async () => {
    if (!supabase || !roomId) return;
    try {
      const rFirst = await fetchRoom(supabase, roomId);
      setRoom(rFirst);
      mmDebug("tick fetchRoom#1", {
        roomId,
        rawStatus: rFirst?.status,
        row: rFirst ? "ok" : "null",
        search_deadline: rFirst?.search_deadline,
      });

      const players = await fetchRoomPlayers(supabase, roomId);
      const humans = players.filter((p) => !p.is_bot).length;
      setPlayerCount(humans);
      mmDebug("tick room_players", {
        roomId,
        humans,
        rows: players.length,
        playerIds: players.map((p) => p.player_id),
      });

      if (shouldTransitionToGame(rFirst, humans)) {
        logMmUi({
          where: "tick: после 1-го fetchRoom + room_players — готово к столу, onRoomPlaying",
          currentRoomId: roomId,
          roomStatus: rFirst?.status,
          roomRowWasNull: rFirst == null,
          humansCount: humans,
          screenState,
          conditionMet: "shouldTransitionToGame(rFirst, humans): humans>=2 || playing",
        });
        mmDebug("→ game ready (после первого опроса)", { roomId, humans, status: rFirst?.status });
        onRoomPlayingRef.current(roomId);
        return;
      }

      let deadlineMs = NaN;
      const rawDl = rFirst?.search_deadline;
      if (rawDl != null) deadlineMs = Date.parse(String(rawDl));
      const since = matchmakingSinceRef.current;
      const clientAssumeDeadlinePassed =
        since != null && Date.now() - since > 12_500;
      const pastSearchDeadline =
        (Number.isFinite(deadlineMs) && Date.now() > deadlineMs + 750) ||
        clientAssumeDeadlinePassed;

      const rpcMinMs =
        humans >= 2
          ? MATCHMAKING_RPC_TWO_HUMANS_MS
          : pastSearchDeadline
            ? MATCHMAKING_RPC_AFTER_DEADLINE_MS
            : MATCHMAKING_RPC_MIN_INTERVAL_MS;

      const now = Date.now();
      if (humans >= 2) {
        mmDebug("RPC finalize + force_start_if_two_humans (humans>=2, каждый тик)", { roomId, humans });
        await durakFinalizeRoomIfReady(supabase, roomId);
        await durakForceStartIfTwoHumans(supabase, roomId);
        lastMatchmakingRpcAtRef.current = Date.now();
      } else if (now - lastMatchmakingRpcAtRef.current >= rpcMinMs) {
        mmDebug("RPC durak_finalize_room_if_ready", {
          roomId,
          humans,
          pastSearchDeadline,
          rpcMinMs,
          msSinceJoin: since != null ? Date.now() - since : null,
        });
        await durakFinalizeRoomIfReady(supabase, roomId);
        lastMatchmakingRpcAtRef.current = Date.now();
      } else {
        mmDebug("skip finalize (throttle)", { roomId, humans, rpcMinMs, waitMs: rpcMinMs - (now - lastMatchmakingRpcAtRef.current) });
      }

      const r = await fetchRoom(supabase, roomId);
      setRoom(r);
      mmDebug("tick fetchRoom#2", { roomId, rawStatus: r?.status });
      const botsCount = players.length - humans;
      const playingAfterSecond = isPlayingStatus(r);
      const transitionAfterSecond = shouldTransitionToGame(r, humans);
      logMmUi({
        where: "tick end (интервал ~1с): что видит клиент для перехода в игру",
        currentRoomId: roomId,
        roomStatusAfterFirstFetch: rFirst?.status ?? null,
        roomStatusAfterSecondFetch: r?.status ?? null,
        roomRowMissingFirst: rFirst == null,
        roomRowMissingSecond: r == null,
        /** В UI «Уже за столом» — только люди (не боты). */
        playersCountHumans: humans,
        humansCount: humans,
        botsCount,
        rowsInRoomPlayers: players.length,
        screenState,
        transitionSearchingToGame:
          "onRoomPlaying если shouldTransitionToGame(roomRow, humans): humans>=2 || status===playing",
        conditionMetThisTick: transitionAfterSecond
          ? "ДА — вызываем onRoomPlaying ниже"
          : "НЕТ — ждём второго человека или playing",
        isPlayingAfterFirstPoll: isPlayingStatus(rFirst),
        isPlayingAfterSecondPoll: playingAfterSecond,
        wouldTransitionAfterFirst: shouldTransitionToGame(rFirst, humans),
        wouldTransitionAfterSecond: transitionAfterSecond,
      });
      if (transitionAfterSecond) {
        logMmUi({
          where: "tick: после 2-го fetchRoom + RPC — готово к столу, onRoomPlaying",
          currentRoomId: roomId,
          roomStatus: r?.status,
          humansCount: humans,
          screenState,
          conditionMet: "shouldTransitionToGame(r, humans)",
        });
        mmDebug("→ game ready (после второго опроса / finalize)", {
          roomId,
          humans,
          status: r?.status,
        });
        onRoomPlayingRef.current(roomId);
      }
    } catch (e) {
      const msg = formatPostgrestError(e);
      if (isProxyRateLimitError(msg)) {
        console.warn("[durak] matchmaking: proxy rate limit, retry later");
        return;
      }
      console.error(e);
      setError(msg);
    }
  }, [supabase, roomId, screenState]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        abandonDurakStoredRoom();
        const pid = getOrCreateDurakPlayerId();
        mmDebug("join_queue start", { playerId: pid.slice(0, 12) + "…", playerName });
        const j = await durakJoinQueue(supabase, pid, playerName);
        if (cancelled) return;
        mmDebug("join_queue ok → roomId", j.roomId, "затем finalize (после join всегда)");
        logMmUi({
          where: "join_queue success → setRoomId, дальше finalize / fetchRoom",
          currentRoomId: j.roomId,
          screenState: error ? "error" : "searching",
        });
        setRoomId(j.roomId);
        matchmakingSinceRef.current = Date.now();
        lastMatchmakingRpcAtRef.current = Date.now();
        await durakFinalizeRoomIfReady(supabase, j.roomId);
        mmDebug("finalize после join выполнен");
        let players = await fetchRoomPlayers(supabase, j.roomId);
        let humans = players.filter((p) => !p.is_bot).length;
        mmDebug("после join: room_players", { humans, rows: players.length });
        if (humans >= 2) {
          mmDebug("join path: force_start_if_two_humans");
          await durakForceStartIfTwoHumans(supabase, j.roomId);
        }
        const r = await fetchRoom(supabase, j.roomId);
        if (cancelled) return;
        setRoom(r);
        mmDebug("после join fetchRoom", { status: r?.status });
        players = await fetchRoomPlayers(supabase, j.roomId);
        humans = players.filter((p) => !p.is_bot).length;
        setPlayerCount(humans);
        logMmUi({
          where: "после join fetchRoom + room_players",
          currentRoomId: j.roomId,
          roomStatus: r?.status ?? null,
          roomRowMissing: r == null,
          playersCountHumans: humans,
          humansCount: humans,
          botsCount: players.length - humans,
          rowsInRoomPlayers: players.length,
          screenState: "searching",
          wouldTransition: shouldTransitionToGame(r, humans),
          transitionRule: "humans >= 2 || isPlayingStatus(r)",
        });
        if (shouldTransitionToGame(r, humans)) {
          mmDebug("→ game ready (сразу после join)", j.roomId, { humans, status: r?.status });
          onRoomPlayingRef.current(j.roomId);
          return;
        }
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
    }, 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [supabase, roomId, tick]);

  useEffect(() => {
    if (roomId && shouldTransitionToGame(room, playerCount)) {
      logMmUi({
        where: "useEffect [room,roomId,playerCount]: готово к столу → onRoomPlaying",
        currentRoomId: roomId,
        roomStatus: room?.status,
        playersCountHumans: playerCount,
        humansCount: playerCount,
        screenState,
        conditionMet: "shouldTransitionToGame(room, playerCount)",
      });
      mmDebug("→ game ready (effect по state)", {
        roomId,
        status: room?.status,
        humans: playerCount,
      });
      onRoomPlayingRef.current(roomId);
    }
  }, [room, roomId, playerCount, screenState]);

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
        <p className="text-lg font-medium text-white/95">Ищем пару…</p>
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
