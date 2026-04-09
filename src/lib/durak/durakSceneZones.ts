/**
 * Единая геометрия сцены дурака: tableRect → opponent / table / player зоны.
 * Все координаты — от верха и левого края **игровой колонки** (без шапки сайта).
 *
 * -----------------------------------------------------------------------------
 * КАНОНИЧЕСКИЙ LAYOUT (фиксирован; менять только осознанно, 2–6 игроков):
 * - Стол: круг по `computeDurakSceneZoneLayout`, центр по `DURAK_SCENE_TABLE_CENTER_Y_RATIO`,
 *   блок сукна отдельно; бой и колода — отдельный слой того же box (см. `DurakGame.tsx`).
 * - Соперники: якорь на окружности, доля сукна — `durakSceneLayout` + `durakTableLayoutEngine`.
 * - Z-order: см. `DURAK_Z_*` ниже; строка состояния и кнопки выше веера (текст не перекрывается). На /durak `BottomNav` выше руки.
 * - Нижняя чёрная колонка (`DurakGame`): кнопки (лёгкий -mt) → панель `phaseLine` + `game.message`
 *   (серой italic-приписки / microFlavour нет) → ряд «имя слева | веер», отступ pt между статусом и рукой.
 * - Низ зоны игрока у края сцены (кроме небольшого safe-area); веер может заходить под плавающее меню.
 * -----------------------------------------------------------------------------
 */

/**
 * Центр стола по вертикали сцены (доля ниже topInset). Меньше — стол и соперники выше,
 * меньше «чёрная полоса» под сайт-хедером, ниже зона руки и проще уместить веер над таббаром.
 */
export const DURAK_SCENE_TABLE_CENTER_Y_RATIO = 0.30;

/** Для data-атрибутов / подписей; синхронно с `DURAK_SCENE_TABLE_CENTER_Y_RATIO`. */
export const DURAK_SCENE_TABLE_CENTER_Y_VH = Math.round(DURAK_SCENE_TABLE_CENTER_Y_RATIO * 100);

/**
 * Z-order: … → колода → рука (низ) → кнопки → статус → баннеры.
 * Веер может геометрически заходить вверх — строка состояния всё равно рисуется поверх.
 */
export const DURAK_Z_TABLE_SURFACE = 10;
export const DURAK_Z_OPPONENTS = 20;
export const DURAK_Z_TABLE_CARDS = 25;
export const DURAK_Z_DECK = 30;
/** Веер и имя: ниже кнопок и строки состояния. */
export const DURAK_Z_PLAYER_HAND = 32;
export const DURAK_Z_CONTROLS = 40;
/** Поверх кнопок и руки, чтобы текст фазы оставался читаемым. */
export const DURAK_Z_STATUS_LINE = 48;
export const DURAK_Z_GAME_HEADER_BANNERS = 50;

/** Минимум между верхней границей круга стола и нижним краем веера соперника (px). */
export const DURAK_SCENE_OPPONENT_FAN_CLEAR_BELOW_TABLE_TOP_PX = 18;

/** Низ стола → верх чёрной зоны (не менять без нужды: влияет на всю нижнюю колонку). */
export const DURAK_SCENE_HAND_CLEAR_ABOVE_TABLE_BOTTOM_PX = 6;

/** Небольшой зазор над нижним краем сцены (устар. для формулы высоты зоны — см. `playerZoneBottomInsetPx`). */
export const DURAK_SCENE_HAND_CLEAR_ABOVE_TABBAR_PX = 0;

/**
 * Раньше резерв под таббар внутри сцены; сейчас рука опускается вниз, меню приложения — поверх (`BottomNav` z-index).
 * Оставлено для совместимости импортов.
 */
export const DURAK_SCENE_TABBAR_RESERVE_PX = 102;

/** Горизонтальный внутренний отступ в нижней зоне (имя слева от руки; не связано с колодой на столе). */
export function getDeckNameClearanceLeftPx(_tableRadiusPx: number): number {
  return 10;
}

/**
 * Резерв под кнопки и блок состояния над «имя | рука» (px).
 * Растёт вместе с подъёмом стола — иначе max высота веера «съедает» зазор под статусом.
 */
export const DURAK_SCENE_PLAYER_ZONE_CHROME_RESERVE_PX = 212;

export type DurakSceneZoneLayoutOptions = {
  /** Доп. отступ сверху: статус-бар / вырез; сдвигает стол и зоны вниз. */
  topInsetPx?: number;
  /**
   * Доп. сдвиг сцены вниз (px): фиксированный хедер сайта, Chrome `visualViewport`,
   * чтобы метки соперников не заезжали под шапку.
   */
  layoutExtraTopPx?: number;
  /** Доп. снизу: home indicator / жесты + запас поверх фиксированного таббара. */
  bottomInsetPx?: number;
};

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
  /** Нижняя граница контента игрока у низа сцены (см. `playerZoneBottomInsetPx`). */
  playerZoneBottomY: number;
  /** Высота player zone между top и bottom (px). */
  playerZoneHeightPx: number;
  /** Макс. высота блока веера (px), чтобы не заезжать на стол при flex-сжатии. */
  maxPlayerHandHeightPx: number;
  /** CSS `bottom` и зазор от нижнего края сцены (не резерв под меню приложения). */
  playerZoneBottomInsetPx: number;
  /** @deprecated Используйте `playerZoneBottomInsetPx` (оставлено как алиас). */
  tabBarReservePx: number;
  deckNameClearanceLeftPx: number;
};

/**
 * Одна точка правды: размеры сцены → стол по центру по вертикали, радиус от ширины стола.
 */
export function computeDurakSceneZoneLayout(
  sceneW: number,
  sceneH: number,
  options?: DurakSceneZoneLayoutOptions,
): DurakSceneZoneLayout {
  const W = Math.max(280, sceneW);
  const H = Math.max(320, sceneH);
  const topInset =
    Math.max(0, options?.topInsetPx ?? 0) + Math.max(0, options?.layoutExtraTopPx ?? 0);
  const bottomInset = Math.max(0, options?.bottomInsetPx ?? 0);
  const layoutH = Math.max(240, H - topInset);
  const tableW = Math.min(W * 0.86, 416, Math.min(W, H) * 0.76);
  const R = tableW / 2;
  const centerX = W / 2;
  const centerY = topInset + DURAK_SCENE_TABLE_CENTER_Y_RATIO * layoutH;
  const tableTop = centerY - R;
  const tableBottom = centerY + R;
  const orbitPxEff = Math.max(8, tableW * 0.48);
  /** Только safe-area / жесты; без «высоты таббара» — веер уходит под фикс-меню. */
  const playerZoneBottomInsetPx = Math.max(
    6,
    Math.min(bottomInset + 4, 26),
  );
  const playerZoneTopY = tableBottom + DURAK_SCENE_HAND_CLEAR_ABOVE_TABLE_BOTTOM_PX;
  const playerZoneBottomYRaw = H - playerZoneBottomInsetPx - DURAK_SCENE_HAND_CLEAR_ABOVE_TABBAR_PX;
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
    playerZoneBottomInsetPx,
    tabBarReservePx: playerZoneBottomInsetPx,
    deckNameClearanceLeftPx: getDeckNameClearanceLeftPx(R),
  };
}
