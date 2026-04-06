/**
 * Единый layout соперников за столом (2–6 игроков): углы, внешний радиус, якорь веера.
 * Локальный игрок внизу (90°) в разметке не участвует — только соперники по внешней дуге.
 */

import type { Card, Player } from "@/games/durak/types";

import {
  fanContainerRotationDeg,
  normalizeAngleDeg180,
  opponentFanLayoutMults,
  seatOffsetOnCircle,
  type OpponentFanMults,
} from "./tableSeatLayout";

function opponentAnglesUniform(totalPlayers: number, opponentCount: number): number[] {
  if (totalPlayers < 2 || opponentCount <= 0) return [];
  const step = 360 / totalPlayers;
  const out: number[] = [];
  for (let i = 0; i < opponentCount; i++) {
    const k = i + 1;
    out.push(normalizeAngleDeg180(90 - k * step));
  }
  return out;
}

/**
 * Угла сиденья соперников (по часовой от локального внизу), индекс 0…N−2.
 * Явные таблицы для 2–6; иначе равномерный шаг по кругу.
 */
export function getSeatAnglesForTotalPlayers(totalPlayers: number): number[] {
  switch (totalPlayers) {
    case 2:
      return [-90];
    case 3:
      return [-55, -125];
    case 4:
      return [0, -45, -135];
    case 5: {
      const step = 360 / 5;
      const out: number[] = [];
      for (let i = 0; i < 4; i++) {
        const k = i + 1;
        out.push(normalizeAngleDeg180(90 - k * step));
      }
      return out;
    }
    case 6:
      return [45, 0, -45, -135, 135];
    default:
      if (totalPlayers < 2) return [];
      return opponentAnglesUniform(totalPlayers, totalPlayers - 1);
  }
}

/**
 * Совместимость с прежним API: углы для `opponents.length` соперников при `totalPlayerCount` игроках.
 */
export function getOpponentSeatAnglesDeg(
  opponentCount: number,
  totalPlayerCount?: number,
): number[] {
  const total = totalPlayerCount ?? opponentCount + 1;
  const angles = getSeatAnglesForTotalPlayers(total);
  if (angles.length === opponentCount) return angles;
  return opponentAnglesUniform(total, opponentCount);
}

/**
 * Радиус окружности якорей соперников (px): **внешняя дуга** относительно зоны боя `orbitPxEff`.
 * Без «притягивания» к центру — веер остаётся над ободом сукна, не внутри зелёного круга.
 */
export function getOpponentRimRadiusPx(orbitPxEff: number, embedded: boolean): number {
  const base = Math.max(1, orbitPxEff);
  const embeddedExtra = embedded ? 22 : 0;
  const raw = base * 1.16 + embeddedExtra + 48;
  /** Полуось квадрата стола (orbit = 0.48·ширина); без верхнего предела якорь уезжает за край и веер не виден. */
  const tableHalfPx = (base / 0.48) * 0.5;
  const maxR = tableHalfPx * 0.88;
  return Math.min(raw, maxR);
}

/**
 * Сдвиг угла якоря веера относительно угла сиденья: зона колоды слева (верхний левый сектор).
 */
export function getFanAnchorAngleOffsetDeg(seatAngleDeg: number): number {
  if (seatAngleDeg <= -95 && seatAngleDeg >= -175) return 6;
  return 0;
}

function labelRadialPx(opponentCount: number): number {
  if (opponentCount >= 5) return 38;
  if (opponentCount >= 4) return 44;
  return 50;
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
  embedded: boolean;
}): DurakOpponentTablePlacement[] {
  const { opponents, totalPlayers, orbitPxEff, embedded } = args;
  const rimR = getOpponentRimRadiusPx(orbitPxEff, embedded);
  const mults = opponentFanLayoutMults(opponents.length);
  const lr = labelRadialPx(opponents.length);
  const angles = getOpponentSeatAnglesDeg(opponents.length, totalPlayers);

  return opponents.map((opp, oi) => {
    const bh = opp.hand;
    const seatAngleDeg = angles[oi] ?? -90;
    const { ox: rimOx, oy: rimOy, nx, ny } = seatOffsetOnCircle(seatAngleDeg, rimR);
    const fanAnchorAngleDeg = seatAngleDeg + getFanAnchorAngleOffsetDeg(seatAngleDeg);
    const { ox: fanAx, oy: fanAy } = seatOffsetOnCircle(fanAnchorAngleDeg, rimR);
    const fanRot = fanContainerRotationDeg(fanAnchorAngleDeg);
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
