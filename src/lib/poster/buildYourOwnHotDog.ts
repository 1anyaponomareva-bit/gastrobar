export type BuildYourOwnHotDogOption = {
  id: string;
  label: string;
  price: number;
};

export type BuildYourOwnHotDogSausage = {
  id: string;
  label: string;
  shortLabel: string;
  grammage: string;
  /** Доплата к базовой цене 60.000 */
  addon: number;
};

export const BUILD_YOUR_OWN_HOT_DOG_ID = "simple-hot-dog";
export const BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE = 60000;

export const HOT_DOG_SAUSAGES: BuildYourOwnHotDogSausage[] = [
  {
    id: "standard-pork",
    label: "Классическая свиная сосиска",
    shortLabel: "Классическая свиная сосиска",
    grammage: "60 г",
    addon: 0,
  },
  {
    id: "craft-chicken",
    label: "Куриная крафтовая сосиска",
    shortLabel: "Куриная крафтовая сосиска",
    grammage: "140 г",
    addon: 30000,
  },
  {
    id: "craft-pork",
    label: "Свиная крафтовая сосиска",
    shortLabel: "Свиная крафтовая сосиска",
    grammage: "140 г",
    addon: 30000,
  },
  {
    id: "craft-pork-cheese",
    label: "Свиная крафтовая сосиска с сыром",
    shortLabel: "Свиная крафтовая сосиска с сыром",
    grammage: "140 г",
    addon: 30000,
  },
];

export const HOT_DOG_TOPPINGS: BuildYourOwnHotDogOption[] = [
  { id: "fried-onion", label: "Жареный лук", price: 15000 },
  { id: "pickled-onion", label: "Маринованный лук", price: 15000 },
  { id: "crispy-onion", label: "Хрустящий лук", price: 15000 },
  { id: "sour-cabbage", label: "Квашеная капуста", price: 20000 },
  { id: "pickles", label: "Маринованные огурцы", price: 15000 },
  { id: "jalapeno", label: "Халапеньо", price: 20000 },
  { id: "crispy-bacon", label: "Хрустящий бекон", price: 25000 },
];

export const HOT_DOG_SAUCES: BuildYourOwnHotDogOption[] = [
  { id: "mayonnaise", label: "Майонез", price: 0 },
  { id: "ketchup", label: "Кетчуп", price: 0 },
  { id: "mustard", label: "Горчица", price: 10000 },
  { id: "honey-mustard", label: "Медовая горчица", price: 10000 },
  { id: "bbq", label: "BBQ", price: 10000 },
  { id: "cheese", label: "Сырный", price: 15000 },
  { id: "sriracha", label: "Шрирача", price: 10000 },
  { id: "sweet-chilli", label: "Сладкий чили", price: 10000 },
  { id: "tartar", label: "Тартар", price: 10000 },
  { id: "tomato-herbs", label: "Томатный с травами", price: 10000 },
];

export function isBuildYourOwnHotDog(itemId: string): boolean {
  return itemId === BUILD_YOUR_OWN_HOT_DOG_ID;
}

export function getBuildYourOwnSausageOptions(basePrice = BUILD_YOUR_OWN_HOT_DOG_BASE_PRICE) {
  return HOT_DOG_SAUSAGES.map((sausage) => ({
    id: sausage.id,
    label: sausage.label,
    shortLabel: sausage.shortLabel,
    grammage: sausage.grammage,
    price: basePrice + sausage.addon,
    addon: sausage.addon,
  }));
}

export function getBuildYourOwnOptions(ids: string[]): BuildYourOwnHotDogOption[] {
  const byId = new Map(
    [...HOT_DOG_TOPPINGS, ...HOT_DOG_SAUCES].map((option) => [option.id, option]),
  );
  return ids.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
}
