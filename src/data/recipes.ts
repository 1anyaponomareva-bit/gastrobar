export type RecipeLang = "ru" | "en" | "vn";

export type LocalizedText = Record<RecipeLang, string>;

export type RecipeKind = "dish" | "prep";

export type RecipeIngredient = {
  name: LocalizedText;
  /** Net amount for the base yield; scaled linearly. */
  amount: number;
  /** Gross amount before trimming; defaults to `amount`. */
  gross?: number;
  unit: string;
  note?: LocalizedText;
};

export type RecipeStep = {
  title?: LocalizedText;
  /** Path under /public. */
  photo?: string;
  items: LocalizedText[];
};

export type RecipeFactIcon = "weight" | "length" | "storage" | "time" | "temperature";

export type RecipeFact = {
  icon: RecipeFactIcon;
  label: LocalizedText;
  value: LocalizedText;
};

export type RecipeStorageIcon = "freezer" | "fridge" | "thaw" | "no-refreeze";

export type RecipeStorageRule = {
  icon: RecipeStorageIcon;
  title: LocalizedText;
  text?: LocalizedText;
};

export type Recipe = {
  id: string;
  kind: RecipeKind;
  name: LocalizedText;
  /** Card number, creation date and revision printed in the card header. */
  meta?: { cardNo: string; date: string; revision: string };
  /** Path under /public, e.g. "/food/menu/CLASSIC-HOT-DOG.png". */
  photo?: string;
  /** What one base batch produces, e.g. 1 portion of 250 g or 2 kg of sauce. */
  yield: { amount: number; unit: string; label?: LocalizedText };
  facts?: RecipeFact[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  storage?: RecipeStorageRule[];
  /** Placeholder content that has to be replaced with the real tech card. */
  example?: boolean;
};

const l = (ru: string, en: string, vn: string): LocalizedText => ({ ru, en, vn });

const SAUSAGE_PHOTO = "/recipes/chicken-sausage";

export const RECIPES: Recipe[] = [
  {
    id: "chicken-sausage",
    kind: "prep",
    meta: { cardNo: "GF-PR-001", date: "30.10.2026", revision: "01" },
    name: l("Куриная колбаска (1 кг)", "Chicken Sausage (1 kg)", "Xúc xích gà (1 kg)"),
    photo: `${SAUSAGE_PHOTO}/hero.jpg`,
    yield: {
      amount: 1223.5,
      unit: "g",
      label: l(
        "1 партия ≈ 1,2 кг (9–10 колбасок)",
        "1 batch ≈ 1.2 kg (9–10 sausages)",
        "1 mẻ ≈ 1,2 kg (9–10 cây)",
      ),
    },
    facts: [
      { icon: "weight", label: l("Вес 1 шт", "Portion weight", "Trọng lượng 1 cây"), value: l("120–130 г", "120–130 g", "120–130 g") },
      { icon: "length", label: l("Длина", "Length", "Chiều dài"), value: l("17–18 см", "17–18 cm", "17–18 cm") },
      { icon: "storage", label: l("Хранение", "Storage", "Bảo quản"), value: l("−18 °C, до 180 дней", "−18 °C, up to 180 days", "−18 °C, tối đa 180 ngày") },
    ],
    ingredients: [
      { name: l("Куриное бедро без кости", "Chicken thigh boneless", "Thịt đùi gà (không xương)"), amount: 870, unit: "g" },
      { name: l("Куриная кожа", "Chicken skin", "Da gà"), amount: 130, unit: "g" },
      { name: l("Чёрный перец молотый", "Black pepper powder", "Tiêu đen (bột)"), amount: 2, unit: "g" },
      { name: l("Сахар", "Sugar", "Đường"), amount: 2, unit: "g" },
      { name: l("Вода (ледяная)", "Water (iced)", "Nước (đá)"), amount: 130, unit: "ml" },
      { name: l("Соль", "Salt", "Muối"), amount: 15, unit: "g" },
      { name: l("Горчичный порошок", "Mustard powder", "Bột mù tạt"), amount: 1.5, unit: "g" },
      { name: l("Луковый порошок", "Onion powder", "Bột hành"), amount: 3, unit: "g" },
      { name: l("Сливочное масло несолёное", "Butter (unsalted)", "Bơ lạt"), amount: 65, unit: "g" },
      { name: l("Чесночный порошок", "Garlic powder", "Bột tỏi"), amount: 3, unit: "g" },
      { name: l("Паприка сладкая молотая", "Paprika powder (sweet)", "Bột ớt chuông (ngọt)"), amount: 2, unit: "g" },
    ],
    steps: [
      {
        title: l("Подготовка мяса", "Meat preparation", "Chuẩn bị nguyên liệu"),
        photo: `${SAUSAGE_PHOTO}/step-1.jpg`,
        items: [
          l(
            "Удалить лишний жир, осколки костей и посторонние примеси.",
            "Remove excess fat, bone fragments and impurities.",
            "Loại bỏ mỡ thừa, xương vụn và tạp chất.",
          ),
          l(
            "Взять 870 г куриного бедра без кости и 130 г куриной кожи.",
            "Use 870 g chicken thigh (boneless) and 130 g chicken skin.",
            "Sử dụng 870 g thịt đùi gà (không xương) và 130 g da gà.",
          ),
        ],
      },
      {
        title: l("Нарезка", "Cutting", "Thái nhỏ"),
        photo: `${SAUSAGE_PHOTO}/step-2.jpg`,
        items: [
          l("270 г бедра — на фарш.", "270 g chicken thigh for grinding.", "270 g thịt đùi gà để xay."),
          l(
            "600 г бедра нарезать кубиком 6–8 мм.",
            "600 g chicken thigh cut into 6–8 mm cubes.",
            "600 g thịt đùi gà cắt hạt lựu 6–8 mm.",
          ),
        ],
      },
      {
        title: l("Измельчение", "Grinding", "Xay thịt"),
        photo: `${SAUSAGE_PHOTO}/step-3.jpg`,
        items: [
          l(
            "Прокрутить 270 г бедра через решётку 4 мм, 2 раза.",
            "Grind 270 g chicken thigh through a 4 mm plate, twice.",
            "Xay 270 g thịt đùi gà qua mặt sàng 4 mm, 2 lần.",
          ),
          l(
            "Прокрутить 130 г кожи через решётку 4 мм, 2 раза.",
            "Grind 130 g chicken skin through a 4 mm plate, twice.",
            "Xay 130 g da gà qua mặt sàng 4 mm, 2 lần.",
          ),
        ],
      },
      {
        title: l("Замес", "Mixing", "Trộn thịt"),
        photo: `${SAUSAGE_PHOTO}/step-4.jpg`,
        items: [
          l(
            "В дежу положить фарш, кожу, кубики мяса, все специи, ледяную воду и масло.",
            "Add ground chicken, ground skin, diced chicken, all spices, iced water and butter into the bowl.",
            "Cho thịt xay, da xay, thịt hạt lựu, tất cả gia vị, nước đá và bơ vào tô.",
          ),
          l("Перемешать до однородности (2 минуты).", "Mix until well combined (2 minutes).", "Trộn đều hỗn hợp (2 phút)."),
          l(
            "Собрать массу со дна и перемешать ещё 2 минуты.",
            "Scrape the bottom of the bowl and mix again for 2 minutes.",
            "Cạo phần thịt ở đáy tô và trộn lại thêm 2 phút.",
          ),
        ],
      },
      {
        title: l("Выдержка в холоде", "Resting", "Ủ lạnh"),
        photo: `${SAUSAGE_PHOTO}/step-5.jpg`,
        items: [l("Выдержать 12–24 часа при 2–4 °C.", "Rest 12–24 hours at 2–4 °C.", "Ủ lạnh 12–24 giờ ở 2–4 °C.")],
      },
      {
        title: l("Подготовка оболочки", "Prepare casing", "Chuẩn bị vỏ"),
        photo: `${SAUSAGE_PHOTO}/step-6.jpg`,
        items: [
          l("Оболочка — свиная черева (натуральная).", "Pork intestines (natural casing).", "Vỏ: lòng heo (vỏ tự nhiên)."),
          l("Хорошо промыть от соли.", "Rinse well from salt.", "Rửa sạch muối."),
          l("Замочить в тёплой воде на 30–60 минут.", "Soak in warm water 30–60 minutes.", "Ngâm nước ấm 30–60 phút."),
          l("Промыть водой изнутри и снаружи.", "Rinse with water inside and outside.", "Rửa nước bên trong và bên ngoài."),
        ],
      },
      {
        title: l("Набивка", "Stuffing", "Nhồi xúc xích"),
        photo: `${SAUSAGE_PHOTO}/step-7.jpg`,
        items: [
          l("Заполнить шприц фаршем.", "Fill the sausage stuffer with the meat mixture.", "Cho hỗn hợp thịt vào máy nhồi."),
          l("Насадка 2 см.", "Use a 2 cm nozzle.", "Sử dụng ống nhồi 2 cm."),
          l("Набивать плотно, без пузырей воздуха.", "Stuff without air pockets.", "Nhồi chặt, tránh bọt khí."),
          l("Перекрутить на колбаски нужной длины.", "Twist sausages to the desired length.", "Xoắn từng cây theo chiều dài mong muốn."),
        ],
      },
      {
        title: l("Формовка", "Forming", "Tạo hình"),
        photo: `${SAUSAGE_PHOTO}/step-8.jpg`,
        items: [
          l(
            "Перекручивать поочерёдно по и против часовой стрелки.",
            "Twist each sausage alternately clockwise and counterclockwise.",
            "Xoắn từng cây theo chiều kim đồng hồ và ngược lại.",
          ),
          l("Длина: 17–18 см.", "Length: 17–18 cm.", "Chiều dài: 17–18 cm."),
          l("Вес: 120–130 г.", "Weight: 120–130 g.", "Trọng lượng: 120–130 g."),
          l("Разложить на решётку с промежутком 1 см.", "Place sausages on a rack, 1 cm apart.", "Xếp lên khay, cách nhau 1 cm."),
        ],
      },
      {
        title: l("Приготовление", "Cooking", "Nấu chín"),
        photo: `${SAUSAGE_PHOTO}/step-9.jpg`,
        items: [
          l("Печь на 125 °C (проверять термометром).", "Set the oven to 125 °C (use a thermometer).", "Đặt nhiệt độ lò 125 °C (dùng nhiệt kế)."),
          l(
            "Под решётку поставить противень с горячей водой.",
            "Place a tray with hot water under the rack.",
            "Đặt khay nước nóng bên dưới.",
          ),
          l(
            "Вставить термощуп в 2 самые крупные колбаски.",
            "Insert the thermometer into the two largest sausages.",
            "Cắm nhiệt kế vào 2 cây lớn nhất.",
          ),
          l("Поставить колбаски в печь.", "Put the sausages in the oven.", "Cho xúc xích vào lò."),
          l(
            "Готовить до 72–74 °C внутри.",
            "Cook until the internal temperature reaches 72–74 °C.",
            "Nấu đến khi nhiệt độ bên trong đạt 72–74 °C.",
          ),
        ],
      },
      {
        title: l("Охлаждение", "Cooling", "Làm lạnh"),
        photo: `${SAUSAGE_PHOTO}/step-10.jpg`,
        items: [
          l("Переложить в ледяную воду на 10 минут.", "Transfer to ice water for 10 minutes.", "Ngâm nước đá 10 phút."),
          l("Обсушить.", "Dry.", "Để ráo."),
        ],
      },
      {
        title: l("Вакуумная упаковка", "Vacuum packing", "Đóng gói"),
        photo: `${SAUSAGE_PHOTO}/step-11.jpg`,
        items: [
          l("По 2 колбаски в вакуумный пакет.", "Pack two sausages per vacuum bag.", "Đóng gói 2 cây/túi hút chân không."),
          l("Вакуум на максимум.", "Vacuum at maximum.", "Hút chân không tối đa."),
          l(
            "Этикетка: название, дата производства, срок годности (6 месяцев), вес.",
            "Label: product name, production date, expiry date (6 months), weight.",
            "Ghi nhãn: tên sản phẩm, ngày sản xuất, hạn sử dụng (6 tháng), trọng lượng.",
          ),
        ],
      },
    ],
    storage: [
      { icon: "freezer", title: l("Морозильник −18 °C", "Freezer −18 °C", "Ngăn đông −18 °C"), text: l("до 180 дней", "up to 180 days", "tối đa 180 ngày") },
      { icon: "thaw", title: l("После разморозки", "After thawing", "Sau khi rã đông"), text: l("7 дней", "7 days", "7 ngày") },
      { icon: "no-refreeze", title: l("Повторно не замораживать", "Do not refreeze", "Không tái đông") },
    ],
  },
  {
    id: "classic-hot-dog",
    kind: "dish",
    example: true,
    name: l("Классический хот-дог", "Classic Hot Dog", "Hot dog cổ điển"),
    photo: "/food/menu/CLASSIC-HOT-DOG.png",
    yield: {
      amount: 1,
      unit: "pcs",
      label: l("1 порция ≈ 250 г", "1 portion ≈ 250 g", "1 phần ≈ 250 g"),
    },
    ingredients: [
      { name: l("Булочка для хот-дога", "Hot dog bun", "Bánh mì hot dog"), amount: 1, unit: "pcs" },
      { name: l("Сосиска Hot Dog Sausage", "Hot Dog Sausage", "Xúc xích hot dog"), amount: 1, unit: "pcs" },
      { name: l("Кетчуп", "Ketchup", "Tương cà"), amount: 15, unit: "g" },
      { name: l("Горчица жёлтая", "Yellow mustard", "Mù tạt vàng"), amount: 10, unit: "g" },
      { name: l("Маринованные огурцы", "Pickles", "Dưa chuột muối"), amount: 20, unit: "g" },
      { name: l("Жареный лук", "Fried onion", "Hành phi"), amount: 5, unit: "g" },
    ],
    steps: [
      {
        items: [
          l("Обжарить сосиску на гриле 4–5 минут, поворачивая.", "Grill the sausage for 4–5 minutes, turning it.", "Nướng xúc xích 4–5 phút, trở đều."),
          l(
            "Разрезать булочку и прогреть её на гриле 30 секунд.",
            "Slice the bun and warm it on the grill for 30 seconds.",
            "Cắt bánh mì và làm nóng trên vỉ nướng 30 giây.",
          ),
          l(
            "Положить сосиску, сверху огурцы, кетчуп и горчицу зигзагом.",
            "Add the sausage, then pickles, ketchup and mustard in a zigzag.",
            "Đặt xúc xích, thêm dưa chuột, tương cà và mù tạt theo hình zíc zắc.",
          ),
          l(
            "Посыпать жареным луком и подать в коробке для хот-дога.",
            "Sprinkle with fried onion and serve in a hot dog box.",
            "Rắc hành phi và cho vào hộp hot dog.",
          ),
        ],
      },
    ],
  },
];
