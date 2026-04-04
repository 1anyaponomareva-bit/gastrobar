/**
 * Геометрия рассадки вокруг круглого стола (мобильный UI).
 * Углы: 0° = вправо по экрану, 90° = низ (место локального игрока), 180° = влево, -90° = верх.
 * Соперники в порядке `opponentsClockwiseFromLocal` — по часовой от локального относительно стола.
 */

import type { CSSProperties } from "react";

export function normalizeAngleDeg180(a: number): number {
  let x = a;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/** Смещение якоря сиденья от центра стола (ox вправо, oy вниз). */
export function seatOffsetOnCircle(
  angleDeg: number,
  radiusPx: number,
): { ox: number; oy: number; nx: number; ny: number } {
  const r = Math.max(1, radiusPx);
  const rad = (angleDeg * Math.PI) / 180;
  const nx = Math.cos(rad);
  const ny = Math.sin(rad);
  return { ox: nx * r, oy: ny * r, nx, ny };
}

/** Половина дуги «занятой» локальным игроком внизу (90°): сиденья только вне [90−h, 90+h]. */
const LOCAL_BOTTOM_GAP_HALF_DEG = 32;

/**
 * Равномерная рассадка соперников по окружности стола: N точек на дуге,
 * оставшейся после выреза под локального игрока снизу. Порядок — по возрастанию
 * угла вдоль дуги от «правого края» выреза к левому (согласовано с обходом по часовой от места внизу).
 */
function opponentAnglesOnCircleExcludingBottom(n: number): number[] {
  if (n <= 0) return [];
  const bottom = 90;
  const h = LOCAL_BOTTOM_GAP_HALF_DEG;
  const forbiddenLo = bottom - h;
  const forbiddenHi = bottom + h;
  const arcLen = 360 - (forbiddenHi - forbiddenLo);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * arcLen;
    let ang = forbiddenHi + d;
    while (ang >= 360) ang -= 360;
    out.push(normalizeAngleDeg180(ang));
  }
  return out;
}

/**
 * Углы сидений для каждого соперника (индекс 0..N-1), N = opponents.length.
 * Два соперника — симметрично вокруг «верха» (−90°), как за круглым столом (левый-верх / правый-верх).
 */
export function getOpponentSeatAnglesDeg(opponentCount: number): number[] {
  if (opponentCount <= 0) return [];
  if (opponentCount === 1) return [-90];
  if (opponentCount === 2) return [-135, -45];
  return opponentAnglesOnCircleExcludingBottom(opponentCount);
}

/** Поворот контейнера руки: веер локально «вверх» смотрит к центру стола. */
export function fanContainerRotationDeg(seatAngleDeg: number): number {
  return normalizeAngleDeg180(seatAngleDeg - 90);
}

export type OpponentFanMults = {
  /** Множитель к edgeMaxDeg */
  edgeMax: number;
  /** Множитель к шагу tx между картами */
  step: number;
  /** Множитель к дуге arc */
  arc: number;
  /** Общий scale всего блока руки */
  scale: number;
  /** Высота зоны веера (rem), дальше clamp в vw в JSX */
  handHeightRem: number;
  /** Ширина зоны веера (rem) */
  handWidthRem: number;
};

export function opponentFanLayoutMults(opponentCount: number): OpponentFanMults {
  switch (opponentCount) {
    case 1:
      return {
        edgeMax: 1,
        step: 1,
        arc: 1,
        scale: 1,
        handHeightRem: 5.35,
        handWidthRem: 10.5,
      };
    case 2:
      return {
        edgeMax: 0.9,
        step: 0.92,
        arc: 0.92,
        scale: 0.94,
        handHeightRem: 5.05,
        handWidthRem: 10,
      };
    case 3:
      return {
        edgeMax: 0.82,
        step: 0.85,
        arc: 0.85,
        scale: 0.89,
        handHeightRem: 4.85,
        handWidthRem: 9.5,
      };
    case 4:
      return {
        edgeMax: 0.7,
        step: 0.76,
        arc: 0.76,
        scale: 0.8,
        handHeightRem: 4.4,
        handWidthRem: 8.75,
      };
    case 5:
      return {
        edgeMax: 0.6,
        step: 0.66,
        arc: 0.66,
        scale: 0.72,
        handHeightRem: 4,
        handWidthRem: 8,
      };
    default:
      return {
        edgeMax: 0.55,
        step: 0.6,
        arc: 0.6,
        scale: 0.68,
        handHeightRem: 3.75,
        handWidthRem: 7.5,
      };
  }
}

/**
 * Веер рубашек соперника: касательно к столу (локально: разворот относительно нижней кромки контейнера).
 */
export function opponentTableFanStyle(
  n: number,
  i: number,
  mults: OpponentFanMults,
): CSSProperties {
  if (n <= 0) return {};
  const mid = (n - 1) / 2;
  const rel = i - mid;
  if (n <= 1) {
    return {
      left: "50%",
      bottom: 0,
      transform: "translate(-50%, 0)",
      transformOrigin: "bottom center",
      zIndex: 20,
    };
  }
  const denom = Math.max(mid, 1e-6);
  const baseEdge = Math.min(20, 7 + n * 1.65);
  const edgeMaxDeg = baseEdge * mults.edgeMax;
  const rot = (rel / denom) * edgeMaxDeg;
  const baseStep = Math.min(16, Math.max(8, 92 / Math.max(n - 1, 1)));
  const stepPx = baseStep * mults.step;
  const tx = rel * stepPx;
  const arc = Math.abs(rel) * 0.38 * mults.arc;
  const zFromCenter = Math.round(4 * (mid - Math.abs(rel)));
  return {
    left: "50%",
    bottom: 0,
    transform: `translate(calc(-50% + ${tx}px), ${-arc}px) rotate(${rot}deg)`,
    transformOrigin: "bottom center",
    zIndex: 16 + zFromCenter + i,
  };
}
