"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { errorMessage, getSession, isAuthError, logout as apiLogout } from "@/lib/orders/api";
import { ORDERS_LANGS, ordersT, readOrdersLang, writeOrdersLang, type OrdersLang } from "@/lib/orders/i18n";
import { OrdersLogin } from "./OrdersLogin";
import "./orders.css";

type OrdersContextValue = {
  email: string;
  lang: OrdersLang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (lang: OrdersLang) => void;
  setEmail: (email: string | null) => void;
  logout: () => void;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useOrders(): OrdersContextValue {
  const value = useContext(OrdersContext);
  if (!value) throw new Error("useOrders outside OrdersShell");
  return value;
}

function isOrdersTab(pathname: string | null): "list" | "orders" {
  const path = pathname ?? "/orders";
  if (path === "/orders" || path === "/orders/" || path.startsWith("/orders/suppliers")) return "list";
  return "orders";
}

export function OrdersShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lang, setLangState] = useState<OrdersLang>("ru");
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [bootError, setBootError] = useState<string | null>(null);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => ordersT(lang, key, vars), [lang]);

  useEffect(() => {
    setLangState(readOrdersLang());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "vn" ? "vi" : lang;
  }, [lang]);

  const loadSession = useCallback(async () => {
    setBootError(null);
    try {
      const session = await getSession();
      setEmail(session?.email ?? null);
    } catch (error) {
      if (isAuthError(error)) {
        setEmail(null);
        return;
      }
      setBootError(errorMessage(error, t("error_network"), t("error_load")));
      setEmail(null);
    }
  }, [t]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const setLang = (next: OrdersLang) => {
    setLangState(next);
    writeOrdersLang(next);
  };

  const logout = () => {
    void apiLogout();
    setEmail(null);
  };

  const ctx = useMemo<OrdersContextValue>(
    () => ({
      email: email ?? "",
      lang,
      t,
      setLang,
      setEmail: (value) => setEmail(value),
      logout,
    }),
    [email, lang, t],
  );

  const tab = isOrdersTab(pathname);

  if (email === undefined) {
    return (
      <div className="orders-app">
        <div className="orders-loading">{t("loading")}</div>
      </div>
    );
  }

  if (!email) {
    return (
      <OrdersContext.Provider value={ctx}>
        {bootError ? (
          <div className="orders-app">
            <div className="orders-main">
              <div className="orders-banner error" role="alert">
                {bootError}
                <button type="button" className="orders-btn dark" style={{ marginTop: 10 }} onClick={() => void loadSession()}>
                  {t("retry")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <OrdersLogin />
        )}
      </OrdersContext.Provider>
    );
  }

  return (
    <OrdersContext.Provider value={ctx}>
      <div className="orders-app">
        <div className="orders-shell">
          <header className="orders-top">
            <div className="orders-topRow">
              <div className="orders-brand">
                {t("app_title")}
                <small>ORDERS</small>
              </div>
              <div className="orders-lang" role="group" aria-label="Language">
                {ORDERS_LANGS.map((item) => (
                  <button key={item.code} type="button" className={item.code === lang ? "active" : ""} onClick={() => setLang(item.code)}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="orders-logout" onClick={logout}>
              {email} · {t("logout")}
            </button>
          </header>
          <div className="orders-main">
            <nav className="orders-tabs" aria-label="Sections">
              <Link href="/orders" className={tab === "list" ? "active" : ""}>
                {t("order_list")}
              </Link>
              <Link href="/orders/history" className={tab === "orders" ? "active" : ""}>
                {t("orders_section")}
              </Link>
            </nav>
            {children}
          </div>
        </div>
      </div>
    </OrdersContext.Provider>
  );
}
