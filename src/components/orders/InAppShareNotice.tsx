"use client";

import { useEffect, useState } from "react";
import { androidChromeIntentUrl, detectInAppBrowser, type InAppBrowserInfo } from "@/lib/deliverPdfFile";
import { useOrders } from "./OrdersShell";

export function InAppShareNotice() {
  const { t } = useOrders();
  const [info, setInfo] = useState<InAppBrowserInfo>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInfo(detectInAppBrowser());
  }, []);

  if (!info) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt(t("inapp_copy"), window.location.href);
    }
  };

  return (
    <div className="orders-banner error" role="alert">
      <b>{t("inapp_title")}</b>
      <p style={{ margin: "6px 0 10px", fontWeight: 600 }}>
        {info.platform === "ios" ? t("inapp_ios") : info.platform === "android" ? t("inapp_android") : t("inapp_other")}
      </p>
      <div className="orders-actions">
        {info.platform === "android" ? (
          <a className="orders-btn ok" href={androidChromeIntentUrl(window.location.href)}>
            {t("inapp_chrome")}
          </a>
        ) : null}
        <button type="button" className="orders-btn dark" onClick={() => void copy()}>
          {copied ? t("inapp_copied") : t("inapp_copy")}
        </button>
      </div>
    </div>
  );
}
