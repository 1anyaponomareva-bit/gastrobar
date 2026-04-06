/**
 * Геометрия рассадки вокруг круглого стола (мобильный UI).
 *
 * Конвенция углов (как в тригонометрии на экране, y вниз):
 *   x = cx + r * cos(θ),   y = cy + r * sin(θ)
 *   0° = вправо, 90° = низ (место локального игрока), 180° = влево, -90° = верх.
 *
 * Локальный игрок всегда внизу при θ = 90°. Соперники в порядке
 * `otherPlayersClockwiseFromLocal` — по часовой стрелке от локального вдоль окружности.
 * Угла сидений и радиус обода — в `durakTableLayoutEngine.ts`.
 */

import type { CSSProperties } from "react";

export function normalizeAngleDeg180(a: number): number {
  let x = a;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/** Смещение центра якоря сиденья от центра стола: ox вправо, oy вниз (px). */
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

/** Поворот контейнера веера: локально «верх» веера направлен к центру стола. */
export function fanContainerRotationDeg(seatAngleDeg: number): number {
  return normalizeAngleDeg180(seatAngleDeg - 90);
}

export type OpponentFanMults = {
  edgeMax: number;
  step: number;
  arc: number;
  scale: number;
  handHeightRem: number;
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
 * Веер рубашек соперника: касательно к столу (локально от нижней кромки контейнера).
 * `compact`: узкий веер, при n > 4 дополнительно ужимает шаг (перекрытие вместо ширины).
 */
export function opponentTableFanStyle(
  n: number,
  i: number,
  mults: OpponentFanMults,
  fanTightness = 1,
  opts?: { compact?: boolean; durakOpponent?: boolean },
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
  const t = Math.max(0.35, Math.min(1.25, fanTightness));
  const denom = Math.max(mid, 1e-6);
  const baseEdge = Math.min(20, 7 + n * 1.65);
  let edgeMaxDeg = baseEdge * mults.edgeMax * t;
  if (opts?.durakOpponent) {
    edgeMaxDeg = Math.min(edgeMaxDeg, 15);
  }
  const baseStep = Math.min(16, Math.max(8, 92 / Math.max(n - 1, 1)));
  let stepPx = baseStep * mults.step * t;
  let arc = Math.abs(rel) * 0.38 * mults.arc * t;
  if (opts?.compact) {
    edgeMaxDeg *= 0.72;
    stepPx *= 0.55;
    stepPx /= 1 + Math.max(0, n - 4) * 0.16;
    arc *= 0.78;
  }
  const rot = (rel / denom) * edgeMaxDeg;
  const tx = rel * stepPx;
  const zFromCenter = Math.round(4 * (mid - Math.abs(rel)));
  return {
    left: "50%",
    bottom: 0,
    transform: `translate(calc(-50% + ${tx}px), ${-arc}px) rotate(${rot}deg)`,
    transformOrigin: "bottom center",
    zIndex: 16 + zFromCenter + i,
  };
}
