import type { LocalizedText, RecipeFactIcon, RecipeKind, RecipeStorageIcon } from "@/data/recipes";

/** [ymin, xmin, ymax, xmax], normalized to 0–1000 (Gemini convention). */
export type Box = [number, number, number, number];

export type ExtractedRecipe = {
  kind: RecipeKind;
  name: LocalizedText;
  cardNo: string;
  date: string;
  revision: string;
  yieldAmount: number;
  yieldUnit: string;
  yieldLabel: LocalizedText;
  heroBox: Box | null;
  facts: { icon: RecipeFactIcon; label: LocalizedText; value: LocalizedText }[];
  ingredients: { name: LocalizedText; unit: string; net: number }[];
  steps: { title: LocalizedText; items: LocalizedText[]; photoBox: Box | null }[];
  storage: { icon: RecipeStorageIcon; title: LocalizedText; text: LocalizedText | null }[];
};

const localized = {
  type: "OBJECT",
  properties: { ru: { type: "STRING" }, en: { type: "STRING" }, vn: { type: "STRING" } },
  required: ["ru", "en", "vn"],
  propertyOrdering: ["ru", "en", "vn"],
};

const box = {
  type: "ARRAY",
  items: { type: "INTEGER" },
  minItems: 4,
  maxItems: 4,
  nullable: true,
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["dish", "prep"] },
    name: localized,
    cardNo: { type: "STRING" },
    date: { type: "STRING" },
    revision: { type: "STRING" },
    yieldAmount: { type: "NUMBER" },
    yieldUnit: { type: "STRING", enum: ["g", "kg", "ml", "l", "pcs"] },
    yieldLabel: localized,
    heroBox: box,
    facts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          icon: { type: "STRING", enum: ["weight", "length", "storage", "time", "temperature"] },
          label: localized,
          value: localized,
        },
        required: ["icon", "label", "value"],
      },
    },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: localized,
          unit: { type: "STRING", enum: ["g", "kg", "ml", "l", "pcs", "egg"] },
          net: { type: "NUMBER" },
        },
        required: ["name", "unit", "net"],
        propertyOrdering: ["name", "unit", "net"],
      },
    },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: localized,
          items: { type: "ARRAY", items: localized },
          photoBox: box,
        },
        required: ["title", "items"],
      },
    },
    storage: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          icon: { type: "STRING", enum: ["freezer", "fridge", "thaw", "no-refreeze"] },
          title: localized,
          text: { ...localized, nullable: true },
        },
        required: ["icon", "title"],
      },
    },
  },
  required: [
    "kind",
    "name",
    "cardNo",
    "date",
    "revision",
    "yieldAmount",
    "yieldUnit",
    "yieldLabel",
    "facts",
    "ingredients",
    "steps",
    "storage",
  ],
  propertyOrdering: [
    "kind",
    "name",
    "cardNo",
    "date",
    "revision",
    "yieldAmount",
    "yieldUnit",
    "yieldLabel",
    "heroBox",
    "facts",
    "ingredients",
    "steps",
    "storage",
  ],
};

const PROMPT = `You convert a restaurant technical card (tech card / "технологическая карта") image into structured JSON for a kitchen app used by Russian and Vietnamese staff.

Rules:
- Copy every number EXACTLY as printed (amounts, weights, temperatures, times, sizes). Never round or invent numbers. "1,000 g" means 1000.
- Every text field must be given in three languages: ru (Russian), en (English), vn (Vietnamese). Use the text printed on the card for languages that are present; translate the missing ones. Russian must use natural professional kitchen terminology (e.g. "Нарезка", "Замес", "Панировка", "Брутто/Нетто"). Use proper Vietnamese diacritics.
- kind: "prep" for semi-finished products / preparations (card numbers like GF-PR-..., sauces, sausages, breaded items to be cooked later), "dish" for a dish served to guests.
- name: product name as on the card, including batch size in brackets if printed, e.g. "Fish Bites (1 kg)" / "Фиш байтс (1 кг)". Use normal sentence/title case in all languages, never ALL CAPS.
- cardNo, date, revision: from the card header; empty string if absent. Keep the date format as printed.
- yieldAmount + yieldUnit: the finished dish / product weight printed on the card (usually the total under the ingredients table). yieldLabel: short human label built from the yield, such as "1 batch ≈ 1.43 kg" (not the table heading); mention pieces or portions only if printed.
- ingredients: in the printed order. net = the amount that goes into the dish; if the card has both GROSS and NET columns, take NET and ignore GROSS. unit: g, kg, ml, l, pcs; use "egg" for eggs counted in pieces.
- facts: the highlighted key parameters (portion weight, piece weight, length, storage, cooking time/temperature), max 4. value includes the unit, e.g. "120–130 g". Use icon "weight" for weights, "length" for sizes, "storage" for storage temperature/shelf life.
- steps: every numbered step of the cooking technology in order EXCEPT a final storage-only step (put that into storage instead). title = step heading. items = one entry per bullet / numbered line, short imperative sentences; keep sub-lists as separate items (e.g. "1) flour;"). Include EVERY line of the step, including intro lines such as "After the coating is firm:" and final lines such as "Store in the freezer." — never skip or merge lines.
- storage: storage rules (freezer, fridge, after thawing, do not refreeze). title like "Freezer −18 °C", text like "up to 180 days" or null.
- heroBox: bounding box of the main photo of the finished product. photoBox: bounding box of the photo illustrating that step, or null if the step has no photo. Boxes are [ymin, xmin, ymax, xmax] normalized to 0-1000, tight around the photo itself only — exclude step number badges, headings, captions, icons and text.`;

function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

export async function extractRecipeFromImage(image: Buffer, mimeType: string): Promise<ExtractedRecipe> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const model = geminiModel();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: image.toString("base64") } }, { text: PROMPT }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: "low" },
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );

  const data = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${data?.error?.message ?? "request failed"}`);

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty response");
  return JSON.parse(text) as ExtractedRecipe;
}
