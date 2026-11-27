"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminAuthForm, AdminNameForm } from "@/components/recipes/AdminAuthForm";
import { translate } from "@/lib/i18n";
import { ErpFormHost } from "@/components/erp/ErpFormHost";
import { ProductCard } from "@/components/erp/ProductsPage";
import { archiveAdmin, getAdminCatalog, saveAdminSupplier } from "@/lib/orders/api";
import { ORDERS_ADMIN_PATH } from "@/lib/erp/menuListQuery";
import {
  ALL_CATEGORY_TAB,
  catalogCategoryChips,
  compareCatalogNames,
  filterByCategory,
  sortCatalogProducts,
  withVisibleCategories,
} from "@/lib/orders/orderList";
import { OrderCategoryTabs } from "./OrderCategoryTabs";
import { productDisplayName } from "@/lib/erp/productName";
import { ordersT } from "@/lib/orders/i18n";
import {
  archiveAdminPrepStockItem,
  getPrepStockSettings,
  listAdminPrepStockItems,
  PrepStockApiError,
  saveAdminPrepStockItem,
  savePrepStockSettings,
  type PrepStockCatalogItemRow,
} from "@/lib/orders/prepStockApi";
import { staffStockLabel } from "@/data/staffInStockItems";
import type { OrderProduct, OrderSupplier } from "@/lib/orders/types";
import { useOrders } from "./OrdersShell";
import "@/components/staff/staff-inventory.css";
import "@/components/recipes/recipes.css";
import "@/components/staff/staff-admin.css";
import "./orders.css";

const tAdmin = (key: string) => translate("ru", key);
const t = (key: string) => ordersT("ru", key);

type Tab = "items" | "suppliers" | "prep";
type Notice = { ok: boolean; text: string } | null;

export function OrdersAdminApp() {
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [accountName, setAccountName] = useState("");
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
      .then((data: { email?: string | null; name?: string | null }) => {
        setSession(data.email ?? null);
        setAccountName(data.name ?? "");
      })
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
            <a className="staffAdminEntry" href="/orders">
              ← Order List
            </a>
          </div>
          <div className="recipesTitle">{t("admin_title")}</div>
        </div>
        <div className="main">
          {session === undefined ? (
            <div className="empty">{tAdmin("staff_loading")}</div>
          ) : session && !accountName ? (
            <AdminNameForm t={tAdmin} onSaved={setAccountName} />
          ) : session ? (
            <CatalogEditor email={session} onLogout={logout} onExpired={() => setSession(null)} />
          ) : (
            <AdminAuthForm
              mode={mode}
              invite={invite}
              t={tAdmin}
              onDone={(email, name) => {
                setSession(email);
                setAccountName(name ?? "");
              }}
              onSwitchToLogin={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CatalogEditor({ email, onLogout, onExpired }: { email: string; onLogout: () => void; onExpired: () => void }) {
  const { lang } = useOrders();
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [prepItems, setPrepItems] = useState<PrepStockCatalogItemRow[]>([]);
  const [prepZaloUrl, setPrepZaloUrl] = useState("");
  const [tab, setTab] = useState<Tab>("items");
  const [editingProduct, setEditingProduct] = useState<OrderProduct | "new" | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<OrderSupplier | "new" | null>(null);
  const [editingPrep, setEditingPrep] = useState<PrepStockCatalogItemRow | "new" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY_TAB);

  const load = useCallback(async () => {
    const catalog = await getAdminCatalog();
    setProducts(catalog.products);
    setSuppliers(catalog.suppliers);
  }, []);

  const loadPrep = useCallback(async () => {
    const [items, settings] = await Promise.all([
      listAdminPrepStockItems(),
      getPrepStockSettings().catch(() => ({ zaloUrl: null as string | null })),
    ]);
    setPrepItems(items);
    setPrepZaloUrl(settings.zaloUrl ?? "");
  }, []);

  useEffect(() => {
    load().catch(() => setNotice({ ok: false, text: tAdmin("recipes_admin_err_server") }));
  }, [load]);

  useEffect(() => {
    if (tab !== "prep") return;
    loadPrep().catch((error) => {
      const status = error instanceof PrepStockApiError ? error.status : 0;
      if (status === 401) onExpired();
      else setNotice({ ok: false, text: tAdmin("recipes_admin_err_server") });
    });
  }, [tab, loadPrep, onExpired]);

  const guard = async (work: () => Promise<void>, okText: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      setNotice({ ok: true, text: okText });
      return true;
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: number }).status) : 0;
      if (status === 401) {
        onExpired();
        return false;
      }
      setNotice({ ok: false, text: tAdmin("recipes_admin_err_server") });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const categoryLabels = useMemo(
    () => ({
      all: ordersT(lang, "category_all"),
      uncategorized: ordersT(lang, "category_none"),
      unnamed: ordersT(lang, "category_unnamed"),
    }),
    [lang],
  );
  const visibleProducts = useMemo(() => withVisibleCategories(products, lang), [products, lang]);
  const categoryChips = useMemo(
    () => catalogCategoryChips(visibleProducts, lang, categoryLabels),
    [visibleProducts, lang, categoryLabels],
  );

  useEffect(() => {
    if (category === ALL_CATEGORY_TAB) return;
    if (!categoryChips.some((chip) => chip.id === category)) setCategory(ALL_CATEGORY_TAB);
  }, [category, categoryChips]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? visibleProducts.filter((product) =>
          [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? "", product.categoryName ?? "", product.categoryNameVn ?? ""].some((text) =>
            text.toLowerCase().includes(query),
          ),
        )
      : visibleProducts;
    return sortCatalogProducts(filterByCategory(filtered, category), lang);
  }, [visibleProducts, search, lang, category]);

  const sortedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => compareCatalogNames(a.name, b.name) || a.id.localeCompare(b.id)),
    [suppliers],
  );

  let body: ReactNode;
  if (editingProduct) {
    body = (
      <ErpFormHost>
        <ProductCard
          id={editingProduct === "new" ? "new" : editingProduct.id}
          presetType="ingredient"
          from={ORDERS_ADMIN_PATH}
          onClose={() => {
            setEditingProduct(null);
            void load();
          }}
        />
      </ErpFormHost>
    );
  } else if (editingSupplier) {
    const initial = editingSupplier === "new" ? null : editingSupplier;
    body = (
      <SupplierForm
        initial={initial}
        busy={busy}
        onCancel={() => setEditingSupplier(null)}
        onSave={async (payload, isNew) => {
          const ok = await guard(async () => {
            await saveAdminSupplier(payload);
            await load();
          }, isNew ? t("admin_supplier_added") : t("admin_supplier_saved"));
          if (ok) setEditingSupplier(null);
        }}
        onArchive={
          initial
            ? async () => {
                const ok = await guard(async () => {
                  await archiveAdmin("supplier", initial.id, true);
                  await load();
                }, t("admin_supplier_saved"));
                if (ok) setEditingSupplier(null);
              }
            : undefined
        }
      />
    );
  } else if (editingPrep) {
    const initial = editingPrep === "new" ? null : editingPrep;
    body = (
      <PrepStockItemForm
        initial={initial}
        busy={busy}
        onCancel={() => setEditingPrep(null)}
        onSave={async (payload, isNew) => {
          const ok = await guard(async () => {
            await saveAdminPrepStockItem(payload);
            await loadPrep();
          }, isNew ? t("admin_prep_added") : t("admin_prep_saved"));
          if (ok) setEditingPrep(null);
        }}
        onArchive={
          initial
            ? async () => {
                const ok = await guard(async () => {
                  await archiveAdminPrepStockItem(initial.id);
                  await loadPrep();
                }, t("admin_prep_archived"));
                if (ok) setEditingPrep(null);
              }
            : undefined
        }
      />
    );
  } else if (tab === "items") {
    body = (
      <>
        <button type="button" className="dark staffAdminAdd" onClick={() => setEditingProduct("new")}>
          {t("admin_add_item")}
        </button>
        <div className="staffAdminCatalogChrome">
          <input className="search" placeholder="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} />
          <OrderCategoryTabs
            categories={categoryChips}
            value={category}
            onChange={setCategory}
            ariaLabel={ordersT(lang, "filter_all")}
          />
        </div>
        <div className="mode">
          <span>{t("admin_order_hint")}</span>
        </div>
        {visible.map((product) => (
          <button
            key={product.id}
            type="button"
            className={`staffAdminRow ${product.hidden ? "isHidden" : ""}`}
            onClick={() => setEditingProduct(product)}
          >
            <b>{productDisplayName({ locale: lang, nameEn: product.nameEn, nameVn: product.nameVn })}</b>
            <span>
              {[suppliers.find((row) => row.id === product.supplierId)?.name, product.unit, product.hidden ? t("admin_hidden") : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        ))}
        {!visible.length ? <div className="empty">Ничего не найдено</div> : null}
      </>
    );
  } else if (tab === "suppliers") {
    body = (
      <>
        <button type="button" className="dark staffAdminAdd" onClick={() => setEditingSupplier("new")}>
          {t("admin_add_supplier")}
        </button>
        <div className="mode">
          <span>{t("admin_suppliers_hint")}</span>
        </div>
        {sortedSuppliers.map((supplier) => (
          <button key={supplier.id} type="button" className="staffAdminRow" onClick={() => setEditingSupplier(supplier)}>
            <b>{supplier.name}</b>
            <span>
              {supplier.productCount} поз.
              {supplier.zaloUrl ? " · Zalo ✓" : ""}
            </span>
          </button>
        ))}
      </>
    );
  } else {
    const zaloValid = !prepZaloUrl.trim() || /^https:\/\/\S+$/i.test(prepZaloUrl.trim());
    body = (
      <>
        <form
          className="card formSection orders-prepAdminZalo"
          onSubmit={(event) => {
            event.preventDefault();
            if (!zaloValid) return;
            void guard(async () => {
              const saved = await savePrepStockSettings(prepZaloUrl.trim());
              setPrepZaloUrl(saved.zaloUrl ?? "");
            }, t("admin_prep_zalo_saved"));
          }}
        >
          <label>
            <span>{t("admin_prep_zalo")}</span>
            <input
              inputMode="url"
              placeholder="https://zalo.me/g/…"
              value={prepZaloUrl}
              onChange={(event) => setPrepZaloUrl(event.target.value)}
            />
          </label>
          <small className="staffAdminHint">{t("admin_prep_zalo_hint")}</small>
          {zaloValid ? null : (
            <small className="staffAdminHint error">Ссылка должна начинаться с https://</small>
          )}
          <div className="adminActions">
            <button type="submit" className="dark" disabled={busy || !zaloValid}>
              {busy ? "Сохраняю…" : "Сохранить Zalo"}
            </button>
          </div>
        </form>
        <button type="button" className="dark staffAdminAdd" onClick={() => setEditingPrep("new")}>
          {t("admin_add_prep_item")}
        </button>
        <div className="mode">
          <span>{t("admin_prep_hint")}</span>
        </div>
        {prepItems.map((item) => {
          const label = staffStockLabel(item, lang);
          const note = String(item.note || "").trim();
          return (
            <button key={item.id} type="button" className="staffAdminRow" onClick={() => setEditingPrep(item)}>
              <b>
                {label}
                {note ? <span className="orders-prepStockNote"> / {note}</span> : null}
              </b>
              <span>{item.noWarehouse ? "Prep only" : "Prep · Warehouse"}</span>
            </button>
          );
        })}
        {!prepItems.length ? <div className="empty">Ничего не найдено</div> : null}
      </>
    );
  }

  return (
    <div className="adminEditor">
      <div className="adminBar">
        <span>{email}</span>
        <button type="button" className="white" onClick={onLogout}>
          {tAdmin("recipes_admin_logout")}
        </button>
      </div>
      {editingProduct || editingSupplier || editingPrep ? null : (
        <div className="sectionPicker staffAdminTabs" role="tablist" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {(
            [
              ["items", t("admin_items")],
              ["suppliers", t("admin_suppliers")],
              ["prep", t("admin_prep_stock")],
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

function PrepStockItemForm({
  initial,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  initial: PrepStockCatalogItemRow | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (
    payload: {
      id?: string | null;
      nameEn: string;
      nameRu: string;
      nameVn: string;
      note: string;
      noWarehouse: boolean;
    },
    isNew: boolean,
  ) => void;
  onArchive?: () => void;
}) {
  const [nameRu, setNameRu] = useState(initial?.name.ru ?? "");
  const [nameEn, setNameEn] = useState(initial?.name.en ?? "");
  const [nameVn, setNameVn] = useState(initial?.name.vn ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [noWarehouse, setNoWarehouse] = useState(Boolean(initial?.noWarehouse));
  const canSave = Boolean(nameRu.trim() || nameEn.trim() || nameVn.trim());

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        onSave(
          {
            id: initial?.id ?? null,
            nameEn: nameEn.trim(),
            nameRu: nameRu.trim(),
            nameVn: nameVn.trim(),
            note: note.trim(),
            noWarehouse,
          },
          !initial,
        );
      }}
    >
      <h2 className="staffAdminTitle">{initial ? t("admin_prep_edit") : t("admin_prep_new")}</h2>
      <label>
        <span>{t("admin_prep_name_ru")}</span>
        <input value={nameRu} onChange={(event) => setNameRu(event.target.value)} />
      </label>
      <label>
        <span>{t("admin_prep_name_en")}</span>
        <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
      </label>
      <label>
        <span>{t("admin_prep_name_vn")}</span>
        <input value={nameVn} onChange={(event) => setNameVn(event.target.value)} />
      </label>
      <label>
        <span>{t("admin_prep_note")}</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("admin_prep_note_hint")}
        />
      </label>
      <small className="staffAdminHint">{t("admin_prep_note_hint")}</small>
      <label className="orders-prepAdminCheck">
        <input
          type="checkbox"
          checked={noWarehouse}
          onChange={(event) => setNoWarehouse(event.target.checked)}
        />
        <span>{t("admin_prep_no_warehouse")}</span>
      </label>
      <div className="adminActions">
        <button type="submit" className="dark" disabled={busy || !canSave}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="white" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
      {onArchive ? (
        <button type="button" className="white danger staffAdminDelete" disabled={busy} onClick={onArchive}>
          🗑 В архив
        </button>
      ) : null}
    </form>
  );
}

function SupplierForm({
  initial,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  initial: OrderSupplier | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>, isNew: boolean) => void;
  onArchive?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [zaloUrl, setZaloUrl] = useState(initial?.zaloUrl ?? "");
  const zaloValid = !zaloUrl.trim() || /^https:\/\/\S+$/i.test(zaloUrl.trim());

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !zaloValid) return;
        onSave({ id: initial?.id, name: name.trim(), zalo_url: zaloUrl.trim() }, !initial);
      }}
    >
      <h2 className="staffAdminTitle">{initial ? "Редактирование поставщика" : "Новый поставщик"}</h2>
      <label>
        <span>Название *</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        <span>Ссылка на группу Zalo</span>
        <input inputMode="url" placeholder="https://zalo.me/g/…" value={zaloUrl} onChange={(event) => setZaloUrl(event.target.value)} />
      </label>
      {zaloValid ? null : <small className="staffAdminHint error">Ссылка должна начинаться с https://</small>}
      <div className="adminActions">
        <button type="submit" className="dark" disabled={busy || !name.trim() || !zaloValid}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="white" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
      {onArchive ? (
        <button type="button" className="white danger staffAdminDelete" disabled={busy} onClick={onArchive}>
          🗑 В архив
        </button>
      ) : null}
    </form>
  );
}
