import type { Card, GameTable, Rank } from "./types";
import * as engine from "./engine";
import { canBeat, rankValue } from "./cards";

function botPlayerId(table: GameTable): string | null {
  const b = table.players.find((p) => p.type === "bot");
  return b?.id ?? null;
}

function sortAttackPreference(hand: Card[], trumpSuit: GameTable["trumpSuit"]) {
  return [...hand].sort((a, b) => {
    const ua = a.suit === trumpSuit ? 1 : 0;
    const ub = b.suit === trumpSuit ? 1 : 0;
    if (ua !== ub) return ua - ub;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

/** Одна минимальная карта для первой атаки (сначала не козыри, затем по рангу). */
export function botChooseAttackInitial(table: GameTable): string[] {
  const attacker = table.players[table.attackerIndex];
  if (attacker.type !== "bot" || attacker.hand.length === 0) return [];
  const sorted = sortAttackPreference(attacker.hand, table.trumpSuit);
  const first = sorted[0];
  return first ? [first.id] : [];
}

export function botChooseDefend(
  table: GameTable
): { attackId: string; defenseId: string } | "take" {
  const defender = table.players[table.defenderIndex];
  if (defender.type !== "bot") return "take";

  const pair = table.tablePairs.find((p) => p.defense === null);
  if (!pair) return "take";

  const candidates = defender.hand.filter((c) =>
    canBeat(pair.attack, c, table.trumpSuit)
  );
  if (candidates.length === 0) return "take";

  candidates.sort((a, b) => {
    const ta = a.suit === table.trumpSuit ? 1 : 0;
    const tb = b.suit === table.trumpSuit ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return rankValue(a.rank) - rankValue(b.rank);
  });

  return { attackId: pair.attack.id, defenseId: candidates[0]!.id };
}

/** Одна карта для подкидывания игроком с индексом `playerIndex` (не защитник). */
export function botChooseTossForPlayer(
  table: GameTable,
  playerIndex: number
): { type: "toss"; ids: string[] } | { type: "pass" } {
  const p = table.players[playerIndex];
  if (!p || p.type !== "bot" || playerIndex === table.defenderIndex) return { type: "pass" };

  const ranksOnTable = new Set<Rank>();
  for (const tp of table.tablePairs) {
    ranksOnTable.add(tp.attack.rank);
    if (tp.defense) ranksOnTable.add(tp.defense.rank);
  }

  const tossable = p.hand.filter((c) => ranksOnTable.has(c.rank));
  const sorted = sortAttackPreference(tossable, table.trumpSuit);

  for (const c of sorted) {
    if (table.tablePairs.length + 1 <= table.roundDefenderInitialHand) {
      return { type: "toss", ids: [c.id] };
    }
  }
  return { type: "pass" };
}

export function botChooseTossOrBeat(
  table: GameTable,
): { type: "toss"; ids: string[] } | { type: "beat" } | { type: "noop" } {
  if (table.players.length >= 3) {
    for (const idx of engine.attackingSeatOrder(table)) {
      if (idx === table.attackerIndex) continue;
      const peer = botChooseTossForPlayer(table, idx);
      if (peer.type === "toss") {
        const selfToss = botChooseTossForPlayer(table, table.attackerIndex);
        if (selfToss.type === "toss") return selfToss;
        return { type: "noop" };
      }
    }
  }
  const r = botChooseTossForPlayer(table, table.attackerIndex);
  if (r.type === "toss") return r;
  return { type: "beat" };
}

/** Один шаг бота; вернуть null, если сейчас не ход бота или ход невалиден. */
export function applyBotMove(table: GameTable): GameTable | null {
  if (table.state !== "playing") return null;

  const bid = botPlayerId(table);
  if (!bid) return null;

  if (table.phase === "attack_initial" && table.players[table.attackerIndex]!.type === "bot") {
    const ids = botChooseAttackInitial(table);
    if (ids.length === 0) return null;
    const r = engine.attackInitial(table, bid, ids);
    return "error" in r ? null : r.table;
  }

  if (table.phase === "defend" && table.players[table.defenderIndex]!.type === "bot") {
    const d = botChooseDefend(table);
    if (d === "take") {
      const r = engine.defenderCannotBeat(table, bid);
      return "error" in r ? null : r.table;
    }
    const r = engine.defendPlay(table, bid, d.attackId, d.defenseId);
    return "error" in r ? null : r.table;
  }

  const tossPhases = table.phase === "attack_toss" || table.phase === "player_can_throw_more";
  if (tossPhases) {
    const order = engine.attackingSeatOrder(table);
    for (const idx of order) {
      const pl = table.players[idx];
      if (!pl || pl.type !== "bot") continue;
      const sub = botChooseTossForPlayer(table, idx);
      if (sub.type !== "toss") continue;
      const r = engine.attackToss(table, pl.id, sub.ids);
      if (!("error" in r)) return r.table;
    }

    const att = table.players[table.attackerIndex];
    if (att?.type === "bot") {
      const choice = botChooseTossOrBeat(table);
      if (choice.type === "noop") return null;
      if (choice.type === "beat") {
        if (table.phase === "player_can_throw_more") {
          const def = table.players[table.defenderIndex];
          if (!def) return null;
          const r = engine.defenderTake(table, def.id);
          return "error" in r ? null : r.table;
        }
        const r = engine.attackerBeat(table, att.id);
        return "error" in r ? null : r.table;
      }
      const r = engine.attackToss(table, att.id, choice.ids);
      if ("error" in r) {
        if (table.phase === "player_can_throw_more") {
          const def = table.players[table.defenderIndex];
          if (def) {
            const take = engine.defenderTake(table, def.id);
            if (!("error" in take)) return take.table;
          }
        }
        const beat = engine.attackerBeat(table, att.id);
        return "error" in beat ? null : beat.table;
      }
      return r.table;
    }
  }

  return null;
}
