"use client";

import { useState, type FormEvent } from "react";
import { isApiMissing, isAuthError, login } from "@/lib/orders/api";
import { isValidPersonName } from "@/lib/orders/person";
import { useOrders } from "./OrdersShell";

export function OrdersLogin() {
  const { t } = useOrders();
  const [email, setMail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (invite.trim() && !isValidPersonName(name)) {
      setError(t("login_name_help"));
      return;
    }
    setBusy(true);
    try {
      await login(email, password, invite, name);
      window.location.reload();
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
        {invite.trim() ? (
          <div className="orders-field" style={{ marginBottom: 10 }}>
            <label htmlFor="orders-name">{t("login_name")}</label>
            <input id="orders-name" className="orders-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
            <p className="orders-note" style={{ marginTop: 6 }}>
              {t("login_name_help")}
            </p>
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
