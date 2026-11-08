"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ErpAction, ErpState } from "@/lib/erp/types";
import { ErpContext, type ErpContextValue } from "./ErpShell";
import { ErpHrefProvider } from "./erpHref";
import { Empty, errorText, loadingText, T } from "./ui";
import "./erp.css";

type Notice = { ok: boolean; text: string } | null;

async function fetchState(): Promise<{ status: number; data: (ErpState & { email: string }) | null; error: string | null }> {
  const response = await fetch("/api/erp/state", { cache: "no-store" }).catch(() => null);
  if (!response) return { status: 0, data: null, error: "network" };
  const body = await response.json().catch(() => null);
  if (!response.ok) return { status: response.status, data: null, error: body?.error ?? "server" };
  return { status: response.status, data: body as ErpState & { email: string }, error: null };
}

function withoutEmail({ email: _email, ...state }: ErpState & { email: string }): ErpState {
  return state;
}

/** Same ERP session and product card as /erp, without the ERP sidebar. Used by Orders admin. */
export function ErpFormHost({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<ErpState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const writes = useRef(0);

  const reload = useCallback(async () => {
    const startedAt = writes.current;
    const { status, data, error } = await fetchState();
    if (status === 401) {
      setEmail(null);
      setState(null);
      setLoadError("ERP_FORBIDDEN");
      return;
    }
    if (!data) {
      setLoadError(error ?? "server");
      return;
    }
    if (writes.current !== startedAt) return;
    setLoadError(null);
    setEmail(data.email);
    setState(withoutEmail(data));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!notice?.ok) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const act = useCallback(
    async <T,>(action: ErpAction, successText?: string | false): Promise<T | null> => {
      setBusy(true);
      try {
        const response = await fetch("/api/erp/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        if (response.status === 401) {
          setEmail(null);
          setState(null);
          setLoadError("ERP_FORBIDDEN");
          return null;
        }
        const data = (await response.json().catch(() => ({}))) as { error?: string; detail?: string; patch?: Partial<ErpState> } & T;
        writes.current += 1;
        if (!response.ok) {
          setNotice({ ok: false, text: errorText(data.error ?? "server", data.detail) });
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
    [reload],
  );

  const value: ErpContextValue = {
    email: email ?? "",
    state,
    reload,
    act,
    busy,
    notify: setNotice,
    docsVersion: 0,
  };

  return (
    <ErpHrefProvider>
      <ErpContext.Provider value={value}>
        <div className="erp erpEmbed">
          {notice ? (
            <div className={`erpToast ${notice.ok ? "ok" : "bad"}`} role={notice.ok ? "status" : "alert"}>
              <span>{notice.text}</span>
              <button type="button" aria-label="×" onClick={() => setNotice(null)}>
                ×
              </button>
            </div>
          ) : null}
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
        </div>
      </ErpContext.Provider>
    </ErpHrefProvider>
  );
}
