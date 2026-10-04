export type KitchenLang = "ru" | "en" | "vn";

export type KitchenText = Record<KitchenLang, string>;

export type KitchenShift = "day" | "evening";

export type KitchenSection = {
  id: string;
  title: KitchenText;
};

export type KitchenCheckItem = {
  id: string;
  sectionId: string;
  label: KitchenText;
  hint?: KitchenText;
};

export const KITCHEN_UI: Record<string, KitchenText> = {
  title: {
    ru: "Чек-лист подготовки кухни",
    en: "Kitchen prep checklist",
    vn: "Checklist chuẩn bị bếp",
  },
  date: { ru: "Дата", en: "Date", vn: "Ngày" },
  employee: { ru: "Сотрудник", en: "Employee", vn: "Nhân viên" },
  employeePlaceholder: {
    ru: "Имя сотрудника",
    en: "Employee name",
    vn: "Tên nhân viên",
  },
  shift: { ru: "Смена", en: "Shift", vn: "Ca" },
  day: { ru: "Дневная", en: "Day", vn: "Ca ngày" },
  evening: { ru: "Вечерняя", en: "Evening", vn: "Ca tối" },
  hint: { ru: "Подсказка", en: "Hint", vn: "Gợi ý" },
  close: { ru: "Закрыть", en: "Close", vn: "Đóng" },
  formDoc: {
    ru: "Сформировать документ",
    en: "Create document",
    vn: "Tạo tài liệu",
  },
  needName: {
    ru: "Укажите имя сотрудника",
    en: "Enter the employee name",
    vn: "Nhập tên nhân viên",
  },
  doneOf: {
    ru: "Отмечено",
    en: "Checked",
    vn: "Đã đánh dấu",
  },
  pdfError: {
    ru: "Не удалось сформировать документ",
    en: "Could not create the document",
    vn: "Không tạo được tài liệu",
  },
  infoLabel: {
    ru: "Показать подсказку",
    en: "Show hint",
    vn: "Xem gợi ý",
  },
};

export const KITCHEN_SECTIONS: KitchenSection[] = [
  {
    id: "pickup",
    title: { ru: "Станция выдачи", en: "Pickup station", vn: "Quầy giao món" },
  },
  { id: "bread", title: { ru: "Хлеб", en: "Bread", vn: "Bánh mì" } },
  { id: "toaster", title: { ru: "Тостер", en: "Toaster", vn: "Máy nướng" } },
  { id: "fryer", title: { ru: "Фритюр", en: "Fryer", vn: "Nồi chiên" } },
  {
    id: "grill",
    title: { ru: "Основной гриль", en: "Main grill", vn: "Vỉ nướng chính" },
  },
  { id: "flat", title: { ru: "Flat Grill", en: "Flat Grill", vn: "Flat Grill" } },
  { id: "hood", title: { ru: "Вытяжка", en: "Hood", vn: "Máy hút mùi" } },
  {
    id: "bain",
    title: { ru: "Горячий мармит", en: "Hot holding well", vn: "Tủ hâm nóng" },
  },
  {
    id: "cabbage",
    title: { ru: "Квашеная капуста", en: "Sauerkraut", vn: "Dưa bắp cải" },
  },
  { id: "sauces", title: { ru: "Соусы", en: "Sauces", vn: "Sốt" } },
  {
    id: "cold",
    title: { ru: "Холодная станция", en: "Cold station", vn: "Quầy lạnh" },
  },
  { id: "freezer", title: { ru: "Морозильник", en: "Freezer", vn: "Tủ đông" } },
  { id: "fridge", title: { ru: "Холодильник", en: "Fridge", vn: "Tủ lạnh" } },
  { id: "tools", title: { ru: "Инвентарь", en: "Tools", vn: "Dụng cụ" } },
  { id: "sanitation", title: { ru: "Санитария", en: "Sanitation", vn: "Vệ sinh" } },
  {
    id: "ready",
    title: { ru: "Готовность кухни", en: "Kitchen ready", vn: "Sẵn sàng mở bếp" },
  },
];

const same = (text: string): KitchenText => ({ ru: text, en: text, vn: text });

export const KITCHEN_ITEMS: KitchenCheckItem[] = [
  {
    id: "straws",
    sectionId: "pickup",
    label: {
      ru: "Трубочки пополнены",
      en: "Straws restocked",
      vn: "Ống hút đã được bổ sung",
    },
  },
  {
    id: "napkins",
    sectionId: "pickup",
    label: {
      ru: "Салфетки пополнены",
      en: "Napkins restocked",
      vn: "Khăn giấy đã được bổ sung",
    },
  },
  {
    id: "cards",
    sectionId: "pickup",
    label: {
      ru: "Открытки пополнены",
      en: "Postcards restocked",
      vn: "Postcard đã được bổ sung",
    },
  },
  {
    id: "cups",
    sectionId: "pickup",
    label: {
      ru: "Стаканы пополнены",
      en: "Cups restocked",
      vn: "Ly đã được bổ sung",
    },
  },
  {
    id: "ice-cups",
    sectionId: "pickup",
    label: {
      ru: "Стаканы для льда пополнены",
      en: "Ice cups restocked",
      vn: "Ly đá đã được bổ sung",
    },
  },
  {
    id: "sodas",
    sectionId: "pickup",
    label: {
      ru: "Газированные напитки в наличии",
      en: "Soft drinks in stock",
      vn: "Nước có gas còn đủ",
    },
  },
  {
    id: "packaging",
    sectionId: "pickup",
    label: {
      ru: "Упаковка и соусники пополнены",
      en: "Packaging and sauce cups restocked",
      vn: "Bao bì và hộp sốt đã được bổ sung",
    },
  },
  {
    id: "paper",
    sectionId: "pickup",
    label: {
      ru: "Бумага / фольга пополнены",
      en: "Paper / foil restocked",
      vn: "Giấy / giấy bạc đã được bổ sung",
    },
  },
  {
    id: "printer",
    sectionId: "pickup",
    label: {
      ru: "Принтер готов к работе",
      en: "Printer is ready",
      vn: "Máy in sẵn sàng",
    },
  },
  {
    id: "burger-buns",
    sectionId: "bread",
    label: {
      ru: "Булки для бургеров в наличии",
      en: "Burger buns in stock",
      vn: "Bánh burger còn đủ",
    },
  },
  {
    id: "hotdog-buns",
    sectionId: "bread",
    label: {
      ru: "Булки для хот-догов в наличии",
      en: "Hot dog buns in stock",
      vn: "Bánh hot dog còn đủ",
    },
  },
  {
    id: "pita",
    sectionId: "bread",
    label: { ru: "Пита в наличии", en: "Pita in stock", vn: "Bánh pita còn đủ" },
  },
  {
    id: "bread-labeled",
    sectionId: "bread",
    label: {
      ru: "Весь хлеб промаркирован",
      en: "All bread is labeled",
      vn: "Toàn bộ bánh đã được ghi hạn dùng",
    },
    hint: {
      ru: "Маркировка хлеба: указывается дата окончания срока годности.",
      en: "Bread labeling: write the use-by date.",
      vn: "Ghi hạn bánh: ghi ngày hết hạn sử dụng.",
    },
  },
  {
    id: "bread-fresh",
    sectionId: "bread",
    label: { ru: "Хлеб свежий", en: "Bread is fresh", vn: "Bánh còn tươi" },
  },
  {
    id: "buns-freezer",
    sectionId: "bread",
    label: {
      ru: "Запас булок в морозильнике есть",
      en: "Backup buns are in the freezer",
      vn: "Còn bánh dự trữ trong tủ đông",
    },
  },
  {
    id: "toaster-on",
    sectionId: "toaster",
    label: {
      ru: "Тостер включен",
      en: "Toaster is on",
      vn: "Máy nướng đã bật",
    },
  },
  {
    id: "toaster-temp",
    sectionId: "toaster",
    label: {
      ru: "Температура 200°C",
      en: "Temperature 200°C",
      vn: "Nhiệt độ 200°C",
    },
    hint: {
      ru: "Не менять температуру самостоятельно.",
      en: "Do not change the temperature yourself.",
      vn: "Không tự ý đổi nhiệt độ.",
    },
  },
  {
    id: "oil-ok",
    sectionId: "fryer",
    label: {
      ru: "Масло в нормальном состоянии",
      en: "Oil is in good condition",
      vn: "Dầu chiên còn tốt",
    },
  },
  {
    id: "fryer-temp",
    sectionId: "fryer",
    label: {
      ru: "Температура 165–170°C",
      en: "Temperature 165–170°C",
      vn: "Nhiệt độ 165–170°C",
    },
    hint: {
      ru: "Температуру измерять электронным термометром.",
      en: "Measure the temperature with a digital thermometer.",
      vn: "Đo nhiệt độ bằng nhiệt kế điện tử.",
    },
  },
  {
    id: "grill-clean",
    sectionId: "grill",
    label: {
      ru: "Решетки и камни чистые",
      en: "Grates and stones are clean",
      vn: "Vỉ và đá đã sạch",
    },
  },
  {
    id: "grill-carbon",
    sectionId: "grill",
    label: {
      ru: "Нагар удален",
      en: "Carbon buildup removed",
      vn: "Đã cạo sạch lớp cháy",
    },
  },
  {
    id: "grill-temp",
    sectionId: "grill",
    label: {
      ru: "Температура 265–290°C",
      en: "Temperature 265–290°C",
      vn: "Nhiệt độ 265–290°C",
    },
    hint: {
      ru: "Центральная зона гриля самая горячая.",
      en: "The center of the grill is the hottest zone.",
      vn: "Vùng giữa vỉ nướng nóng nhất.",
    },
  },
  {
    id: "flat-clean",
    sectionId: "flat",
    label: {
      ru: "Поверхность чистая",
      en: "Surface is clean",
      vn: "Mặt bếp đã sạch",
    },
  },
  {
    id: "flat-flame",
    sectionId: "flat",
    label: {
      ru: "Пламя выставлено правильно",
      en: "Flame is set correctly",
      vn: "Lửa đã chỉnh đúng",
    },
    hint: {
      ru: "По краям пламя выше, в центре — низкое.",
      en: "Flame is higher at the edges and low in the center.",
      vn: "Lửa cao hơn ở mép, thấp ở giữa.",
    },
  },
  {
    id: "hood-filters",
    sectionId: "hood",
    label: {
      ru: "Решетки / маслоприемники чистые",
      en: "Filters / grease traps are clean",
      vn: "Lưới lọc / khay dầu đã sạch",
    },
  },
  {
    id: "hood-perimeter",
    sectionId: "hood",
    label: {
      ru: "Периметр очищен от жира",
      en: "Perimeter cleaned of grease",
      vn: "Xung quanh đã lau sạch dầu mỡ",
    },
  },
  {
    id: "bain-clean",
    sectionId: "bain",
    label: {
      ru: "Мармит чистый",
      en: "Holding well is clean",
      vn: "Tủ hâm đã sạch",
    },
  },
  {
    id: "bain-temp",
    sectionId: "bain",
    label: {
      ru: "Регулятор чуть ниже 30°C",
      en: "Control set just below 30°C",
      vn: "Núm chỉnh thấp hơn 30°C một chút",
    },
  },
  {
    id: "bain-water",
    sectionId: "bain",
    label: {
      ru: "Вода для гастроемкостей 1–2 см",
      en: "Water for gastronorm pans 1–2 cm",
      vn: "Nước cho khay gastronorm 1–2 cm",
    },
  },
  {
    id: "bain-cheese",
    sectionId: "bain",
    label: {
      ru: "Вода для сырного соуса 2–3 см",
      en: "Water for cheese sauce 2–3 cm",
      vn: "Nước cho sốt phô mai 2–3 cm",
    },
    hint: {
      ru: "Бутылку сырного соуса полностью в воду не погружать.",
      en: "Do not fully submerge the cheese sauce bottle.",
      vn: "Không nhúng cả chai sốt phô mai xuống nước.",
    },
  },
  {
    id: "cabbage-fresh",
    sectionId: "cabbage",
    label: {
      ru: "Капуста свежая",
      en: "Cabbage is fresh",
      vn: "Dưa bắp cải còn tươi",
    },
  },
  {
    id: "cabbage-portion",
    sectionId: "cabbage",
    label: {
      ru: "В мармите небольшая порция",
      en: "A small portion is in the warmer",
      vn: "Trong tủ hâm chỉ để một phần nhỏ",
    },
  },
  {
    id: "cabbage-fridge",
    sectionId: "cabbage",
    label: {
      ru: "Основной запас в холодильнике",
      en: "Main stock is in the fridge",
      vn: "Phần chính để trong tủ lạnh",
    },
    hint: {
      ru: "В мармит выкладывать примерно слой 4–5 см и пополнять по мере необходимости.",
      en: "Put about a 4–5 cm layer in the warmer and refill as needed.",
      vn: "Cho vào tủ hâm lớp khoảng 4–5 cm và bổ sung khi cần.",
    },
  },
  { id: "sauce-ketchup", sectionId: "sauces", label: same("Ketchup") },
  { id: "sauce-mayo", sectionId: "sauces", label: same("Mayonnaise") },
  { id: "sauce-mustard", sectionId: "sauces", label: same("Mustard") },
  { id: "sauce-bbq", sectionId: "sauces", label: same("BBQ") },
  { id: "sauce-chili", sectionId: "sauces", label: same("Sweet Chili") },
  { id: "sauce-sriracha", sectionId: "sauces", label: same("Sriracha") },
  { id: "sauce-salad", sectionId: "sauces", label: same("Salad Dressing") },
  { id: "sauce-yogurt", sectionId: "sauces", label: same("Yogurt Sauce") },
  { id: "sauce-cheese", sectionId: "sauces", label: same("Cheese Sauce") },
  {
    id: "sauces-filled",
    sectionId: "sauces",
    label: {
      ru: "Все соусы заполнены",
      en: "All sauces are filled",
      vn: "Tất cả sốt đã được rót đầy",
    },
  },
  {
    id: "sauces-labeled",
    sectionId: "sauces",
    label: {
      ru: "Все соусы промаркированы",
      en: "All sauces are labeled",
      vn: "Tất cả sốt đã được ghi hạn dùng",
    },
    hint: {
      ru: "Маркировка соусов: указывается дата окончания срока годности. Соус с более ранней датой используется первым.",
      en: "Sauce labeling: write the use-by date. Use the sauce with the earliest date first.",
      vn: "Ghi hạn sốt: ghi ngày hết hạn. Dùng sốt có ngày sớm hơn trước.",
    },
  },
  {
    id: "sauces-backup",
    sectionId: "sauces",
    label: {
      ru: "Резерв основных соусов есть",
      en: "Backup of the main sauces is available",
      vn: "Còn sốt chính dự trữ",
    },
  },
  {
    id: "cold-surface",
    sectionId: "cold",
    label: {
      ru: "Рабочая поверхность чистая",
      en: "Work surface is clean",
      vn: "Mặt bàn làm việc đã sạch",
    },
  },
  {
    id: "cold-sanitizer",
    sectionId: "cold",
    label: {
      ru: "Sanitizer и чистая тряпка на месте",
      en: "Sanitizer and a clean cloth are in place",
      vn: "Dung dịch sát khuẩn và khăn sạch đã có",
    },
  },
  {
    id: "cold-spoons",
    sectionId: "cold",
    label: {
      ru: "Рабочие ложки на месте",
      en: "Working spoons are in place",
      vn: "Thìa làm việc đã có",
    },
  },
  {
    id: "cold-bowls",
    sectionId: "cold",
    label: {
      ru: "2 рабочие миски на месте",
      en: "2 working bowls are in place",
      vn: "2 tô làm việc đã có",
    },
    hint: {
      ru: "Одна миска — для салата. Вторая — для pita / burrito.",
      en: "One bowl is for salad. The second is for pita / burrito.",
      vn: "Một tô cho salad. Tô thứ hai cho pita / burrito.",
    },
  },
  {
    id: "cold-boards",
    sectionId: "cold",
    label: {
      ru: "Зеленая и коричневая доски на месте",
      en: "Green and brown boards are in place",
      vn: "Thớt xanh và thớt nâu đã có",
    },
    hint: {
      ru: "Зеленая доска — овощи. Коричневая — готовые продукты.",
      en: "Green board — vegetables. Brown board — ready-to-eat food.",
      vn: "Thớt xanh — rau. Thớt nâu — món đã chế biến.",
    },
  },
  {
    id: "cold-clear",
    sectionId: "cold",
    label: {
      ru: "Лишних предметов нет",
      en: "No extra items",
      vn: "Không có đồ thừa",
    },
  },
  { id: "fr-fries", sectionId: "freezer", label: same("French Fries") },
  { id: "fr-mozz", sectionId: "freezer", label: same("Mozzarella Sticks") },
  { id: "fr-nuggets", sectionId: "freezer", label: same("Chicken Nuggets") },
  { id: "fr-fish", sectionId: "freezer", label: same("Fish Bites / Fish Burger") },
  { id: "fr-wings", sectionId: "freezer", label: same("Chicken Wings") },
  { id: "fr-chicken-sausage", sectionId: "freezer", label: same("Chicken Sausages") },
  { id: "fr-pork-sausage", sectionId: "freezer", label: same("Pork / Craft Sausages") },
  { id: "fr-chicken-kebab", sectionId: "freezer", label: same("Chicken Kebab") },
  { id: "fr-pork-kebab", sectionId: "freezer", label: same("Pork Kebab") },
  { id: "fr-beef-burger", sectionId: "freezer", label: same("Beef Burger") },
  { id: "fr-beefsteak", sectionId: "freezer", label: same("Beefsteak") },
  { id: "fr-bacon", sectionId: "freezer", label: same("Bacon") },
  { id: "fr-onion", sectionId: "freezer", label: same("Fried / Caramelized Onion") },
  { id: "fr-pepper", sectionId: "freezer", label: same("Onion + Bell Pepper Mix") },
  { id: "fr-cheese", sectionId: "freezer", label: same("Cheese") },
  { id: "fr-burger-buns", sectionId: "freezer", label: same("Burger Buns") },
  { id: "fr-hotdog-buns", sectionId: "freezer", label: same("Hot Dog Buns") },
  {
    id: "fridge-stock",
    sectionId: "fridge",
    label: {
      ru: "Все основные ингредиенты на смену в наличии",
      en: "All main ingredients for the shift are in stock",
      vn: "Nguyên liệu chính cho ca đã đủ",
    },
  },
  {
    id: "fridge-veg",
    sectionId: "fridge",
    label: {
      ru: "Овощи свежие",
      en: "Vegetables are fresh",
      vn: "Rau còn tươi",
    },
  },
  {
    id: "fridge-sauces",
    sectionId: "fridge",
    label: {
      ru: "Соусы в наличии",
      en: "Sauces are in stock",
      vn: "Sốt còn đủ",
    },
  },
  {
    id: "fridge-labeled",
    sectionId: "fridge",
    label: {
      ru: "Продукты промаркированы",
      en: "Products are labeled",
      vn: "Thực phẩm đã được ghi hạn dùng",
    },
  },
  {
    id: "fridge-expired",
    sectionId: "fridge",
    label: {
      ru: "Просроченных продуктов нет",
      en: "No expired products",
      vn: "Không có thực phẩm hết hạn",
    },
  },
  {
    id: "tools-utensils",
    sectionId: "tools",
    label: {
      ru: "Ножи / щипцы / лопатки на месте",
      en: "Knives / tongs / spatulas are in place",
      vn: "Dao / kẹp / xẻng đã có",
    },
  },
  {
    id: "tools-bowls",
    sectionId: "tools",
    label: {
      ru: "Миски и доски на месте",
      en: "Bowls and boards are in place",
      vn: "Tô và thớt đã có",
    },
  },
  {
    id: "san-sink",
    sectionId: "sanitation",
    label: { ru: "Раковина пустая", en: "Sink is empty", vn: "Bồn rửa trống" },
  },
  {
    id: "san-surfaces",
    sectionId: "sanitation",
    label: {
      ru: "Рабочие поверхности чистые",
      en: "Work surfaces are clean",
      vn: "Mặt bàn làm việc đã sạch",
    },
  },
  {
    id: "san-floor",
    sectionId: "sanitation",
    label: {
      ru: "Пол и рабочая зона чистые",
      en: "Floor and work area are clean",
      vn: "Sàn và khu làm việc đã sạch",
    },
  },
  {
    id: "san-personal",
    sectionId: "sanitation",
    label: {
      ru: "Личных вещей на станции нет",
      en: "No personal items on the station",
      vn: "Không có đồ cá nhân trên quầy",
    },
  },
  {
    id: "ready-stock",
    sectionId: "ready",
    label: {
      ru: "Все необходимое пополнено",
      en: "Everything needed is restocked",
      vn: "Mọi thứ cần thiết đã được bổ sung",
    },
  },
  {
    id: "ready-equipment",
    sectionId: "ready",
    label: {
      ru: "Все оборудование работает",
      en: "All equipment works",
      vn: "Thiết bị đều hoạt động",
    },
  },
  {
    id: "ready-open",
    sectionId: "ready",
    label: {
      ru: "Кухня готова к открытию",
      en: "Kitchen is ready to open",
      vn: "Bếp sẵn sàng mở cửa",
    },
  },
];

export function kitchenText(text: KitchenText, lang: KitchenLang): string {
  return text[lang] ?? text.ru;
}
