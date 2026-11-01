"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import {
  RECIPES,
  applyRecipeOverrides,
  ingredientKey,
  type Recipe,
  type RecipeLang,
  type RecipeOverrides,
} from "@/data/recipes";
import { getAssetUrl } from "@/lib/appVersion";
import { translate } from "@/lib/i18n";
import { toStaffAppLang } from "@/lib/staffInventoryI18n";
import { useTranslation } from "@/lib/useTranslation";
import { unitLabel } from "./RecipesApp";
import "@/components/staff/staff-inventory.css";
import "./recipes.css";

type Draft = Record<string, { amount: string; gross: string }>;

const ERROR_KEYS: Record<string, string> = {
  credentials: "recipes_admin_err_credentials",
  exists: "recipes_admin_err_exists",
  invite: "recipes_admin_err_invite",
  invalid: "recipes_admin_err_invalid",
  number: "recipes_admin_err_number",
};

function errorKey(code: unknown): string {
  return (typeof code === "string" && ERROR_KEYS[code]) || "recipes_admin_err_server";
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

function draftFor(recipe: Recipe): Draft {
  const draft: Draft = {};
  for (const ingredient of recipe.ingredients) {
    const gross = ingredient.gross;
    draft[ingredientKey(ingredient)] = {
      amount: String(ingredient.amount),
      gross: gross !== undefined && gross !== ingredient.amount ? String(gross) : "",
    };
  }
  return draft;
}

export function RecipesAdminApp() {
  const { lang } = useTranslation();
  const recipeLang = toStaffAppLang(lang);
  const t = useCallback((key: string) => translate(recipeLang, key), [recipeLang]);
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [invite, setInvite] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) {
      setInvite(code);
      setMode("register");
    }
    fetch("/api/recipes-admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { email?: string | null }) => setSession(data.email ?? null))
      .catch(() => setSession(null));
  }, []);

  const logout = async () => {
    await fetch("/api/recipes-admin/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    setMode("login");
  };

  if (session === undefined) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        {t("staff_loading")}
      </div>
    );
  }

  return (
    <div className="staff-inventory staff-inventory-page recipes-app">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <StaffLanguageFlags />
          </div>
          <div className="venueLogo">
            <img src={getAssetUrl("/food/menu/GASTROFOOD-line.png")} alt="GASTROFOOD" />
          </div>
          <div className="recipesTitle">{t("recipes_admin_title")}</div>
        </div>

        <div className="main">
          {session ? (
            <AdminEditor email={session} lang={recipeLang} t={t} onLogout={logout} onExpired={() => setSession(null)} />
          ) : (
            <AuthForm
              mode={mode}
              invite={invite}
              t={t}
              onDone={setSession}
              onSwitchToLogin={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type AuthFormProps = {
  mode: "login" | "register";
  invite: string | null;
  t: (key: string) => string;
  onDone: (email: string) => void;
  onSwitchToLogin: () => void;
};

function AuthForm({ mode, invite, t, onDone, onSwitchToLogin }: AuthFormProps) {
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
      else setError(t(errorKey(data.error)));
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

type EditorProps = {
  email: string;
  lang: RecipeLang;
  t: (key: string) => string;
  onLogout: () => void;
  onExpired: () => void;
};

function AdminEditor({ email, lang, t, onLogout, onExpired }: EditorProps) {
  const [overrides, setOverrides] = useState<RecipeOverrides | null>(null);
  const [recipeId, setRecipeId] = useState(RECIPES[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/recipes/overrides", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { overrides?: RecipeOverrides }) => setOverrides(data.overrides ?? {}))
      .catch(() => setOverrides({}));
  }, []);

  const base = RECIPES.find((recipe) => recipe.id === recipeId) ?? RECIPES[0];
  const current = useMemo(() => applyRecipeOverrides(base, overrides), [base, overrides]);

  useEffect(() => {
    if (overrides) setDraft(draftFor(current));
  }, [current, overrides]);

  const preview = useMemo(() => {
    const edits: RecipeOverrides[string] = {};
    for (const ingredient of base.ingredients) {
      const row = draft[ingredientKey(ingredient)];
      const amount = row ? parseNumber(row.amount) : null;
      const gross = row ? parseNumber(row.gross) : null;
      edits[ingredientKey(ingredient)] = {
        amount: amount !== null && !Number.isNaN(amount) ? amount : ingredient.amount,
        gross: gross !== null && !Number.isNaN(gross) ? gross : undefined,
      };
    }
    return applyRecipeOverrides(base, { [base.id]: edits });
  }, [base, draft]);

  const hasInvalid = Object.values(draft).some(
    (row) => parseNumber(row.amount) === null || Number.isNaN(parseNumber(row.amount)) || Number.isNaN(parseNumber(row.gross)),
  );

  const save = async (edits: Record<string, { amount?: string; gross?: string }>) => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/recipes-admin/overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: base.id, edits }),
      });
      const data = (await response.json().catch(() => ({}))) as { overrides?: RecipeOverrides; error?: string };
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (response.ok && data.overrides) {
        setOverrides(data.overrides);
        setStatus({ ok: true, text: t("recipes_admin_saved") });
      } else {
        setStatus({ ok: false, text: t(errorKey(data.error)) });
      }
    } catch {
      setStatus({ ok: false, text: t("recipes_admin_err_server") });
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (key: string, field: "amount" | "gross", value: string) => {
    setStatus(null);
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const second: RecipeLang = lang === "vn" ? "en" : "vn";

  return (
    <div className="adminEditor">
      <div className="adminBar">
        <span>{email}</span>
        <button type="button" className="white" onClick={onLogout}>
          {t("recipes_admin_logout")}
        </button>
      </div>

      <div className="adminRecipes">
        {RECIPES.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            className={`adminRecipeBtn ${recipe.id === base.id ? "active" : ""}`}
            onClick={() => {
              setRecipeId(recipe.id);
              setStatus(null);
            }}
          >
            {recipe.name[lang]}
            {overrides?.[recipe.id] ? <span className="adminDot" /> : null}
          </button>
        ))}
      </div>

      <div className="exampleNotice">{t("recipes_admin_hint")}</div>

      {!overrides ? (
        <div className="empty">{t("staff_loading")}</div>
      ) : (
        <>
          <div className="tcTableWrap">
            <table className="tcTable adminTable">
              <thead>
                <tr>
                  <th className="tcName">{t("recipes_col_name")}</th>
                  <th>{t("recipes_col_gross")}</th>
                  <th>{t("recipes_col_net")}</th>
                </tr>
              </thead>
              <tbody>
                {base.ingredients.map((ingredient) => {
                  const key = ingredientKey(ingredient);
                  const row = draft[key] ?? { amount: "", gross: "" };
                  const amount = parseNumber(row.amount);
                  const gross = parseNumber(row.gross);
                  const unit = unitLabel(ingredient.unit, lang);
                  const changed = amount !== ingredient.amount || (gross !== null && gross !== (ingredient.gross ?? ingredient.amount));
                  return (
                    <tr key={key} className={changed ? "changed" : ""}>
                      <td className="tcName">
                        <b>{ingredient.name[lang]}</b>
                        <i>{ingredient.name[second]}</i>
                        {changed ? (
                          <small>
                            {t("recipes_admin_original")}: {ingredient.gross && ingredient.gross !== ingredient.amount ? `${ingredient.gross} / ` : ""}
                            {ingredient.amount} {unit}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <input
                          className={Number.isNaN(gross) ? "invalid" : ""}
                          inputMode="decimal"
                          placeholder={row.amount}
                          value={row.gross}
                          onChange={(event) => updateRow(key, "gross", event.target.value)}
                        />
                      </td>
                      <td>
                        <span className="adminQty">
                          <input
                            className={amount === null || Number.isNaN(amount) ? "invalid" : ""}
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(event) => updateRow(key, "amount", event.target.value)}
                          />
                          <small>{unit}</small>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>{t("recipes_finished_weight")}</td>
                  <td className="tcQty">
                    {preview.yield.amount} {unitLabel(preview.yield.unit, lang)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {status ? <div className={status.ok ? "adminOk" : "adminError"}>{status.text}</div> : null}

          <div className="adminActions">
            <button
              type="button"
              className="dark"
              disabled={busy || hasInvalid}
              onClick={() => save(draft)}
            >
              {t("recipes_admin_save")}
            </button>
            <button
              type="button"
              className="white"
              disabled={busy || !overrides[base.id]}
              onClick={() => {
                if (window.confirm(t("recipes_admin_reset_confirm"))) save({});
              }}
            >
              {t("recipes_admin_reset")}
            </button>
          </div>
          <a className="adminOpenCard" href={`/recipes?r=${base.id}`} target="_blank" rel="noreferrer">
            {t("recipes_admin_open_card")} ↗
          </a>
        </>
      )}
    </div>
  );
}
