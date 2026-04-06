/**
 * Единая сцена дурака: всё строится от центра стола (tableY).
 * `H` в getTableCenterYPx / getPlayerHandCenterYPx — высота **колонки сцены** (между хедером и таббаром), не `window.innerHeight`.
 */

/** Центр круглого стола по вертикали (доля высоты экрана) — чуть ниже геометрического центра. */
export const DURAK_SCENE_TABLE_CENTER_Y_VH = 55;

/** Зазор «сукно — соперник» по вертикали (40–70px), фиксированное значение по умолчанию. */
export const DURAK_SCENE_OPPONENT_GAP_ABOVE_TABLE_PX = 50;
export const DURAK_SCENE_OPPONENT_GAP_ABOVE_TABLE_MIN_PX = 40;
export const DURAK_SCENE_OPPONENT_GAP_ABOVE_TABLE_MAX_PX = 70;

/** Горизонтальный вылет якоря соперника от центра стола (px): ox = cos(θ)·(tableRadius + это). */
export const DURAK_SCENE_OPPONENT_HORIZONTAL_ORBIT_PX = 60;

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
  return (DURAK_SCENE_TABLE_CENTER_Y_VH / 100) * H;
}

/** Зазор «над сукном» в px с учётом вилки 40–70. */
export function getOpponentGapAboveTablePx(): number {
  return Math.min(
    DURAK_SCENE_OPPONENT_GAP_ABOVE_TABLE_MAX_PX,
    Math.max(DURAK_SCENE_OPPONENT_GAP_ABOVE_TABLE_MIN_PX, DURAK_SCENE_OPPONENT_GAP_ABOVE_TABLE_PX),
  );
}

/**
 * Локальный oy якоря соперника от центра стола: прямо над столом.
 * opponentY (viewport) = tableY + rimOy = tableY - tableRadius - gap.
 */
export function getOpponentRimOyPx(tableRadiusPx: number): number {
  return -tableRadiusPx - getOpponentGapAboveTablePx();
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
 * centerY стола = 55% высоты сцены.
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

/** orbitBattlePx = getBattleAreaOrbitPx(...); восстановить tableRadius как в engine. */
function getTableRadiusFromOrbitBattle(orbitBattlePx: number): number {
  const o = orbitBattlePx / 0.78;
  return o / 0.96;
}
