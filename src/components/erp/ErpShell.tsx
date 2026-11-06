"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminAuthForm } from "@/components/recipes/AdminAuthForm";
import type { ErpAction, ErpState } from "@/lib/erp/types";
import { translate } from "@/lib/i18n";
import { ERP_LANGS, LANG_STORAGE_KEY, readStoredLang, setErpLang, type ErpLang } from "./i18n";
import { activeStockHref, stockNavItems } from "./stockNav";
import { Empty, errorText, loadingText, NavLink, T } from "./ui";
import "./erp.css";

type Notice = { ok: boolean; text: string } | null;

type ActOptions = {
  /** Called with the error response, e.g. to show the draft that was saved before posting failed. */
  onFail?: (data: Record<string, unknown>) => void;
};

type ErpContextValue = {
  email: string;
  state: ErpState | null;
  reload: () => Promise<void>;
  /**
   * Runs an action; on success shows `successText` (or "Saved") and applies the data the server
   * returns as changed (or reloads everything when it returns none).
   */
  act: <T = Record<string, unknown>>(action: ErpAction, successText?: string | false, options?: ActOptions) => Promise<T | null>;
  busy: boolean;
  notify: (notice: Notice) => void;
  /** Grows after every document change, so document lists know to refresh. */
  docsVersion: number;
};

const DOCUMENT_ACTIONS = new Set<ErpAction["action"]>(["saveDocument", "postDocument", "cancelDocument", "deleteDraft"]);
/** Comes back to the ERP after this long away: catalog changes from Staff or another tab are loaded. */
const FOCUS_REFRESH_MS = 30_000;

type StateResponse = ErpState & { email: string };

async function fetchState(): Promise<{ status: number; data: StateResponse | null; error: string | null }> {
  const response = await fetch("/api/erp/state", { cache: "no-store" }).catch(() => null);
  if (!response) return { status: 0, data: null, error: "network" };
  const body = await response.json().catch(() => null);
  if (!response.ok) return { status: response.status, data: null, error: body?.error ?? "server" };
  return { status: response.status, data: body as StateResponse, error: null };
}

function withoutEmail({ email: _email, ...state }: StateResponse): ErpState {
  return state;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export function useErp(): ErpContextValue {
  const value = useContext(ErpContext);
  if (!value) throw new Error("useErp outside ErpShell");
  return value;
}

type Section = "home" | "products" | "stock" | "preps" | "menu" | "service";

export function sectionOf(pathname: string | null): Section {
  const path = pathname ?? "/erp";
  if (path.startsWith("/erp/products")) return "products";
  if (path.startsWith("/erp/stock") || path.startsWith("/erp/documents")) return "stock";
  if (path.startsWith("/erp/preps")) return "preps";
  if (path.startsWith("/erp/menu")) return "menu";
  if (path.startsWith("/erp/service")) return "service";
  return "home";
}

const ICONS: Record<Section, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  products: <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  stock: <path d="M3 9.5 12 4l9 5.5V20H3zM7 20v-6h10v6M7 17h10" />,
  preps: <path d="M5 11h14v3a7 7 0 0 1-14 0zM3 11h18M9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4" />,
  menu: <path d="M6 3v8a2 2 0 0 0 2 2v8M10 3v8a2 2 0 0 1-2 2M8 3v6M17 21V3c-2 1-3 4-3 8h3" />,
  service: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z" />
  ),
};

const Icon = ({ section }: { section: Section }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
    {ICONS[section]}
  </svg>
);

const navItems = (): { section: Section; href: string; label: string; short: string }[] => [
  { section: "home", href: "/erp", label: T("Главная", "Home", "Trang chủ"), short: T("Главная", "Home", "Trang chủ") },
  { section: "products", href: "/erp/products", label: T("Продукты", "Products", "Sản phẩm"), short: T("Продукты", "Products", "Sản phẩm") },
  { section: "stock", href: "/erp/stock", label: T("Склад", "Stock", "Kho"), short: T("Склад", "Stock", "Kho") },
  { section: "preps", href: "/erp/preps", label: T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm"), short: T("Полуфабр.", "Preps", "BTP") },
  { section: "menu", href: "/erp/menu", label: T("Меню", "Menu", "Thực đơn"), short: T("Меню", "Menu", "Thực đơn") },
];

function LangSwitch({ lang, onChange }: { lang: ErpLang; onChange: (lang: ErpLang) => void }) {
  return (
    <div className="erpLang" role="group" aria-label="Language">
      {ERP_LANGS.map((item) => (
        <button key={item.code} type="button" className={item.code === lang ? "active" : ""} onClick={() => onChange(item.code)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ErpShell({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<ErpLang>("ru");
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [invite, setInvite] = useState<string | null>(null);
  const [initial, setInitial] = useState<ErpState | null>(null);
  setErpLang(lang);

  useEffect(() => {
    setLang(readStoredLang());
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) {
      setInvite(code);
      setMode("register");
    }
    // One request opens the ERP: the data answer also tells who is signed in (401: nobody).
    void fetchState().then(async ({ status, data }) => {
      if (data) {
        setInitial(withoutEmail(data));
        setEmail(data.email);
        return;
      }
      if (status === 401) return setEmail(null);
      // Data failed for another reason: find out about the session; the data screen shows the error.
      const session = await fetch("/api/erp/session", { cache: "no-store" })
        .then((response) => response.json() as Promise<{ email?: string | null }>)
        .catch(() => null);
      setEmail(session?.email ?? null);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "vn" ? "vi" : lang;
  }, [lang]);

  const changeLang = (next: ErpLang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  };

  // Stable, so page changes (which re-render this layout) do not restart the data loading.
  const expire = useCallback(() => {
    setInitial(null);
    setEmail(null);
  }, []);

  const logout = async () => {
    await fetch("/api/recipes-admin/logout", { method: "POST" }).catch(() => {});
    expire();
  };

  if (email === undefined) {
    return (
      <div className="erp">
        <div className="erpLoading">{loadingText()}</div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="erp">
        <header className="erpAuthHead">
          <span className="erpBrand">GASTROFOOD</span>
          <LangSwitch lang={lang} onChange={changeLang} />
        </header>
        <div className="erpAuth recipes-app">
          <AdminAuthForm
            mode={mode}
            invite={invite}
            t={(key) => translate(lang, key)}
            onDone={setEmail}
            onSwitchToLogin={() => setMode("login")}
          />
        </div>
      </div>
    );
  }

  return (
    <ErpData
      email={email}
      initial={initial}
      onExpired={expire}
      lang={lang}
      onLang={changeLang}
      onLogout={logout}
    >
      {children}
    </ErpData>
  );
}

function ErpData({
  email,
  initial,
  onExpired,
  lang,
  onLang,
  onLogout,
  children,
}: {
  email: string;
  initial: ErpState | null;
  onExpired: () => void;
  lang: ErpLang;
  onLang: (lang: ErpLang) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const stockActive = activeStockHref(pathname);
  const [stockOpen, setStockOpen] = useState(section === "stock");
  const [state, setState] = useState<ErpState | null>(initial);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [docsVersion, setDocsVersion] = useState(0);
  const hasState = useRef(Boolean(initial));
  /** Counts writes, so a reload that started before a write does not overwrite its newer data. */
  const writes = useRef(0);

  const reload = useCallback(async () => {
    const startedAt = writes.current;
    const { status, data, error } = await fetchState();
    if (status === 401) return onExpired();
    if (!data) {
      // With data on screen a failed refresh only shows a notice: open forms keep what was typed.
      if (hasState.current) setNotice({ ok: false, text: errorText(error ?? "server") });
      else setLoadError(error ?? "server");
      return;
    }
    if (writes.current !== startedAt) return;
    setLoadError(null);
    hasState.current = true;
    setState(withoutEmail(data));
  }, [onExpired]);

  useEffect(() => {
    if (!hasState.current) void reload();
    // Catalog changes made in Staff (or another tab) show up when the user comes back to the ERP.
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < FOCUS_REFRESH_MS) return;
      last = Date.now();
      void reload();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  useEffect(() => {
    if (!notice?.ok) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setStockOpen(section === "stock");
  }, [section]);

  const act = useCallback(
    async <T,>(action: ErpAction, successText?: string | false, options?: ActOptions): Promise<T | null> => {
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
        const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string; patch?: Partial<ErpState> } & T;
        writes.current += 1;
        if (DOCUMENT_ACTIONS.has(action.action)) setDocsVersion((version) => version + 1);
        if (!response.ok) {
          setNotice({ ok: false, text: errorText(data.error ?? "server", data.detail) });
          options?.onFail?.(data);
          return null;
        }
        if (successText !== false) setNotice({ ok: true, text: successText ?? T("Сохранено", "Saved", "Đã lưu") });
        const patch = data.patch;
        if (patch) setState((prev) => (prev ? { ...prev, ...patch } : prev));
        else await reload();
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

  const items = navItems();

  return (
    <ErpContext.Provider value={{ email, state, reload, act, busy, notify: setNotice, docsVersion }}>
      <div className="erp erpApp">
        <aside className="erpSide">
          <div className="erpSideBrand">
            GASTROFOOD
            <small>ERP</small>
          </div>
          <nav className="erpSideNav">
            {items.map((item) =>
              item.section === "stock" ? (
                <div key={item.href} className={`erpSideGroup ${stockOpen ? "open" : ""}`}>
                  <NavLink
                    href={item.href}
                    className={section === "stock" ? "active" : ""}
                    aria-expanded={stockOpen}
                    aria-controls="erp-stock-sub"
                    onClick={(event) => {
                      if (section !== "stock") {
                        setStockOpen(true);
                        return;
                      }
                      event.preventDefault();
                      setStockOpen((open) => !open);
                    }}
                  >
                    <Icon section={item.section} />
                    {item.label}
                    <svg className="erpSideChevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </NavLink>
                  <div className="erpSideSub" id="erp-stock-sub">
                    <div>
                      {stockNavItems().map((sub) => (
                        <NavLink key={sub.href} href={sub.href} className={stockActive === sub.href ? "active" : ""}>
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <NavLink key={item.href} href={item.href} className={section === item.section ? "active" : ""}>
                  <Icon section={item.section} />
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
          <div className="erpSideFoot">
            <NavLink href="/erp/service" className={`erpSideService ${section === "service" ? "active" : ""}`}>
              <Icon section="service" />
              {T("Служебное", "Admin tools", "Quản trị")}
            </NavLink>
            <LangSwitch lang={lang} onChange={onLang} />
            <div className="erpSideUser">
              <span title={email}>{email}</span>
              <button type="button" className="erpLink" onClick={onLogout}>
                {T("Выйти", "Log out", "Đăng xuất")}
              </button>
            </div>
          </div>
        </aside>

        <header className="erpTop">
          <span className="erpBrand">GASTROFOOD</span>
          <div className="erpTopRight">
            <LangSwitch lang={lang} onChange={onLang} />
            <NavLink href="/erp/service" className={`erpTopIcon ${section === "service" ? "active" : ""}`}>
              <Icon section="service" />
              <span className="erpSr">{T("Служебное", "Admin tools", "Quản trị")}</span>
            </NavLink>
          </div>
        </header>

        <div className="erpBody">
          {notice ? (
            <div className={`erpToast ${notice.ok ? "ok" : "bad"}`} role={notice.ok ? "status" : "alert"}>
              <span>{notice.text}</span>
              <button type="button" aria-label="×" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          ) : null}
          <main className="erpMain">
            {loadError ? (
              <Empty
                kind="error"
                title={T("Не удалось загрузить данные", "Could not load data", "Không tải được dữ liệu")}
                text={errorText(loadError)}
                action={
                  <button type="button" className="erpBtn primary" onClick={() => void reload()}>
                    {T("Повторить", "Try again", "Thử lại")}
                  </button>
                }
              />
            ) : state ? (
              children
            ) : (
              <div className="erpLoading">{loadingText()}</div>
            )}
          </main>
        </div>

        <nav className="erpBottomNav">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} className={section === item.section ? "active" : ""}>
              <Icon section={item.section} />
              <span>{item.short}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </ErpContext.Provider>
  );
}
