/**
 * Фиксированная геометрия соперников: верхняя дуга, орбита вне круга стола.
 * y вниз; центр стола — центр круглого контейнера; углы в градусах, 0° вправо, −90° вверх.
 */

import type { Card, Player } from "@/games/durak/types";

import {
  fanContainerRotationDeg,
  opponentFanLayoutMults,
  type OpponentFanMults,
} from "./tableSeatLayout";

/** Радиус размещения карт боя — внутри сукна, меньше полного orbit. */
export const DURAK_TABLE_BATTLE_ORBIT_MULT = 0.78;

export function getBattleAreaOrbitPx(orbitPxEff: number): number {
  return Math.max(1, orbitPxEff) * DURAK_TABLE_BATTLE_ORBIT_MULT;
}

/**
 * Радиус круга стола (px): `orbitPxEff = clientWidth * 0.48` → `clientWidth = orbit/0.48`, радиус = W/2.
 */
export function getTableRadiusPxFromOrbit(orbitPxEff: number): number {
  const o = Math.max(1, orbitPxEff);
  return o / 0.96;
}

/** Зазор от обода стола до орбиты соперников (70–110px). */
export function getPlayerOrbitGapPx(tableRadiusPx: number): number {
  return Math.round(Math.min(110, Math.max(70, 70 + tableRadiusPx * 0.06)));
}

/** Ниже этой линии (в координатах от центра, oy) соперник не опускается — над сукном. */
const PLAYER_OY_MAX_ABOVE_TABLE_PX = 40;

function opponentAnglesUniformUpperArc(opponentCount: number): number[] {
  if (opponentCount <= 0) return [];
  const lo = -160;
  const hi = -20;
  if (opponentCount === 1) return [-90];
  const span = hi - lo;
  const out: number[] = [];
  for (let i = 0; i < opponentCount; i++) {
    const t = opponentCount === 1 ? 0.5 : i / (opponentCount - 1);
    out.push(lo + t * span);
  }
  return out;
}

/**
 * Углы только в верхней дуге [−160°, −20°]. Явные таблицы 2–6; иначе равномерно по дуге.
 */
export function getSeatAnglesForTotalPlayers(totalPlayers: number): number[] {
  switch (totalPlayers) {
    case 2:
      return [-90];
    case 3:
      return [-140, -40];
    case 4:
      return [-150, -90, -30];
    case 5:
      return [-160, -120, -80, -40];
    case 6:
      return [-160, -130, -100, -70, -40];
    default:
      if (totalPlayers < 2) return [];
      return opponentAnglesUniformUpperArc(totalPlayers - 1);
  }
}

export function getOpponentSeatAnglesDeg(
  opponentCount: number,
  totalPlayerCount?: number,
): number[] {
  const total = totalPlayerCount ?? opponentCount + 1;
  const angles = getSeatAnglesForTotalPlayers(total);
  if (angles.length === opponentCount) return angles;
  return opponentAnglesUniformUpperArc(opponentCount);
}

/**
 * Якорь соперника на орбите; oy не ниже −tableRadius − 40 (не «сползать» на сукно).
 * Точка остаётся на круге радиуса `playerRadiusPx`: при фиксации `oy` пересчитываем `ox` как
 * пересечение окружности с горизонталью (а не удлиняем луч — иначе при углах ~−160° `ox` уходит за экран).
 */
function clampOpponentRadialOffset(params: {
  angleDeg: number;
  tableRadiusPx: number;
  playerRadiusPx: number;
}): { ox: number; oy: number; rUsed: number } {
  const { angleDeg, tableRadiusPx, playerRadiusPx } = params;
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const r = Math.max(1, playerRadiusPx);
  let ox = cosA * r;
  let oy = Math.sin(rad) * r;

  const oyMax = -tableRadiusPx - PLAYER_OY_MAX_ABOVE_TABLE_PX;
  if (oy > oyMax) {
    oy = oyMax;
    const disc = r * r - oy * oy;
    if (disc <= 0) {
      ox = 0;
    } else {
      const mag = Math.sqrt(disc);
      ox = cosA >= 0 ? mag : -mag;
    }
  }
  return { ox, oy, rUsed: r };
}

/** Ужатый веер соперника: scale 0.75–0.85, меньше раскрытие. */
export function applyDurakOpponentFanTightness(m: OpponentFanMults): OpponentFanMults {
  const scale = Math.min(0.85, Math.max(0.75, m.scale * 0.82));
  return {
    ...m,
    scale,
    edgeMax: m.edgeMax * 0.42,
    step: m.step * 0.88,
    arc: m.arc * 0.88,
    handWidthRem: m.handWidthRem * 0.9,
    handHeightRem: m.handHeightRem * 0.92,
  };
}

function labelRadialPx(opponentCount: number): number {
  if (opponentCount >= 5) return 36;
  if (opponentCount >= 4) return 40;
  return 46;
}

export type DurakOpponentTablePlacement = {
  oppId: string;
  oppName: string | undefined;
  bh: Card[];
  lx: number;
  ly: number;
  fanAx: number;
  fanAy: number;
  fanRot: number;
  mults: OpponentFanMults;
};

export function buildOpponentTablePlacements(args: {
  opponents: Player[];
  totalPlayers: number;
  orbitPxEff: number;
  embedded?: boolean;
}): DurakOpponentTablePlacement[] {
  const { opponents, totalPlayers, orbitPxEff } = args;
  const tableRadiusPx = getTableRadiusPxFromOrbit(orbitPxEff);
  const gapPx = getPlayerOrbitGapPx(tableRadiusPx);
  const playerRadiusPx = tableRadiusPx + gapPx;

  const baseMults = opponentFanLayoutMults(opponents.length);
  const mults = applyDurakOpponentFanTightness(baseMults);
  const lr = labelRadialPx(opponents.length);
  const angles = getOpponentSeatAnglesDeg(opponents.length, totalPlayers);

  return opponents.map((opp, oi) => {
    const bh = opp.hand;
    const seatAngleDeg = angles[oi] ?? -90;
    const rad = (seatAngleDeg * Math.PI) / 180;
    const nx = Math.cos(rad);
    const ny = Math.sin(rad);
    const { ox: rimOx, oy: rimOy } = clampOpponentRadialOffset({
      angleDeg: seatAngleDeg,
      tableRadiusPx,
      playerRadiusPx,
    });
    const fanAx = rimOx;
    const fanAy = rimOy;
    const fanRot = fanContainerRotationDeg(seatAngleDeg);
    const lx = rimOx + nx * lr;
    const ly = rimOy + ny * lr;

    return {
      oppId: opp.id,
      oppName: opp.name,
      bh,
      lx,
      ly,
      fanAx,
      fanAy,
      fanRot,
      mults,
    };
  });
}
