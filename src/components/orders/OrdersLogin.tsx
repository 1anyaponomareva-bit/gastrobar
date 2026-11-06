"use client";

import { useState, type FormEvent } from "react";
import { isApiMissing, isAuthError, login } from "@/lib/orders/api";
import { useOrders } from "./OrdersShell";

export function OrdersLogin() {
  const { t, setEmail } = useOrders();
  const [email, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await login(email, password, invite);
      setEmail(session.email);
    } catch (err) {
      if (isApiMissing(err)) setError(t("login_api_missing"));
      else if (isAuthError(err)) setError(t("login_error_credentials"));
      else setError(t("login_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="orders-app">
      <header className="orders-top">
        <div className="orders-brand">
          {t("app_title")}
          <small>ORDERS</small>
        </div>
      </header>
      <form className="orders-login" onSubmit={(event) => void submit(event)}>
        <h1>{t("login_title")}</h1>
        <p>{t("login_lead")}</p>
        {error ? (
          <div className="orders-banner error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="orders-field" style={{ marginBottom: 10 }}>
          <label htmlFor="orders-email">{t("login_email")}</label>
          <input id="orders-email" className="orders-input" type="email" autoComplete="email" value={email} onChange={(e) => setMail(e.target.value)} required />
        </div>
        <div className="orders-field" style={{ marginBottom: 14 }}>
          <label htmlFor="orders-password">{t("login_password")}</label>
          <input
            id="orders-password"
            className="orders-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="orders-field" style={{ marginBottom: 14 }}>
          <label htmlFor="orders-invite">{t("login_invite")}</label>
          <input
            id="orders-invite"
            className="orders-input"
            type="text"
            autoComplete="off"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
          />
          <p className="orders-note" style={{ marginTop: 6 }}>
            {t("login_invite_help")}
          </p>
        </div>
        <button type="submit" className="orders-btn primary block" disabled={busy}>
          {busy ? t("login_busy") : t("login_submit")}
        </button>
      </form>
    </div>
  );
}
