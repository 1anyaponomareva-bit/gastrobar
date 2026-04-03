import type { Card, GameTable, Rank } from "./types";
import * as engine from "./engine";
import { canBeat, rankValue } from "./cards";

function sortAttackPreference(hand: Card[], trumpSuit: GameTable["trumpSuit"]) {
  return [...hand].sort((a, b) => {
    const ua = a.suit === trumpSuit ? 1 : 0;
    const ub = b.suit === trumpSuit ? 1 : 0;
    if (ua !== ub) return ua - ub;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

/** Минимальная легальная первая атака (карты одного ранга — играем все карты этого ранга, как при мультивыборе одного достоинства). */
function minAttackIdsForPlayer(table: GameTable, attackerId: string): string[] {
  const attacker = table.players[table.attackerIndex];
  if (!attacker || attacker.id !== attackerId || attacker.hand.length === 0) return [];
  const sorted = sortAttackPreference(attacker.hand, table.trumpSuit);
  const rank = sorted[0]!.rank;
  return attacker.hand.filter((c) => c.rank === rank).map((c) => c.id);
}

export function chooseTossForSeat(table: GameTable, playerIndex: number): { type: "toss"; ids: string[] } | { type: "pass" } {
  const p = table.players[playerIndex];
  if (!p || playerIndex === table.defenderIndex) return { type: "pass" };

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

function chooseTossOrBeatForAttacker(table: GameTable, attackerId: string): { type: "toss"; ids: string[] } | { type: "beat" } {
  const att = table.players[table.attackerIndex];
  if (!att || att.id !== attackerId) return { type: "beat" };
  const r = chooseTossForSeat(table, table.attackerIndex);
  if (r.type === "toss") return r;
  return { type: "beat" };
}

/**
 * Один шаг автохода для указанного игрока (онлайн / таймер).
 * Логика согласована с `applyBotMove`, но без проверки `type === "bot"`.
 */
export function tryAutoMove(table: GameTable, playerId: string): GameTable | null {
  if (table.state !== "playing") return null;

  if (table.phase === "attack_initial" && table.players[table.attackerIndex]!.id === playerId) {
    const ids = minAttackIdsForPlayer(table, playerId);
    if (ids.length === 0) return null;
    const r = engine.attackInitial(table, playerId, ids);
    return "error" in r ? null : r.table;
  }

  if (table.phase === "defend" && table.players[table.defenderIndex]!.id === playerId) {
    const defender = table.players[table.defenderIndex]!;
    const pair = table.tablePairs.find((p) => p.defense === null);
    if (!pair) return null;

    const candidates = defender.hand.filter((c) => canBeat(pair.attack, c, table.trumpSuit));
    if (candidates.length === 0) {
      const r = engine.defenderCannotBeat(table, playerId);
      return "error" in r ? null : r.table;
    }
    candidates.sort((a, b) => {
      const ta = a.suit === table.trumpSuit ? 1 : 0;
      const tb = b.suit === table.trumpSuit ? 1 : 0;
      if (ta !== tb) return ta - tb;
      return rankValue(a.rank) - rankValue(b.rank);
    });
    const best = candidates[0]!;
    const r = engine.defendPlay(table, playerId, pair.attack.id, best.id);
    return "error" in r ? null : r.table;
  }

  const tossPhases = table.phase === "attack_toss" || table.phase === "player_can_throw_more";
  if (!tossPhases) return null;

  const order = engine.attackingSeatOrder(table);
  for (const idx of order) {
    const pl = table.players[idx];
    if (!pl || pl.id !== playerId) continue;
    const sub = chooseTossForSeat(table, idx);
    if (sub.type !== "toss") continue;
    const r = engine.attackToss(table, playerId, sub.ids);
    if (!("error" in r)) return r.table;
  }

  const att = table.players[table.attackerIndex];
  if (att?.id === playerId) {
    const choice = chooseTossOrBeatForAttacker(table, playerId);
    if (choice.type === "beat") {
      if (table.phase === "player_can_throw_more") {
        const def = table.players[table.defenderIndex];
        if (!def) return null;
        const r = engine.defenderTake(table, def.id);
        return "error" in r ? null : r.table;
      }
      const r = engine.attackerBeat(table, playerId);
      return "error" in r ? null : r.table;
    }
    const r = engine.attackToss(table, playerId, choice.ids);
    if ("error" in r) {
      if (table.phase === "player_can_throw_more") {
        const def = table.players[table.defenderIndex];
        if (def) {
          const take = engine.defenderTake(table, def.id);
          if (!("error" in take)) return take.table;
        }
      }
      const beat = engine.attackerBeat(table, playerId);
      return "error" in beat ? null : beat.table;
    }
    return r.table;
  }

  /** В `player_can_throw_more` кнопку «Бито» показывают всем не-защитникам — не только leading attacker. */
  if (table.phase === "player_can_throw_more" && table.players[table.defenderIndex]!.id !== playerId) {
    const def = table.players[table.defenderIndex];
    if (!def) return null;
    const r = engine.defenderTake(table, def.id);
    return "error" in r ? null : r.table;
  }

  return null;
}

/** Показывать таймер хода только если локальному игроку нужно действие (не «только ждать»). */
export function localPlayerMustActOnline(table: GameTable, localId: string): boolean {
  if (table.state !== "playing") return false;
  const selfIdx = table.players.findIndex((p) => p.id === localId);
  if (selfIdx < 0) return false;
  const selfIsAttacker = table.attackerIndex === selfIdx;
  const selfIsDefender = table.defenderIndex === selfIdx;
  const selfCanToss =
    !selfIsDefender && (table.phase === "attack_toss" || table.phase === "player_can_throw_more");

  const ranksOnTable = new Set<Rank>();
  for (const tp of table.tablePairs) {
    ranksOnTable.add(tp.attack.rank);
    if (tp.defense) ranksOnTable.add(tp.defense.rank);
  }
  const hand = table.players[selfIdx]?.hand ?? [];
  const hasValidToss =
    selfCanToss &&
    hand.some(
      (c) =>
        ranksOnTable.has(c.rank) &&
        table.tablePairs.length + 1 <= table.roundDefenderInitialHand
    );

  const selfShowBito =
    (table.phase === "attack_toss" && selfIsAttacker) ||
    (table.phase === "player_can_throw_more" && !selfIsDefender);

  if (table.phase === "attack_initial") return selfIsAttacker;
  if (table.phase === "defend") return selfIsDefender;
  if (table.phase === "attack_toss") {
    if (selfIsDefender) return false;
    if (selfIsAttacker) return true;
    return hasValidToss;
  }
  if (table.phase === "player_can_throw_more") {
    if (selfIsDefender) return false;
    return hasValidToss || selfShowBito;
  }
  return false;
}
