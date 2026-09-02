"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGoogleMapsEmbedUrl, buildGoogleMapsSearchUrl } from "@/lib/poster/googleMapsEmbed";
import { useTranslation } from "@/lib/useTranslation";

type PosterTestDeliveryAddressFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

const MIN_ADDRESS_LENGTH = 8;
const DEBOUNCE_MS = 650;

export function PosterTestDeliveryAddressField({
  value,
  onChange,
}: PosterTestDeliveryAddressFieldProps) {
  const { t, lang } = useTranslation();
  const [debouncedAddress, setDebouncedAddress] = useState(value.trim());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAddress(value.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  const showMap = debouncedAddress.length >= MIN_ADDRESS_LENGTH;
  const embedUrl = useMemo(
    () => (showMap ? buildGoogleMapsEmbedUrl(debouncedAddress, lang) : null),
    [debouncedAddress, lang, showMap],
  );
  const openUrl = useMemo(
    () => (showMap ? buildGoogleMapsSearchUrl(debouncedAddress) : null),
    [debouncedAddress, showMap],
  );

  return (
    <div className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-white/45">
        {t("poster_test_delivery_address")}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-amber-300/60"
        placeholder={t("poster_test_delivery_address_placeholder")}
        autoComplete="street-address"
      />

      {showMap && embedUrl && openUrl ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <div className="relative aspect-[16/10] w-full bg-black/40">
            <iframe
              title={t("poster_test_delivery_map_title")}
              src={embedUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <div className="space-y-2 border-t border-white/10 px-3 py-3">
            <p className="text-xs leading-relaxed text-white/55">{t("poster_test_delivery_map_hint")}</p>
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-xs font-semibold text-amber-200/95 underline-offset-2 hover:underline"
            >
              {t("poster_test_delivery_map_open")}
            </a>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-white/40">{t("poster_test_delivery_map_empty")}</p>
      )}
    </div>
  );
}
