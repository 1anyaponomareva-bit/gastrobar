/**
 * Единая геометрия сцены дурака: tableRect → opponent / table / player зоны.
 * Все координаты — от верха и левого края **игровой колонки** (без шапки сайта).
 */

/** Центр стола по вертикали: 52% высоты доступной игровой области. */
export const DURAK_SCENE_TABLE_CENTER_Y_RATIO = 0.52;

/** Для data-атрибутов / подписей; синхронно с `DURAK_SCENE_TABLE_CENTER_Y_RATIO`. */
export const DURAK_SCENE_TABLE_CENTER_Y_VH = Math.round(DURAK_SCENE_TABLE_CENTER_Y_RATIO * 100);

/** Жёсткий z-order сцены (не разбрасывать по компонентам). */
export const DURAK_Z_TABLE_SURFACE = 10;
export const DURAK_Z_DECK = 15;
export const DURAK_Z_TABLE_CARDS = 20;
export const DURAK_Z_OPPONENTS = 30;
export const DURAK_Z_PLAYER_HAND = 35;
export const DURAK_Z_CONTROLS = 40;
export const DURAK_Z_GAME_HEADER_BANNERS = 50;

/** Минимум между верхней границей круга стола и нижним краем веера соперника (px). */
export const DURAK_SCENE_OPPONENT_FAN_CLEAR_BELOW_TABLE_TOP_PX = 24;

/** Минимум между нижней границей круга стола и верхним краем зоны руки (px). */
export const DURAK_SCENE_HAND_CLEAR_ABOVE_TABLE_BOTTOM_PX = 24;

/** Нижний край веера игрока не ближе к верху таббара (px). */
export const DURAK_SCENE_HAND_CLEAR_ABOVE_TABBAR_PX = 16;

/** Резерв под нижний таббар + safe-area внутри сцены (px). */
export const DURAK_SCENE_TABBAR_RESERVE_PX = 92;

/**
 * Отступ слева для имени/руки, чтобы не наезжать на колоду в левой части стола.
 * Оценка: ~половина радиуса + запас.
 */
export function getDeckNameClearanceLeftPx(tableRadiusPx: number): number {
  return Math.min(220, Math.max(88, tableRadiusPx * 0.55 + 40));
}

/** Резерв под кнопки / фазу / имя внутри player zone (px). */
export const DURAK_SCENE_PLAYER_ZONE_CHROME_RESERVE_PX = 132;

export type DurakSceneZoneLayout = {
  sceneW: number;
  sceneH: number;
  centerX: number;
  centerY: number;
  tableTop: number;
  tableBottom: number;
  tableLeft: number;
  tableWidthPx: number;
  tableRadiusPx: number;
  orbitPxEff: number;
  /** Нижняя граница зоны соперников (y < tableTop - OPPONENT_FAN_CLEAR). */
  opponentZoneBottomY: number;
  /** Верхняя граница зоны игрока (кнопки, имя, рука). */
  playerZoneTopY: number;
  /** Нижняя граница контента игрока над таббаром. */
  playerZoneBottomY: number;
  /** Высота player zone между top и bottom (px). */
  playerZoneHeightPx: number;
  /** Макс. высота блока веера (px), чтобы не заезжать на стол при flex-сжатии. */
  maxPlayerHandHeightPx: number;
  tabBarReservePx: number;
  deckNameClearanceLeftPx: number;
};

/**
 * Одна точка правды: размеры сцены → стол по центру по вертикали, радиус от ширины стола.
 */
export function computeDurakSceneZoneLayout(sceneW: number, sceneH: number): DurakSceneZoneLayout {
  const W = Math.max(280, sceneW);
  const H = Math.max(320, sceneH);
  const tableW = Math.min(W * 0.86, 416, Math.min(W, H) * 0.76);
  const R = tableW / 2;
  const centerX = W / 2;
  const centerY = DURAK_SCENE_TABLE_CENTER_Y_RATIO * H;
  const tableTop = centerY - R;
  const tableBottom = centerY + R;
  const orbitPxEff = Math.max(8, tableW * 0.48);
  const tabBarReservePx = DURAK_SCENE_TABBAR_RESERVE_PX;
  const playerZoneTopY = tableBottom + DURAK_SCENE_HAND_CLEAR_ABOVE_TABLE_BOTTOM_PX;
  const playerZoneBottomYRaw = H - tabBarReservePx - DURAK_SCENE_HAND_CLEAR_ABOVE_TABBAR_PX;
  const playerZoneBottomY = Math.max(playerZoneTopY + 80, playerZoneBottomYRaw);
  const playerZoneHeightPx = Math.max(0, playerZoneBottomY - playerZoneTopY);
  const maxPlayerHandHeightPx = Math.max(
    100,
    playerZoneHeightPx - DURAK_SCENE_PLAYER_ZONE_CHROME_RESERVE_PX,
  );

  return {
    sceneW: W,
    sceneH: H,
    centerX,
    centerY,
    tableTop,
    tableBottom,
    tableLeft: centerX - R,
    tableWidthPx: tableW,
    tableRadiusPx: R,
    orbitPxEff,
    opponentZoneBottomY: Math.max(0, tableTop - DURAK_SCENE_OPPONENT_FAN_CLEAR_BELOW_TABLE_TOP_PX),
    playerZoneTopY,
    playerZoneBottomY,
    playerZoneHeightPx,
    maxPlayerHandHeightPx,
    tabBarReservePx,
    deckNameClearanceLeftPx: getDeckNameClearanceLeftPx(R),
  };
}
