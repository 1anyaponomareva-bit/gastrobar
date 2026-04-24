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
import { sortHand } from "@/games/durak/engine";
import {
  buildGameFromRoomPlayers,
  roomStateMatchesRoomPlayers,
} from "@/lib/durak/online/buildRoomGame";
import { abandonDurakStoredRoom, markDurakTabOnlineResume } from "@/lib/durak/activeRoomStorage";
import {
  durakForfeitStaleOpponent,
  durakPlayerPing,
  durakSaveRoomState,
  fetchRoom,
  fetchRoomPlayers,
  formatPostgrestError,
  isRoomPlayerLikelyGone,
} from "@/lib/durak/online/matchmaking";
import type { RoomStatePayload } from "@/lib/durak/online/types";
import type { DurakGameEmbeddedProps } from "./DurakGame";
import { useTranslation } from "@/lib/useTranslation";

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

/**
 * Локальный стол «свежее» опроса: можно не подменять устаревшим poll при том же/старым ts.
 * Нельзя считать себя впереди только по числу пар на столе: после «Бито» у сервера пар 0, у клиента ещё старый стол —
 * иначе отбой соперника никогда не применится.
 */
function localTableAheadOfRemotePoll(loc: GameTable, rem: GameTable): boolean {
  const a = durakRoundTableProgress(loc);
  const b = durakRoundTableProgress(rem);
  /** Те же атаки, но мы уже отбились чаще, чем в ответе poll. */
  if (a[0] === b[0] && a[1] > b[1]) return true;
  /** У нас стол уже пуст (новый раунд / взяли карты), на сервере ещё прошлая схватка. */
  if (loc.tablePairs.length === 0 && rem.tablePairs.length > 0) return true;
  /** Подкинули атаку: локально больше пар, чем в poll — но не случай «сервер отбил и сбросил стол». */
  if (a[0] > b[0]) {
    if (rem.tablePairs.length === 0 && rem.discardPile.length > loc.discardPile.length) {
      return false;
    }
    return true;
  }
  return false;
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
    const atk = p.attack ?? p.attack_card;
    if (!isCard(atk)) continue;
    const defRaw = p.defense ?? p.defense_card;
    const defense = defRaw == null ? null : isCard(defRaw) ? defRaw : null;
    out.push({ attack: atk, defense });
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
    const pidRaw = p.id ?? p.player_id;
    const id =
      typeof pidRaw === "string" && pidRaw.trim()
        ? pidRaw.trim()
        : pidRaw != null && String(pidRaw).trim()
          ? String(pidRaw).trim()
          : "";
    if (!id) return null;
    const hand = Array.isArray(p.hand) ? p.hand.filter(isCard) : [];
    const siRaw = p.seatIndex ?? p.seat_index;
    const seatIndex = typeof siRaw === "number" && siRaw >= 0 ? siRaw : i;
    out.push({
      id,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "",
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
function coerceRemoteGame(raw: unknown, stableTableId?: string | null): GameTable | null {
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
  const tablePairsRaw = (g as { table_pairs?: unknown }).table_pairs ?? g.tablePairs;
  const tablePairs = normalizeTablePairs(tablePairsRaw);
  const discardPile = normalizeDeck(g.discardPile);
  const trumpRaw = g.trumpCard ?? (g as { trump_card?: unknown }).trump_card;
  const trumpCard = trumpRaw != null && isCard(trumpRaw) ? trumpRaw : null;
  const ts = g.trumpSuit ?? (g as { trump_suit?: unknown }).trump_suit;
  const trumpSuit =
    ts === "spades" || ts === "hearts" || ts === "diamonds" || ts === "clubs" ? ts : trumpCard?.suit ?? "spades";
  const fromPayload = typeof g.id === "string" && g.id.trim() ? g.id.trim() : "";
  const sid = stableTableId && String(stableTableId).trim() ? String(stableTableId).trim() : "";
  /** Без стабильного id каждый poll с пропущенным `game.id` в JSON давал новый uuid → мигание и повторная «раздача» в DurakGame. */
  const id = fromPayload || sid || tableIdFallback();
  const playersSorted = players.map((p) => ({ ...p, hand: sortHand(p.hand) }));
  return {
    id,
    mode: g.mode === "podkidnoy" ? "podkidnoy" : "podkidnoy",
    players: playersSorted,
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
    beatAckPlayerIds: (() => {
      const raw = (g as { beatAckPlayerIds?: unknown }).beatAckPlayerIds;
      if (!Array.isArray(raw)) return undefined;
      const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
      return ids.length ? ids : [];
    })(),
    beatRoundDeadlineMs:
      typeof (g as { beatRoundDeadlineMs?: unknown }).beatRoundDeadlineMs === "number" &&
      Number.isFinite((g as { beatRoundDeadlineMs?: number }).beatRoundDeadlineMs)
        ? Number((g as { beatRoundDeadlineMs?: number }).beatRoundDeadlineMs)
        : undefined,
  };
}

/**
 * Онлайн-партия: `room_state` в Supabase, realtime, сидирование стола лидером.
 * Старт игры: после `rooms.status === 'playing'` + запись в `room_state`.
 * Добавление бота: RPC `durak_finalize_room_if_ready` (см. SQL) при 1 игроке после дедлайна.
 *
 * Синхронизация ходов: RPC `durak_save_room_state` + опрос по HTTP (без Supabase Realtime/WebSocket:
 * в Safari / встроенных браузерах и при блокировке wss часто «TypeError: Load failed»).
 * Persist не должен захватывать `game` в замыкание debounce — иначе поздняя запись затирает отбой соперника.
 * Сброс только `message` в DurakGame не должен подставлять целиком устаревший `embedded.game` — иначе пропадает отбой соперника.
 */
export function DurakOnlineGame({ roomId, playerName, onLeave, renderGame }: Props) {
  const { t } = useTranslation();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerId = useMemo(() => getOrCreateDurakPlayerId(), []);

  useEffect(() => {
    const c = createSupabaseBrowserClient();
    setSupabase(c);
    if (!c) setError(t("dog_err_supabase"));
  }, [t]);
  const [game, setGame] = useState<GameTable | null>(null);
  /** Победа по отсутствию соперника (отдельный текст оверлея). */
  const [opponentForfeitWin, setOpponentForfeitWin] = useState(false);
  /** После первого не-null стола — реже опрашивать БД (не привязывать интервал к каждому ходу). */
  const [tableHydrated, setTableHydrated] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Актуальный стол (в т.ч. после realtime); persist читает отсюда, иначе debounce затирает чужой ход старым замыканием. */
  const gameRef = useRef<GameTable | null>(null);
  /** Время последнего применённого с сервера `room_state.updated_at` (чтобы не откатывать ход по опросу). */
  const lastAppliedServerTsRef = useRef(0);
  /** Локальный ход ещё не записан в БД — не подменять стол устаревшим poll / pre-upsert select с тем же `updated_at`. */
  const pendingRoomSaveRef = useRef(false);
  /** Увеличивается на каждый материальный ход; RPC save снимает pending только если совпал с актуальным (параллельные async после debounce). */
  const roomSaveGenRef = useRef(0);
  /** Анти-спам: не больше ~18 сохранений за 10 с с одного клиента. */
  const saveThrottleTimestampsRef = useRef<number[]>([]);

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
    setOpponentForfeitWin(false);
    setGame(null);
  }, [roomId]);

  /** Вкладка «в матче» — иначе после F5 не поднимем playing из LS; в новой вкладке LS не тянет чужой стол. */
  useEffect(() => {
    markDurakTabOnlineResume();
  }, [roomId]);

  /** Не дёргаем last_seen в прошлое при уходе: соперник зачитывает форфейт через ~20 с без пинга (см. isRoomPlayerLikelyGone + durak_forfeit_stale_opponent). */
  const leaveMatchAndParent = useCallback(() => {
    onLeave();
  }, [onLeave]);

  /** После партии убираем сохранённый room id — иначе «быстрая игра» тянет старый стол после игры у друзей. */
  useEffect(() => {
    if (game?.state !== "finished") return;
    abandonDurakStoredRoom();
  }, [game?.state]);

  /** Пинг активности: нужен и в фоне — иначе сервер «caller not active» и форфейт соперника не проходит. */
  useEffect(() => {
    if (!supabase) return;
    const ping = () => {
      void durakPlayerPing(supabase, roomId, playerId).catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, 5000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [supabase, roomId, playerId]);

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
      const remote = coerceRemoteGame(rawGame, roomId);
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
    [roomId]
  );

  /**
   * Техническая победа: соперник не пинговал ≥20 с или пропал из room_players (сервер: `durak_forfeit_stale_opponent`).
   * Не привязываем к visibility: иначе вкладка в фоне — форфейт никогда не вызывается.
   * Свой пинг по-прежнему только при видимой вкладке (сервер требует «caller not active» если сам не пинговал ~30 с).
   */
  useEffect(() => {
    if (!supabase) return;
    const id = window.setInterval(() => {
      const g = gameRef.current;
      if (!g || g.state !== "playing") return;
      if (g.players.filter((p) => p.type !== "bot").length < 2) return;
      void (async () => {
        try {
          const rows = await fetchRoomPlayers(supabase, roomId);
          const others = rows.filter((r) => !r.is_bot && r.player_id !== playerId);
          const now = Date.now();
          const humansInGame = g.players.filter((p) => p.type !== "bot").length;
          let shouldForfeit = false;
          if (others.length === 0) {
            if (humansInGame >= 2) shouldForfeit = true;
          } else {
            shouldForfeit = others.every((r) => isRoomPlayerLikelyGone(r, now));
          }
          if (!shouldForfeit) return;
          await durakPlayerPing(supabase, roomId, playerId);
          const raw = await durakForfeitStaleOpponent(supabase, roomId, playerId);
          advanceLastAppliedRef(lastAppliedServerTsRef, Date.parse(raw));
          setOpponentForfeitWin(true);
          const { data, error } = await supabase
            .from("room_state")
            .select("state, updated_at")
            .eq("room_id", roomId)
            .maybeSingle();
          if (!error) applyRemoteRow(data, "realtime");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/opponent still active|caller not active/i.test(msg)) {
            console.warn("[durak] durak_forfeit_stale_opponent:", msg);
          }
        }
      })();
    }, 1200);
    return () => window.clearInterval(id);
  }, [supabase, roomId, playerId, applyRemoteRow]);

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
          console.warn("[durak] room_state pre-save select:", selErr.message);
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

        const nowTs = Date.now();
        saveThrottleTimestampsRef.current = saveThrottleTimestampsRef.current.filter(
          (t) => nowTs - t < 10_000
        );
        if (saveThrottleTimestampsRef.current.length >= 18) {
          console.warn("[durak] room_state save throttled (client)");
          if (saveGenAtRun === roomSaveGenRef.current) {
            pendingRoomSaveRef.current = true;
            persistTimer.current = setTimeout(() => {
              persistGame();
            }, 2200);
          }
          return;
        }

        const delaysMs = [0, 120, 300, 700];
        let upRaw: string | undefined;
        for (let attempt = 0; attempt < delaysMs.length; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => window.setTimeout(r, delaysMs[attempt]));
            g = gameRef.current;
            if (!g) return;
            if (saveGenAtRun !== roomSaveGenRef.current) return;
          }
          try {
            upRaw = await durakSaveRoomState(supabase, roomId, playerId, { game: g });
            saveThrottleTimestampsRef.current.push(Date.now());
            break;
          } catch (err) {
            console.warn(
              "[durak] durak_save_room_state:",
              err instanceof Error ? err.message : err,
              `(attempt ${attempt + 1})`
            );
          }
        }

        if (!upRaw) {
          console.warn("[durak] durak_save_room_state: all retries failed; will retry save");
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
    }, 160);
  }, [supabase, roomId, playerId, applyRemoteRow]);

  const onRemoteGameChange = useCallback(
    (update: SetStateAction<GameTable>) => {
      setGame((current) => {
        if (!current) {
          /* Функциональный апдейт без загруженного стола затирал бы партию в null — см. инициализацию. */
          if (typeof update === "function") return current;
          return update;
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
        const existingGame = coerceRemoteGame(existing?.game, roomId);
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
        let initial: GameTable;
        try {
          initial = buildGameFromRoomPlayers(rows, playerId, roomId);
        } catch (err) {
          if (!cancelled) {
            setError(
              formatPostgrestError(err instanceof Error ? err : new Error(String(err)))
            );
          }
          return;
        }

        /*
         * Детерминированная колода по roomId: оба клиента собирают один и тот же стол сразу.
         * Раньше не-лидер ждал room_state от лидера; при сбое RPC poll оставался с coerce=null — вечная «Загрузка стола».
         */
        gameRef.current = initial;
        setGame(initial);

        if (leaderId === playerId) {
          try {
            const raw = await durakSaveRoomState(supabase, roomId, playerId, { game: initial });
            advanceLastAppliedRef(lastAppliedServerTsRef, Date.parse(raw));
          } catch (e) {
            console.warn("[durak] durak_save_room_state (seed):", e instanceof Error ? e.message : e);
          }
        }

        const { data: after } = await supabase
          .from("room_state")
          .select("state, updated_at")
          .eq("room_id", roomId)
          .maybeSingle();
        if (cancelled) return;

        const g = coerceRemoteGame((after?.state as RoomStatePayload | undefined)?.game, roomId);
        const gOk = g != null && roomStateMatchesRoomPlayers(rows, g);
        if (gOk && g) {
          gameRef.current = g;
          setGame(g);
          const raw = after?.updated_at;
          if (raw && !Number.isNaN(Date.parse(String(raw)))) {
            advanceLastAppliedRef(lastAppliedServerTsRef, Date.parse(String(raw)));
          }
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
        try {
          const { data, error } = await supabase
            .from("room_state")
            .select("state, updated_at")
            .eq("room_id", roomId)
            .maybeSingle();
          if (error) return;
          applyRemoteRow(data, "poll");
        } catch {
          /* сеть: не бросаем вверх, не роняем React */
        }
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
      onLeave: leaveMatchAndParent,
      opponentForfeitWin,
    };
  }, [roomId, playerId, playerName, game, onRemoteGameChange, leaveMatchAndParent, opponentForfeitWin]);

  if (error) {
    return (
      <div
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center text-amber-200"
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "3rem 1rem",
          textAlign: "center",
          backgroundColor: "#14100c",
          color: "#fde68a",
        }}
      >
        <p className="text-sm" style={{ fontSize: 14 }}>
          {error}
        </p>
        <button
          type="button"
          onClick={leaveMatchAndParent}
          className="rounded-full border border-white/25 px-4 py-2 text-sm text-white/90"
          style={{ color: "#f8fafc", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 9999, padding: "0.5rem 1rem" }}
        >
          {t("back")}
        </button>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div
        className="flex min-h-0 w-full flex-1 items-center justify-center py-20 text-sm text-white/50"
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: "5rem 1rem",
          backgroundColor: "#14100c",
          color: "rgba(248,250,252,0.55)",
          fontSize: 14,
        }}
      >
        {t("mm_connecting")}
      </div>
    );
  }

  if (!game || !embeddedProps) {
    return (
      <div
        className="flex min-h-[min(50dvh,420px)] min-w-0 w-full flex-1 flex-col items-center justify-center gap-2 px-4 py-20 text-center text-sm text-white/55"
        style={{
          display: "flex",
          minHeight: "min(50vh, 420px)",
          width: "100%",
          flex: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          padding: "5rem 1rem",
          textAlign: "center",
          backgroundColor: "#14100c",
          color: "rgba(248,250,252,0.7)",
          fontSize: 14,
        }}
      >
        <span>{t("dog_loading_table")}</span>
        <span className="max-w-[20rem] text-xs text-white/35" style={{ maxWidth: "20rem", fontSize: 12, color: "rgba(248,250,252,0.45)" }}>
          {t("dog_loading_hint")}
        </span>
        <button
          type="button"
          onClick={leaveMatchAndParent}
          className="mt-4 rounded-full border border-white/25 px-4 py-2 text-[13px] font-medium text-white/90"
        >
          {t("dog_leave_table")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col basis-0">
      {renderGame(embeddedProps)}
    </div>
  );
}
