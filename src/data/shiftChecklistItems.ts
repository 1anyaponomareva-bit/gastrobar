import type { StaffInventoryVenue } from "@/data/staffInventoryItems";

export type ShiftType = "day" | "evening";
export type CleaningType = "regular" | "general";

export type ShiftChecklistItem = {
  id: string;
  section: string;
  group?: string;
  label: string;
  shifts?: ShiftType[];
};

function barDay(
  id: string,
  section: string,
  group: string,
  label: string,
): ShiftChecklistItem {
  return { id, section, group, label, shifts: ["day"] };
}

const GASTROBAR_DAY_ITEMS: ShiftChecklistItem[] = [
  // Открытие смены 8:00–10:00 утра
  ...[
    ["stock-1", "Проверены остатки продукции"],
    ["stock-2", "Проверены сроки годности продуктов"],
    ["stock-3", "Отправлен список недостающих товаров (чек-лист)"],
    ["stock-4", "Отдать лишние товары/посуду в цех в чистом виде"],
    ["stock-5", "Заполнить органайзеры инвентарём"],
    ["stock-6", "Заполнить салфетницы"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Открытие смены 8:00–10:00 утра", "Товар и заготовки", label),
  ),
  ...[
    ["eq-1", "Холодильники работают исправно"],
    ["eq-2", "Морозильники работают исправно"],
    ["eq-3", "Холодильники для пива работают исправно"],
    [
      "eq-4",
      "Газовое оборудование заправлено, при необходимости сделать заказ поставщику в группу",
    ],
    ["eq-5", "Терминал 1 работает исправно"],
    ["eq-6", "Терминал 2 работает исправно"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Открытие смены 8:00–10:00 утра", "Оборудование", label),
  ),
  ...[
    ["out-1", "Убрать территорию вокруг трака"],
    ["out-2", "Вынести весь мусор"],
    ["out-3", "Протереть наружные поверхности"],
    ["out-4", "Помыть пепельницы"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Открытие смены 8:00–10:00 утра", "Уборка снаружи", label),
  ),
  ...[
    ["in-0", "Посудомоечная машина разобрана"],
    ["in-1", "Очищены рабочие поверхности"],
    ["in-2", "Подметён пол"],
    ["in-3", "Вымыта вся посуда"],
    ["in-4", "Вымыта раковина"],
    ["in-5", "Вымыт барный/кухонный инвентарь"],
    ["in-6", "Вымыта посуда и стекло"],
    ["in-7", "Резиновые капельники чистые"],
    ["in-8", "Пивные краны чистые"],
    ["in-9", "Пивные капельники чистые"],
    ["in-mop", "Помыть половую тряпку и ведро"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Открытие смены 8:00–10:00 утра", "Уборка внутри", label),
  ),

  // Контроль в течение смены с 10:00 до 17:00
  ...[
    ["mid-0", "Аудио-видео интерактив включены"],
    ["mid-1", "Остатки продукции контролировались"],
    ["mid-2", "Мусорные баки не переполнены"],
    ["mid-3", "Рабочее место поддерживается в чистоте"],
    [
      "mid-territory",
      "Контролировать порядок территории вокруг трака (стулья, столы, барные стойки)",
    ],
    [
      "mid-4",
      "Работа с едой и пищевыми процессами выполнялись в перчатках",
    ],
    ["mid-5", "Заготовки для вечерней смены подготовлены"],
  ].map(([id, label]) =>
    barDay(
      `gb-day-${id}`,
      "Контроль в течение смены с 10:00 до 17:00",
      "",
      label,
    ),
  ),

  // Закрытие смены с 17:00 до 18:00
  ...[
    ["close-stock-1", "Подсчитаны остатки продукции"],
    ["close-stock-2", "Передана информация сменщику об остатках"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Закрытие смены с 17:00 до 18:00", "Остатки и заказ", label),
  ),
  ...[
    ["close-in-1", "Очищены рабочие поверхности"],
    ["close-in-2", "Вымыт инвентарь"],
    ["close-in-3", "Вымыты раковины"],
    ["close-in-4", "Подметён пол"],
    ["close-in-5", "Вымыт пол"],
    ["close-in-6", "Протерты холодильники"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Закрытие смены с 17:00 до 18:00", "Уборка внутри", label),
  ),
  ...[
    ["close-out-1", "Протерты наружные поверхности"],
    ["close-out-2", "Убрана территория вокруг трака"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Закрытие смены с 17:00 до 18:00", "Уборка снаружи", label),
  ),
  ...[
    ["close-trash-1", "Весь мусор вынесен"],
    ["close-trash-2", "Установлен новый мусорный пакет"],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Закрытие смены с 17:00 до 18:00", "Мусор", label),
  ),
  ...[
    ["close-end-1", "Касса посчитана"],
    [
      "close-end-2",
      "Отчет о закрытии смены, чек-лист контроля, чеки об оплате и расходах отправлены",
    ],
  ].map(([id, label]) =>
    barDay(`gb-day-${id}`, "Закрытие смены с 17:00 до 18:00", "Закрытие", label),
  ),
];

const GASTROBAR_EVENING_ITEMS: ShiftChecklistItem[] = [
  {
    id: "gb-eve-placeholder",
    section: "Вечерняя смена",
    label: "Список обязанностей для вечерней смены будет добавлен",
    shifts: ["evening"],
  },
];

const GASTROFOOD_ITEMS: ShiftChecklistItem[] = [
  {
    id: "gf-open-1",
    section: "Opening Shift",
    label: "Unlock doors and turn on lights",
  },
  {
    id: "gf-open-2",
    section: "Opening Shift",
    label: "Check refrigerator and freezer temperatures",
  },
  {
    id: "gf-open-3",
    section: "Opening Shift",
    label: "Inspect kitchen and dining area cleanliness",
  },
  {
    id: "gf-open-4",
    section: "Opening Shift",
    label: "Wash hands and put on uniform / gloves",
  },
  {
    id: "gf-open-5",
    section: "Opening Shift",
    label: "Turn on grill, fryer, and prep equipment",
  },
  {
    id: "gf-open-6",
    section: "Opening Shift",
    label: "Check sauce and ingredient stock at stations",
  },
  {
    id: "gf-during-1",
    section: "During Shift",
    label: "Follow food safety and hygiene standards",
  },
  {
    id: "gf-during-2",
    section: "During Shift",
    label: "Keep workstations clean and organized",
  },
  {
    id: "gf-close-1",
    section: "Closing Shift",
    label: "Clean grill, fryer, and cooking surfaces",
  },
  {
    id: "gf-close-2",
    section: "Closing Shift",
    label: "Store all food in refrigerators",
  },
  {
    id: "gf-close-3",
    section: "Closing Shift",
    label: "Empty trash and replace liners",
  },
  {
    id: "gf-close-4",
    section: "Closing Shift",
    label: "Wash dishes and sanitize prep tables",
  },
  {
    id: "gf-close-5",
    section: "Closing Shift",
    label: "Turn off equipment, lock doors, set alarm",
  },
  {
    id: "gf-clean-1",
    section: "Cleaning",
    label: "Sweep and mop kitchen and guest area floors",
  },
  {
    id: "gf-clean-2",
    section: "Cleaning",
    label: "Wipe tables, counters, and touchpoints",
  },
  {
    id: "gf-clean-3",
    section: "Cleaning",
    label: "Clean restrooms and refill supplies",
  },
  {
    id: "gf-clean-4",
    section: "Cleaning",
    label: "Deep clean hood filters and hard-to-reach areas",
  },
];

export const SHIFT_CHECKLIST_BY_VENUE: Record<
  StaffInventoryVenue,
  ShiftChecklistItem[]
> = {
  gastrofood: GASTROFOOD_ITEMS,
  gastrobar: [...GASTROBAR_DAY_ITEMS, ...GASTROBAR_EVENING_ITEMS],
};

export function getShiftChecklistItems(
  venue: StaffInventoryVenue,
  cleaning: CleaningType,
  shift: ShiftType,
): ShiftChecklistItem[] {
  let items = SHIFT_CHECKLIST_BY_VENUE[venue].filter(
    (item) => !item.shifts || item.shifts.includes(shift),
  );

  if (venue === "gastrofood" && cleaning !== "general") {
    items = items.filter((item) => item.id !== "gf-clean-4");
  }

  return items;
}

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  day: "Day Shift",
  evening: "Evening Shift",
};

export const CLEANING_TYPE_LABELS: Record<CleaningType, string> = {
  regular: "Regular Cleaning",
  general: "General Cleaning",
};

export function getSectionTabLabel(sectionTitle: string): string {
  if (sectionTitle.startsWith("Открытие")) return "Открытие";
  if (sectionTitle.startsWith("Контроль")) return "Контроль";
  if (sectionTitle.startsWith("Закрытие")) return "Закрытие";
  if (sectionTitle.length <= 18) return sectionTitle;
  const word = sectionTitle.split(/\s+/)[0];
  return word || sectionTitle;
}

export function isClosingSection(sectionTitle: string): boolean {
  return (
    sectionTitle.startsWith("Закрытие") ||
    sectionTitle.startsWith("Closing")
  );
}
