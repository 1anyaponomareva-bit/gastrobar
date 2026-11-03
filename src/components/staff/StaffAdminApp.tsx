"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminAuthForm } from "@/components/recipes/AdminAuthForm";
import {
  sanitizeStaffCatalog,
  staffCategoryLabel,
  staffItemLabel,
  uniqueCatalogId,
  type StaffCatalog,
  type StaffCatalogCategory,
  type StaffCatalogItem,
  type StaffCatalogSupplier,
} from "@/data/staffCatalog";
import { getAssetUrl } from "@/lib/appVersion";
import { translate } from "@/lib/i18n";
import "./staff-inventory.css";
import "@/components/recipes/recipes.css";
import "./staff-admin.css";

type Tab = "items" | "suppliers" | "categories";

type Editing =
  | { kind: "item"; value: StaffCatalogItem; isNew: boolean }
  | { kind: "supplier"; value: StaffCatalogSupplier; isNew: boolean }
  | { kind: "category"; value: StaffCatalogCategory; isNew: boolean };

type Notice = { ok: boolean; text: string } | null;

const UNITS = ["kg", "g", "l", "ml", "pcs", "box", "pack", "btl", "can"];

const t = (key: string) => translate("ru", key);

async function translateToVn(text: string): Promise<string | null> {
  const response = await fetch("/api/staff-admin/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (response.status === 401) throw new Error("auth");
  const data = (await response.json().catch(() => null)) as { vn?: string } | null;
  return response.ok && data?.vn ? data.vn : null;
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function StaffAdminApp() {
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

  return (
    <div className="staff-inventory staff-inventory-page recipes-app staff-admin">
      <div className="app">
        <div className="top">
          <div className="langRow staffTopRow">
            <a className="staffAdminEntry" href="/staff">
              ← Staff
            </a>
          </div>
          <div className="venueLogo">
            <img src={getAssetUrl("/food/menu/GASTROFOOD-line.png")} alt="GASTROFOOD" />
          </div>
          <div className="recipesTitle">Кабинет администратора · Staff</div>
        </div>

        <div className="main">
          {session === undefined ? (
            <div className="empty">{t("staff_loading")}</div>
          ) : session ? (
            <CatalogEditor email={session} onLogout={logout} onExpired={() => setSession(null)} />
          ) : (
            <AdminAuthForm
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

type CatalogEditorProps = {
  email: string;
  onLogout: () => void;
  onExpired: () => void;
};

function CatalogEditor({ email, onLogout, onExpired }: CatalogEditorProps) {
  const [catalog, setCatalog] = useState<StaffCatalog | null>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");

  useEffect(() => {
    fetch("/api/staff-catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { catalog?: unknown }) => setCatalog(sanitizeStaffCatalog(data.catalog)))
      .catch(() => setNotice({ ok: false, text: t("recipes_admin_err_server") }));
  }, []);

  const save = useCallback(
    async (next: StaffCatalog, message: string) => {
      setBusy(true);
      setNotice(null);
      try {
        const response = await fetch("/api/staff-admin/catalog", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalog: next }),
        });
        if (response.status === 401) {
          onExpired();
          return false;
        }
        const data = (await response.json().catch(() => null)) as { catalog?: StaffCatalog } | null;
        if (!response.ok || !data?.catalog) throw new Error("save");
        setCatalog(data.catalog);
        setNotice({ ok: true, text: message });
        return true;
      } catch {
        setNotice({ ok: false, text: "Не удалось сохранить. Проверьте поля и попробуйте ещё раз." });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onExpired],
  );

  if (!catalog) {
    return notice ? (
      <div className="adminError">{notice.text}</div>
    ) : (
      <div className="empty">{t("staff_loading")}</div>
    );
  }

  const usage = (field: "supplier" | "category", id: string) =>
    catalog.items.filter((item) => item[field] === id).length;

  const finish = async (next: StaffCatalog, message: string) => {
    if (await save(next, message)) {
      setEditing(null);
      window.scrollTo({ top: 0 });
    }
  };

  const open = (next: Editing) => {
    setEditing(next);
    setNotice(null);
    window.scrollTo({ top: 0 });
  };

  const replace = <T extends { id: string }>(list: T[], value: T, isNew: boolean): T[] =>
    isNew ? [...list, value] : list.map((entry) => (entry.id === value.id ? value : entry));

  let body: ReactNode;
  if (editing?.kind === "item") {
    body = (
      <ItemForm
        initial={editing.value}
        isNew={editing.isNew}
        catalog={catalog}
        busy={busy}
        onExpired={onExpired}
        onCancel={() => setEditing(null)}
        onSave={(value, extras) =>
          finish(
            {
              categories: extras.category ? [...catalog.categories, extras.category] : catalog.categories,
              suppliers: extras.supplier ? [...catalog.suppliers, extras.supplier] : catalog.suppliers,
              items: replace(catalog.items, value, editing.isNew),
            },
            editing.isNew ? "Позиция добавлена" : "Позиция сохранена",
          )
        }
        onDelete={() =>
          finish(
            { ...catalog, items: catalog.items.filter((item) => item.id !== editing.value.id) },
            "Позиция удалена",
          )
        }
      />
    );
  } else if (editing?.kind === "supplier") {
    body = (
      <SupplierForm
        initial={editing.value}
        takenIds={catalog.suppliers.map((supplier) => supplier.id)}
        isNew={editing.isNew}
        usedBy={usage("supplier", editing.value.id)}
        busy={busy}
        onCancel={() => setEditing(null)}
        onSave={(value) =>
          finish(
            { ...catalog, suppliers: replace(catalog.suppliers, value, editing.isNew) },
            editing.isNew ? "Поставщик добавлен" : "Поставщик сохранён",
          )
        }
        onDelete={() =>
          finish(
            {
              ...catalog,
              suppliers: catalog.suppliers.filter((supplier) => supplier.id !== editing.value.id),
            },
            "Поставщик удалён",
          )
        }
      />
    );
  } else if (editing?.kind === "category") {
    body = (
      <CategoryForm
        initial={editing.value}
        takenIds={catalog.categories.map((category) => category.id)}
        isNew={editing.isNew}
        usedBy={usage("category", editing.value.id)}
        busy={busy}
        onExpired={onExpired}
        onCancel={() => setEditing(null)}
        onSave={(value) =>
          finish(
            { ...catalog, categories: replace(catalog.categories, value, editing.isNew) },
            editing.isNew ? "Категория добавлена" : "Категория сохранена",
          )
        }
        onDelete={() =>
          finish(
            {
              ...catalog,
              categories: catalog.categories.filter((category) => category.id !== editing.value.id),
            },
            "Категория удалена",
          )
        }
      />
    );
  } else if (tab === "items") {
    const query = search.trim().toLowerCase();
    const visible = catalog.items.filter(
      (item) =>
        (!supplierFilter || item.supplier === supplierFilter) &&
        (!query ||
          [item.name, item.nameVn, item.brand ?? "", item.itemNo ?? ""].some((text) =>
            text.toLowerCase().includes(query),
          )),
    );
    const supplierLabel = (id: string) =>
      catalog.suppliers.find((supplier) => supplier.id === id)?.label ?? id;
    body = (
      <>
        <button
          type="button"
          className="dark staffAdminAdd"
          onClick={() =>
            open({
              kind: "item",
              isNew: true,
              value: {
                id: "",
                name: "",
                nameVn: "",
                unit: "pcs",
                category: catalog.categories[0]?.id ?? "",
                supplier: supplierFilter || catalog.suppliers[0]?.id || "",
              },
            })
          }
        >
          + Добавить позицию
        </button>
        <div className="staffAdminFilters">
          <input
            className="search"
            placeholder="Поиск по названию, бренду, артикулу"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">Все поставщики</option>
            {catalog.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mode">
          <span>Всего позиций: {visible.length}</span>
        </div>
        {catalog.categories.map((category) => {
          const inCategory = visible.filter((item) => item.category === category.id);
          if (!inCategory.length) return null;
          return (
            <div key={category.id}>
              <div className="category">{staffCategoryLabel(category)}</div>
              {inCategory.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`staffAdminRow ${item.hidden ? "isHidden" : ""}`}
                  onClick={() => open({ kind: "item", isNew: false, value: item })}
                >
                  <b>{staffItemLabel(item)}</b>
                  <span>
                    {[supplierLabel(item.supplier), item.unit, item.brand, item.hidden ? "скрыта" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
        {!visible.length ? <div className="empty">Ничего не найдено</div> : null}
      </>
    );
  } else if (tab === "suppliers") {
    body = (
      <>
        <button
          type="button"
          className="dark staffAdminAdd"
          onClick={() => open({ kind: "supplier", isNew: true, value: { id: "", label: "" } })}
        >
          + Добавить поставщика
        </button>
        <div className="mode">
          <span>Порядок здесь = порядок вкладок у сотрудников</span>
        </div>
        {catalog.suppliers.map((supplier, index) => (
          <OrderedRow
            key={supplier.id}
            title={supplier.label}
            subtitle={`${usage("supplier", supplier.id)} поз. · ${supplier.zaloUrl ? "Zalo ✓" : "без Zalo"}`}
            busy={busy}
            onOpen={() => open({ kind: "supplier", isNew: false, value: supplier })}
            onMove={(delta) =>
              save({ ...catalog, suppliers: move(catalog.suppliers, index, delta) }, "Порядок сохранён")
            }
          />
        ))}
      </>
    );
  } else {
    body = (
      <>
        <button
          type="button"
          className="dark staffAdminAdd"
          onClick={() => open({ kind: "category", isNew: true, value: { id: "", en: "", vn: "" } })}
        >
          + Добавить категорию
        </button>
        <div className="mode">
          <span>Порядок здесь = порядок категорий у сотрудников</span>
        </div>
        {catalog.categories.map((category, index) => (
          <OrderedRow
            key={category.id}
            title={staffCategoryLabel(category)}
            subtitle={`${usage("category", category.id)} поз.`}
            busy={busy}
            onOpen={() => open({ kind: "category", isNew: false, value: category })}
            onMove={(delta) =>
              save({ ...catalog, categories: move(catalog.categories, index, delta) }, "Порядок сохранён")
            }
          />
        ))}
      </>
    );
  }

  return (
    <div className="adminEditor">
      <div className="adminBar">
        <span>{email}</span>
        <button type="button" className="white" onClick={onLogout}>
          {t("recipes_admin_logout")}
        </button>
      </div>

      {editing ? null : (
        <div className="sectionPicker staffAdminTabs" role="tablist">
          {(
            [
              ["items", "Позиции"],
              ["suppliers", "Поставщики"],
              ["categories", "Категории"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`sectionBtn ${tab === id ? "active" : ""}`}
              onClick={() => {
                setTab(id);
                setNotice(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {notice ? <div className={notice.ok ? "adminOk" : "adminError"}>{notice.text}</div> : null}

      {body}
    </div>
  );
}

type OrderedRowProps = {
  title: string;
  subtitle: string;
  busy: boolean;
  onOpen: () => void;
  onMove: (delta: number) => void;
};

function OrderedRow({ title, subtitle, busy, onOpen, onMove }: OrderedRowProps) {
  return (
    <div className="staffAdminOrdered">
      <button type="button" className="staffAdminRow" onClick={onOpen}>
        <b>{title}</b>
        <span>{subtitle}</span>
      </button>
      <button type="button" className="white" disabled={busy} aria-label="Выше" onClick={() => onMove(-1)}>
        ↑
      </button>
      <button type="button" className="white" disabled={busy} aria-label="Ниже" onClick={() => onMove(1)}>
        ↓
      </button>
    </div>
  );
}

type FormActionsProps = {
  isNew: boolean;
  busy: boolean;
  canSave: boolean;
  deleteBlocked?: string;
  deleteConfirm: string;
  onCancel: () => void;
  onDelete: () => void;
};

function FormActions({
  isNew,
  busy,
  canSave,
  deleteBlocked,
  deleteConfirm,
  onCancel,
  onDelete,
}: FormActionsProps) {
  return (
    <>
      <div className="adminActions">
        <button type="submit" className="dark" disabled={busy || !canSave}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="white" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
      {isNew ? null : (
        <button
          type="button"
          className="white danger staffAdminDelete"
          disabled={busy}
          onClick={() => {
            if (deleteBlocked) window.alert(deleteBlocked);
            else if (window.confirm(deleteConfirm)) onDelete();
          }}
        >
          🗑 Удалить
        </button>
      )}
    </>
  );
}

type TranslateFieldProps = {
  label: string;
  value: string;
  source: string;
  onChange: (value: string) => void;
  onExpired: () => void;
};

function TranslateField({ label, value, source, onChange, onExpired }: TranslateFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(false);
    try {
      const vn = await translateToVn(source.trim());
      if (vn) onChange(vn);
      else setError(true);
    } catch (reason) {
      if (reason instanceof Error && reason.message === "auth") onExpired();
      else setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label>
      <span>{label}</span>
      <div className="staffAdminTranslate">
        <input value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="white" disabled={busy || !source.trim()} onClick={run}>
          {busy ? "…" : "🌐 Перевести"}
        </button>
      </div>
      {error ? <small className="staffAdminHint error">Перевод не получился, впишите вручную</small> : null}
    </label>
  );
}

type ItemFormProps = {
  initial: StaffCatalogItem;
  isNew: boolean;
  catalog: StaffCatalog;
  busy: boolean;
  onExpired: () => void;
  onCancel: () => void;
  onSave: (
    value: StaffCatalogItem,
    extras: { category?: StaffCatalogCategory; supplier?: StaffCatalogSupplier },
  ) => void;
  onDelete: () => void;
};

const NEW_OPTION = "__new__";

function ItemForm({ initial, isNew, catalog, busy, onExpired, onCancel, onSave, onDelete }: ItemFormProps) {
  const [draft, setDraft] = useState(initial);
  const [translating, setTranslating] = useState(false);
  const [newCategory, setNewCategory] = useState({ en: "", vn: "" });
  const [newSupplier, setNewSupplier] = useState({ label: "", zaloUrl: "" });
  const units = useMemo(
    () => [...new Set([...UNITS, ...catalog.items.map((item) => item.unit)])],
    [catalog],
  );
  const [customUnit, setCustomUnit] = useState(!units.includes(initial.unit));
  const set = <K extends keyof StaffCatalogItem>(key: K, value: StaffCatalogItem[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const addingCategory = draft.category === NEW_OPTION;
  const addingSupplier = draft.supplier === NEW_OPTION;
  const zaloValid = !newSupplier.zaloUrl.trim() || /^https:\/\/\S+$/i.test(newSupplier.zaloUrl.trim());
  const canSave = Boolean(
    draft.name.trim() &&
      draft.unit.trim() &&
      draft.category &&
      draft.supplier &&
      (!addingCategory || newCategory.en.trim()) &&
      (!addingSupplier || (newSupplier.label.trim() && zaloValid)),
  );
  const packHint = draft.pack?.trim() ? `1 ${draft.unit || "…"} = ${draft.pack.trim()}` : null;

  const ensureVn = async (vn: string, en: string) => {
    if (vn.trim()) return vn.trim();
    return (await translateToVn(en.trim()).catch(() => null)) ?? en.trim();
  };

  const submit = async () => {
    setTranslating(true);
    const nameVn = await ensureVn(draft.nameVn, draft.name);
    const category = addingCategory
      ? {
          id: uniqueCatalogId(newCategory.en, catalog.categories.map((entry) => entry.id)),
          en: newCategory.en.trim(),
          vn: await ensureVn(newCategory.vn, newCategory.en),
        }
      : undefined;
    setTranslating(false);
    const supplier = addingSupplier
      ? {
          id: uniqueCatalogId(newSupplier.label, catalog.suppliers.map((entry) => entry.id)),
          label: newSupplier.label.trim(),
          zaloUrl: newSupplier.zaloUrl.trim() || undefined,
        }
      : undefined;
    const id = isNew
      ? uniqueCatalogId(
          `${draft.name} ${draft.brand ?? ""}`,
          catalog.items.map((item) => item.id),
        )
      : draft.id;
    onSave(
      {
        ...draft,
        id,
        category: category?.id ?? draft.category,
        supplier: supplier?.id ?? draft.supplier,
        name: draft.name.trim(),
        nameVn,
        unit: draft.unit.trim(),
        brand: draft.brand?.trim() || undefined,
        pack: draft.pack?.trim() || undefined,
        itemNo: draft.itemNo?.trim() || undefined,
        hidden: draft.hidden || undefined,
      },
      { category, supplier },
    );
  };

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void submit();
      }}
    >
      <h2 className="staffAdminTitle">{isNew ? "Новая позиция" : "Редактирование позиции"}</h2>
      <label>
        <span>Название (English) *</span>
        <input value={draft.name} onChange={(event) => set("name", event.target.value)} required />
      </label>
      <TranslateField
        label="Название (Tiếng Việt)"
        value={draft.nameVn}
        source={draft.name}
        onChange={(value) => set("nameVn", value)}
        onExpired={onExpired}
      />
      <small className="staffAdminHint">Если оставить пустым, переведётся автоматически при сохранении</small>
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Категория *</span>
          <select value={draft.category} onChange={(event) => set("category", event.target.value)}>
            {catalog.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.en}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Новая категория…</option>
          </select>
        </label>
        <label>
          <span>Поставщик *</span>
          <select value={draft.supplier} onChange={(event) => set("supplier", event.target.value)}>
            {catalog.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.label}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Новый поставщик…</option>
          </select>
        </label>
      </div>
      {addingCategory ? (
        <div className="staffAdminInline">
          <b>Новая категория</b>
          <label>
            <span>Название (English) *</span>
            <input
              value={newCategory.en}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, en: event.target.value }))}
              required
            />
          </label>
          <TranslateField
            label="Название (Tiếng Việt)"
            value={newCategory.vn}
            source={newCategory.en}
            onChange={(vn) => setNewCategory((prev) => ({ ...prev, vn }))}
            onExpired={onExpired}
          />
        </div>
      ) : null}
      {addingSupplier ? (
        <div className="staffAdminInline">
          <b>Новый поставщик</b>
          <label>
            <span>Название *</span>
            <input
              value={newSupplier.label}
              onChange={(event) => setNewSupplier((prev) => ({ ...prev, label: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>Ссылка на группу Zalo</span>
            <input
              inputMode="url"
              placeholder="https://zalo.me/g/…"
              value={newSupplier.zaloUrl}
              onChange={(event) => setNewSupplier((prev) => ({ ...prev, zaloUrl: event.target.value }))}
            />
          </label>
          {zaloValid ? null : (
            <small className="staffAdminHint error">Ссылка должна начинаться с https://</small>
          )}
        </div>
      ) : null}
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Единица заказа *</span>
          <select
            value={customUnit ? NEW_OPTION : draft.unit}
            onChange={(event) => {
              const custom = event.target.value === NEW_OPTION;
              setCustomUnit(custom);
              set("unit", custom ? "" : event.target.value);
            }}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Своя единица…</option>
          </select>
          {customUnit ? (
            <input
              placeholder="напр. tray, bag, roll"
              value={draft.unit}
              onChange={(event) => set("unit", event.target.value)}
              required
            />
          ) : null}
        </label>
        <label>
          <span>В упаковке</span>
          <input
            placeholder="напр. 5 kg, 24 pcs"
            value={draft.pack ?? ""}
            onChange={(event) => set("pack", event.target.value)}
          />
        </label>
      </div>
      {packHint ? <small className="staffAdminHint">Сотрудники увидят: {packHint}</small> : null}
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Бренд</span>
          <input value={draft.brand ?? ""} onChange={(event) => set("brand", event.target.value)} />
        </label>
        <label>
          <span>Артикул</span>
          <input value={draft.itemNo ?? ""} onChange={(event) => set("itemNo", event.target.value)} />
        </label>
      </div>
      <label className="staffAdminCheck">
        <input
          type="checkbox"
          checked={Boolean(draft.hidden)}
          onChange={(event) => set("hidden", event.target.checked)}
        />
        <span>Скрыть у сотрудников</span>
      </label>
      {translating ? <div className="adminBusy">⏳ Перевожу на вьетнамский…</div> : null}
      <FormActions
        isNew={isNew}
        busy={busy || translating}
        canSave={canSave}
        deleteConfirm={`Удалить «${initial.name}»?`}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </form>
  );
}

type SupplierFormProps = {
  initial: StaffCatalogSupplier;
  takenIds: string[];
  isNew: boolean;
  usedBy: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (value: StaffCatalogSupplier) => void;
  onDelete: () => void;
};

function SupplierForm({ initial, takenIds, isNew, usedBy, busy, onCancel, onSave, onDelete }: SupplierFormProps) {
  const [label, setLabel] = useState(initial.label);
  const [zaloUrl, setZaloUrl] = useState(initial.zaloUrl ?? "");
  const zaloValid = !zaloUrl.trim() || /^https:\/\/\S+$/i.test(zaloUrl.trim());

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label.trim() || !zaloValid) return;
        onSave({
          id: initial.id || uniqueCatalogId(label, takenIds),
          label: label.trim(),
          zaloUrl: zaloUrl.trim() || undefined,
        });
      }}
    >
      <h2 className="staffAdminTitle">{isNew ? "Новый поставщик" : "Редактирование поставщика"}</h2>
      <label>
        <span>Название *</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} required />
      </label>
      <label>
        <span>Ссылка на группу Zalo</span>
        <input
          inputMode="url"
          placeholder="https://zalo.me/g/…"
          value={zaloUrl}
          onChange={(event) => setZaloUrl(event.target.value)}
        />
      </label>
      {zaloValid ? null : (
        <small className="staffAdminHint error">Ссылка должна начинаться с https://</small>
      )}
      <FormActions
        isNew={isNew}
        busy={busy}
        canSave={Boolean(label.trim()) && zaloValid}
        deleteBlocked={
          usedBy ? `У этого поставщика ${usedBy} поз. Сначала переназначьте их другому поставщику.` : undefined
        }
        deleteConfirm={`Удалить поставщика «${initial.label}»?`}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </form>
  );
}

type CategoryFormProps = {
  initial: StaffCatalogCategory;
  takenIds: string[];
  isNew: boolean;
  usedBy: number;
  busy: boolean;
  onExpired: () => void;
  onCancel: () => void;
  onSave: (value: StaffCatalogCategory) => void;
  onDelete: () => void;
};

function CategoryForm({ initial, takenIds, isNew, usedBy, busy, onExpired, onCancel, onSave, onDelete }: CategoryFormProps) {
  const [en, setEn] = useState(initial.en);
  const [vn, setVn] = useState(initial.vn);

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (!en.trim()) return;
        onSave({ id: initial.id || uniqueCatalogId(en, takenIds), en: en.trim(), vn: vn.trim() || en.trim() });
      }}
    >
      <h2 className="staffAdminTitle">{isNew ? "Новая категория" : "Редактирование категории"}</h2>
      <label>
        <span>Название (English) *</span>
        <input value={en} onChange={(event) => setEn(event.target.value)} required />
      </label>
      <TranslateField label="Название (Tiếng Việt)" value={vn} source={en} onChange={setVn} onExpired={onExpired} />
      <FormActions
        isNew={isNew}
        busy={busy}
        canSave={Boolean(en.trim())}
        deleteBlocked={
          usedBy ? `В этой категории ${usedBy} поз. Сначала перенесите их в другую категорию.` : undefined
        }
        deleteConfirm={`Удалить категорию «${initial.en}»?`}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    </form>
  );
}
