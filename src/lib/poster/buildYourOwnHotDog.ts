export type BuildYourOwnHotDogOption = {
  id: string;
  label: string;
  price: number;
};

export const BUILD_YOUR_OWN_HOT_DOG_ID = "simple-hot-dog";

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

export function getBuildYourOwnOptions(ids: string[]): BuildYourOwnHotDogOption[] {
  const byId = new Map(
    [...HOT_DOG_TOPPINGS, ...HOT_DOG_SAUCES].map((option) => [option.id, option]),
  );
  return ids.flatMap((id) => {
    const option = byId.get(id);
    return option ? [option] : [];
  });
}
