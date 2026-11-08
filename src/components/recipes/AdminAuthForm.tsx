"use client";

import { useState, type FormEvent } from "react";
import { isValidPersonName } from "@/lib/orders/person";

const ERROR_KEYS: Record<string, string> = {
  credentials: "recipes_admin_err_credentials",
  exists: "recipes_admin_err_exists",
  invite: "recipes_admin_err_invite",
  invalid: "recipes_admin_err_invalid",
  name: "recipes_admin_err_name",
  number: "recipes_admin_err_number",
};

export function adminErrorKey(code: unknown): string {
  return (typeof code === "string" && ERROR_KEYS[code]) || "recipes_admin_err_server";
}

type AdminAuthFormProps = {
  mode: "login" | "register";
  invite: string | null;
  t: (key: string) => string;
  onDone: (email: string, name?: string) => void;
  onSwitchToLogin: () => void;
};

export function AdminNameForm({ t, onSaved }: { t: (key: string) => string; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isValidPersonName(name)) {
      setError(t("recipes_admin_err_name"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/recipes-admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json().catch(() => ({}))) as { name?: string; error?: string };
      if (response.ok && data.name) onSaved(data.name);
      else setError(t(adminErrorKey(data.error)));
    } catch {
      setError(t("recipes_admin_err_server"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card adminAuth" onSubmit={submit}>
      <h2>{t("recipes_admin_need_name")}</h2>
      <label>
        <span>{t("recipes_admin_name")}</span>
        <input
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={80}
        />
      </label>
      {error ? <div className="adminError">{error}</div> : null}
      <button type="submit" className="dark" disabled={busy}>
        {t("recipes_admin_save_name")}
      </button>
    </form>
  );
}

export function AdminAuthForm({ mode, invite, t, onDone, onSwitchToLogin }: AdminAuthFormProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "register" && (!isValidPersonName(name) || password.length < 6 || password !== repeat)) {
      setError(t(!isValidPersonName(name) ? "recipes_admin_err_name" : "recipes_admin_err_invalid"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/recipes-admin/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, invite, name: mode === "register" ? name : undefined }),
      });
      const data = (await response.json().catch(() => ({}))) as { email?: string; name?: string; error?: string };
      if (response.ok && data.email) {
        if (data.name) onDone(data.email, data.name);
        else setPendingEmail(data.email);
      } else setError(t(adminErrorKey(data.error)));
    } catch {
      setError(t("recipes_admin_err_server"));
    } finally {
      setBusy(false);
    }
  };

  if (pendingEmail) {
    return <AdminNameForm t={t} onSaved={(saved) => onDone(pendingEmail, saved)} />;
  }

  return (
    <form className="card adminAuth" onSubmit={submit}>
      <h2>{t(mode === "register" ? "recipes_admin_register_title" : "recipes_admin_login_title")}</h2>
      {mode === "register" ? (
        <label>
          <span>{t("recipes_admin_name")}</span>
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </label>
      ) : null}
      <label>
        <span>{t("recipes_admin_email")}</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        <span>{t("recipes_admin_password")}</span>
        <input
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {mode === "register" ? (
        <label>
          <span>{t("recipes_admin_password_repeat")}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            required
          />
        </label>
      ) : null}
      {error ? <div className="adminError">{error}</div> : null}
      <button type="submit" className="dark" disabled={busy}>
        {t(mode === "register" ? "recipes_admin_register_btn" : "recipes_admin_login_btn")}
      </button>
      {mode === "register" ? (
        <button type="button" className="adminLink" onClick={onSwitchToLogin}>
          {t("recipes_admin_have_account")}
        </button>
      ) : null}
    </form>
  );
}
