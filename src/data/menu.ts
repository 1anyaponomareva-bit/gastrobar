export type BarSubcategory = "cocktail" | "wine" | "beer" | "tincture" | "snacks";
export type MenuSubcategory = "snack" | "sausage" | "dumpling";

/** Группа вкуса кальяна — вкладки сортировки в меню. */
export type HookahFlavorCategory = "sweet" | "sour" | "fresh" | "herbal";

export type MenuItemCategory = "food" | "cocktail" | "hookah";

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  image: string;
  /** Изображение для горизонтального списка (в полноэкранном виде используется image) */
  imageList?: string;
  category: MenuItemCategory;
  price: string; // VND
  grammage?: string;
  barSubcategory?: BarSubcategory; // напитки; «snacks» не на карточке — только вкладка
  menuSubcategory?: MenuSubcategory; // тип снека (закуски / сосиски / пельмени)
  /** Бейдж «Хит продаж» / рекомендация (огонёк) */
  badge?: "hit";
  /** Вкус: короткая строка под напитком, напр. "кисло-сладкий, виски, лимон, мёд" */
  taste?: string;
  /** Для кальяна: бренд табака (показывается на карточке) */
  tobacco?: string;
  /** Для кальяна: вкусовая смесь */
  flavor?: string;
  /** Кальян: вкладка вкуса (Сладкие / Кислые / …) */
  hookahFlavorCategory?: HookahFlavorCategory;
  /** Бейдж крепости (напитки: слабый; кальян: лёгкий и т.д.) */
  strength?: "weak" | "medium" | "strong";
  /** Пометки для снеков: к пиву, к коктейлям, к вину (можно несколько) */
  pairing?: ("beer" | "cocktail" | "wine")[];
};

export const MENU_ITEMS: MenuItem[] = [
  // БАР (порядок: коктейли → вино → пиво → настойки)
  {
    id: "b52",
    name: "Б-52",
    description: "Легендарный слоистый шот из кофейного ликера, сливочного крема и апельсинового трипл-сек.",
    image: "/menu/cocktail_b52_ultra.png",
    imageList: "/menu/cocktail-b52-horizontal-hero.png",
    category: "cocktail",
    price: "95000",
    barSubcategory: "cocktail",
    badge: "hit",
    taste: "сладкий, кофе, сливки, апельсин",
    strength: "strong",
  },
  {
    id: "whisky-sour",
    name: "Виски Сауэр",
    description: "Баланс выдержанного бурбона, лимона и нежной пенки.",
    image: "/menu/cocktail_whisky_sour_ultra.png",
    imageList: "/menu/cocktail-whisky-sour-horizontal-hero.png",
    category: "cocktail",
    price: "135000",
    barSubcategory: "cocktail",
    badge: "hit",
    taste: "кисло-сладкий, виски, лимон, мёд",
    strength: "strong",
  },
  {
    id: "whisky-cola",
    name: "Виски Кола",
    description: "Классический дуэт с глубоким древесным ароматом.",
    image: "/menu/cocktail_whisky_cola_ultra.png",
    imageList: "/menu/cocktail-whisky-cola-horizontal-hero.png",
    category: "cocktail",
    price: "115000",
    barSubcategory: "cocktail",
    taste: "виски, кола, лёгкая сладость",
    strength: "strong",
  },
  {
    id: "long-island",
    name: "Лонг Айленд",
    description: "Мощный микс пяти видов крепкого алкоголя.",
    image: "/menu/cocktail_long_island_ultra.png",
    imageList: "/menu/cocktail-long-island-horizontal-hero.png",
    category: "cocktail",
    price: "175000",
    barSubcategory: "cocktail",
    taste: "крепкий, лимон, кола, текила, джин, ром, водка",
    strength: "strong",
  },
  {
    id: "boulevardier",
    name: "Бульвардье",
    description: "Бурбон, Campari и сладкий вермут. Элегантная классика.",
    image: "/menu/cocktail_boulevardier_ultra.png",
    imageList: "/menu/cocktail-boulevardier-horizontal-hero.png",
    category: "cocktail",
    price: "155000",
    barSubcategory: "cocktail",
    taste: "горьковатый, бурбон, кампари, вермут",
    strength: "strong",
  },
  {
    id: "aperol",
    name: "Апероль Шприц",
    description: "Искристое просекко, биттер Aperol и освежающий всплеск содовой.",
    image: "/menu/cocktail_aperol_ultra.png",
    imageList: "/menu/cocktail-aperol-spritz-horizontal-hero.png",
    category: "cocktail",
    price: "145000",
    barSubcategory: "cocktail",
    taste: "горьковато-сладкий, апероль, просекко, апельсин",
    strength: "weak",
  },
  {
    id: "negroni",
    name: "Негрони",
    description: "Джин, кампари и красный вермут. Горьковатая классика.",
    image: "/menu/cocktail_negroni_ultra.png",
    imageList: "/menu/cocktail-negroni-horizontal-hero.png",
    category: "cocktail",
    price: "155000",
    barSubcategory: "cocktail",
    taste: "горький, джин, кампари, вермут",
    strength: "strong",
  },
  {
    id: "gin-tonic",
    name: "Джин-тоник",
    description: "Кристальная свежесть можжевельника и лайма.",
    image: "/menu/cocktail_gin_tonic_ultra.png",
    imageList: "/menu/cocktail-gin-tonic-horizontal-hero.png",
    category: "cocktail",
    price: "125000",
    barSubcategory: "cocktail",
    taste: "свежий, джин, тоник, лайм, можжевельник",
    strength: "medium",
  },
  {
    id: "white-wine",
    name: "Белое вино",
    description: "Элегантный выбор с тонкими фруктовыми нотами и освежающей минеральностью.",
    image: "/menu/cocktail_white_wine_ultra.png",
    imageList: "/menu/cocktail-white-wine-horizontal-hero.png",
    category: "cocktail",
    price: "120000",
    barSubcategory: "wine",
    taste: "лёгкое, фруктовое, минеральное",
    strength: "weak",
  },
  {
    id: "red-wine",
    name: "Красное вино",
    description: "Полнотелое вино с богатым букетом темных ягод.",
    image: "/menu/cocktail_red_wine_ultra.png",
    imageList: "/menu/cocktail-red-wine-horizontal-hero.png",
    category: "cocktail",
    price: "120000",
    barSubcategory: "wine",
    taste: "полнотелое, ягодное, терпкое",
    strength: "medium",
  },
  {
    id: "beer-light",
    name: "Светлое пиво Sapporo",
    description: "Свежее светлое пиво разливное.",
    image: "/menu/cocktail_light_beer_ultra.png",
    imageList: "/menu/cocktail-light-beer-horizontal-hero.png",
    category: "cocktail",
    price: "75000",
    barSubcategory: "beer",
    taste: "светлое, лёгкое, хмельное",
    strength: "weak",
  },
  {
    id: "beer-dark",
    name: "Тёмное пиво Sapporo",
    description: "Тёмное пиво с карамельными нотами.",
    image: "/menu/cocktail_dark_beer_ultra.png",
    imageList: "/menu/cocktail-dark-beer-horizontal-hero.png",
    category: "cocktail",
    price: "85000",
    barSubcategory: "beer",
    taste: "тёмное, карамель, солод",
    strength: "weak",
  },
  {
    id: "tincture-passion",
    name: "Настойка Маракуйя",
    description: "Авторский крафт с взрывным тропическим вкусом.",
    image: "/menu/cocktail_tincture_passion_ultra.png",
    imageList: "/menu/cocktail-passion-fruit-horizontal-hero.png",
    category: "cocktail",
    price: "60000",
    barSubcategory: "tincture",
    taste: "сладкий, маракуйя, тропический",
    strength: "medium",
  },
  {
    id: "limoncello",
    name: "Лимончелло",
    description: "Солнечный дижестив на основе лимонной цедры.",
    image: "/menu/cocktail_tincture_lemoncello_ultra.png",
    imageList: "/menu/cocktail-limoncello-horizontal-hero.png",
    category: "cocktail",
    price: "60000",
    barSubcategory: "tincture",
    badge: "hit",
    taste: "сладкий, лимон, цедра, освежающий",
    strength: "medium",
  },
  // СНЕКИ в общем списке «Бар» после напитков
  {
    id: "chicken-jerky",
    name: "Джерки куриные",
    description: "Пряные вяленые куриные джерки. Идеально к пиву.",
    image: "/menu/food-chicken-jerky-horizontal-hero.png",
    imageList: "/menu/food-chicken-jerky-horizontal-hero.png",
    category: "food",
    price: "95000",
    menuSubcategory: "snack",
    badge: "hit",
    pairing: ["beer", "cocktail"],
  },
  {
    id: "beef-jerky",
    name: "Джерки говядина",
    description: "Вяленая говядина с пряностями. Насыщенный вкус к пиву.",
    image: "/menu/food-beef-jerky-horizontal-hero.png",
    imageList: "/menu/food-beef-jerky-horizontal-hero.png",
    category: "food",
    price: "115000",
    menuSubcategory: "snack",
    badge: "hit",
    pairing: ["beer", "cocktail"],
  },
  {
    id: "smoked-cheese",
    name: "Сыр косичка",
    description: "Копчёный сыр косичка. Идеально к пиву и вину.",
    image: "/menu/food-smoked-cheese-horizontal-hero.png",
    imageList: "/menu/food-smoked-cheese-horizontal-hero.png",
    category: "food",
    price: "75000",
    menuSubcategory: "snack",
    pairing: ["beer", "wine"],
  },
  {
    id: "pistachios",
    name: "Фисташки",
    description: "Обжаренные солёные фисташки к пиву и коктейлям.",
    image: "/menu/snack_pistachios_ultra.png",
    imageList: "/menu/food-pistachios-horizontal-hero.png",
    category: "food",
    price: "55000",
    menuSubcategory: "snack",
    pairing: ["beer", "cocktail"],
  },
  {
    id: "peanuts",
    name: "Арахис",
    description: "Хрустящий солёный арахис. Классический барный снэк.",
    image: "/menu/snack_peanuts_ultra.png",
    imageList: "/menu/food-peanuts-horizontal-hero.png",
    category: "food",
    price: "45000",
    menuSubcategory: "snack",
    pairing: ["beer", "cocktail"],
  },
  {
    id: "dried-squid",
    name: "Сушеный кальмар",
    description: "Вяленый кальмар. Классическая закуска к пиву.",
    image: "/menu/food-dried-squid-horizontal-hero.png",
    imageList: "/menu/food-dried-squid-horizontal-hero.png",
    category: "food",
    price: "85000",
    menuSubcategory: "snack",
    pairing: ["beer"],
  },
];

/** Кальяны: те же бейджи хит / крепость; табак и вкус — на правой колонке карточки. Фото — `public/hookah/`. */
const HOOKAH_PRICE = "490000";
const HOOKAH_GRAMMAGE = "50–60 мин";

export const HOOKAH_MENU_ITEMS: MenuItem[] = [
  {
    id: "hookah-black-burn-brownie",
    name: "Брауни",
    description:
      "Это удачное сочетание нот ванили, корицы и шоколада. С первой затяжки — вкус любимого десерта.",
    image: "/hookah/brownie.png",
    imageList: "/hookah/brownie.png",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    badge: "hit",
    tobacco: "Black Burn",
    flavor: "Brownie",
    strength: "weak",
    hookahFlavorCategory: "sweet",
  },
  {
    id: "hookah-black-burn-elka",
    name: "Ёлка",
    description:
      "Хвойная смола и прохлада хвои с лёгким эвкалиптовым акцентом — как зимняя прогулка по лесу.",
    image: "/hookah/elka.png",
    imageList: "/hookah/elka.png",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Black Burn",
    flavor: "Elka",
    strength: "medium",
    hookahFlavorCategory: "herbal",
  },
  {
    id: "hookah-black-burn-pomelo",
    name: "Помело",
    description:
      "Терпкий цитрус: кисло-сладкий профиль помело с приятной горечью на выдохе.",
    image: "/hookah/pomelo.png",
    imageList: "/hookah/pomelo.png",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Black Burn",
    flavor: "Pomelo",
    strength: "medium",
    hookahFlavorCategory: "sour",
  },
  {
    id: "hookah-black-burn-shock-currant",
    name: "Shock, Currant shock",
    description:
      "Яркий кислый микс красной и чёрной смородины: сочный вдох и глубокий ягодный выдох.",
    image: "/hookah/ShockCurrant.png",
    imageList: "/hookah/ShockCurrant.png",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Black Burn",
    flavor: "Shock Currant",
    strength: "medium",
    hookahFlavorCategory: "sour",
  },
  {
    id: "hookah-black-burn-strawberry-jam",
    name: "Strawberry Jam",
    description:
      "Насыщенный аромат клубничного джема: сладко, ягодно, без приторности.",
    image: "/hookah/BlackBurnStrawberryJam.jpg",
    imageList: "/hookah/BlackBurnStrawberryJam.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Black Burn",
    flavor: "Strawberry Jam",
    strength: "weak",
    hookahFlavorCategory: "sweet",
  },
  {
    id: "hookah-darkside-basil-blast",
    name: "Basil Blast",
    description:
      "Табак Darkside CORE: базилик и свежие травяные ноты с бодрым послевкусием.",
    image: "/hookah/DarksideCOREBasilBlast.jpg",
    imageList: "/hookah/DarksideCOREBasilBlast.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Basil Blast",
    strength: "medium",
    hookahFlavorCategory: "herbal",
  },
  {
    id: "hookah-darkside-cosmo-flower",
    name: "Cosmo Flower",
    description:
      "Цветочный микс с лёгкой сладостью и освежающим паром — универсально в любое время.",
    image: "/hookah/DarksideCORECosmoFlower.jpg",
    imageList: "/hookah/DarksideCORECosmoFlower.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Cosmo Flower",
    strength: "medium",
    hookahFlavorCategory: "fresh",
  },
  {
    id: "hookah-darkside-dark-supra",
    name: "Dark Supra",
    description:
      "Насыщенный микс линейки CORE: глубокий профиль для любителей выразительного дыма.",
    image: "/hookah/DarksideCOREDarkSupra.jpg",
    imageList: "/hookah/DarksideCOREDarkSupra.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Dark Supra",
    strength: "strong",
    hookahFlavorCategory: "herbal",
  },
  {
    id: "hookah-darkside-falling-star",
    name: "Falling Star",
    description:
      "Светлый фруктово-ягодный акцент; баланс сладости и свежести.",
    image: "/hookah/DarksideCOREFallingStar.jpg",
    imageList: "/hookah/DarksideCOREFallingStar.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Falling Star",
    strength: "medium",
    hookahFlavorCategory: "fresh",
  },
  {
    id: "hookah-darkside-generis-raspberry",
    name: "Generis Raspberry",
    description:
      "Ягодная малина: яркий вкус и аромат спелой малины.",
    image: "/hookah/DarksideCOREGenerisRaspberry.jpg",
    imageList: "/hookah/DarksideCOREGenerisRaspberry.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Generis Raspberry",
    strength: "medium",
    hookahFlavorCategory: "sweet",
  },
  {
    id: "hookah-darkside-lemonblast",
    name: "Lemonblast",
    description:
      "Цитрусовый заряд лимона: кислинка, которая освежает с первой же чаши.",
    image: "/hookah/DarksideCORELemonblast.jpg",
    imageList: "/hookah/DarksideCORELemonblast.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Lemonblast",
    strength: "medium",
    hookahFlavorCategory: "sour",
  },
  {
    id: "hookah-darkside-nordberry",
    name: "Nordberry",
    description:
      "Северные ягоды: сладковато-дикий профиль с лёгкой кислинкой.",
    image: "/hookah/DarksideCORENordberry.jpg",
    imageList: "/hookah/DarksideCORENordberry.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Nordberry",
    strength: "medium",
    hookahFlavorCategory: "fresh",
  },
  {
    id: "hookah-darkside-red-rush",
    name: "Red Rush",
    description:
      "Яркий «красный» микс: энергичный ягодно-фруктовый характер.",
    image: "/hookah/DarksideCORERedRush.jpg",
    imageList: "/hookah/DarksideCORERedRush.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Red Rush",
    strength: "medium",
    hookahFlavorCategory: "sour",
  },
  {
    id: "hookah-darkside-tropic-ray",
    name: "Tropic Ray",
    description:
      "Тропики в чаше: сочные фруктовые ноты и летняя свежесть.",
    image: "/hookah/DarksideCORETropicRay.jpg",
    imageList: "/hookah/DarksideCORETropicRay.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Darkside CORE",
    flavor: "Tropic Ray",
    strength: "medium",
    hookahFlavorCategory: "fresh",
  },
  {
    id: "hookah-musthave-mandarin",
    name: "Mandarin",
    description:
      "Must Have: сочный мандарин — цитрусовая сладость и яркий аромат кожуры.",
    image: "/hookah/MusthaveMandarin.jpg",
    imageList: "/hookah/MusthaveMandarin.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Must Have",
    flavor: "Mandarin",
    strength: "medium",
    hookahFlavorCategory: "fresh",
  },
  {
    id: "hookah-musthave-nord-star",
    name: "Nord Star",
    description:
      "Must Have: прохладный северный профиль — свежесть и лёгкая сладость.",
    image: "/hookah/MusthaveNordStar.jpg",
    imageList: "/hookah/MusthaveNordStar.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Must Have",
    flavor: "Nord Star",
    strength: "medium",
    hookahFlavorCategory: "fresh",
  },
  {
    id: "hookah-musthave-rocketman",
    name: "Rocketman",
    description:
      "Must Have: насыщенный фирменный микс — сладкий яркий вкус и стойкий дым.",
    image: "/hookah/MusthaveRocketman.jpg",
    imageList: "/hookah/MusthaveRocketman.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Must Have",
    flavor: "Rocketman",
    strength: "medium",
    hookahFlavorCategory: "sweet",
  },
  {
    id: "hookah-overdose-overcola",
    name: "Overcola",
    description:
      "Overdose: кола в классическом прочтении — газировка, карамель и сладость.",
    image: "/hookah/OverdoseOvercola.jpg",
    imageList: "/hookah/OverdoseOvercola.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Overdose",
    flavor: "Overcola",
    strength: "weak",
    hookahFlavorCategory: "sweet",
  },
  {
    id: "hookah-overdose-peach-iced-tea",
    name: "Peach Iced Tea",
    description:
      "Overdose: холодный чай с персиком — нежная сладость и чайный фон.",
    image: "/hookah/OverdosePeachIcedTea.jpg",
    imageList: "/hookah/OverdosePeachIcedTea.jpg",
    category: "hookah",
    price: HOOKAH_PRICE,
    grammage: HOOKAH_GRAMMAGE,
    tobacco: "Overdose",
    flavor: "Peach Iced Tea",
    strength: "weak",
    hookahFlavorCategory: "sweet",
  },
];

/** Бар + кальяны — для списка избранного и общих ссылок по id. */
export const MENU_AND_HOOKAH_ITEMS: MenuItem[] = [...MENU_ITEMS, ...HOOKAH_MENU_ITEMS];

export function strengthDisplayLabel(item: MenuItem): string | null {
  if (!item.strength) return null;
  if (item.category === "hookah") {
    if (item.strength === "weak") return "Лёгкий";
    if (item.strength === "medium") return "Средний";
    return "Крепкий";
  }
  if (item.strength === "weak") return "Слабый";
  if (item.strength === "medium") return "Средний";
  return "Крепкий";
}
