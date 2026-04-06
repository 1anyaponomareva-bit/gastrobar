/**
 * Единая система координат игровой сцены (viewport, dvh/vh).
 * Все смещения по вертикали задаются здесь; режим 2–6 меняет только углы соперников.
 */

/** Центр круглого стола по вертикали — фиксировано. */
export const DURAK_SCENE_TABLE_CENTER_Y_VH = 50;

/** Зоны по спецификации (ориентиры, не все используются в расчётах). */
export const DURAK_SCENE_OPPONENT_ZONE_MIN_VH = 8;
export const DURAK_SCENE_OPPONENT_ZONE_MAX_VH = 28;

/** Нижняя граница якоря соперника (не выше этого Y от верха экрана — не «улетают» вверх). */
export const DURAK_SCENE_OPPONENT_ANCHOR_MIN_VH = 12;

/** Вертикаль центра веера руки игрока. */
export const DURAK_SCENE_PLAYER_HAND_CENTER_Y_VH = 82;

/** Центр веера не ниже этой линии (не уходит вниз за safe). */
export const DURAK_SCENE_PLAYER_HAND_CENTER_MAX_Y_VH = 85;

/** Зазор от обода стола до орбиты соперников — фиксированный px. */
export const DURAK_SCENE_PLAYER_ORBIT_GAP_PX = 60;

/** Сукно: соперник не ближе к центру, чем tableRadius + это (px от центра по oy). */
export const DURAK_SCENE_TABLE_OY_ABOVE_TABLE_PX = 20;

/** Масштаб руки игрока. */
export const DURAK_SCENE_PLAYER_HAND_SCALE = 0.95;

/** Суммарный размах веера руки (градусы между крайними картами), вилка 22–28°. */
export const DURAK_SCENE_PLAYER_HAND_FAN_TOTAL_DEG = 26;

/** Нижняя кромка зоны карт на столе не ниже (playerHandY − 120px) в координатах от верха viewport. */
export const DURAK_SCENE_TABLE_CARDS_BOTTOM_MARGIN_ABOVE_HAND_PX = 120;

/**
 * Кламп rimOy (смещение от центра стола в px, вниз +) после расчёта по орбите:
 * 12vh ≤ (centerY + rimOy) ≤ (centerY − tableRadiusPx − 20).
 */
export function clampOpponentRimOyViewportPx(params: {
  rimOy: number;
  viewportHeightPx: number;
  tableRadiusPx: number;
}): number {
  const { viewportHeightPx, tableRadiusPx } = params;
  let { rimOy } = params;
  const H = Math.max(320, viewportHeightPx);
  const centerY = 0.5 * H;
  const minAnchorY = (DURAK_SCENE_OPPONENT_ANCHOR_MIN_VH / 100) * H;
  const maxAnchorY = centerY - tableRadiusPx - DURAK_SCENE_TABLE_OY_ABOVE_TABLE_PX;
  const rimMin = minAnchorY - centerY;
  const rimMax = maxAnchorY - centerY;
  const lo = Math.min(rimMin, rimMax);
  const hi = Math.max(rimMin, rimMax);
  return Math.max(lo, Math.min(rimOy, hi));
}

/**
 * После клампа oy пересчитать ox на окружности радиуса r (центр стола в 0,0).
 */
export function radialOxForOyOnCircle(params: {
  rimOy: number;
  playerRadiusPx: number;
  angleDeg: number;
}): number {
  const { rimOy, playerRadiusPx, angleDeg } = params;
  const r = Math.max(1, playerRadiusPx);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const disc = r * r - rimOy * rimOy;
  if (disc <= 0) return 0;
  const mag = Math.sqrt(disc);
  return cosA >= 0 ? mag : -mag;
}

/**
 * Смещение центра пары вниз от центра стола (px); низ карты не ниже (playerHandY − 120px) по viewport.
 */
export function clampTablePairOffsetYPx(params: {
  y: number;
  viewportHeightPx: number;
  orbitBattlePx: number;
}): number {
  const H = Math.max(320, params.viewportHeightPx);
  const centerY = 0.5 * H;
  const approxCardHalf = 68;
  const maxBottomViewport =
    (DURAK_SCENE_PLAYER_HAND_CENTER_Y_VH / 100) * H -
    DURAK_SCENE_TABLE_CARDS_BOTTOM_MARGIN_ABOVE_HAND_PX;
  const maxYDownFromCenter = maxBottomViewport - centerY - approxCardHalf;
  const orbitCap = params.orbitBattlePx * 0.62;
  const cap = Math.min(maxYDownFromCenter, orbitCap);
  if (params.y <= cap) return params.y;
  return cap;
}
