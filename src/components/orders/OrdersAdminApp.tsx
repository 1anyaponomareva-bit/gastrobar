"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminAuthForm, AdminNameForm } from "@/components/recipes/AdminAuthForm";
import { translate } from "@/lib/i18n";
import { ErpFormHost } from "@/components/erp/ErpFormHost";
import { ProductCard } from "@/components/erp/ProductsPage";
import { archiveAdmin, getAdminCatalog, saveAdminSupplier } from "@/lib/orders/api";
import { ORDERS_ADMIN_PATH } from "@/lib/erp/menuListQuery";
import { catalogCategories, compareCatalogNames, groupProductsByCategory, sortCatalogProducts } from "@/lib/orders/orderList";
import { productDisplayName } from "@/lib/erp/productName";
import { ordersT } from "@/lib/orders/i18n";
import type { OrderProduct, OrderSupplier } from "@/lib/orders/types";
import { useOrders } from "./OrdersShell";
import "@/components/staff/staff-inventory.css";
import "@/components/recipes/recipes.css";
import "@/components/staff/staff-admin.css";

const tAdmin = (key: string) => translate("ru", key);
const t = (key: string) => ordersT("ru", key);

type Tab = "items" | "suppliers";
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
  const [tab, setTab] = useState<Tab>("items");
  const [editingProduct, setEditingProduct] = useState<OrderProduct | "new" | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<OrderSupplier | "new" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const catalog = await getAdminCatalog();
    setProducts(catalog.products);
    setSuppliers(catalog.suppliers);
  }, []);

  useEffect(() => {
    load().catch(() => setNotice({ ok: false, text: tAdmin("recipes_admin_err_server") }));
  }, [load]);

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

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? products.filter((product) =>
          [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? "", product.categoryName ?? "", product.categoryNameVn ?? ""].some((text) =>
            text.toLowerCase().includes(query),
          ),
        )
      : products;
    return sortCatalogProducts(filtered, lang);
  }, [products, search, lang]);

  const groups = useMemo(
    () =>
      groupProductsByCategory(visible, catalogCategories(visible, lang), {
        locale: lang,
        uncategorizedName: ordersT(lang, "category_none"),
      }),
    [visible, lang],
  );

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
  } else if (tab === "items") {
    body = (
      <>
        <button type="button" className="dark staffAdminAdd" onClick={() => setEditingProduct("new")}>
          {t("admin_add_item")}
        </button>
        <input className="search" placeholder="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="mode">
          <span>{t("admin_order_hint")}</span>
        </div>
        {groups.map((group) => (
          <div key={group.id || "uncategorized"}>
            {group.name ? <div className="category">{group.name}</div> : null}
            {group.products.map((product) => (
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
          </div>
        ))}
        {!visible.length ? <div className="empty">Ничего не найдено</div> : null}
      </>
    );
  } else {
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
  }

  return (
    <div className="adminEditor">
      <div className="adminBar">
        <span>{email}</span>
        <button type="button" className="white" onClick={onLogout}>
          {tAdmin("recipes_admin_logout")}
        </button>
      </div>
      {editingProduct || editingSupplier ? null : (
        <div className="sectionPicker staffAdminTabs" role="tablist" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {(
            [
              ["items", t("admin_items")],
              ["suppliers", t("admin_suppliers")],
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
