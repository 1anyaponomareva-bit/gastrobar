/**
 * Единая сцена дурака: всё строится от центра стола (tableY).
 * `H` в getTableCenterYPx / getPlayerHandCenterYPx — высота **колонки сцены** (между хедером и таббаром), не `window.innerHeight`.
 */

import { DURAK_SCENE_TABLE_CENTER_Y_RATIO } from "./durakSceneZones";

export { DURAK_SCENE_TABLE_CENTER_Y_VH } from "./durakSceneZones";

/** Высота компактной карты на столе (px) — для расчёта «¼ на сукне». */
export const DURAK_SCENE_OPPONENT_COMPACT_CARD_HEIGHT_PX = 60;

/** Доля высоты карты на зелёном сукне (остальное — на чёрном фоне). */
export const DURAK_SCENE_OPPONENT_ON_FELT_CARD_FRACTION = 0.25;

/**
 * Оценка: от якоря веера вдоль радиуса к столу до ближайшей к центру кромки карт (px).
 * Якорь = center + (nx,ny)·d; ближайшая к столу кромка ≈ d − halfH; задаём d − halfH = R − fraction·h.
 */
export const DURAK_SCENE_OPPONENT_FAN_HALF_HEIGHT_EST_PX = 46;

/**
 * Радиус до центра якоря веера на луче сиденья: на окружности стола с учётом ¼ карты на сукне.
 * d = R − fraction·h + halfH (для всех углов θ одна и та же логика).
 */
export function getOpponentFanAnchorRadialDistPx(tableRadiusPx: number): number {
  const R = Math.max(1, tableRadiusPx);
  const h = DURAK_SCENE_OPPONENT_COMPACT_CARD_HEIGHT_PX;
  const halfH = DURAK_SCENE_OPPONENT_FAN_HALF_HEIGHT_EST_PX;
  return R - DURAK_SCENE_OPPONENT_ON_FELT_CARD_FRACTION * h + halfH;
}

/** Центр веера руки: tableY + tableRadius + это (px). */
export const DURAK_SCENE_HAND_OFFSET_BELOW_TABLE_PX = 80;

/** Вилка центра руки по высоте экрана (после формулы — мягкий кламп). */
export const DURAK_SCENE_PLAYER_HAND_CENTER_MIN_VH = 78;
export const DURAK_SCENE_PLAYER_HAND_CENTER_MAX_VH = 82;

/** Минимум отступа нижней кромки веера от таббара / safe (px). */
export const DURAK_SCENE_HAND_BOTTOM_CLEARANCE_PX = 20;

/** Резерв под нижний бар + safe-area (оценка для клампа центра руки). */
export const DURAK_SCENE_BOTTOM_UI_RESERVE_PX = 96;

/** Сукно: карты боя не заходят слишком близко к центру по oy (локально от центра стола). */
export const DURAK_SCENE_TABLE_OY_ABOVE_TABLE_PX = 20;

/** Масштаб руки игрока. */
export const DURAK_SCENE_PLAYER_HAND_SCALE = 0.95;

/** Суммарный размах веера руки (градусы между крайними картами). */
export const DURAK_SCENE_PLAYER_HAND_FAN_TOTAL_DEG = 26;

/** Нижняя кромка карт на столе — запас над зоной руки (px от низа экрана к логике clamp). */
export const DURAK_SCENE_TABLE_CARDS_BOTTOM_MARGIN_ABOVE_HAND_PX = 100;

export function getTableCenterYPx(viewportHeightPx: number): number {
  const H = Math.max(320, viewportHeightPx);
  return DURAK_SCENE_TABLE_CENTER_Y_RATIO * H;
}

/**
 * Центр веера руки: tableY + tableRadius + 80px, затем кламп в 78–82% и от таббара.
 */
export function getPlayerHandCenterYPx(
  sceneHeightPx: number,
  tableRadiusPx: number,
): number {
  const H = Math.max(320, sceneHeightPx);
  const tableY = getTableCenterYPx(sceneHeightPx);
  let y = tableY + tableRadiusPx + DURAK_SCENE_HAND_OFFSET_BELOW_TABLE_PX;
  const lo = (DURAK_SCENE_PLAYER_HAND_CENTER_MIN_VH / 100) * H;
  const hi = (DURAK_SCENE_PLAYER_HAND_CENTER_MAX_VH / 100) * H;
  y = Math.max(lo, Math.min(y, hi));
  const maxY =
    H -
    DURAK_SCENE_BOTTOM_UI_RESERVE_PX -
    DURAK_SCENE_HAND_BOTTOM_CLEARANCE_PX -
    88;
  if (y > maxY) y = Math.max(lo, maxY);
  return y;
}

/**
 * Смещение пар на столе вниз от центра стола: низ карт не уходит в зону руки.
 * centerY стола — `DURAK_SCENE_TABLE_CENTER_Y_RATIO` из `durakSceneZones`.
 */
export function clampTablePairOffsetYPx(params: {
  y: number;
  sceneHeightPx: number;
  orbitBattlePx: number;
}): number {
  const H = Math.max(320, params.sceneHeightPx);
  const centerY = getTableCenterYPx(params.sceneHeightPx);
  const approxCardHalf = 68;
  const handCenterPx = getPlayerHandCenterYPx(params.sceneHeightPx, getTableRadiusFromOrbitBattle(params.orbitBattlePx));
  const maxBottomViewport = handCenterPx - DURAK_SCENE_TABLE_CARDS_BOTTOM_MARGIN_ABOVE_HAND_PX;
  const maxYDownFromCenter = maxBottomViewport - centerY - approxCardHalf;
  const orbitCap = params.orbitBattlePx * 0.62;
  const cap = Math.min(maxYDownFromCenter, orbitCap);
  if (params.y <= cap) return params.y;
  return cap;
}

/** orbitBattlePx = getBattleAreaOrbitPx(...); синхронно с `DURAK_TABLE_BATTLE_ORBIT_MULT` в engine. */
function getTableRadiusFromOrbitBattle(orbitBattlePx: number): number {
  const o = orbitBattlePx / 0.68;
  return o / 0.96;
}
