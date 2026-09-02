export function googleMapsLanguage(lang: string): string {
  if (lang === "vn") return "vi";
  if (lang === "ru" || lang === "en") return lang;
  return "vi";
}

export function buildGoogleMapsSearchUrl(address: string): string {
  const query = encodeURIComponent(address.trim());
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function buildGoogleMapsEmbedUrl(address: string, lang: string): string | null {
  const trimmed = address.trim();
  if (trimmed.length < 5) return null;

  const query = encodeURIComponent(trimmed);
  const mapLang = googleMapsLanguage(lang);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${query}&zoom=16&language=${mapLang}`;
  }

  return `https://maps.google.com/maps?q=${query}&hl=${mapLang}&z=16&output=embed`;
}
