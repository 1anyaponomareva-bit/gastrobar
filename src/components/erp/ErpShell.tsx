"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminAuthForm } from "@/components/recipes/AdminAuthForm";
import type { ErpAction, ErpState } from "@/lib/erp/types";
import { translate } from "@/lib/i18n";
import { errorText, L } from "./ui";
import "./erp.css";

type Notice = { ok: boolean; text: string } | null;

type ErpContextValue = {
  email: string;
  state: ErpState | null;
  reload: () => Promise<void>;
  act: <T = Record<string, unknown>>(action: ErpAction) => Promise<T | null>;
  busy: boolean;
  notify: (notice: Notice) => void;
};

const ErpContext = createContext<ErpContextValue | null>(null);

export function useErp(): ErpContextValue {
  const value = useContext(ErpContext);
  if (!value) throw new Error("useErp outside ErpShell");
  return value;
}

const NAV: { href: string; label: string }[] = [
  { href: "/erp", label: L("Start", "Bắt đầu") },
  { href: "/erp/catalog", label: L("Catalog", "Danh mục") },
  { href: "/erp/stock", label: L("Stock", "Tồn kho") },
  { href: "/erp/documents", label: L("Documents", "Chứng từ") },
  { href: "/erp/preps", label: L("Semi-finished", "Bán thành phẩm") },
  { href: "/erp/production", label: L("Production", "Sản xuất") },
  { href: "/erp/menu", label: L("Menu costing", "Giá vốn món") },
  { href: "/erp/review", label: L("Review", "Kiểm tra") },
  { href: "/erp/settings", label: L("Settings", "Cài đặt") },
];

const t = (key: string) => translate("en", key);

export function ErpShell({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [invite, setInvite] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) {
      setInvite(code);
      setMode("register");
    }
    fetch("/api/erp/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { email?: string | null }) => setEmail(data.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  const logout = async () => {
    await fetch("/api/recipes-admin/logout", { method: "POST" }).catch(() => {});
    setEmail(null);
  };

  return (
    <div className="erp">
      <header className="erpHeader">
        <div className="erpBrand">GASTROFOOD ERP</div>
        {email ? (
          <div className="erpUser">
            <span>{email}</span>
            <button type="button" className="erpLink" onClick={logout}>
              {L("Log out", "Đăng xuất")}
            </button>
          </div>
        ) : null}
      </header>
      {email === undefined ? (
        <div className="erpEmpty">{L("Loading…", "Đang tải…")}</div>
      ) : email ? (
        <ErpData email={email} onExpired={() => setEmail(null)}>
          {children}
        </ErpData>
      ) : (
        <div className="erpAuth recipes-app">
          <AdminAuthForm mode={mode} invite={invite} t={t} onDone={setEmail} onSwitchToLogin={() => setMode("login")} />
        </div>
      )}
    </div>
  );
}

function ErpData({ email, onExpired, children }: { email: string; onExpired: () => void; children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<ErpState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const response = await fetch("/api/erp/state", { cache: "no-store" }).catch(() => null);
    if (response?.status === 401) return onExpired();
    if (!response?.ok) {
      setLoadError(errorText((await response?.json().catch(() => null))?.error ?? "server"));
      return;
    }
    setLoadError(null);
    setState((await response.json()) as ErpState);
  }, [onExpired]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!notice?.ok) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const act = useCallback(
    async <T,>(action: ErpAction): Promise<T | null> => {
      setBusy(true);
      try {
        const response = await fetch("/api/erp/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        if (response.status === 401) {
          onExpired();
          return null;
        }
        const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string } & T;
        if (!response.ok) {
          setNotice({ ok: false, text: errorText(data.error ?? "server", data.detail) });
          return null;
        }
        setNotice({ ok: true, text: L("Saved", "Đã lưu") });
        await reload();
        return data;
      } catch {
        setNotice({ ok: false, text: errorText("network") });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onExpired, reload],
  );

  return (
    <ErpContext.Provider value={{ email, state, reload, act, busy, notify: setNotice }}>
      <nav className="erpNav">
        {NAV.map((item) => {
          const active = item.href === "/erp" ? pathname === "/erp" : pathname?.startsWith(item.href);
          return (
            <a key={item.href} href={item.href} className={active ? "active" : ""}>
              {item.label}
            </a>
          );
        })}
      </nav>
      {notice ? (
        <div className={`erpNotice ${notice.ok ? "ok" : "bad"}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="erpLink" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
      ) : null}
      <main className="erpMain">
        {loadError ? <div className="erpNotice bad">{loadError}</div> : state ? children : <div className="erpEmpty">{L("Loading…", "Đang tải…")}</div>}
      </main>
    </ErpContext.Provider>
  );
}
