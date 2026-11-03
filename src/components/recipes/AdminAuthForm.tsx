"use client";

import { useState, type FormEvent } from "react";

const ERROR_KEYS: Record<string, string> = {
  credentials: "recipes_admin_err_credentials",
  exists: "recipes_admin_err_exists",
  invite: "recipes_admin_err_invite",
  invalid: "recipes_admin_err_invalid",
  number: "recipes_admin_err_number",
};

export function adminErrorKey(code: unknown): string {
  return (typeof code === "string" && ERROR_KEYS[code]) || "recipes_admin_err_server";
}

type AdminAuthFormProps = {
  mode: "login" | "register";
  invite: string | null;
  t: (key: string) => string;
  onDone: (email: string) => void;
  onSwitchToLogin: () => void;
};

export function AdminAuthForm({ mode, invite, t, onDone, onSwitchToLogin }: AdminAuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "register" && (password.length < 6 || password !== repeat)) {
      setError(t("recipes_admin_err_invalid"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/recipes-admin/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, invite }),
      });
      const data = (await response.json().catch(() => ({}))) as { email?: string; error?: string };
      if (response.ok && data.email) onDone(data.email);
      else setError(t(adminErrorKey(data.error)));
    } catch {
      setError(t("recipes_admin_err_server"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card adminAuth" onSubmit={submit}>
      <h2>{t(mode === "register" ? "recipes_admin_register_title" : "recipes_admin_login_title")}</h2>
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
