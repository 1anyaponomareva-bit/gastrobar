"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { useDragReorder } from "@/lib/useDragReorder";
import "./staff-inventory.css";
import "@/components/recipes/recipes.css";
import "./staff-admin.css";

type Tab = "items" | "suppliers" | "categories";

type Editing =
  | { kind: "item"; value: StaffCatalogItem; isNew: boolean }
  | { kind: "supplier"; value: StaffCatalogSupplier; isNew: boolean }
  | { kind: "category"; value: StaffCatalogCategory; isNew: boolean };

type Notice = { ok: boolean; text: string } | null;

/** Codes used by ERP rows that Staff does not list; new ids must avoid them. */
type Reserved = { items: string[]; suppliers: string[]; categories: string[] };
const NO_RESERVED: Reserved = { items: [], suppliers: [], categories: [] };

const UNITS = ["kg", "g", "l", "ml", "pcs", "box", "pack", "btl", "can"];

const t = (key: string) => translate("ru", key);

/** Puts the entries listed in `ids` into that order, keeping every other entry in its place. */
function reorderSubset<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const queue = ids.map((id) => byId.get(id)).filter((entry): entry is T => Boolean(entry));
  const moved = new Set(queue.map((entry) => entry.id));
  let next = 0;
  return list.map((entry) => (moved.has(entry.id) ? queue[next++] : entry));
}

type DragListProps<T extends { id: string }> = {
  list: T[];
  disabled: boolean;
  render: (entry: T) => ReactNode;
  onCommit: (ids: string[]) => Promise<boolean>;
};

function DragList<T extends { id: string }>({ list, disabled, render, onCommit }: DragListProps<T>) {
  const listKey = list.map((entry) => entry.id).join("|");
  const [order, setOrder] = useState(() => list.map((entry) => entry.id));
  const orderRef = useRef(order);
  const moved = useRef(false);

  const resetOrder = useCallback(() => {
    orderRef.current = listKey ? listKey.split("|") : [];
    setOrder(orderRef.current);
  }, [listKey]);

  useEffect(resetOrder, [resetOrder]);

  const drag = useDragReorder(
    (from, to) => {
      const next = [...orderRef.current];
      const [entry] = next.splice(from, 1);
      next.splice(to, 0, entry);
      orderRef.current = next;
      moved.current = true;
      setOrder(next);
    },
    {
      onEnd: () => {
        if (moved.current) {
          void onCommit(orderRef.current).then((saved) => {
            if (!saved) resetOrder();
          });
        }
        moved.current = false;
      },
    },
  );

  const byId = new Map(list.map((entry) => [entry.id, entry]));
  return (
    <>
      {order.map((id, index) => {
        const entry = byId.get(id);
        if (!entry) return null;
        return (
          <div
            key={id}
            ref={(element) => {
              drag.rowRefs.current[index] = element;
            }}
            className={`staffAdminDragRow ${drag.dragIndex === index ? "dragging" : ""}`}
          >
            <button
              type="button"
              className="staffAdminHandle"
              aria-label="Перетащить"
              disabled={disabled}
              {...drag.handleProps(index)}
            >
              ⠿
            </button>
            {render(entry)}
          </div>
        );
      })}
    </>
  );
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

  const [version, setVersion] = useState("");
  const [reserved, setReserved] = useState<Reserved>(NO_RESERVED);
  const editingRef = useRef(false);
  editingRef.current = Boolean(editing) || busy;

  const load = useCallback(async () => {
    const response = await fetch("/api/staff-catalog", { cache: "no-store" });
    const data = (await response.json()) as { catalog?: unknown; version?: string; reserved?: Reserved };
    const fresh = sanitizeStaffCatalog(data.catalog);
    if (!response.ok || !fresh || !data.version) throw new Error("load");
    setCatalog(fresh);
    setVersion(data.version);
    setReserved(data.reserved ?? NO_RESERVED);
  }, []);

  useEffect(() => {
    load().catch(() => setNotice({ ok: false, text: t("recipes_admin_err_server") }));
    // Changes made in the ERP show up when the page is opened again or gets focus.
    const refresh = () => {
      if (document.visibilityState === "visible" && !editingRef.current) load().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const save = useCallback(
    async (next: StaffCatalog, message: string) => {
      setBusy(true);
      setNotice(null);
      try {
        const response = await fetch("/api/staff-admin/catalog", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalog: next, version }),
        });
        if (response.status === 401) {
          onExpired();
          return false;
        }
        if (response.status === 409) {
          await load().catch(() => {});
          setNotice({
            ok: false,
            text: "Справочник успели изменить (в ERP или на другом устройстве). Загружена актуальная версия — проверьте данные и сохраните ещё раз.",
          });
          return false;
        }
        const data = (await response.json().catch(() => null)) as
          | { catalog?: StaffCatalog; version?: string; reserved?: Reserved; error?: string }
          | null;
        if (data?.error === "ERP_DUPLICATE") {
          setNotice({ ok: false, text: "Такой код уже занят другой позицией в ERP. Измените название или бренд и сохраните ещё раз." });
          await load().catch(() => {});
          return false;
        }
        if (!response.ok || !data?.catalog || !data.version) throw new Error("save");
        setCatalog(data.catalog);
        setVersion(data.version);
        setReserved(data.reserved ?? NO_RESERVED);
        setNotice({ ok: true, text: message });
        return true;
      } catch {
        setNotice({ ok: false, text: "Не удалось сохранить. Проверьте поля и попробуйте ещё раз." });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onExpired, version, load],
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

  const reorder = (key: keyof StaffCatalog, ids: string[]) =>
    save(
      { ...catalog, [key]: reorderSubset<{ id: string }>(catalog[key], ids) } as StaffCatalog,
      "Порядок сохранён",
    );

  const replace = <T extends { id: string }>(list: T[], value: T, isNew: boolean): T[] =>
    isNew ? [...list, value] : list.map((entry) => (entry.id === value.id ? value : entry));

  let body: ReactNode;
  if (editing?.kind === "item") {
    body = (
      <ItemForm
        initial={editing.value}
        isNew={editing.isNew}
        catalog={catalog}
        reserved={reserved}
        busy={busy}
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
        takenIds={[...catalog.suppliers.map((supplier) => supplier.id), ...reserved.suppliers]}
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
        takenIds={[...catalog.categories.map((category) => category.id), ...reserved.categories]}
        isNew={editing.isNew}
        usedBy={usage("category", editing.value.id)}
        busy={busy}
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
            placeholder="Поиск"
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
              <DragList
                list={inCategory}
                disabled={busy}
                onCommit={(ids) => reorder("items", ids)}
                render={(item) => (
                  <button
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
                )}
              />
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
        <DragList
          list={catalog.suppliers}
          disabled={busy}
          onCommit={(ids) => reorder("suppliers", ids)}
          render={(supplier) => (
            <button
              type="button"
              className="staffAdminRow"
              onClick={() => open({ kind: "supplier", isNew: false, value: supplier })}
            >
              <b>{supplier.label}</b>
              <span>
                {usage("supplier", supplier.id)} поз. · {supplier.zaloUrl ? "Zalo ✓" : "без Zalo"}
              </span>
            </button>
          )}
        />
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
        <DragList
          list={catalog.categories}
          disabled={busy}
          onCommit={(ids) => reorder("categories", ids)}
          render={(category) => (
            <button
              type="button"
              className="staffAdminRow"
              onClick={() => open({ kind: "category", isNew: false, value: category })}
            >
              <b>{staffCategoryLabel(category)}</b>
              <span>{usage("category", category.id)} поз.</span>
            </button>
          )}
        />
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

type ItemFormProps = {
  initial: StaffCatalogItem;
  isNew: boolean;
  catalog: StaffCatalog;
  reserved: Reserved;
  busy: boolean;
  onCancel: () => void;
  onSave: (
    value: StaffCatalogItem,
    extras: { category?: StaffCatalogCategory; supplier?: StaffCatalogSupplier },
  ) => void;
  onDelete: () => void;
};

const NEW_OPTION = "__new__";

function ItemForm({ initial, isNew, catalog, reserved, busy, onCancel, onSave, onDelete }: ItemFormProps) {
  const [draft, setDraft] = useState(() => ({ ...initial, name: isNew ? "" : staffItemLabel(initial) }));
  const [newCategory, setNewCategory] = useState("");
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
      (!addingCategory || newCategory.trim()) &&
      (!addingSupplier || (newSupplier.label.trim() && zaloValid)),
  );
  const packHint = draft.pack?.trim() ? `1 ${draft.unit || "…"} = ${draft.pack.trim()}` : null;

  const submit = () => {
    const name = draft.name.trim();
    const categoryName = newCategory.trim();
    const category = addingCategory
      ? {
          id: uniqueCatalogId(categoryName, [...catalog.categories.map((entry) => entry.id), ...reserved.categories]),
          en: categoryName,
          vn: categoryName,
        }
      : undefined;
    const supplier = addingSupplier
      ? {
          id: uniqueCatalogId(newSupplier.label, [...catalog.suppliers.map((entry) => entry.id), ...reserved.suppliers]),
          label: newSupplier.label.trim(),
          zaloUrl: newSupplier.zaloUrl.trim() || undefined,
        }
      : undefined;
    const id = isNew
      ? uniqueCatalogId(
          `${name} ${draft.brand ?? ""}`,
          [...catalog.items.map((item) => item.id), ...reserved.items],
        )
      : draft.id;
    onSave(
      {
        ...draft,
        id,
        category: category?.id ?? draft.category,
        supplier: supplier?.id ?? draft.supplier,
        name,
        nameVn: name,
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
        if (canSave) submit();
      }}
    >
      <h2 className="staffAdminTitle">{isNew ? "Новая позиция" : "Редактирование позиции"}</h2>
      <label>
        <span>Название *</span>
        <input
          placeholder="Butter / Bơ"
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
          required
        />
      </label>
      <small className="staffAdminHint">Сотрудники увидят название ровно так, как вы его впишете</small>
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Категория *</span>
          <select value={draft.category} onChange={(event) => set("category", event.target.value)}>
            {catalog.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {staffCategoryLabel(category)}
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
            <span>Название *</span>
            <input
              placeholder="Frozen / Đông lạnh"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              required
            />
          </label>
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
      <FormActions
        isNew={isNew}
        busy={busy}
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
  onCancel: () => void;
  onSave: (value: StaffCatalogCategory) => void;
  onDelete: () => void;
};

function CategoryForm({ initial, takenIds, isNew, usedBy, busy, onCancel, onSave, onDelete }: CategoryFormProps) {
  const [name, setName] = useState(isNew ? "" : staffCategoryLabel(initial));

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        const label = name.trim();
        if (!label) return;
        onSave({ id: initial.id || uniqueCatalogId(label, takenIds), en: label, vn: label });
      }}
    >
      <h2 className="staffAdminTitle">{isNew ? "Новая категория" : "Редактирование категории"}</h2>
      <label>
        <span>Название *</span>
        <input
          placeholder="Frozen / Đông lạnh"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <FormActions
        isNew={isNew}
        busy={busy}
        canSave={Boolean(name.trim())}
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
