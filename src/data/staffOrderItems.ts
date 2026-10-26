export type StaffOrderSupplierId =
  | "mm"
  | "hisina"
  | "happy-papa"
  | "tran-anh"
  | "shopee"
  | "saigon-efp"
  | "rvc"
  | "qween-pack"
  | "quang-minh"
  | "minh-nhat"
  | "atlas"
  | "moonmilk"
  | "pork-intestines";

export type StaffOrderSupplier = {
  id: StaffOrderSupplierId;
  label: string;
  zaloUrl?: string;
};

export const STAFF_ORDER_SUPPLIERS: StaffOrderSupplier[] = [
  { id: "mm", label: "MM", zaloUrl: "https://zalo.me/g/65gr4g33gucqyijbhtgi" },
  { id: "hisina", label: "Hisina", zaloUrl: "https://zalo.me/g/dhfjwk4dvjb9pwdjs1es" },
  { id: "happy-papa", label: "Happy Papa" },
  { id: "tran-anh", label: "Trần Anh" },
  { id: "shopee", label: "Shopee", zaloUrl: "https://zalo.me/g/bzsivi1igdlvmlvft9pj" },
  { id: "saigon-efp", label: "Saigon EFP" },
  { id: "rvc", label: "RVC" },
  { id: "qween-pack", label: "Qween Pack" },
  { id: "quang-minh", label: "Quang Minh" },
  { id: "minh-nhat", label: "Minh Nhật Foods" },
  { id: "atlas", label: "Atlas" },
  { id: "moonmilk", label: "Moonmilk" },
  { id: "pork-intestines", label: "Pork Intestines" },
];

export const STAFF_ORDER_CATEGORIES = [
  "Alcohol",
  "Dairy Products & Eggs",
  "Disposable Tableware",
  "Fruits & Vegetables",
  "Meat & Poultry",
  "Pantry",
  "Sauces",
  "Soft Drinks",
  "Supplies",
] as const;

export type StaffOrderCategory = (typeof STAFF_ORDER_CATEGORIES)[number];

export type StaffOrderItem = {
  id: string;
  category: StaffOrderCategory;
  name: string;
  brand?: string;
  pack?: string;
  unit: string;
  supplier: StaffOrderSupplierId;
  itemNo?: string;
};

type Row = [
  name: string,
  brand: string,
  pack: string,
  unit: string,
  supplier: StaffOrderSupplierId,
  itemNo?: string,
];

const ROWS: Record<StaffOrderCategory, Row[]> = {
  Alcohol: [["Saigon Beer (330ml)", "", "24 pcs", "pack", "mm", "259043"]],
  "Dairy Products & Eggs": [
    ["Butter", "Allowrie Unsalted", "5 kg", "box", "mm", "234468"],
    ["Cheese - Cheddar (Sliced)", "Anchor", "10*1040 g", "box", "hisina"],
    ["Cheese - Mozzarella", "Golden Pizza", "5*2 kg", "box", "happy-papa"],
    ["Cheese - Mozzarella", "Mlekpol", "5*2 kg", "box", "happy-papa"],
    ["Eggs", "MM Pro", "10 pcs", "pack", "mm", "320936"],
    ["Milk", "TH", "1 L", "pcs", "mm", "192382"],
    ["Yogurt (Plain)", "Dalat", "1 kg", "pcs", "mm", "226563"],
  ],
  "Disposable Tableware": [
    ["Appetizer Box (500ml)", "", "600 pcs", "box", "rvc", "TBB500"],
    ["Burger Box", "", "400 pcs", "box", "saigon-efp", "B5"],
    ["Hotdog Box", "", "1200 pcs", "box", "rvc", "Hộp Giấy Kraft Nâu Nắp PET 190×90 mm"],
    ["Lunch Box (1000ml)", "", "300 pcs", "box", "qween-pack", "QP-HT25"],
    ["Paper Bag (Pita)", "", "8000 pcs", "box", "saigon-efp", "14GT"],
    ["Paper Wrap", "", "50 pcs", "pack", "shopee"],
    ["Plastic Gloves (Single Pack)", "", "100 pcs", "pack", "shopee"],
    ["Plastic Cup+Lid (500ml)", "", "50 pcs", "pack", "shopee"],
    ["Plastic Fork and Spoon (Single Pack)", "", "100 pcs", "pack", "shopee"],
    ["Plastic Bag (Cup)", "", "1 kg", "kg", "shopee"],
    ["Plastic Bag (3kg)", "", "1 kg", "kg", "shopee"],
    ["Plastic Bag (5kg)", "", "1 kg", "kg", "shopee"],
    ["Sauce Cup+Lid (2oz, 60ml)", "", "2000 pcs", "box", "saigon-efp", "C-2OZ"],
    ["Stickers (GastroFood)", "", "10 000 pcs", "box", "quang-minh"],
    ["Wet Nupkins (Single Pack)", "", "500 pcs", "pack", "shopee"],
    ["Straw (8mm Single Pack)", "", "", "box", "qween-pack"],
  ],
  "Fruits & Vegetables": [
    ["Cucumber", "", "1 kg", "kg", "tran-anh"],
    ["Garlic", "", "1 kg", "kg", "tran-anh"],
    ["Lemon", "", "1 kg", "kg", "tran-anh"],
    ["Salad", "", "1 kg", "kg", "tran-anh"],
    ["Lime", "", "1 kg", "kg", "tran-anh"],
    ["Onion", "", "1 kg", "kg", "tran-anh"],
    ["Onion Red", "", "1 kg", "kg", "tran-anh"],
    ["Green Bell Pepper", "", "1 kg", "kg", "tran-anh"],
    ["Red Bell Pepper", "", "1 kg", "kg", "tran-anh"],
    ["Beef Tomatos", "", "1 kg", "kg", "tran-anh"],
    ["Potatoes", "", "1 kg", "kg", "tran-anh"],
    ["Parsley", "", "1 kg", "kg", "tran-anh"],
  ],
  "Meat & Poultry": [
    ["Bacon", "", "10*1 kg", "box", "hisina", "HHBR0001"],
    ["Buffalo Meat - Striploin 46", "", "20 kg", "box", "happy-papa"],
    ["Beef Fat", "", "13-15 kg", "box", "happy-papa"],
    ["Basa Fillet", "", "20 kg", "box", "happy-papa"],
    ["Chicken - Leg Quater", "", "15 kg", "box", "happy-papa"],
    ["Chicken - Wings", "", "20 kg", "box", "minh-nhat"],
    ["French Fries", "Marquise", "10 kg", "box", "happy-papa"],
    ["Hotdog Sausage", "", "60*500 g", "box", "hisina", "HHHD0001"],
    ["Pork - Collar", "", "20-25 kg", "box", "happy-papa"],
    ["Pork - Fat", "", "15 kg", "box", "happy-papa"],
    ["Pork - Intestines (26-28mm)", "", "500 g", "pack", "pork-intestines"],
  ],
  Pantry: [
    ["Capers", "Coop", "200 g", "can", "mm", "442290"],
    ["Cilantro (Dry)", "", "500 g", "pcs", "shopee"],
    ["Corn Starch", "Meizan", "1 kg", "pcs", "mm", "352243"],
    ["Coriander (Powder)", "", "500 g", "pcs", "shopee"],
    ["Cumin (Powder)", "", "500 g", "pcs", "shopee"],
    ["Dill (Dry)", "", "100 g", "pcs", "shopee"],
    ["Flour", "Meizan", "1 kg", "pcs", "mm", "221841"],
    ["Garlic (Powder)", "", "500 g", "pcs", "shopee"],
    ["Ginger (Powder)", "", "500 g", "pcs", "shopee"],
    ["Honey", "MM Pro", "2800 g/bottle", "btl", "mm", "435624"],
    ["Jalapeno (Pickled)", "La Costena", "2800 g/can", "can", "atlas", "MP113"],
    ["Khmeli Suneli (Powder)", "", "", "g", "shopee"],
    ["Nutmeg (Powder)", "", "1 kg", "pack", "shopee"],
    ["Oil Cooking", "Happy Price", "5 L/bottle", "btl", "mm", "319364"],
    ["Oil Olive", "Neptune", "2 L/bottle", "btl", "mm", "480726"],
    ["Oil Sesame", "Meizan", "250 ml/bottle", "btl", "mm", "171396"],
    ["Onion (Fried)", "", "1000 g", "g", "shopee"],
    ["Onion (Powder)", "", "500 g", "g", "shopee"],
    ["Panko Bread Crumbs", "Panko", "1 kg", "pcs", "mm", "438015"],
    ["Paprika (Powder)", "", "500 g", "g", "shopee"],
    ["Paprika Smoked (Powder)", "", "500 g", "g", "shopee"],
    ["Paprika Sweet (Powder)", "", "500 g", "g", "shopee"],
    ["Parsley (Dry)", "", "500 g", "g", "shopee"],
    ["Pepper Black (Powder)", "", "1000 g", "g", "shopee"],
    ["Pepper White (Powder)", "", "500 g", "g", "shopee"],
    ["Peppercorns Black", "", "250 g", "g", "shopee"],
    ["Pickles", "Tan Mai", "515 g", "pcs", "moonmilk"],
    ["Salt", "Vietsalt", "1 kg", "kg", "mm", "420087"],
    ["Salt Nitrite", "", "1 kg", "kg", "shopee"],
    ["Sugar", "Bien Hoa Re", "1 kg", "kg", "mm", "197459"],
    ["Sumac", "Savi", "70 g", "g", "shopee"],
    ["Tomatoes - Whole Peeled", "Fiamma", "2500 g", "g", "mm", "211180"],
    ["Yeast", "", "500 g", "g", "shopee"],
  ],
  Sauces: [
    ["Mayonaise", "MM Pro", "1 kg", "pcs", "mm", "259664"],
    ["Mustard - Dijon Old Style", "Maille", "865 g", "can", "moonmilk", "125"],
    ["Mustard - Yellow", "Golden Farm", "500 g", "btl", "shopee"],
    ["Sauce - BBQ", "McCormick-Tanguy", "500 g", "btl", "mm", "348768"],
    ["Sauce - Ketchup", "Heinz", "3300 g", "can", "mm", "54448"],
    ["Sauce - Soy", "Maggi", "1800 ml", "btl", "mm", "176821"],
    ["Sauce - Sriracha", "Chinsu", "4*2 kg", "box", "mm", "435237"],
    ["Sauce - Sweet Chilli", "Aroy-D", "920 g", "btl", "mm", "188108"],
    ["Sauce - Worcestershire", "Lea&Perrins", "12*290 ml", "box", "atlas", "SA108"],
    ["Vinegar (4%)", "Minh Chau", "1000 ml", "btl", "mm", "209576"],
    ["Vinegar - Apple", "Sempio", "500 ml/bottle", "btl", "mm", "241208"],
  ],
  "Soft Drinks": [
    ["Coca-Cola (Can 320ml)", "", "24 pcs", "pack", "mm", "356978"],
    ["Coca-Cola Zero (Can 320ml)", "", "24 pcs", "pack", "mm", "370747"],
    ["Fanta (Can 320ml)", "", "24 pcs", "pack", "mm", "370743"],
    ["Schweppes Ginger Ale (Can 320ml)", "", "24 pcs", "pack", "mm", "390388"],
    ["Schweppes Soda (Can 320ml)", "", "24 pcs", "pack", "mm", "369807"],
    ["Schweppes Tonic (Can 320ml)", "", "24 pcs", "pack", "mm", "369217"],
    ["Sprite (Can 320ml)", "", "24 pcs", "pack", "mm", "368689"],
  ],
  Supplies: [
    ["Aluminum Foil (45x285m)", "MM Pro", "1 pcs", "pcs", "mm", "255749"],
    ["Bamboo Skewers (20cm)", "", "50 pcs", "pack", "shopee"],
    ["Cling Film (30x300m)", "Happy Price", "1 pcs", "pcs", "mm", "444169"],
    ["Cling Film (45x600m)", "Happy Price", "1 pcs", "pcs", "mm", "444172"],
    ["Dishwash Liquid", "Happy Price", "5 kg/bottle", "btl", "mm", "415853"],
    ["Garbage Bags (45L)", "", "1 kg", "kg", "shopee"],
    ["Garbage Bags (60L)", "", "1 kg", "kg", "shopee"],
    ["Gloves - Vinyl (Large)", "", "100 pcs", "pcs", "shopee"],
    ["Hand Towel", "Khan Tay", "10 pcs", "pack", "mm", "190883"],
    ["Kitchen Towel", "MM Pro", "6 pcs/pack", "pack", "mm", "466249"],
    ["Nupkins (20*10)", "", "20 pcs", "pcs", "shopee"],
    ["Patty Paper (11.4cm)", "", "100 pcs", "pcs", "shopee"],
    ["Sanitizer 90%", "", "5 L", "L", "shopee"],
    ["Sponge", "", "12 pcs", "pack", "mm", "254305"],
    ["Steel Cleaning Spray", "Bref", "750 ml", "ml", "shopee"],
    ["Steel Scrub", "MM Pro", "6 pcs", "pack", "mm", "447688"],
    ["Stickers (35x22x50m)", "", "1 pcs", "pcs", "shopee"],
    ["Printer Paper Roll (12x40)", "", "160 pcs", "pcs", "shopee"],
    ["Printer Paper Roll (80x80)", "", "50 pcs", "box", "shopee"],
    ["Vacuum Bag (15*20)", "", "1 kg", "kg", "shopee"],
    ["Vacuum Bag (18*25)", "", "1 kg", "kg", "shopee"],
    ["Vacuum Bag (20*30)", "", "1 kg", "kg", "shopee"],
  ],
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const STAFF_ORDER_ITEMS: StaffOrderItem[] = STAFF_ORDER_CATEGORIES.flatMap(
  (category) =>
    ROWS[category].map(([name, brand, pack, unit, supplier, itemNo]) => ({
      id: slug(`${name} ${brand}`),
      category,
      name,
      brand: brand || undefined,
      pack: pack || undefined,
      unit,
      supplier,
      itemNo,
    })),
);

export function getStaffOrderSupplier(
  id: StaffOrderSupplierId,
): StaffOrderSupplier {
  return STAFF_ORDER_SUPPLIERS.find((supplier) => supplier.id === id)!;
}
