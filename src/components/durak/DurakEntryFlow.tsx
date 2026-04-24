"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getOrCreateDurakPlayerId } from "@/lib/durak/online/playerId";
import {
  durakCloseInactiveFriendRooms,
  durakCreateFriendRoom,
  durakFinalizeRoomIfReady,
  durakJoinFriendRoom,
  durakStartFriendRoom,
  fetchPublicFriendTables,
  fetchRoom,
  fetchRoomPlayers,
  formatPostgrestError,
} from "@/lib/durak/online/matchmaking";
import type { PublicFriendTableRow, RoomPlayerRow, RoomRow } from "@/lib/durak/online/types";
import { DurakOnlineMatchmaking } from "@/components/durak/DurakOnlineMatchmaking";
import {
  randomDrinkTableNameUnique,
  tableNameKeysFromPublicRows,
  uniqueFriendTableName,
} from "@/lib/durak/friendTableNames";
import { cn } from "@/lib/utils";
import { DURAK_ONLINE_UNAVAILABLE_BANNER } from "@/lib/durak/userFacingError";

type Phase =
  | { k: "choose" }
  | { k: "quick" }
  | { k: "friends-menu" }
  | { k: "create" }
  | { k: "list" }
  | { k: "lobby"; roomId: string; joinCode: string; tableName: string; maxPlayers: number };

type Props = {
  displayName: string;
  /** Код из ссылки ?stol= */
  inviteCodeFromUrl: string | null;
  onOnlineGameStarted: (roomId: string, kind: "quick" | "friend") => void;
  onBackToMenu: () => void;
};

export function DurakEntryFlow({ displayName, inviteCodeFromUrl, onOnlineGameStarted, onBackToMenu }: Props) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [supabaseInitDone, setSupabaseInitDone] = useState(false);
  const [phase, setPhase] = useState<Phase>({ k: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteDone, setInviteDone] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createMax, setCreateMax] = useState(4);
  const [tables, setTables] = useState<PublicFriendTableRow[]>([]);
  const [lobbyRoom, setLobbyRoom] = useState<RoomRow | null>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<RoomPlayerRow[]>([]);

  useEffect(() => {
    try {
      setSupabase(createSupabaseBrowserClient());
    } catch {
      setSupabase(null);
    } finally {
      setSupabaseInitDone(true);
    }
  }, []);

  useEffect(() => {
    if (!supabaseInitDone || supabase) return;
    if (phase.k === "choose" || phase.k === "friends-menu") return;
    setPhase({ k: "choose" });
    setError(null);
  }, [supabaseInitDone, supabase, phase.k]);

  /** Столы друзей без активности 20 мин — finished; без этого висят, пока кто-то не откроет список. */
  useEffect(() => {
    if (!supabase) return;
    void durakCloseInactiveFriendRooms(supabase).catch(() => {});
  }, [supabase]);

  const loadTables = useCallback(async () => {
    if (!supabase) return;
    try {
      const rows = await fetchPublicFriendTables(supabase);
      setTables(rows);
    } catch {
      setTables([]);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase || phase.k !== "list") return;
    void loadTables();
    const id = window.setInterval(() => void loadTables(), 2000);
    return () => window.clearInterval(id);
  }, [supabase, phase.k, loadTables]);

  /** Первый заход на экран создания: подставляем свободное «барное» имя, если поле пустое. */
  useEffect(() => {
    if (!supabase || phase.k !== "create") return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchPublicFriendTables(supabase);
        if (cancelled) return;
        const taken = tableNameKeysFromPublicRows(rows);
        setCreateName((prev) => (prev.trim() ? prev : randomDrinkTableNameUnique(taken)));
      } catch {
        if (!cancelled) setCreateName((prev) => (prev.trim() ? prev : randomDrinkTableNameUnique(new Set())));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, phase.k]);

  useEffect(() => {
    if (phase.k !== "lobby" || !supabase) return;
    const tick = async () => {
      try {
        await durakFinalizeRoomIfReady(supabase, phase.roomId);
        const r = await fetchRoom(supabase, phase.roomId);
        setLobbyRoom(r);
        if (r?.status === "playing") {
          onOnlineGameStarted(phase.roomId, "friend");
          return;
        }
        const pl = await fetchRoomPlayers(supabase, phase.roomId);
        setLobbyPlayers(pl);
      } catch (e) {
        console.error(e);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2200);
    return () => window.clearInterval(id);
  }, [supabase, phase, onOnlineGameStarted]);

  useEffect(() => {
    if (!inviteCodeFromUrl || inviteDone) return;
    if (!supabaseInitDone) return;
    if (!supabase) {
      setError(DURAK_ONLINE_UNAVAILABLE_BANNER);
      setInviteDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setBusy(true);
        setError(null);
        const pid = getOrCreateDurakPlayerId();
        const { roomId } = await durakJoinFriendRoom(supabase, pid, displayName, {
          joinCode: inviteCodeFromUrl,
        });
        if (cancelled) return;
        const r = await fetchRoom(supabase, roomId);
        setPhase({
          k: "lobby",
          roomId,
          joinCode: r?.join_code ?? inviteCodeFromUrl.toUpperCase(),
          tableName: (r?.table_name ?? "Стол").trim() || "Стол",
          maxPlayers: r?.max_players ?? 4,
        });
        setInviteDone(true);
      } catch (e) {
        if (!cancelled) setError(formatPostgrestError(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, supabaseInitDone, inviteCodeFromUrl, displayName, inviteDone]);

  const onCreateTable = async () => {
    if (!supabase) return;
    const raw = createName.trim();
    if (!raw) {
      setError("Придумайте название стола или нажмите «Другое название».");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pid = getOrCreateDurakPlayerId();
      const rows = await fetchPublicFriendTables(supabase);
      const taken = tableNameKeysFromPublicRows(rows);
      const name = uniqueFriendTableName(raw, taken);
      const { roomId, joinCode } = await durakCreateFriendRoom(
        supabase,
        pid,
        displayName,
        name,
        createMax
      );
      setCreateName(name);
      setPhase({
        k: "lobby",
        roomId,
        joinCode,
        tableName: name,
        maxPlayers: createMax,
      });
    } catch (e) {
      setError(formatPostgrestError(e));
    } finally {
      setBusy(false);
    }
  };

  const onSuggestTableName = async () => {
    if (!supabase) return;
    setError(null);
    try {
      const rows = await fetchPublicFriendTables(supabase);
      setCreateName(randomDrinkTableNameUnique(tableNameKeysFromPublicRows(rows)));
    } catch {
      setCreateName(randomDrinkTableNameUnique(new Set()));
    }
  };

  const onJoinTableRow = async (row: PublicFriendTableRow) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const pid = getOrCreateDurakPlayerId();
      const { roomId } = await durakJoinFriendRoom(supabase, pid, displayName, {
        roomId: row.id,
      });
      const r = await fetchRoom(supabase, roomId);
      setPhase({
        k: "lobby",
        roomId,
        joinCode: r?.join_code ?? row.join_code ?? "",
        tableName: (r?.table_name ?? "Стол").trim() || "Стол",
        maxPlayers: r?.max_players ?? row.max_players,
      });
    } catch (e) {
      setError(formatPostgrestError(e));
    } finally {
      setBusy(false);
    }
  };

  const copyInviteLink = () => {
    if (phase.k !== "lobby") return;
    const u = `${typeof window !== "undefined" ? window.location.origin : ""}/durak?stol=${encodeURIComponent(phase.joinCode)}`;
    void navigator.clipboard.writeText(u);
  };

  const onStartAsHost = async () => {
    if (phase.k !== "lobby" || !supabase) return;
    setBusy(true);
    setError(null);
    try {
      await durakStartFriendRoom(supabase, getOrCreateDurakPlayerId(), phase.roomId);
      await durakFinalizeRoomIfReady(supabase, phase.roomId);
      const r = await fetchRoom(supabase, phase.roomId);
      if (r?.status === "playing") onOnlineGameStarted(phase.roomId, "friend");
    } catch (e) {
      setError(formatPostgrestError(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && phase.k === "choose" && inviteCodeFromUrl && !inviteDone) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="max-w-sm text-sm text-amber-200/90">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setInviteDone(true);
            }}
            className="rounded-full border border-white/25 px-5 py-2.5 text-sm text-white/90 hover:bg-white/10"
          >
            Понятно
          </button>
        </div>
      </div>
    );
  }

  if (!supabaseInitDone) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center bg-[#14100c] px-4 py-20 text-sm text-white/50">
        Загрузка…
      </div>
    );
  }

  if (phase.k === "quick" && !supabase) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 overflow-x-hidden bg-[#14100c] px-4 py-16 text-center text-sm text-amber-200/90">
        <p className="max-w-sm">{DURAK_ONLINE_UNAVAILABLE_BANNER}</p>
        <button
          type="button"
          onClick={() => setPhase({ k: "choose" })}
          className="rounded-full border border-white/25 px-5 py-2.5 text-sm text-white/90 hover:bg-white/10"
        >
          Назад
        </button>
      </div>
    );
  }

  if (phase.k === "quick") {
    return (
      <DurakOnlineMatchmaking
        playerName={displayName}
        onRoomPlaying={(roomId) => onOnlineGameStarted(roomId, "quick")}
        onCancel={() => setPhase({ k: "choose" })}
      />
    );
  }

  if (phase.k === "lobby") {
    const pid = getOrCreateDurakPlayerId();
    const isOwner = lobbyRoom?.owner_player_id === pid;
    const humans = lobbyPlayers.filter((p) => !p.is_bot).length;
    const full = humans >= phase.maxPlayers;
    const canEarlyStart = isOwner && humans >= 2 && !full;

    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 py-8">
          <button
            type="button"
            onClick={() => setPhase({ k: "friends-menu" })}
            className="self-start text-sm text-white/45 transition hover:text-white/75"
          >
            ← Назад
          </button>
          <div>
            <h1 className="text-xl font-semibold text-white">{phase.tableName}</h1>
            <p className="mt-1 text-sm text-white/55">
              Игроки: {humans} / {phase.maxPlayers}
            </p>
          </div>
          <ul className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            {lobbyPlayers.length === 0 ? (
              <li className="text-sm text-white/45">Загрузка списка…</li>
            ) : (
              lobbyPlayers.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm text-white/85">
                  <span className="truncate">{p.player_name || "Игрок"}</span>
                  {p.is_bot ? <span className="shrink-0 text-[10px] text-white/35">бот</span> : null}
                </li>
              ))
            )}
          </ul>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={copyInviteLink}
              className="w-full rounded-full border border-emerald-400/40 bg-emerald-900/35 py-3 text-sm font-medium text-emerald-50 hover:bg-emerald-800/40"
            >
              Скопировать ссылку
            </button>
            {canEarlyStart ? (
              <button
                type="button"
                disabled={busy}
                onClick={onStartAsHost}
                className="w-full rounded-full bg-[#f8d66d] py-3.5 text-sm font-semibold text-[#1a1612] shadow-lg hover:brightness-105 disabled:opacity-45"
              >
                Начать игру
              </button>
            ) : null}
            {full ? (
              <p className="text-center text-xs text-white/45">Стол заполнен — сейчас начнём…</p>
            ) : null}
          </div>
          {error ? <p className="text-center text-sm text-amber-200/90">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (phase.k === "create") {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 py-8">
          <button
            type="button"
            onClick={() => setPhase({ k: "friends-menu" })}
            className="self-start text-sm text-white/45 transition hover:text-white/75"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-semibold text-white">Новый стол</h1>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-white/55">Название стола</span>
            <p className="text-[11px] text-white/40">
              Видно в списке лобби. Если такое имя уже есть, подставим другое (например с хвостиком).
            </p>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value.slice(0, 40))}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-[#f8d66d]/55"
              placeholder="Например: По пиву · мохито"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSuggestTableName()}
              className="mt-1 w-fit max-w-full py-0.5 text-left text-[12px] font-medium text-[#f8d66d]/75 transition hover:text-[#f8d66d] disabled:opacity-40"
            >
              Сгенерировать другое название
            </button>
          </label>
          <div className="space-y-2">
            <span className="text-xs font-medium text-white/55">Сколько мест за столом</span>
            <p className="text-[11px] text-white/40">От 2 до 6 игроков</p>
            <div className="grid grid-cols-5 gap-2">
              {([2, 3, 4, 5, 6] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCreateMax(n)}
                  className={cn(
                    "rounded-xl border py-3 text-sm font-semibold transition",
                    createMax === n
                      ? "border-[#f8d66d] bg-[#f8d66d]/15 text-[#f8d66d]"
                      : "border-white/12 bg-white/[0.04] text-white/75 hover:border-white/25"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !createName.trim()}
            onClick={onCreateTable}
            className="mt-2 w-full rounded-full bg-[#f8d66d] py-3.5 text-sm font-semibold text-[#1a1612] shadow-lg hover:brightness-105 disabled:opacity-45"
          >
            Создать стол
          </button>
          {error ? <p className="text-sm text-amber-200/90">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (phase.k === "list") {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-8">
          <button
            type="button"
            onClick={() => setPhase({ k: "friends-menu" })}
            className="self-start text-sm text-white/45 transition hover:text-white/75"
          >
            ← Назад
          </button>
          <h1 className="text-xl font-semibold text-white">Список столов</h1>
          <p className="text-sm text-white/45">Только те, что ещё набирают игроков</p>
          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {tables.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-white/12 px-4 py-10 text-center text-sm text-white/40">
                Пока никого. Создайте стол сами — друзья подключатся по ссылке.
              </li>
            ) : (
              tables.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white/90">{t.table_name ?? "Стол"}</p>
                    <p className="text-xs text-white/45">
                      {t.player_count} / {t.max_players}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onJoinTableRow(t)}
                    className="shrink-0 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-white/90 hover:bg-white/15 disabled:opacity-45"
                  >
                    За стол
                  </button>
                </li>
              ))
            )}
          </ul>
          {error ? <p className="text-sm text-amber-200/90">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (phase.k === "friends-menu") {
    const noNet = !supabase;
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
          <button
            type="button"
            onClick={() => setPhase({ k: "choose" })}
            className="self-start text-sm text-white/45 transition hover:text-white/75"
          >
            ← Назад
          </button>
          {noNet ? (
            <p className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-3 py-2 text-sm text-amber-100/90">
              {DURAK_ONLINE_UNAVAILABLE_BANNER}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold text-white">Игра с друзьями</h1>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={noNet}
              onClick={() => {
                if (noNet) return;
                setError(null);
                setCreateName("");
                setPhase({ k: "create" });
              }}
              className="flex w-full flex-col items-start gap-1 rounded-2xl border border-white/14 bg-white/[0.06] px-5 py-4 text-left transition hover:border-white/25 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-lg">➕ Создать стол</span>
              <span className="text-sm text-white/50">До 6 мест — ты хозяин, рассылаешь ссылку</span>
            </button>
            <button
              type="button"
              disabled={noNet}
              onClick={() => {
                if (noNet) return;
                setError(null);
                void loadTables();
                setPhase({ k: "list" });
              }}
              className="flex w-full flex-col items-start gap-1 rounded-2xl border border-white/14 bg-white/[0.06] px-5 py-4 text-left transition hover:border-white/25 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-lg">📋 Список столов</span>
              <span className="text-sm text-white/50">Столы, которые ждут игроков</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showInviteLoader = Boolean(inviteCodeFromUrl && !inviteDone && busy);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden bg-[#14100c] px-4 pb-[max(6.25rem,calc(env(safe-area-inset-bottom,0px)+5.75rem))] text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
        {showInviteLoader ? (
          <p className="text-center text-sm text-white/55">Открываем стол по ссылке…</p>
        ) : null}
        {!supabase ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-3 py-2.5 text-center text-sm text-amber-100/90">
            {DURAK_ONLINE_UNAVAILABLE_BANNER}
          </p>
        ) : null}
        <h1 className="text-center text-2xl font-semibold leading-tight text-white">Как будешь играть?</h1>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            disabled={!supabase}
            onClick={() => {
              if (!supabase) return;
              setError(null);
              setPhase({ k: "quick" });
            }}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-2xl px-5 py-5 text-center shadow-lg transition active:scale-[0.99]",
              "bg-[#f8d66d] text-[#1a1612] hover:brightness-105",
              "shadow-[0_12px_40px_rgba(248,214,109,0.25)]",
              !supabase && "cursor-not-allowed opacity-45",
            )}
          >
            <span className="text-lg font-semibold">🟢 Быстро найти игру</span>
            <span className="text-sm font-normal text-[#1a1612]/75">Дуэль: всегда ровно два человека за столом</span>
          </button>
          <button
            type="button"
            disabled={!supabase}
            onClick={() => {
              if (!supabase) return;
              setError(null);
              setPhase({ k: "friends-menu" });
            }}
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-2xl border border-white/18 bg-white/[0.05] px-5 py-5 text-center text-white/90 transition hover:border-white/28 hover:bg-white/[0.08]",
              !supabase && "cursor-not-allowed opacity-45",
            )}
          >
            <span className="text-lg font-semibold">👥 С друзьями</span>
            <span className="text-sm text-white/50">Создать или присоединиться к столу</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onBackToMenu}
          className="mx-auto text-sm text-white/40 underline decoration-white/20 underline-offset-4 hover:text-white/65"
        >
          На главное меню
        </button>
      </div>
    </div>
  );
}
