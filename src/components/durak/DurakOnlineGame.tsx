"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type SetStateAction,
} from "react";
import type { Card, GamePhase, GameTable, GameTableState, Player, PlayerType, TablePair } from "@/games/durak/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import {
  buildGameFromRoomPlayers,
  roomStateMatchesRoomPlayers,
} from "@/lib/durak/online/buildRoomGame";
import {
  fetchRoomPlayers,
  formatPostgrestError,
} from "@/lib/durak/online/matchmaking";
import type { RoomStatePayload } from "@/lib/durak/online/types";
import type { DurakGameEmbeddedProps } from "./DurakGame";

type Props = {
  roomId: string;
  playerName: string;
  onLeave: () => void;
  /** Рендер стола без циклического import — иначе dynamic chunk и «TypeError: Load failed» на проде/Safari. */
  renderGame: (embedded: DurakGameEmbeddedProps) => ReactElement;
};

/**
 * Каноническая сериализация: в Postgres `jsonb` переупорядочивает ключи — иначе один и тот же стол
 * даёт разные строки у клиента и после `select`, ложный рассинхрон и откат хода по poll.
 */
function stableJsonForSignature(x: unknown): string {
  if (x === null || typeof x !== "object") {
    return JSON.stringify(x);
  }
  if (Array.isArray(x)) {
    return `[${x.map(stableJsonForSignature).join(",")}]`;
  }
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJsonForSignature(o[k])}`)
    .join(",")}}`;
}

/** Сравнение стола без `message` — чтобы «только очистка сообщения» не затирала чужой отбой из realtime. */
function durakGameMaterialSignature(gt: GameTable): string {
  const { message: _m, ...rest } = gt;
  return stableJsonForSignature(rest);
}

/** Пары на столе и число отбитых — чтобы не тянуть устаревший poll без отбоя, пока локально уже отбились. */
function durakRoundTableProgress(gt: GameTable): readonly [number, number] {
  const pairs = gt.tablePairs.length;
  const defenses = gt.tablePairs.filter((p) => p.defense !== null).length;
  return [pairs, defenses];
}

function localRoundAheadOfRemote(loc: GameTable, rem: GameTable): boolean {
  const a = durakRoundTableProgress(loc);
  const b = durakRoundTableProgress(rem);
  return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
}

/** Карты на столе (атака+отбой) — доп. check, если кортеж пар совпал, а подпись всё же разошлась. */
function tableCardsOnBoard(gt: GameTable): number {
  return gt.tablePairs.reduce((n, p) => n + 1 + (p.defense ? 1 : 0), 0);
}

function localTableAheadOfRemotePoll(loc: GameTable, rem: GameTable): boolean {
  return localRoundAheadOfRemote(loc, rem) || tableCardsOnBoard(loc) > tableCardsOnBoard(rem);
}

/**
 * lastApplied должен строго расти после каждого нашего upsert / принятого с сервера снимка.
 * Иначе при неменяющемся `updated_at` (нет триггера в БД / тот же ms) poll с прежним ts затирает отбой 2-го игрока.
 */
function advanceLastAppliedRef(ref: { current: number }, serverTsMs: number): void {
  if (Number.isNaN(serverTsMs)) return;
  const p = ref.current;
  ref.current = serverTsMs > p ? serverTsMs : p + 1;
}

const VALID_PHASE: ReadonlySet<string> = new Set<GamePhase>([
  "attack_initial",
  "defend",
  "attack_toss",
  "player_can_throw_more",
  "drawing",
  "game_over",
]);

function isCard(x: unknown): x is Card {
  if (x == null || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.suit === "string" &&
    typeof c.rank === "string" &&
    c.id.length > 0
  );
}

function normalizeDeck(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCard);
}

function normalizeTablePairs(raw: unknown): TablePair[] {
  if (!Array.isArray(raw)) return [];
  const out: TablePair[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (!isCard(p.attack)) continue;
    const d = p.defense;
    const defense = d == null ? null : isCard(d) ? d : null;
    out.push({ attack: p.attack, defense });
  }
  return out;
}

function normalizePlayerType(x: unknown): PlayerType {
  if (x === "human" || x === "bot" || x === "remote") return x;
  return "remote";
}

function normalizeState(raw: unknown): GameTableState {
  if (raw === "waiting" || raw === "playing" || raw === "finished") return raw;
  if (typeof raw === "string") {
    const s = raw.toLowerCase();
    if (s === "waiting" || s === "playing" || s === "finished") return s;
  }
  return "playing";
}

function normalizePhase(raw: unknown): GamePhase {
  if (typeof raw === "string" && VALID_PHASE.has(raw)) return raw as GamePhase;
  return "attack_initial";
}

function normalizePlayers(raw: unknown): Player[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out: Player[] = [];
  let i = 0;
  for (const item of raw) {
    if (item == null || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string" || !p.id) return null;
    const hand = Array.isArray(p.hand) ? p.hand.filter(isCard) : [];
    const seatIndex = typeof p.seatIndex === "number" && p.seatIndex >= 0 ? p.seatIndex : i;
    out.push({
      id: p.id,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Игрок",
      type: normalizePlayerType(p.type),
      hand,
      seatIndex,
    });
    i += 1;
  }
  return out;
}

function tableIdFallback(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `durak-${Date.now()}`;
}

/** Из jsonb с сервера: неполные / устаревшие поля после миграций не должны блокировать стол. */
function coerceRemoteGame(raw: unknown): GameTable | null {
  if (raw == null || typeof raw !== "object") return null;
  const g = raw as Partial<GameTable>;
  const players = normalizePlayers(g.players);
  if (!players) return null;
  const n = players.length;
  let attackerIndex =
    typeof g.attackerIndex === "number" && g.attackerIndex >= 0 && g.attackerIndex < n
      ? g.attackerIndex
      : 0;
  let defenderIndex =
    typeof g.defenderIndex === "number" && g.defenderIndex >= 0 && g.defenderIndex < n
      ? g.defenderIndex
      : (attackerIndex + 1) % n;
  if (defenderIndex === attackerIndex) defenderIndex = (attackerIndex + 1) % n;
  const deck = normalizeDeck(g.deck);
  const tablePairs = normalizeTablePairs(g.tablePairs);
  const discardPile = normalizeDeck(g.discardPile);
  const trumpCard = g.trumpCard != null && isCard(g.trumpCard) ? g.trumpCard : null;
  const ts = g.trumpSuit;
  const trumpSuit =
    ts === "spades" || ts === "hearts" || ts === "diamonds" || ts === "clubs" ? ts : trumpCard?.suit ?? "spades";
  const id = typeof g.id === "string" && g.id ? g.id : tableIdFallback();
  return {
    id,
    mode: g.mode === "podkidnoy" ? "podkidnoy" : "podkidnoy",
    players,
    deck,
    tablePairs,
    discardPile,
    trumpCard,
    trumpSuit,
    attackerIndex,
    defenderIndex,
    state: normalizeState(g.state),
    phase: normalizePhase(g.phase),
    winnerId: typeof g.winnerId === "string" ? g.winnerId : null,
    loserId: typeof g.loserId === "string" ? g.loserId : null,
    roundDefenderInitialHand: Number.isFinite(g.roundDefenderInitialHand)
      ? Math.max(0, Number(g.roundDefenderInitialHand))
      : 6,
    message: typeof g.message === "string" ? g.message : null,
  };
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
  const [error, setError] = useState<string | null>(null);
  const playerId = useMemo(() => getOrCreateDurakPlayerId(), []);

  useEffect(() => {
    const c = createSupabaseBrowserClient();
    setSupabase(c);
    if (!c) setError("Нет настроек Supabase");
  }, []);
  const [game, setGame] = useState<GameTable | null>(null);
  /** После первого не-null стола — реже опрашивать БД (не привязывать интервал к каждому ходу). */
  const [tableHydrated, setTableHydrated] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Актуальный стол (в т.ч. после realtime); persist читает отсюда, иначе debounce затирает чужой ход старым замыканием. */
  const gameRef = useRef<GameTable | null>(null);
  /** Время последнего применённого с сервера `room_state.updated_at` (чтобы не откатывать ход по опросу). */
  const lastAppliedServerTsRef = useRef(0);
  /** Локальный ход ещё не записан в БД — не подменять стол устаревшим poll / pre-upsert select с тем же `updated_at`. */
  const pendingRoomSaveRef = useRef(false);
  /** Увеличивается на каждый материальный ход; upsert снимает pending только если совпал с актуальным (параллельные async после debounce). */
  const roomSaveGenRef = useRef(0);

  useEffect(() => {
    gameRef.current = game;
    if (game !== null) setTableHydrated(true);
  }, [game]);

  useEffect(() => {
    setTableHydrated(false);
    lastAppliedServerTsRef.current = 0;
    pendingRoomSaveRef.current = false;
    roomSaveGenRef.current = 0;
    gameRef.current = null;
    setGame(null);
  }, [roomId]);

  /**
   * @param mode
   *   poll — если снимок стола уже совпадает с локальным, пропуск; иначе только «устаревший» ts < last
   *   (равенство ts допускаем при другом JSON — коллизии now() / один ms).
   *   realtime — если ts < lastRef, но JSON стола уже другой (подкинул соперник), всё равно применяем.
   */
  const applyRemoteRow = useCallback(
    (
      row: { state?: RoomStatePayload; updated_at?: string } | null,
      mode: "realtime" | "poll" = "realtime"
    ) => {
      const rawGame = row?.state?.game;
      if (rawGame == null) return;
      const remote = coerceRemoteGame(rawGame);
      if (!remote) return;
      const raw = row?.updated_at;
      let ts = raw != null ? Date.parse(String(raw)) : NaN;
      if (Number.isNaN(ts)) {
        ts = Math.max(lastAppliedServerTsRef.current + 1, Date.now());
      }
      const last = lastAppliedServerTsRef.current;
      const cur = gameRef.current;
      const remoteSig = durakGameMaterialSignature(remote);
      const localSig = cur ? durakGameMaterialSignature(cur) : "";
      if (remoteSig === localSig) return;
      /* poll: не откатывать локальный опережающий ход устаревшим ts с сервера. realtime: отличия уже отсеяны сверху. */
      if (mode === "poll" && ts < last) return;
      /* Ожидаем upsert: пока `updated_at` на сервере не ушёл вперёд от last, poll не должен затирать локальный ход. */
      if (
        mode === "poll" &&
        pendingRoomSaveRef.current &&
        ts <= last &&
        remoteSig !== localSig
      ) {
        return;
      }
      /* Upsert уже прошёл, но пришёл кэш/старый ряд без вашего хода при том же ts — не откатывать стол. */
      if (
        mode === "poll" &&
        cur &&
        ts <= last &&
        remoteSig !== localSig &&
        localTableAheadOfRemotePoll(cur, remote)
      ) {
        return;
      }
      pendingRoomSaveRef.current = false;
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      advanceLastAppliedRef(lastAppliedServerTsRef, ts);
      gameRef.current = remote;
      setGame(remote);
    },
    []
  );

  const persistGame = useCallback(() => {
    if (!supabase) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void (async () => {
        const saveGenAtRun = roomSaveGenRef.current;
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
        /* Только tsS > last: при равенстве строка в БД часто ещё без нашего upsert — откат анимации хода. */
        if (
          sGame &&
          !Number.isNaN(tsS) &&
          sigS !== sigG &&
          tsS > last
        ) {
          applyRemoteRow(
            { state: { game: sGame }, updated_at: raw },
            "realtime"
          );
          return;
        }
        g = gameRef.current;
        if (!g) return;

        const delaysMs = [0, 120, 300, 700];
        let upRaw: string | undefined;
        for (let attempt = 0; attempt < delaysMs.length; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => window.setTimeout(r, delaysMs[attempt]));
            g = gameRef.current;
            if (!g) return;
            if (saveGenAtRun !== roomSaveGenRef.current) return;
          }
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
            .maybeSingle();
          if (!upErr && upData?.updated_at) {
            upRaw = String(upData.updated_at);
            break;
          }
          if (upErr) {
            console.warn("[durak] room_state upsert:", upErr.message, `(attempt ${attempt + 1})`);
          }
        }

        if (!upRaw) {
          console.warn("[durak] room_state upsert: all retries failed; will retry save");
          if (saveGenAtRun === roomSaveGenRef.current) {
            pendingRoomSaveRef.current = true;
            persistTimer.current = setTimeout(() => {
              persistGame();
            }, 1600);
          }
          return;
        }

        if (saveGenAtRun === roomSaveGenRef.current) pendingRoomSaveRef.current = false;
        advanceLastAppliedRef(lastAppliedServerTsRef, Date.parse(upRaw));
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
          roomSaveGenRef.current += 1;
          pendingRoomSaveRef.current = true;
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
    /* Не вызывать setError при !supabase: в том же тике после mount клиент ещё null — гонка с init-effect. */
    if (!supabase) return;
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
        const existingGame = coerceRemoteGame(existing?.game);
        const existingMatches =
          existingGame != null && roomStateMatchesRoomPlayers(rows, existingGame);

        /*
         * Всегда через setGame: раньше вызывали только applyRemoteRow, а он мог
         * выйти без применения (NaN updated_at, совпадение подписей и т.д.) → вечная «Загрузка стола».
         */
        if (existingMatches && existingGame) {
          gameRef.current = existingGame;
          setGame(existingGame);
          if (stateRow?.updated_at) {
            const ts = Date.parse(String(stateRow.updated_at));
            if (!Number.isNaN(ts)) {
              advanceLastAppliedRef(lastAppliedServerTsRef, ts);
            }
          }
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
            advanceLastAppliedRef(lastAppliedServerTsRef, Date.parse(String(raw)));
          }
        }

        const { data: after } = await supabase
          .from("room_state")
          .select("state, updated_at")
          .eq("room_id", roomId)
          .maybeSingle();
        const g = coerceRemoteGame((after?.state as RoomStatePayload | undefined)?.game);
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
            advanceLastAppliedRef(lastAppliedServerTsRef, Date.parse(String(raw)));
          } else {
            lastAppliedServerTsRef.current = 0;
          }
        } else if (!cancelled && !gameRef.current) {
          /* Не затирать стол, если poll/realtime уже применили room_state, а init завершился позже (медленный fetch). */
          setGame(null);
        }
      } catch (e) {
        if (!cancelled) setError(formatPostgrestError(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, roomId, playerId, applyRemoteRow]);

  /** Опрос `room_state` по HTTP (без Realtime — см. комментарий к модулю). До первой загрузки стола — чаще. */
  useEffect(() => {
    if (!supabase) return;
    /* Чаще во время партии — меньше окно, когда успевает прийти устаревший poll без вашего хода. */
    const tickMs = tableHydrated ? (game?.state === "playing" ? 650 : 1500) : 450;
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
  }, [supabase, roomId, applyRemoteRow, tableHydrated, game?.phase, game?.state]);

  const embeddedProps = useMemo((): DurakGameEmbeddedProps | null => {
    if (!game) return null;
    return {
      roomId,
      localPlayerId: playerId,
      playerName,
      game,
      onGameChange: onRemoteGameChange,
      onLeave,
    };
  }, [roomId, playerId, playerName, game, onRemoteGameChange, onLeave]);

  if (error) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center text-amber-200">
        <p className="text-sm">{error}</p>
        <button type="button" onClick={onLeave} className="rounded-full border border-white/25 px-4 py-2 text-sm text-white/90">
          Назад
        </button>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center py-20 text-sm text-white/50">
        Подключение…
      </div>
    );
  }

  if (!game || !embeddedProps) {
    return (
      <div className="flex min-h-[min(50dvh,420px)] min-w-0 w-full flex-1 flex-col items-center justify-center gap-2 px-4 py-20 text-center text-sm text-white/55">
        <span>Загрузка стола…</span>
        <span className="max-w-[20rem] text-xs text-white/35">
          Если экран пустой долго, обновите страницу или проверьте сеть.
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col basis-0">
      {renderGame(embeddedProps)}
    </div>
  );
}
