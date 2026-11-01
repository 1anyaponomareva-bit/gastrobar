"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { StaffLanguageFlags } from "@/components/staff/StaffLanguageFlags";
import {
  applyRecipeOverrides,
  ingredientKey,
  mergeRecipes,
  type Recipe,
  type RecipeLang,
  type RecipeOverrides,
  type StoredRecipes,
} from "@/data/recipes";
import { RecipeForm } from "./RecipeForm";
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

/** Keeps uploads under the serverless body limit; 2400 px is plenty to read a printed card. */
async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3_500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.9),
  );
}

function blankRecipe(): Recipe {
  return {
    id: `recipe-${Date.now().toString(36)}`,
    kind: "dish",
    name: { ru: "", en: "", vn: "" },
    yield: { amount: 0, unit: "g" },
    ingredients: [],
    steps: [],
  };
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
          <div className="langRow recipesLangRow">
            <a className="adminEntry" href="/recipes">
              ← {t("recipes_title")}
            </a>
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

type AdminData = { overrides?: RecipeOverrides; stored?: StoredRecipes | null };

function AdminEditor({ email, lang, t, onLogout, onExpired }: EditorProps) {
  const [overrides, setOverrides] = useState<RecipeOverrides | null>(null);
  const [stored, setStored] = useState<StoredRecipes | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [view, setView] = useState<"amounts" | "import" | "form">("amounts");
  const [formRecipe, setFormRecipe] = useState<Recipe | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const applyData = (data: AdminData) => {
    if (data.overrides) setOverrides(data.overrides);
    if (data.stored !== undefined) setStored(data.stored);
  };

  useEffect(() => {
    fetch("/api/recipes/overrides", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: AdminData) => {
        setOverrides(data.overrides ?? {});
        setStored(data.stored ?? null);
      })
      .catch(() => setOverrides({}));
  }, []);

  const all = useMemo(() => mergeRecipes(stored), [stored]);
  const selected = all.find((recipe) => recipe.id === recipeId) ?? all[0] ?? null;

  const request = async (method: "PATCH" | "DELETE", body: unknown) => {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/recipes-admin/recipes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) return onExpired();
      const data = (await response.json().catch(() => null)) as AdminData | null;
      if (response.ok && data) applyData(data);
      else setNotice({ ok: false, text: t("recipes_admin_err_server") });
    } catch {
      setNotice({ ok: false, text: t("recipes_admin_err_server") });
    } finally {
      setBusy(false);
    }
  };

  const openForm = (recipe: Recipe) => {
    setFormRecipe(recipe);
    setView("form");
    setNotice(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="adminEditor">
      <div className="adminBar">
        <span>{email}</span>
        <button type="button" className="white" onClick={onLogout}>
          {t("recipes_admin_logout")}
        </button>
      </div>

      {view === "form" && formRecipe ? (
        <RecipeForm
          key={formRecipe.id}
          initial={formRecipe}
          t={t}
          onExpired={onExpired}
          onCancel={() => setView("amounts")}
          onSaved={(data) => {
            applyData(data as AdminData);
            setRecipeId(formRecipe.id);
            setView("amounts");
            setNotice({ ok: true, text: t("recipes_admin_published") });
            window.scrollTo({ top: 0 });
          }}
        />
      ) : (
        <>
          <div className="adminRecipes">
            {all.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                className={`adminRecipeBtn ${view === "amounts" && recipe.id === selected?.id ? "active" : ""} ${recipe.hidden ? "isHidden" : ""}`}
                onClick={() => {
                  setRecipeId(recipe.id);
                  setView("amounts");
                  setNotice(null);
                }}
              >
                {recipe.name[lang] || recipe.id}
                {recipe.hidden ? ` · ${t("recipes_admin_hidden_badge")}` : ""}
                {overrides?.[recipe.id] ? <span className="adminDot" /> : null}
              </button>
            ))}
            <button
              type="button"
              className={`adminRecipeBtn adminNewBtn ${view === "import" ? "active" : ""}`}
              onClick={() => {
                setView("import");
                setNotice(null);
              }}
            >
              {t("recipes_admin_new")}
            </button>
          </div>

          {notice ? <div className={notice.ok ? "adminOk" : "adminError"}>{notice.text}</div> : null}

          {view === "import" ? (
            <ImportPanel t={t} onExpired={onExpired} onRecipe={openForm} onBlank={() => openForm(blankRecipe())} />
          ) : !overrides ? (
            <div className="empty">{t("staff_loading")}</div>
          ) : selected ? (
            <>
              <div className="adminRecipeActions">
                <button
                  type="button"
                  className="white"
                  disabled={busy}
                  onClick={() => openForm(applyRecipeOverrides(selected, overrides))}
                >
                  ✏️ {t("recipes_admin_edit_card")}
                </button>
                <button
                  type="button"
                  className="white"
                  disabled={busy}
                  onClick={() => request("PATCH", { id: selected.id, hidden: !selected.hidden })}
                >
                  {selected.hidden ? `👁 ${t("recipes_admin_show")}` : `🙈 ${t("recipes_admin_hide")}`}
                </button>
                <button
                  type="button"
                  className="white danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t("recipes_admin_delete_confirm"))) {
                      request("DELETE", { id: selected.id }).then(() => setRecipeId(null));
                    }
                  }}
                >
                  🗑 {t("recipes_admin_delete")}
                </button>
              </div>
              <AmountsEditor
                key={selected.id}
                base={selected}
                overrides={overrides}
                lang={lang}
                t={t}
                onExpired={onExpired}
                onSaved={setOverrides}
              />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

type ImportPanelProps = {
  t: (key: string) => string;
  onExpired: () => void;
  onRecipe: (recipe: Recipe) => void;
  onBlank: () => void;
};

function ImportPanel({ t, onExpired, onRecipe, onBlank }: ImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", await downscaleImage(file), "card.jpg");
      const response = await fetch("/api/recipes-admin/import", { method: "POST", body: form });
      if (response.status === 401) return onExpired();
      const data = (await response.json().catch(() => null)) as { recipe?: Recipe } | null;
      if (response.ok && data?.recipe) onRecipe(data.recipe);
      else setError(t("recipes_admin_import_error"));
    } catch {
      setError(t("recipes_admin_import_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card adminImport">
      <h2>{t("recipes_admin_import_title")}</h2>
      <p>{t("recipes_admin_import_hint")}</p>
      <label className="adminFilePick">
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <span>📷 {t("recipes_admin_import_pick")}</span>
      </label>
      {preview ? <img src={preview} alt="" className="adminImportPreview" /> : null}
      {error ? <div className="adminError">{error}</div> : null}
      {busy ? <div className="adminBusy">⏳ {t("recipes_admin_import_busy")}</div> : null}
      <button type="button" className="dark" disabled={!file || busy} onClick={run}>
        {t("recipes_admin_import_run")}
      </button>
      <button type="button" className="adminLink" disabled={busy} onClick={onBlank}>
        {t("recipes_admin_import_empty")}
      </button>
    </div>
  );
}

type AmountsEditorProps = {
  base: Recipe;
  overrides: RecipeOverrides;
  lang: RecipeLang;
  t: (key: string) => string;
  onExpired: () => void;
  onSaved: (overrides: RecipeOverrides) => void;
};

function AmountsEditor({ base, overrides, lang, t, onExpired, onSaved }: AmountsEditorProps) {
  const current = useMemo(() => applyRecipeOverrides(base, overrides), [base, overrides]);
  const [draft, setDraft] = useState<Draft>(() => draftFor(current));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(draftFor(current));
  }, [current]);

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
    (row) =>
      parseNumber(row.amount) === null ||
      Number.isNaN(parseNumber(row.amount)) ||
      Number.isNaN(parseNumber(row.gross)),
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
      if (response.status === 401) return onExpired();
      if (response.ok && data.overrides) {
        onSaved(data.overrides);
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
    <>
      <div className="exampleNotice">{t("recipes_admin_hint")}</div>
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
              const changed =
                amount !== ingredient.amount ||
                (gross !== null && gross !== (ingredient.gross ?? ingredient.amount));
              return (
                <tr key={key} className={changed ? "changed" : ""}>
                  <td className="tcName">
                    <b>{ingredient.name[lang]}</b>
                    <i>{ingredient.name[second]}</i>
                    {changed ? (
                      <small>
                        {t("recipes_admin_original")}:{" "}
                        {ingredient.gross && ingredient.gross !== ingredient.amount ? `${ingredient.gross} / ` : ""}
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
        <button type="button" className="dark" disabled={busy || hasInvalid} onClick={() => save(draft)}>
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
  );
}
