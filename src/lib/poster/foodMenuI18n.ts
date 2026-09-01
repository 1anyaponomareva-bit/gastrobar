import type { PosterFoodMenuItem } from "@/lib/poster/mapProducts";
import type { AppLang } from "@/lib/i18n";

const HOT_DOG_LABEL = "Hot Dog";

/** Americanized / brand names — keep in English for vn (and en). */
const TITLES_EN: Record<string, string> = {
  "chicken-wings": "Chicken Wings",
  "mozzarella-sticks": "Mozzarella Sticks",
  "chicken-nuggets": "Chicken Nuggets",
  "crispy-fish-bites": "Crispy Fish Bites",
  "french-fries": "French Fries",
  pistachios: "Pistachios",
  peanuts: "Peanuts",
  "simple-hot-dog": "Build Your Own Hot Dog",
  "classic-hot-dog": "Danish Hot Dog",
  "cheddar-bacon-dog": "Cheddar Bacon Hot Dog",
  "jalapeno-cheddar-dog": "Jalapeño Cheddar Hot Dog",
  "bavarian-dog": "Sauerkraut Mustard Hot Dog",
  "bbq-bacon-dog": "BBQ Bacon Hot Dog",
  "philly-cheesesteak": "Cheesesteak Dog",
  "classic-burger": "Classic Beef Burger",
  cheeseburger: "Cheeseburger",
  "signature-burger": "GASTROBURGER",
  "fish-burger": "Fish Burger",
  "burger-combo": "Cheeseburger Combo",
  "hot-dog-combo": "Hot Dog Combo",
  "cheese-steak-dog-combo": "Cheese Steak Dog Combo",
  "pita-kebab-combo": "Pita Kebab Combo",
  "family-combo": "Family Combo",
  "kids-nuggets-combo": "Kids Nuggets Combo",
  "kids-hot-dog-combo": "Kids Hot Dog Combo",
  "chicken-kebab": "Chicken Kebab Box",
  "pork-kebab": "Pork Kebab Box",
  "kebab-pita": "Kebab Pita",
  "bavarian-sausage": "Grilled Pork Sausage Box",
  "cheddar-jalapeno-sausage": "Cheddar Jalapeño Sausage Box",
  "grilled-chicken-sausage": "Grilled Chicken Sausage Box",
};

const TITLES_VN: Record<string, string> = {
  "chicken-wings": "Cánh gà",
  "mozzarella-sticks": "Que phô mai mozzarella chiên",
  "chicken-nuggets": "Nuggets gà",
  "crispy-fish-bites": "Miếng cá giòn",
  "french-fries": "Khoai tây chiên",
  pistachios: "Hạt dẻ cười rang muối",
  peanuts: "Đậu phộng rang muối",
  "simple-hot-dog": "Build Your Own Hot Dog",
  "classic-hot-dog": "Danish Hot Dog",
  "cheddar-bacon-dog": "Cheddar Bacon Hot Dog",
  "jalapeno-cheddar-dog": "Jalapeño Cheddar Hot Dog",
  "bavarian-dog": "Sauerkraut Mustard Hot Dog",
  "bbq-bacon-dog": "BBQ Bacon Hot Dog",
  "philly-cheesesteak": "Cheesesteak Dog",
  "classic-burger": "Classic Beef Burger",
  cheeseburger: "Cheeseburger",
  "signature-burger": "GASTROBURGER",
  "fish-burger": "Fish Burger",
  "burger-combo": "Cheeseburger Combo",
  "hot-dog-combo": "Hot Dog Combo",
  "cheese-steak-dog-combo": "Cheese Steak Dog Combo",
  "pita-kebab-combo": "Pita Kebab Combo",
  "family-combo": "Family Combo",
  "kids-nuggets-combo": "Kids Nuggets Combo",
  "kids-hot-dog-combo": "Kids Hot Dog Combo",
  "chicken-kebab": "Hộp thịt gà nướng xiên",
  "pork-kebab": "Hộp thịt heo nướng xiên",
  "kebab-pita": "Pita thịt xiên nướng",
  "bavarian-sausage": "Hộp xúc xích heo nướng",
  "cheddar-jalapeno-sausage": "Hộp xúc xích heo phô mai jalapeño",
  "grilled-chicken-sausage": "Hộp xúc xích gà nướng",
};

const DESCS_EN: Record<string, string> = {
  "chicken-wings":
    "Chicken wings marinated in beer and fried to a golden crust.",
  "mozzarella-sticks":
    "Golden fried mozzarella sticks with tomato sauce.",
  "chicken-nuggets": "Crispy chicken thigh nuggets.",
  "crispy-fish-bites":
    "Crispy basa fish bites in breading, served with tartar sauce.",
  "french-fries": "Crispy french fries.",
  pistachios: "Roasted salted pistachios for beer and cocktails.",
  peanuts: "Crunchy salted peanuts — a classic bar snack.",
  "simple-hot-dog": "Pick your sausage, toppings and sauces.",
  "classic-hot-dog":
    "Fried onion, pickled cucumber, mayo, ketchup, mustard and crispy onion.",
  "cheddar-bacon-dog":
    "Fried onion, pickles, cheese sauce, ketchup, mustard, bacon and crispy onion.",
  "jalapeno-cheddar-dog":
    "Fried onion, cheese sauce, ketchup, jalapeño and crispy onion.",
  "bavarian-dog": "Sauerkraut, mayo, mustard and crispy onion.",
  "bbq-bacon-dog":
    "Fried onion, pickled cucumber, mayo, BBQ sauce, mustard, bacon and crispy onion.",
  "philly-cheesesteak":
    "Thinly sliced beef steak, melted cheese, fried onion and bell pepper.",
  "classic-burger":
    "Burger sauce, lettuce, tomato, patty, pickles, pickled onion and burger sauce.",
  cheeseburger:
    "Burger sauce, lettuce, tomato, patty, cheese sauce, pickles, pickled onion and burger sauce.",
  "signature-burger":
    "BBQ sauce, pickle slices, patty, cheese sauce, crispy bacon, fried onion, sautéed mushrooms, BBQ sauce. Served with a wet wipe and disposable gloves.",
  "fish-burger":
    "Tartar sauce, pickles, patty, sauerkraut, fried onion and tartar sauce.",
  "burger-combo": "Cheeseburger, french fries and a drink.",
  "hot-dog-combo": "Any classic Hot Dog, french fries and a drink.",
  "cheese-steak-dog-combo": "Cheese Steak Dog, french fries and a drink.",
  "pita-kebab-combo":
    "Pita kebab — chicken or pork, french fries and a drink.",
  "family-combo":
    "Classic burger or cheeseburger, plus sides and drinks.",
  "kids-nuggets-combo":
    "Nuggets, french fries, juice or a drink and a surprise toy.",
  "kids-hot-dog-combo": "Classic Hot Dog, french fries and a surprise toy.",
  "chicken-kebab":
    "Box with marinated grilled chicken kebab and tomato sauce.",
  "pork-kebab":
    "Box with juicy marinated pork kebab and tomato sauce.",
  "kebab-pita":
    "Pita with grilled kebab, fresh vegetables and sauce. Choose pork or chicken.",
  "bavarian-sausage": "Box with grilled pork sausages.",
  "cheddar-jalapeno-sausage": "Box with grilled pork sausages with cheese.",
  "grilled-chicken-sausage": "Box with grilled chicken sausages.",
};

const DESCS_VN: Record<string, string> = {
  "chicken-wings":
    "Cánh gà ướp bia, chiên vàng giòn.",
  "mozzarella-sticks":
    "Que phô mai mozzarella chiên giòn, kèm sốt cà chua.",
  "chicken-nuggets": "Nuggets ức gà giòn.",
  "crispy-fish-bites":
    "Miếng cá basa chiên giòn, kèm sốt tartar.",
  "french-fries": "Khoai tây chiên giòn.",
  pistachios: "Hạt dẻ cười rang muối — kèm bia và cocktail.",
  peanuts: "Đậu phộng giòn muối — món quen ở bar.",
  "simple-hot-dog": "Chọn xúc xích, topping và sốt theo ý bạn.",
  "classic-hot-dog":
    "Hành phi, dưa chua, mayonnaise, ketchup, mù tạt và hành giòn.",
  "cheddar-bacon-dog":
    "Hành phi, dưa muối, sốt phô mai, ketchup, mù tạt, thịt xông khói và hành giòn.",
  "jalapeno-cheddar-dog":
    "Hành phi, sốt phô mai, ketchup, ớt jalapeño và hành giòn.",
  "bavarian-dog": "Bắp cải muối chua, mayonnaise, mù tạt và hành giòn.",
  "bbq-bacon-dog":
    "Hành phi, dưa chua, mayonnaise, sốt BBQ, mù tạt, thịt xông khói và hành giòn.",
  "philly-cheesesteak":
    "Thịt bò thái mỏng, phô mai chảy, hành phi và ớt chuông.",
  "classic-burger":
    "Sốt burger, rau xà lách, cà chua, bánh thịt, dưa muối, hành ngâm và sốt burger.",
  cheeseburger:
    "Sốt burger, rau xà lách, cà chua, bánh thịt, sốt phô mai, dưa muối, hành ngâm và sốt burger.",
  "signature-burger":
    "Sốt BBQ, dưa chua lát, bánh thịt, sốt phô mai, thịt xông khói giòn, hành phi, nấm xào, sốt BBQ. Kèm khăn ướt và găng tay dùng một lần.",
  "fish-burger":
    "Sốt tartar, dưa muối, bánh cá, bắp cải muối chua, hành phi và sốt tartar.",
  "burger-combo": "Cheeseburger, khoai tây chiên và nước uống.",
  "hot-dog-combo": "Hot Dog classic tùy chọn, khoai tây chiên và nước uống.",
  "cheese-steak-dog-combo": "Cheese Steak Dog, khoai tây chiên và nước uống.",
  "pita-kebab-combo":
    "Pita kebab — gà hoặc heo, khoai tây chiên và nước uống.",
  "family-combo":
    "Burger classic hoặc cheeseburger, kèm món phụ và nước uống.",
  "kids-nuggets-combo":
    "Nuggets, khoai tây chiên, nước ép hoặc nước uống và đồ chơi bất ngờ.",
  "kids-hot-dog-combo": "Hot Dog classic, khoai tây chiên và đồ chơi bất ngờ.",
  "chicken-kebab":
    "Hộp thịt gà xiên nướng ướp gia vị, kèm sốt cà chua.",
  "pork-kebab":
    "Hộp thịt heo xiên nướng mọng nước ướp gia vị, kèm sốt cà chua.",
  "kebab-pita":
    "Pita thịt xiên nướng, rau tươi và sốt. Chọn heo hoặc gà.",
  "bavarian-sausage": "Hộp xúc xích heo nướng trên lò.",
  "cheddar-jalapeno-sausage": "Hộp xúc xích heo phô mai nướng trên lò.",
  "grilled-chicken-sausage": "Hộp xúc xích gà nướng trên lò.",
};

const SAUSAGE_LABEL_BY_ID: Record<AppLang, Record<string, string>> = {
  ru: {},
  en: {
    "standard-pork": "Standard pork sausage",
    craft: "House-made craft sausage (choice of chicken, pork or beef)",
    "craft-chicken": "Craft chicken sausage",
    "craft-pork": "Craft pork sausage",
    "craft-pork-cheese": "Craft pork sausage with cheese",
    pork: "Pork kebab",
    chicken: "Chicken kebab",
  },
  vn: {
    "standard-pork": "Xúc xích heo tiêu chuẩn",
    craft: "Xúc xích craft tự làm (chọn gà, heo hoặc heo phô mai)",
    "craft-chicken": "Xúc xích craft gà",
    "craft-pork": "Xúc xích craft heo",
    "craft-pork-cheese": "Xúc xích craft heo phô mai",
    pork: "Thịt heo xiên nướng",
    chicken: "Thịt gà xiên nướng",
  },
};

const SAUSAGE_LABEL_BY_RU: Record<AppLang, Record<string, string>> = {
  ru: {},
  en: {
    "Стандартная свиная сосиска": "Standard pork sausage",
    "Крафтовая колбаска собственного производства": "House-made craft sausage",
    "Крафтовая колбаска (курица, свинина или говядина на выбор)":
      "House-made craft sausage (chicken, pork or beef)",
    "Крафтовая колбаска (курица, свинина или свинина с сыром на выбор)":
      "House-made craft sausage (chicken, pork or pork with cheese)",
    "Классическая свиная сосиска": "Classic pork sausage",
    "Куриная крафтовая сосиска": "Craft chicken sausage",
    "Свиная крафтовая сосиска": "Craft pork sausage",
    "Свиная крафтовая сосиска с сыром": "Craft pork sausage with cheese",
    "Свиной шашлык": "Pork kebab",
    "Куриный шашлык": "Chicken kebab",
  },
  vn: {
    "Стандартная свиная сосиска": "Xúc xích heo tiêu chuẩn",
    "Крафтовая колбаска собственного производства": "Xúc xích craft tự làm",
    "Крафтовая колбаска (курица, свинина или говядина на выбор)":
      "Xúc xích craft tự làm (chọn gà, heo hoặc bò)",
    "Крафтовая колбаска (курица, свинина или свинина с сыром на выбор)":
      "Xúc xích craft tự làm (chọn gà, heo hoặc heo phô mai)",
    "Классическая свиная сосиска": "Xúc xích heo classic",
    "Куриная крафтовая сосиска": "Xúc xích craft gà",
    "Свиная крафтовая сосиска": "Xúc xích craft heo",
    "Свиная крафтовая сосиска с сыром": "Xúc xích craft heo phô mai",
    "Свиной шашлык": "Thịt heo xiên nướng",
    "Куриный шашлык": "Thịt gà xiên nướng",
  },
};

const BYO_OPTION_LABEL: Record<AppLang, Record<string, string>> = {
  ru: {},
  en: {
    "fried-onion": "Fried onion",
    "pickled-onion": "Pickled onion",
    "crispy-onion": "Crispy onion",
    "sour-cabbage": "Sauerkraut",
    pickles: "Pickles",
    jalapeno: "Jalapeño",
    "crispy-bacon": "Crispy bacon",
    mayonnaise: "Mayonnaise",
    ketchup: "Ketchup",
    mustard: "Mustard",
    "honey-mustard": "Honey mustard",
    bbq: "BBQ",
    cheese: "Cheese sauce",
    sriracha: "Sriracha",
    "sweet-chilli": "Sweet chilli",
    tartar: "Tartar",
    "tomato-herbs": "Tomato & herbs",
  },
  vn: {
    "fried-onion": "Hành phi",
    "pickled-onion": "Hành ngâm",
    "crispy-onion": "Hành giòn",
    "sour-cabbage": "Bắp cải muối chua",
    pickles: "Dưa chua",
    jalapeno: "Jalapeño",
    "crispy-bacon": "Thịt xông khói giòn",
    mayonnaise: "Mayonnaise",
    ketchup: "Ketchup",
    mustard: "Mù tạt",
    "honey-mustard": "Mù tạt mật ong",
    bbq: "BBQ",
    cheese: "Sốt phô mai",
    sriracha: "Sriracha",
    "sweet-chilli": "Ớt ngọt",
    tartar: "Tartar",
    "tomato-herbs": "Cà chua & thảo mộc",
  },
};

export function foodMenuDisplayName(item: PosterFoodMenuItem, lang: AppLang): string {
  let base: string;
  if (lang === "ru") {
    base = item.name;
  } else if (lang === "vn") {
    base = TITLES_VN[item.id] ?? TITLES_EN[item.id] ?? item.name;
  } else {
    base = TITLES_EN[item.id] ?? item.name;
  }

  if (item.category === "hot-dogs") {
    if (item.hotDogPrefix === false) return base;
    if (!base.toLowerCase().includes("hot dog")) {
      return `${HOT_DOG_LABEL} ${base}`;
    }
  }
  return base;
}

export function foodMenuDisplayDescription(item: PosterFoodMenuItem, lang: AppLang): string {
  if (lang === "ru") return item.description || "";
  if (lang === "vn") {
    return DESCS_VN[item.id] ?? DESCS_EN[item.id] ?? (item.description || "");
  }
  return DESCS_EN[item.id] ?? (item.description || "");
}

export function foodSausageOptionLabel(
  option: { id: string; label: string; shortLabel?: string },
  lang: AppLang,
): string {
  const source = option.shortLabel || option.label;
  if (lang === "ru") return source;
  return (
    SAUSAGE_LABEL_BY_ID[lang][option.id] ??
    SAUSAGE_LABEL_BY_RU[lang][source] ??
    SAUSAGE_LABEL_BY_RU[lang][option.label] ??
    source
  );
}

export function foodBuildYourOwnOptionLabel(id: string, fallback: string, lang: AppLang): string {
  if (lang === "ru") return fallback;
  return BYO_OPTION_LABEL[lang][id] ?? fallback;
}

export function foodCategoryLabelKey(
  categoryId: string,
): `food_cat_${string}` | "cat_all" {
  if (categoryId === "all") return "cat_all";
  return `food_cat_${categoryId.replace(/-/g, "_")}` as `food_cat_${string}`;
}
