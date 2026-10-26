"use client";

import { useEffect, useState } from "react";
import {
  androidChromeIntentUrl,
  detectInAppBrowser,
  type InAppBrowserInfo,
} from "@/lib/deliverPdfFile";

type Props = {
  t: (key: string) => string;
};

export function InAppBrowserNotice({ t }: Props) {
  const [info, setInfo] = useState<InAppBrowserInfo>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInfo(detectInAppBrowser());
  }, []);

  if (!info) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt(t("staff_inapp_copy"), window.location.href);
    }
  };

  return (
    <div className="inAppNotice" role="alert">
      <b>{t("staff_inapp_title")}</b>
      <p>
        {info.platform === "ios"
          ? t("staff_inapp_ios")
          : info.platform === "android"
            ? t("staff_inapp_android")
            : t("staff_inapp_other")}
      </p>
      <div className="inAppActions">
        {info.platform === "android" ? (
          <a className="inAppOpen" href={androidChromeIntentUrl(window.location.href)}>
            {t("staff_inapp_open_chrome")}
          </a>
        ) : null}
        <button type="button" className="dark" onClick={handleCopy}>
          {copied ? t("staff_inapp_copied") : t("staff_inapp_copy")}
        </button>
      </div>
    </div>
  );
}
