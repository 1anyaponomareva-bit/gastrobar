export type RecipeLang = "ru" | "en" | "vn";

export type LocalizedText = Record<RecipeLang, string>;

export type RecipeKind = "dish" | "prep";

export type RecipeIngredient = {
  name: LocalizedText;
  /** Amount for the base yield; scaled linearly. */
  amount: number;
  unit: string;
  note?: LocalizedText;
};

export type Recipe = {
  id: string;
  kind: RecipeKind;
  name: LocalizedText;
  /** Path under /public, e.g. "/food/menu/CLASSIC-HOT-DOG.png". */
  photo?: string;
  /** What one base batch produces, e.g. 1 portion of 250 g or 2 kg of sauce. */
  yield: { amount: number; unit: string; label?: LocalizedText };
  ingredients: RecipeIngredient[];
  steps: LocalizedText[];
  storage?: LocalizedText;
  /** Placeholder content that has to be replaced with the real tech card. */
  example?: boolean;
};

export const RECIPES: Recipe[] = [
  {
    id: "classic-hot-dog",
    kind: "dish",
    example: true,
    name: { ru: "Классический хот-дог", en: "Classic Hot Dog", vn: "Hot dog cổ điển" },
    photo: "/food/menu/CLASSIC-HOT-DOG.png",
    yield: {
      amount: 1,
      unit: "pcs",
      label: { ru: "1 порция ≈ 250 г", en: "1 portion ≈ 250 g", vn: "1 phần ≈ 250 g" },
    },
    ingredients: [
      { name: { ru: "Булочка для хот-дога", en: "Hot dog bun", vn: "Bánh mì hot dog" }, amount: 1, unit: "pcs" },
      { name: { ru: "Сосиска Hot Dog Sausage", en: "Hot Dog Sausage", vn: "Xúc xích hot dog" }, amount: 1, unit: "pcs" },
      { name: { ru: "Кетчуп", en: "Ketchup", vn: "Tương cà" }, amount: 15, unit: "g" },
      { name: { ru: "Горчица жёлтая", en: "Yellow mustard", vn: "Mù tạt vàng" }, amount: 10, unit: "g" },
      { name: { ru: "Маринованные огурцы", en: "Pickles", vn: "Dưa chuột muối" }, amount: 20, unit: "g" },
      { name: { ru: "Жареный лук", en: "Fried onion", vn: "Hành phi" }, amount: 5, unit: "g" },
    ],
    steps: [
      {
        ru: "Обжарить сосиску на гриле 4–5 минут, поворачивая.",
        en: "Grill the sausage for 4–5 minutes, turning it.",
        vn: "Nướng xúc xích 4–5 phút, trở đều.",
      },
      {
        ru: "Разрезать булочку и прогреть её на гриле 30 секунд.",
        en: "Slice the bun and warm it on the grill for 30 seconds.",
        vn: "Cắt bánh mì và làm nóng trên vỉ nướng 30 giây.",
      },
      {
        ru: "Положить сосиску, сверху огурцы, кетчуп и горчицу зигзагом.",
        en: "Add the sausage, then pickles, ketchup and mustard in a zigzag.",
        vn: "Đặt xúc xích, thêm dưa chuột, tương cà và mù tạt theo hình zíc zắc.",
      },
      {
        ru: "Посыпать жареным луком и подать в коробке для хот-дога.",
        en: "Sprinkle with fried onion and serve in a hot dog box.",
        vn: "Rắc hành phi và cho vào hộp hot dog.",
      },
    ],
  },
  {
    id: "sauce-cheese",
    kind: "prep",
    example: true,
    name: { ru: "Сырный соус", en: "Cheese Sauce", vn: "Sốt phô mai" },
    yield: {
      amount: 1,
      unit: "kg",
      label: { ru: "1 кг (≈ 3 пакета по 350 г)", en: "1 kg (≈ 3 bags × 350 g)", vn: "1 kg (≈ 3 túi 350 g)" },
    },
    ingredients: [
      { name: { ru: "Молоко", en: "Milk", vn: "Sữa" }, amount: 500, unit: "ml" },
      { name: { ru: "Сыр чеддер", en: "Cheddar cheese", vn: "Phô mai cheddar" }, amount: 400, unit: "g" },
      { name: { ru: "Сливочное масло", en: "Butter", vn: "Bơ" }, amount: 50, unit: "g" },
      { name: { ru: "Мука", en: "Flour", vn: "Bột mì" }, amount: 40, unit: "g" },
      { name: { ru: "Соль", en: "Salt", vn: "Muối" }, amount: 5, unit: "g" },
    ],
    steps: [
      {
        ru: "Растопить масло, добавить муку и обжарить 1 минуту, помешивая.",
        en: "Melt the butter, add the flour and cook for 1 minute, stirring.",
        vn: "Đun chảy bơ, cho bột mì vào và đảo 1 phút.",
      },
      {
        ru: "Влить молоко тонкой струйкой, мешать венчиком до загустения.",
        en: "Pour in the milk slowly, whisking until it thickens.",
        vn: "Đổ sữa từ từ, đánh đều đến khi sánh lại.",
      },
      {
        ru: "Снять с огня, добавить тёртый сыр и соль, мешать до однородности.",
        en: "Remove from heat, add grated cheese and salt, stir until smooth.",
        vn: "Tắt bếp, cho phô mai bào và muối, khuấy đến khi mịn.",
      },
      {
        ru: "Остудить, разлить по пакетам по 350 г, подписать дату.",
        en: "Cool down, portion into 350 g bags and label with the date.",
        vn: "Để nguội, chia vào túi 350 g và ghi ngày.",
      },
    ],
    storage: {
      ru: "Холодильник 0…+4 °C, 3 суток.",
      en: "Fridge 0…+4 °C, 3 days.",
      vn: "Tủ lạnh 0…+4 °C, 3 ngày.",
    },
  },
];
