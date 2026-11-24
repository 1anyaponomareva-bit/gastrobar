/** Extra content languages on tech cards, names and cooking steps. EN + VN stay the defaults. */

export type ContentLangCode = string;

export type ContentLangOption = {
  code: ContentLangCode;
  label: { ru: string; en: string; vn: string };
};

export const DEFAULT_CONTENT_LANGS = ["en", "vn"] as const;

export const CONTENT_LANGS: ContentLangOption[] = [
  { code: "en", label: { ru: "English", en: "English", vn: "English" } },
  { code: "vn", label: { ru: "Tiếng Việt", en: "Vietnamese", vn: "Tiếng Việt" } },
  { code: "ru", label: { ru: "Русский", en: "Russian", vn: "Tiếng Nga" } },
  { code: "zh", label: { ru: "中文", en: "Chinese", vn: "Tiếng Trung" } },
  { code: "ko", label: { ru: "한국어", en: "Korean", vn: "Tiếng Hàn" } },
  { code: "ja", label: { ru: "日本語", en: "Japanese", vn: "Tiếng Nhật" } },
  { code: "th", label: { ru: "ไทย", en: "Thai", vn: "Tiếng Thái" } },
  { code: "id", label: { ru: "Bahasa Indonesia", en: "Indonesian", vn: "Tiếng Indonesia" } },
  { code: "fr", label: { ru: "Français", en: "French", vn: "Tiếng Pháp" } },
  { code: "de", label: { ru: "Deutsch", en: "German", vn: "Tiếng Đức" } },
  { code: "es", label: { ru: "Español", en: "Spanish", vn: "Tiếng Tây Ban Nha" } },
];

const OPTION_BY_CODE = new Map(CONTENT_LANGS.map((row) => [row.code, row]));

export function normalizeContentLang(code: string | null | undefined): ContentLangCode | null {
  const value = (code ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!/^[a-z]{2,5}$/.test(value)) return null;
  if (value === "vi") return "vn";
  return value;
}

export function contentLangLabel(code: string, ui: "ru" | "en" | "vn" = "ru"): string {
  const option = OPTION_BY_CODE.get(code);
  if (option) return option.label[ui];
  return code.toUpperCase();
}

export function extraContentLangs(shown: readonly string[]): ContentLangOption[] {
  const have = new Set(shown);
  return CONTENT_LANGS.filter((row) => !have.has(row.code) && row.code !== "en" && row.code !== "vn");
}

export function uniqueContentLangs(codes: Iterable<string>): ContentLangCode[] {
  const seen = new Set<string>();
  const out: ContentLangCode[] = [];
  for (const raw of codes) {
    const code = normalizeContentLang(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function shownContentLangs(extra: Iterable<string>): ContentLangCode[] {
  return uniqueContentLangs([...DEFAULT_CONTENT_LANGS, ...extra]);
}

/** Drop empty strings; keep only normalized 2–5 letter codes. */
export function sanitizeLangMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const code = normalizeContentLang(key);
    if (!code) continue;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text) out[code] = text.slice(0, 600);
  }
  return out;
}

export function langMapGet(map: Record<string, string> | undefined, code: string): string {
  return (map?.[code] ?? "").trim();
}

export function langMapSet(map: Record<string, string> | undefined, code: string, text: string): Record<string, string> {
  const next = { ...(map ?? {}) };
  const trimmed = text.trim();
  if (trimmed) next[code] = text;
  else delete next[code];
  return next;
}

/** Extra catalog names: never store EN/VN here — those stay in name_en / name_vn. */
export function extraNamesOnly(map: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(map ?? {})) {
    const code = normalizeContentLang(key);
    if (!code || code === "en" || code === "vn") continue;
    out[code] = raw;
  }
  return out;
}

export function namesEqual(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
  const left = extraNamesOnly(a);
  const right = extraNamesOnly(b);
  const keys = uniqueContentLangs([...Object.keys(left), ...Object.keys(right)]);
  return keys.every((code) => (left[code] ?? "").trim() === (right[code] ?? "").trim());
}

export function namesHaystack(row: {
  name_en?: string | null;
  name_vn?: string | null;
  names?: Record<string, string> | null;
  brand?: string | null;
}): string {
  return [row.name_en, row.name_vn, row.brand, ...Object.values(row.names ?? {})].filter(Boolean).join(" ");
}

export function pickContentText(map: Record<string, string> | undefined, preferred: string): string {
  const source = map ?? {};
  const order = uniqueContentLangs([preferred, preferred === "vn" ? "vn" : "en", "en", "vn", "ru", ...Object.keys(source)]);
  for (const code of order) {
    const text = (source[code] ?? "").trim();
    if (text) return text;
  }
  return "";
}
